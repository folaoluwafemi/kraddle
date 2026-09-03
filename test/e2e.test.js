import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createInterface } from "node:readline";
import { test } from "node:test";
import { computeFileMapDigest, extractDependencies } from "../src/extract.js";
import { Workspace } from "../src/kernel.js";
import { gitStateRef, readRepoFiles } from "../src/repo.js";

const exec = promisify(execFile);
const serverPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src", "server.js");

const env = (over = {}) => ({
  origin: "human", epistemic_basis: "asserted",
  approval_state: "accepted", freshness_state: "current",
  recorded_at: 1756771200000, ...over,
});

async function bootstrap() {
  const repoDir = await mkdtemp(join(tmpdir(), "kraddle-e2e-repo-"));
  await mkdir(join(repoDir, "src", "domain"), { recursive: true });
  await mkdir(join(repoDir, "src", "ui"), { recursive: true });
  await writeFile(join(repoDir, "src", "domain", "a.ts"), "export const a = 1;\n");
  await writeFile(join(repoDir, "src", "ui", "Button.tsx"), 'import React from "react";\n');
  await exec("git", ["init"], { cwd: repoDir });
  await exec("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
  await exec("git", ["config", "user.name", "Test"], { cwd: repoDir });
  await exec("git", ["add", "src/domain/a.ts", "src/ui/Button.tsx"], { cwd: repoDir });
  await exec("git", ["commit", "-m", "init"], { cwd: repoDir });

  const { files } = await readRepoFiles(repoDir);
  const { repository, revision } = await gitStateRef(repoDir);
  const stateRef = { repository, revision, contentDigest: computeFileMapDigest(files) };
  const { edges } = extractDependencies(files);

  const workspaceDir = await mkdtemp(join(tmpdir(), "kraddle-e2e-ws-"));
  const store = new Workspace(workspaceDir);
  await store.init();

  const commitment = (recordId, value, over = {}) => ({ id: recordId, kind: "commitment", value, ...env(over) });
  const unitRecord = (recordId, kind, over = {}) => ({ id: recordId, kind, ...env(over) });
  const rel = (recordId, profileId, role, targetId, targetType) => ({
    id: recordId, kind: "relationship", profileId, role, targetId, targetType, ...env(),
  });

  await store.transact([
    { type: "scope.create", value: { id: "SC1", kind: "scope", ...env() } },
    { type: "unit.create", value: unitRecord("EV-UNIT", "evaluator", {
      evaluatorType: "architecture_rule",
      params: { sourcePrefix: "src/domain/", forbiddenPrefixes: ["src/ui/"] },
    }) },
    { type: "commitment.create", value: commitment("C1", "domain must not import ui") },
    { type: "commitment.create", value: commitment("S1", { type: "path_prefix", value: "src/domain/" }) },
    { type: "commitment.create", value: commitment("M1", "prohibition") },
    { type: "unit.create", value: unitRecord("CB1", "control_binding") },
    { type: "relationship.add", value: rel("cb-governed", "CB1", "governed_commitment", "C1", "commitment") },
    { type: "relationship.add", value: rel("cb-selector", "CB1", "subject_selector", "S1", "commitment") },
    { type: "relationship.add", value: rel("cb-modality", "CB1", "modality", "M1", "commitment") },
    { type: "relationship.add", value: rel("cb-evaluator", "CB1", "evaluator", "EV-UNIT", "unit") },
    { type: "evidence.create", value: {
      id: "EV-BASE", kind: "evidence", ...env({ origin: "extractor", epistemic_basis: "observed" }),
      stateRef, edges, extractionScope: { fromPrefixes: ["src/"] },
    } },
    { type: "commitment.create", value: commitment("EP-PURPOSE", "add a domain service") },
    { type: "commitment.create", value: commitment("EP-BASE", "base state") },
    { type: "commitment.create", value: commitment("EP-OUTCOME", "service added under the governing control") },
    { type: "unit.create", value: unitRecord("EP-CTX", "context_envelope", { valid: true, completeness: "complete", complete: true, incompleteReasons: [] }) },
    { type: "unit.create", value: unitRecord("EP-AUTH", "authority_grant", { operations: ["read", "write"], targetPrefix: "src/domain/" }) },
    { type: "unit.create", value: unitRecord("EP-DELTA", "software_element") },
    { type: "unit.create", value: unitRecord("EP1", "execution_episode", {
      lifecycle: "running",
      baseStateRef: stateRef,
    }) },
    { type: "relationship.add", value: rel("ep-purpose", "EP1", "purpose", "EP-PURPOSE", "commitment") },
    { type: "relationship.add", value: rel("ep-scope", "EP1", "target_scope", "SC1", "scope") },
    { type: "relationship.add", value: rel("ep-base", "EP1", "base_revision", "EP-BASE", "commitment") },
    { type: "relationship.add", value: rel("ep-context", "EP1", "context_envelope", "EP-CTX", "unit") },
    { type: "relationship.add", value: rel("ep-authority", "EP1", "authority_grant", "EP-AUTH", "unit") },
    { type: "relationship.add", value: rel("ep-delta", "EP1", "intended_delta", "EP-DELTA", "unit") },
    { type: "relationship.add", value: rel("ep-outcome", "EP1", "outcome", "EP-OUTCOME", "commitment") },
  ], { profileIds: ["CB1", "EP1"] });

  return { repoDir, workspaceDir };
}

function startServer({ repoDir, workspaceDir }) {
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      KRADDLE_REPO: repoDir,
      KRADDLE_WORKSPACE_DIR: workspaceDir,
      KRADDLE_EPISODE_ID: "EP1",
      KRADDLE_BASE_EVIDENCE_ID: "EV-BASE",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map();
  let nextId = 1;
  const stderr = [];
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const rl = createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    const waiter = pending.get(message.id);
    if (waiter) {
      pending.delete(message.id);
      waiter(message);
    }
  });
  const call = (method, params) => {
    const id = nextId++;
    const request = { jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) };
    const promise = new Promise((resolveCall, rejectCall) => {
      pending.set(id, resolveCall);
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          rejectCall(new Error(`timeout awaiting ${method}: ${stderr.join("")}`));
        }
      }, 15000);
    });
    child.stdin.write(JSON.stringify(request) + "\n");
    return promise;
  };
  return { child, call, stderr };
}

