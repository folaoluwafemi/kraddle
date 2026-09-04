import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { computeFileMapDigest, extractDependencies } from "../src/extract.js";
import { Workspace } from "../src/kernel.js";
import { gitStateRef, readRepoFiles } from "../src/repo.js";
import { createKraddleServer } from "../src/server.js";
import { rm as fsRm, writeFile as fsWriteFile } from "node:fs/promises";

const exec = promisify(execFile);

const env = (over = {}) => ({
  origin: "human", epistemic_basis: "asserted",
  approval_state: "accepted", freshness_state: "current",
  recorded_at: 1756771200000, ...over,
});

async function bootstrap({ authority = { operations: ["read", "write"], targetPrefix: "src/domain/" }, testFixture = false } = {}) {
  const repoDir = await mkdtemp(join(tmpdir(), "kraddle-repo-"));
  await mkdir(join(repoDir, "src", "domain"), { recursive: true });
  await mkdir(join(repoDir, "src", "ui"), { recursive: true });
  await writeFile(join(repoDir, "src", "domain", "a.ts"), "export const a = 1;\n");
  await writeFile(join(repoDir, "src", "ui", "Button.tsx"), 'import React from "react";\n');
  if (testFixture) {
    await mkdir(join(repoDir, "test"), { recursive: true });
    await writeFile(join(repoDir, "test", "fixture.test.js"), 'import { thing } from "./missing";\n');
  }
  await exec("git", ["init"], { cwd: repoDir });
  await exec("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
  await exec("git", ["config", "user.name", "Test"], { cwd: repoDir });
  await exec("git", ["add", "src/domain/a.ts", "src/ui/Button.tsx"], { cwd: repoDir });
  await exec("git", ["commit", "-m", "init"], { cwd: repoDir });

  const { files } = await readRepoFiles(repoDir);
  const { repository, revision } = await gitStateRef(repoDir);
  const stateRef = { repository, revision, contentDigest: computeFileMapDigest(files) };
  const { edges } = extractDependencies(files);
  const scopedEdges = edges.filter((edge) => edge.from.startsWith("src/"));

  const workspaceDir = await mkdtemp(join(tmpdir(), "kraddle-ws-"));
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
      stateRef, edges: scopedEdges, extractionScope: { fromPrefixes: ["src/"] },
    } },
    { type: "commitment.create", value: commitment("EP-PURPOSE", "add a domain service") },
    { type: "commitment.create", value: commitment("EP-BASE", "base state") },
    { type: "commitment.create", value: commitment("EP-OUTCOME", "service added under the governing control") },
    { type: "unit.create", value: unitRecord("EP-CTX", "context_envelope", { valid: true, completeness: "complete", complete: true, incompleteReasons: [] }) },
    { type: "unit.create", value: unitRecord("EP-AUTH", "authority_grant", authority) },
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

  const server = await createKraddleServer({
    repoDir,
    workspaceDir,
    episodeId: "EP1",
    baseEvidenceId: "EV-BASE",
  });
  return { repoDir, workspaceDir, server, files, stateRef };
}

const fileExists = (root, path) =>
  access(join(root, ...path.split("/"))).then(() => true, () => false);

