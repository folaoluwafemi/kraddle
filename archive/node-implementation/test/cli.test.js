import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { runCli } from "../src/cli.js";
import { validateProfile, Workspace } from "../src/kernel.js";
import { createKraddleServer } from "../src/server.js";
import { readRepoFiles } from "../src/repo.js";
import { extractDependencies } from "../src/extract.js";

const exec = promisify(execFile);

async function tempRepo() {
  const root = await mkdtemp(join(tmpdir(), "kraddle-cli-"));
  await mkdir(join(root, "src", "domain"), { recursive: true });
  await mkdir(join(root, "src", "ui"), { recursive: true });
  await writeFile(join(root, "src", "domain", "a.ts"), "export const a = 1;\n");
  await writeFile(join(root, "src", "ui", "Button.tsx"), 'import React from "react";\n');
  await exec("git", ["init"], { cwd: root });
  await exec("git", ["config", "user.email", "test@example.com"], { cwd: root });
  await exec("git", ["config", "user.name", "Test"], { cwd: root });
  await exec("git", ["add", "src/domain/a.ts", "src/ui/Button.tsx"], { cwd: root });
  await exec("git", ["commit", "-m", "init"], { cwd: root });
  return root;
}

test("init creates a workspace and reports its path", async () => {
  const root = await tempRepo();
  try {
    const result = await runCli(["init", "--repo", root]);
    assert.equal(result.code, 0);
    assert.ok(result.output.includes(join(root, ".kraddle")));
    assert.ok(result.output.includes("governs"));
    await access(join(root, ".kraddle", "manifest.krd"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("init twice is refused with WORKSPACE_EXISTS", async () => {
  const root = await tempRepo();
  try {
    const first = await runCli(["init", "--repo", root]);
    assert.equal(first.code, 0);
    const second = await runCli(["init", "--repo", root]);
    assert.equal(second.code, 1);
    assert.ok(second.output.includes("WORKSPACE_EXISTS"));
    assert.ok(!/    at /.test(second.output), "no stack frames in CLI failure output");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rule add declares a governing rule pinned to HEAD and scoped", async () => {
  const root = await tempRepo();
  try {
    await runCli(["init", "--repo", root]);
    const result = await runCli([
      "rule", "add", "--repo", root,
      "--source", "src/domain", "--forbid", "src/ui",
      "--text", "domain must not import ui",
    ]);
    assert.equal(result.code, 0, result.output);
    const bindingMatch = result.output.match(/binding\s+(\S+)/);
    const evidenceMatch = result.output.match(/evidence\s+(\S+)/);
    assert.ok(bindingMatch, `output names the binding id: ${result.output}`);
    assert.ok(evidenceMatch, `output names the evidence id: ${result.output}`);
    assert.ok(result.output.includes("rev"), "output mentions the pinned revision");

    const store = new Workspace(root);
    await store.load();
    const bindingId = bindingMatch[1];
    const summary = validateProfile(store.state, bindingId);
    assert.equal(summary.kind, "control_binding");
    const evidence = store.state.evidence.get(evidenceMatch[1]);
    const { stdout } = await exec("git", ["rev-parse", "HEAD"], { cwd: root });
    assert.equal(evidence.stateRef.revision, stdout.trim());
    const { files } = await readRepoFiles(root);
    const { edges } = extractDependencies(files);
    const scoped = edges.filter((edge) => edge.from.startsWith("src/domain/"));
    assert.equal(evidence.edges.length, scoped.length);
    assert.deepEqual(evidence.extractionScope, { fromPrefixes: ["src/domain/"] });
    const governed = [...store.state.commitments.values()].find(
      (commitment) => commitment.value === "domain must not import ui",
    );
    assert.ok(governed);
    assert.deepEqual(governed.forbiddenPathPrefixes, ["src/ui/"]);
    const evaluator = [...store.state.units.values()].find(
      (unit) => unit.kind === "evaluator" && unit.evaluatorType === "architecture_rule",
    );
    assert.ok(evaluator);
    assert.equal(evaluator.params.sourcePrefix, "src/domain/");
    assert.deepEqual(evaluator.params.forbiddenPrefixes, ["src/ui/"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rule add refuses an unsatisfiable rule", async () => {
  const root = await tempRepo();
  try {
    await runCli(["init", "--repo", root]);
    const result = await runCli([
      "rule", "add", "--repo", root,
      "--source", "src", "--forbid", "src",
      "--text", "src must not import src",
    ]);
    assert.equal(result.code, 1);
    assert.ok(result.output.includes("unsatisfiable"), result.output);
    assert.ok(!/    at /.test(result.output));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rule add requires --text", async () => {
  const root = await tempRepo();
  try {
    await runCli(["init", "--repo", root]);
    const result = await runCli([
      "rule", "add", "--repo", root,
      "--source", "src/domain", "--forbid", "src/ui",
    ]);
    assert.equal(result.code, 1);
    assert.ok(result.output.includes("usage"), result.output);
    assert.ok(!/    at /.test(result.output));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("episode start prints env vars the server can boot from", async () => {
  const root = await tempRepo();
  try {
    await runCli(["init", "--repo", root]);
    await runCli([
      "rule", "add", "--repo", root,
      "--source", "src/domain", "--forbid", "src/ui",
      "--text", "domain must not import ui",
    ]);
    const result = await runCli([
      "episode", "start", "--repo", root,
      "--task", "add a domain service",
      "--write-prefix", "src/domain",
    ]);
    assert.equal(result.code, 0, result.output);

    const env = {};
    for (const line of result.output.split("\n")) {
      const match = line.match(/^(KRADDLE_[A-Z_]+)=(.*)$/);
      if (match) env[match[1]] = match[2];
    }
    assert.equal(env.KRADDLE_REPO, root);
    assert.ok(env.KRADDLE_WORKSPACE_DIR);
    assert.ok(env.KRADDLE_EPISODE_ID);
    assert.ok(env.KRADDLE_BASE_EVIDENCE_ID);

    const server = await createKraddleServer({
      repoDir: env.KRADDLE_REPO,
      workspaceDir: root,
      episodeId: env.KRADDLE_EPISODE_ID,
      baseEvidenceId: env.KRADDLE_BASE_EVIDENCE_ID,
    });
    assert.ok(server.tools.length === 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("episode start requires --write-prefix", async () => {
  const root = await tempRepo();
  try {
    await runCli(["init", "--repo", root]);
    await runCli([
      "rule", "add", "--repo", root,
      "--source", "src/domain", "--forbid", "src/ui",
      "--text", "domain must not import ui",
    ]);
    const result = await runCli([
      "episode", "start", "--repo", root,
      "--task", "add a domain service",
    ]);
    assert.equal(result.code, 1);
    assert.ok(result.output.includes("usage"), result.output);
    assert.ok(!/    at /.test(result.output));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function bootstrappedRepo() {
  const root = await tempRepo();
  await runCli(["init", "--repo", root]);
  await runCli([
    "rule", "add", "--repo", root,
    "--source", "src/domain", "--forbid", "src/ui",
    "--text", "domain must not import ui",
  ]);
  const started = await runCli([
    "episode", "start", "--repo", root,
    "--task", "add a domain service",
    "--write-prefix", "src/domain",
  ]);
  assert.equal(started.code, 0, started.output);
  const episodeId = started.output.match(/KRADDLE_EPISODE_ID=(\S+)/)[1];
  return { root, episodeId };
}

test("status names rules and episodes", async () => {
  const { root, episodeId } = await bootstrappedRepo();
  try {
    const result = await runCli(["status", "--repo", root]);
    assert.equal(result.code, 0, result.output);
    assert.ok(result.output.includes("trusted"), result.output);
    assert.ok(result.output.includes("domain must not import ui"), result.output);
    assert.ok(result.output.includes(episodeId), result.output);
    assert.ok(result.output.includes("authorized"), result.output);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("abort sets the episode lifecycle to aborted", async () => {
  const { root, episodeId } = await bootstrappedRepo();
  try {
    const result = await runCli(["episode", "abort", episodeId, "--repo", root]);
    assert.equal(result.code, 0, result.output);
    const store = new Workspace(root);
    await store.load();
    assert.equal(store.state.units.get(episodeId).lifecycle, "aborted");

    const unknown = await runCli(["episode", "abort", "EP-doesnotexist", "--repo", root]);
    assert.equal(unknown.code, 1);
    assert.ok(!/    at /.test(unknown.output));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