const fileExists = (root, path) =>
  access(join(root, ...path.split("/"))).then(() => true, () => false);

test("the agent surface two-block scenario", async () => {
  const { repoDir, workspaceDir } = await bootstrap();
  const { child, call } = startServer({ repoDir, workspaceDir });
  try {
    const init = await call("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "e2e-test", version: "0" },
    });
    assert.equal(init.result.protocolVersion, "2025-06-18");
    assert.equal(init.result.serverInfo.name, "kraddle-agent-surface");

    const toolsList = await call("tools/list");
    const names = toolsList.result.tools.map((tool) => tool.name);
    assert.deepEqual([...names].sort(), ["kraddle_close_episode", "kraddle_read_file", "kraddle_write_file"]);
    for (const forbidden of ["update", "create", "delete", "transact", "grant"]) {
      assert.ok(!names.some((name) => name.includes(forbidden)), `tool names must not contain ${forbidden}`);
    }

    const read = await call("tools/call", {
      name: "kraddle_read_file",
      arguments: { path: "src/domain/a.ts" },
    });
    assert.equal(read.result.isError, false);
    assert.equal(read.result.content[0].text, "export const a = 1;\n");

    const denied = await call("tools/call", {
      name: "kraddle_write_file",
      arguments: {
        path: "src/domain/service.ts",
        content: 'import { Button } from "../ui/Button";\nexport const service = Button;\n',
      },
    });
    assert.equal(denied.result.isError, true);
    assert.ok(denied.result.content[0].text.includes("PREFLIGHT_VIOLATED"));
    assert.ok(denied.result.content[0].text.includes("domain must not import ui"));
    assert.equal(await fileExists(repoDir, "src/domain/service.ts"), false);

    const written = await call("tools/call", {
      name: "kraddle_write_file",
      arguments: { path: "src/domain/service.ts", content: "export const service = () => 1;\n" },
    });
    assert.equal(written.result.isError, false);
    assert.equal(await fileExists(repoDir, "src/domain/service.ts"), true);

    const closed = await call("tools/call", {
      name: "kraddle_close_episode",
      arguments: {},
    });
    assert.equal(closed.result.isError, false);
    assert.ok(closed.result.content[0].text.includes("closed"));
  } finally {
    child.kill();
    await rm(repoDir, { recursive: true, force: true });
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("bypass is caught at closure", async () => {
  const { repoDir, workspaceDir } = await bootstrap();
  const { child, call } = startServer({ repoDir, workspaceDir });
  try {
    const written = await call("tools/call", {
      name: "kraddle_write_file",
      arguments: { path: "src/domain/service.ts", content: "export const service = () => 1;\n" },
    });
    assert.equal(written.result.isError, false);

    await writeFile(join(repoDir, "src", "domain", "rogue.ts"), "export const rogue = 1;\n", "utf8");

    const closed = await call("tools/call", {
      name: "kraddle_close_episode",
      arguments: {},
    });
    assert.equal(closed.result.isError, true);
    assert.ok(closed.result.content[0].text.includes("UNCONTROLLED_EFFECT"));
    assert.ok(closed.result.content[0].text.includes("src/domain/rogue.ts"));
  } finally {
    child.kill();
    await rm(repoDir, { recursive: true, force: true });
    await rm(workspaceDir, { recursive: true, force: true });
  }
});