test("a write outside the authority prefix is denied and never touches disk", async () => {
  const { repoDir, workspaceDir, server } = await bootstrap();
  try {
    const write = server.tools.find((tool) => tool.name === "kraddle_write_file");
    const result = await write.handler({ path: "src/ui/other.tsx", content: "export const x = 1;\n" });
    assert.equal(result.isError, true);
    assert.ok(result.text.includes("TARGET_OUTSIDE_AUTHORITY"));
    assert.equal(await fileExists(repoDir, "src/ui/other.tsx"), false);
  } finally {
    await rm(repoDir, { recursive: true, force: true });
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("a write violating the governing rule is denied by preflight before disk", async () => {
  const { repoDir, workspaceDir, server } = await bootstrap();
  try {
    const write = server.tools.find((tool) => tool.name === "kraddle_write_file");
    const result = await write.handler({
      path: "src/domain/service.ts",
      content: 'import { Button } from "../ui/Button";\nexport const service = Button;\n',
    });
    assert.equal(result.isError, true);
    assert.ok(result.text.includes("PREFLIGHT_VIOLATED"));
    assert.ok(result.text.includes("domain must not import ui"));
    assert.equal(await fileExists(repoDir, "src/domain/service.ts"), false);
  } finally {
    await rm(repoDir, { recursive: true, force: true });
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("a write whose evaluation is unknown is denied fail-closed", async () => {
  const { repoDir, workspaceDir, server } = await bootstrap();
  try {
    const write = server.tools.find((tool) => tool.name === "kraddle_write_file");
    const result = await write.handler({
      path: "src/domain/service.ts",
      content: "const mod = import(cfg.button);\nexport const service = mod;\n",
    });
    assert.equal(result.isError, true);
    assert.ok(result.text.includes("PREFLIGHT_UNKNOWN"));
    assert.equal(await fileExists(repoDir, "src/domain/service.ts"), false);
  } finally {
    await rm(repoDir, { recursive: true, force: true });
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("a clean write is admitted, written, and observed with its admission id", async () => {
  const { repoDir, workspaceDir, server } = await bootstrap();
  try {
    const write = server.tools.find((tool) => tool.name === "kraddle_write_file");
    const content = "export const service = () => 1;\n";
    const result = await write.handler({ path: "src/domain/service.ts", content });
    assert.ok(!result.isError);
    const episode = server.state.units.get("EP1");
    assert.equal(episode.observedEffects.length, 1);
    assert.ok(result.text.includes(episode.observedEffects[0].admissionId));
    const onDisk = await import("node:fs/promises").then((fs) =>
      fs.readFile(join(repoDir, "src", "domain", "service.ts"), "utf8"),
    );
    assert.equal(onDisk, content);
    assert.equal(server.admittedWrites.get("src/domain/service.ts"), content);
  } finally {
    await rm(repoDir, { recursive: true, force: true });
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("closure succeeds on a clean flow and persists the resulting records", async () => {
  const { repoDir, workspaceDir, server, files } = await bootstrap();
  try {
    const write = server.tools.find((tool) => tool.name === "kraddle_write_file");
    const content = "export const service = () => 1;\n";
    const written = await write.handler({ path: "src/domain/service.ts", content });
    assert.ok(!written.isError);

    const close = server.tools.find((tool) => tool.name === "kraddle_close_episode");
    const closed = await close.handler({});
    assert.ok(!closed.isError, closed?.text);
    const expectedDigest = computeFileMapDigest({ ...files, "src/domain/service.ts": content });
    assert.ok(closed.text.includes(expectedDigest));

    const reloaded = new Workspace(workspaceDir);
    const loadResult = await reloaded.load();
    assert.equal(loadResult.trusted, true);
    const worktreeEvidence = [...loadResult.state.evidence.values()].find(
      (record) => record.stateRef?.revision?.endsWith("+worktree"),
    );
    assert.ok(worktreeEvidence, "resulting evidence must persist");
    assert.equal(worktreeEvidence.origin, "extractor");
    assert.equal(worktreeEvidence.approval_state, "accepted");
    const evaluation = [...loadResult.state.units.values()].find((unit) => unit.kind === "evaluation");
    assert.ok(evaluation, "evaluation profile must persist");
    assert.equal(evaluation.result, "satisfied");
    assert.equal(evaluation.stateRef.revision, worktreeEvidence.stateRef.revision);
    const proofObligation = [...loadResult.state.relationships.values()].some(
      (relationship) => relationship.profileId === "EP1" && relationship.role === "proof_obligation",
    );
    assert.ok(proofObligation, "proof obligation must persist");
  } finally {
    await rm(repoDir, { recursive: true, force: true });
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("closure refuses an episode whose working tree contains an unadmitted change", async () => {
  const { repoDir, workspaceDir, server } = await bootstrap();
  try {
    const write = server.tools.find((tool) => tool.name === "kraddle_write_file");
    const written = await write.handler({ path: "src/domain/service.ts", content: "export const service = () => 1;\n" });
    assert.ok(!written.isError);

    await fsWriteFile(join(repoDir, "src", "domain", "rogue.ts"), "export const rogue = 1;\n", "utf8");

    const close = server.tools.find((tool) => tool.name === "kraddle_close_episode");
    const closed = await close.handler({});
    assert.equal(closed.isError, true);
    assert.ok(closed.text.includes("UNCONTROLLED_EFFECT"));
    assert.ok(closed.text.includes("src/domain/rogue.ts"));
  } finally {
    await rm(repoDir, { recursive: true, force: true });
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("closure refuses an episode whose package.json was edited outside admission", async () => {
  const { repoDir, workspaceDir, server } = await bootstrap();
  try {
    const write = server.tools.find((tool) => tool.name === "kraddle_write_file");
    const written = await write.handler({ path: "src/domain/service.ts", content: "export const service = () => 1;\n" });
    assert.ok(!written.isError);

    await fsWriteFile(join(repoDir, "package.json"), '{\n  "name": "weakened"\n}\n', "utf8");

    const close = server.tools.find((tool) => tool.name === "kraddle_close_episode");
    const closed = await close.handler({});
    assert.equal(closed.isError, true);
    assert.ok(closed.text.includes("UNCONTROLLED_EFFECT"));
    assert.ok(closed.text.includes("package.json"));
  } finally {
    await rm(repoDir, { recursive: true, force: true });
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("closure refuses an episode in which a base file was deleted outside admission", async () => {
  const { repoDir, workspaceDir, server } = await bootstrap();
  try {
    const write = server.tools.find((tool) => tool.name === "kraddle_write_file");
    const written = await write.handler({ path: "src/domain/service.ts", content: "export const service = () => 1;\n" });
    assert.ok(!written.isError);

    await fsRm(join(repoDir, "src", "domain", "a.ts"));

    const close = server.tools.find((tool) => tool.name === "kraddle_close_episode");
    const closed = await close.handler({});
    assert.equal(closed.isError, true);
    assert.ok(closed.text.includes("UNCONTROLLED_EFFECT"));
    assert.ok(closed.text.includes("src/domain/a.ts"));
  } finally {
    await rm(repoDir, { recursive: true, force: true });
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("closure evidence edges obey the record's declared extractionScope", async () => {
  const { repoDir, workspaceDir, server } = await bootstrap({ testFixture: true });
  try {
    const write = server.tools.find((tool) => tool.name === "kraddle_write_file");
    const written = await write.handler({ path: "src/domain/service.ts", content: "export const service = () => 1;\n" });
    assert.ok(!written.isError);

    const close = server.tools.find((tool) => tool.name === "kraddle_close_episode");
    const closed = await close.handler({});
    assert.ok(!closed.isError, closed?.text);

    const reloaded = new Workspace(workspaceDir);
    const loadResult = await reloaded.load();
    assert.equal(loadResult.trusted, true);
    const worktreeEvidence = [...loadResult.state.evidence.values()].find(
      (record) => record.stateRef?.revision?.endsWith("+worktree"),
    );
    assert.ok(worktreeEvidence);
    assert.deepEqual(worktreeEvidence.extractionScope, { fromPrefixes: ["src/"] });
    assert.ok(worktreeEvidence.edges.length > 0);
    for (const edge of worktreeEvidence.edges) {
      assert.ok(
        edge.from.startsWith("src/"),
        `closure evidence edge outside declared scope: ${JSON.stringify(edge)}`,
      );
    }
  } finally {
    await rm(repoDir, { recursive: true, force: true });
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("closure denies on resolver incompleteness, same as preflight", async () => {
  const { repoDir, workspaceDir, server } = await bootstrap();
  try {
    const write = server.tools.find((tool) => tool.name === "kraddle_write_file");
    const written = await write.handler({ path: "src/domain/service.ts", content: "export const service = () => 1;\n" });
    assert.ok(!written.isError);

    const selector = server.state.commitments.get("S1");
    await server.workspace.transact([
      { type: "commitment.update", value: { ...selector, value: { type: "semantic_similarity", value: "auth-ish" } } },
    ]);

    const close = server.tools.find((tool) => tool.name === "kraddle_close_episode");
    const closed = await close.handler({});
    assert.equal(closed.isError, true);
    assert.ok(closed.text.includes("CONTEXT_INCOMPLETE"));
  } finally {
    await rm(repoDir, { recursive: true, force: true });
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("a denied write leaves no admission ledger entry", async () => {
  const { repoDir, workspaceDir, server } = await bootstrap();
  try {
    const write = server.tools.find((tool) => tool.name === "kraddle_write_file");
    const denied = await write.handler({
      path: "src/domain/service.ts",
      content: 'import { Button } from "../ui/Button";\nexport const service = Button;\n',
    });
    assert.equal(denied.isError, true);
    assert.ok(denied.text.includes("PREFLIGHT_VIOLATED"));
    const episode = server.state.units.get("EP1");
    assert.equal(episode.admittedEffects?.length ?? 0, 0);

    const clean = await write.handler({ path: "src/domain/service.ts", content: "export const service = () => 1;\n" });
    assert.ok(!clean.isError);
    assert.equal(server.state.units.get("EP1").admittedEffects.length, 1);
    assert.equal(server.state.units.get("EP1").observedEffects.length, 1);
  } finally {
    await rm(repoDir, { recursive: true, force: true });
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("a restarted server refuses an already-active episode", async () => {
  const { repoDir, workspaceDir, server } = await bootstrap();
  try {
    const write = server.tools.find((tool) => tool.name === "kraddle_write_file");
    const written = await write.handler({ path: "src/domain/service.ts", content: "export const service = () => 1;\n" });
    assert.ok(!written.isError);
    // No closure: the episode is left active with an admitted effect.

    await assert.rejects(
      () => createKraddleServer({
        repoDir,
        workspaceDir,
        episodeId: "EP1",
        baseEvidenceId: "EV-BASE",
      }),
      (e) => {
        assert.equal(e.code, "EPISODE_ALREADY_ACTIVE");
        assert.equal(e.detail.episodeId, "EP1");
        assert.equal(e.detail.admittedCount, 1);
        return true;
      },
    );
  } finally {
    await rm(repoDir, { recursive: true, force: true });
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("a read is denied when the authority omits the read operation", async () => {
  const { repoDir, workspaceDir, server } = await bootstrap({
    authority: { operations: ["write"], targetPrefix: "src/domain/" },
  });
  try {
    const read = server.tools.find((tool) => tool.name === "kraddle_read_file");
    const result = await read.handler({ path: "src/domain/a.ts" });
    assert.equal(result.isError, true);
    assert.ok(result.text.includes("OPERATION_NOT_AUTHORIZED"));
  } finally {
    await rm(repoDir, { recursive: true, force: true });
    await rm(workspaceDir, { recursive: true, force: true });
  }
});
