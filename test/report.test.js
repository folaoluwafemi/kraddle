import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { extractDependencies } from "../src/extract.js";
import { extractionReport } from "../src/report.js";
import { readRepoFiles } from "../src/repo.js";

const exec = promisify(execFile);

test("an all-resolved edge set reports full resolution", () => {
  const report = extractionReport({
    subjects: ["a.ts", "b.ts"],
    edges: [
      { from: "a.ts", to: "b.ts", spec: "./b", resolution: "resolved" },
      { from: "b.ts", to: "a.ts", spec: "./a", resolution: "resolved" },
    ],
  });
  assert.equal(report.totalEdges, 2);
  assert.deepEqual(report.byResolution, { resolved: 2, ambiguous: 0, unresolved: 0, external: 0 });
  assert.equal(report.resolvedRatio, 1);
  assert.equal(report.unknownRatio, 0);
});

test("a mixed edge set reports exact counts and ratios", () => {
  const report = extractionReport({
    subjects: [],
    edges: [
      { from: "a.ts", to: "b.ts", spec: "./b", resolution: "resolved" },
      { from: "c.ts", to: "d.ts", spec: "./d", resolution: "resolved" },
      { from: "e.ts", to: null, spec: "./x", resolution: "ambiguous" },
      { from: "f.ts", to: null, spec: "./y", resolution: "unresolved" },
      { from: "g.ts", to: "react", spec: "react", resolution: "external" },
      { from: "h.ts", to: "node:fs", spec: "node:fs", resolution: "external" },
      { from: "i.ts", to: "lodash", spec: "lodash", resolution: "external" },
    ],
  });
  assert.equal(report.totalEdges, 7);
  assert.deepEqual(report.byResolution, { resolved: 2, ambiguous: 1, unresolved: 1, external: 3 });
  assert.equal(report.resolvedRatio, Math.round((2 / 7) * 1000) / 1000);
  assert.equal(report.unknownRatio, Math.round((2 / 7) * 1000) / 1000);
});

test("the from-prefix breakdown groups by first path segment", () => {
  const report = extractionReport({
    subjects: [],
    edges: [
      { from: "src/domain/a.ts", to: "react", spec: "react", resolution: "external" },
      { from: "src/kernel.js", to: "src/x.js", spec: "./x", resolution: "resolved" },
      { from: "test/a.test.js", to: null, spec: "./missing", resolution: "unresolved" },
    ],
  });
  assert.deepEqual(report.fromPrefixBreakdown, {
    src: { resolved: 1, ambiguous: 0, unresolved: 0, external: 1 },
    test: { resolved: 0, ambiguous: 0, unresolved: 1, external: 0 },
  });
});

test("an integration run surfaces a dynamic import as unresolved", async () => {
  const root = await mkdtemp(join(tmpdir(), "kraddle-report-"));
  try {
    await exec("git", ["init"], { cwd: root });
    await writeFile(join(root, "a.ts"), `import { b } from "./b";\nimport { readFile } from "node:fs/promises";\n`);
    await writeFile(join(root, "b.ts"), `export const b = 1;\n`);
    await writeFile(join(root, "c.ts"), `const mod = import(someName);\n`);
    const { files } = await readRepoFiles(root);
    const { edges, subjects } = extractDependencies(files);
    const report = extractionReport({ edges, subjects });
    assert.equal(report.totalEdges, 3);
    assert.equal(report.byResolution.resolved, 1);
    assert.equal(report.byResolution.external, 1);
    assert.equal(report.byResolution.unresolved, 1);
    assert.equal(report.byResolution.ambiguous, 0);
    assert.equal(report.unknownRatio, Math.round((1 / 3) * 1000) / 1000);
    assert.deepEqual(report.fromPrefixBreakdown["."], { resolved: 1, ambiguous: 0, unresolved: 1, external: 1 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
