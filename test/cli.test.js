import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { runCli } from "../src/cli.js";

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
