import assert from "node:assert/strict";
import { test } from "node:test";
import { computeFileMapDigest, extractDependencies, SOURCE_EXTENSIONS } from "../src/extract.js";

test("a relative spec matching a key exactly is resolved", () => {
  const files = {
    "a/x.ts": `import { y } from "./y.ts";\n`,
    "a/y.ts": `export const y = 1;\n`,
  };
  const { edges, subjects, limitations } = extractDependencies(files);
  assert.equal(limitations, "regex-extraction");
  assert.deepEqual(subjects, ["a/x.ts", "a/y.ts"]);
  assert.equal(edges.length, 1);
  assert.deepEqual(edges[0], { from: "a/x.ts", to: "a/y.ts", spec: "./y.ts", resolution: "resolved" });
});

test("a bare specifier is external", () => {
  const files = {
    "src/ui/Button.tsx": `import React from "react";\n`,
  };
  const { edges } = extractDependencies(files);
  assert.equal(edges.length, 1);
  assert.deepEqual(edges[0], { from: "src/ui/Button.tsx", to: "react", spec: "react", resolution: "external" });
});

test("two candidate extensions make an ambiguous edge", () => {
  const files = {
    "a/x.ts": `import { b } from "./Button";\n`,
    "a/Button.ts": `export const b = 1;\n`,
    "a/Button.js": `export const b = 2;\n`,
  };
  const { edges } = extractDependencies(files);
  assert.equal(edges.length, 1);
  assert.equal(edges[0].resolution, "ambiguous");
  assert.equal(edges[0].to, null);
  assert.deepEqual(edges[0].candidates, ["a/Button.ts", "a/Button.js"]);
});

test("a dynamic import of a computed value is unresolved", () => {
  const files = {
    "src/domain/service.ts": `const mod = import(cfg.button);\n`,
  };
  const { edges } = extractDependencies(files);
  assert.equal(edges.length, 1);
  assert.equal(edges[0].resolution, "unresolved");
  assert.equal(edges[0].to, null);
  assert.equal(edges[0].spec, null);
  assert.equal(edges[0].from, "src/domain/service.ts");
});

test("a relative spec with no candidate is unresolved", () => {
  const files = {
    "a/x.ts": `import { missing } from "./missing";\n`,
  };
  const { edges } = extractDependencies(files);
  assert.equal(edges.length, 1);
  assert.equal(edges[0].resolution, "unresolved");
  assert.equal(edges[0].to, null);
  assert.equal(edges[0].spec, "./missing");
});

test("the file map digest is order-insensitive and content-sensitive", () => {
  const a = { "a.ts": "one", "b.ts": "two" };
  const b = { "b.ts": "two", "a.ts": "one" };
  assert.equal(computeFileMapDigest(a), computeFileMapDigest(b));
  const c = { "a.ts": "one", "b.ts": "three" };
  assert.notEqual(computeFileMapDigest(a), computeFileMapDigest(c));
  assert.deepEqual(SOURCE_EXTENSIONS, [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
});
