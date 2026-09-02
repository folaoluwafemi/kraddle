import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { IGNORED_DIRS, readRepoFiles } from "../src/repo.js";

async function tempRoot() {
  return mkdtemp(join(tmpdir(), "kraddle-repo-"));
}

test("reads only source files, with POSIX keys, skipping ignored and dot dirs", async () => {
  const root = await tempRoot();
  try {
    await mkdir(join(root, "src", "domain"), { recursive: true });
    await mkdir(join(root, "src", "ui"), { recursive: true });
    await mkdir(join(root, "node_modules"), { recursive: true });
    await mkdir(join(root, ".git"), { recursive: true });
    await mkdir(join(root, "dist"), { recursive: true });
    await mkdir(join(root, ".cache"), { recursive: true });
    await writeFile(join(root, "src", "domain", "a.ts"), "export const a = 1;\n");
    await writeFile(join(root, "src", "ui", "b.tsx"), "export const b = 2;\n");
    await writeFile(join(root, "node_modules", "x.js"), "module.exports = 1;\n");
    await writeFile(join(root, ".git", "config"), "[core]\n");
    await writeFile(join(root, "dist", "out.js"), "export const out = 1;\n");
    await writeFile(join(root, ".cache", "y.ts"), "export const y = 1;\n");
    const { files, skipped } = await readRepoFiles(root);
    assert.deepEqual(Object.keys(files).sort(), ["src/domain/a.ts", "src/ui/b.tsx"]);
    assert.deepEqual(skipped, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("exceeding maxFiles throws an explicit truncation signal", async () => {
  const root = await tempRoot();
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "a.ts"), "export const a = 1;\n");
    await writeFile(join(root, "src", "b.ts"), "export const b = 2;\n");
    await assert.rejects(
      () => readRepoFiles(root, { maxFiles: 1 }),
      (e) => e instanceof Error,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an oversized file is skipped and reported", async () => {
  const root = await tempRoot();
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "small.ts"), "export const a = 1;");
    await writeFile(join(root, "src", "large.ts"), "x".repeat(64));
    const { files, skipped } = await readRepoFiles(root, { maxBytes: 20 });
    assert.deepEqual(Object.keys(files), ["src/small.ts"]);
    assert.deepEqual(skipped, [{ path: "src/large.ts", reason: "too_large" }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an empty directory yields an empty map without throwing", async () => {
  const root = await tempRoot();
  try {
    const { files, skipped } = await readRepoFiles(root);
    assert.deepEqual(files, {});
    assert.deepEqual(skipped, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("IGNORED_DIRS contains the Phase 1 ignore set", () => {
  assert.deepEqual(IGNORED_DIRS, ["node_modules", ".git", ".kraddle", "dist", "build", "coverage"]);
});
