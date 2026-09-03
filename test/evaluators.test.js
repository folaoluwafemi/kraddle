import assert from "node:assert/strict";
import { test } from "node:test";
import { architectureRuleEvaluator, runEvaluator } from "../src/evaluators.js";
import { validateCoverage } from "../src/kernel.js";

test("a domain file importing ui is violated", () => {
  const files = {
    "src/domain/service.ts": `import { Button } from "../ui/Button.tsx";\n`,
    "src/ui/Button.tsx": `import React from "react";\n`,
  };
  const { result, coverage } = architectureRuleEvaluator({
    sourcePrefix: "src/domain/",
    forbiddenPrefix: "src/ui/",
    files,
  });
  assert.equal(result, "violated");
  assert.deepEqual(coverage.unknownSubjects, []);
});

test("a dynamic import in a domain file is unknown", () => {
  const files = {
    "src/domain/service.ts": `const mod = import(cfg.button);\n`,
    "src/ui/Button.tsx": `import React from "react";\n`,
  };
  const { result, coverage } = architectureRuleEvaluator({
    sourcePrefix: "src/domain/",
    forbiddenPrefix: "src/ui/",
    files,
  });
  assert.equal(result, "unknown");
  assert.ok(coverage.unknownSubjects.includes("src/domain/service.ts"));
});

test("a clean domain map is satisfied with sufficient coverage", () => {
  const files = {
    "src/domain/service.ts": `import { helper } from "./helper";\n`,
    "src/domain/helper.ts": `export const helper = () => 1;\n`,
    "src/ui/Button.tsx": `import React from "react";\n`,
  };
  const { result, coverage } = architectureRuleEvaluator({
    sourcePrefix: "src/domain/",
    forbiddenPrefix: "src/ui/",
    files,
  });
  assert.equal(result, "satisfied");
  assert.deepEqual(validateCoverage(coverage), { sufficient: true });
});

test("runEvaluator executes a configured architecture rule", () => {
  const evaluatorUnit = {
    id: "E1",
    kind: "evaluator",
    evaluatorType: "architecture_rule",
    params: { sourcePrefix: "src/domain/", forbiddenPrefixes: ["src/ui/"] },
  };
  const files = {
    "src/domain/service.ts": `import { Button } from "../ui/Button.tsx";\n`,
    "src/ui/Button.tsx": `import React from "react";\n`,
  };
  const { result } = runEvaluator(evaluatorUnit, files);
  assert.equal(result, "violated");
});

test("runEvaluator returns unknown for an unrecognized evaluator type", () => {
  const evaluatorUnit = {
    id: "E2",
    kind: "evaluator",
    evaluatorType: "semantic_vibes",
    params: { sourcePrefix: "src/domain/", forbiddenPrefixes: ["src/ui/"] },
  };
  const outcome = runEvaluator(evaluatorUnit, { "src/domain/a.ts": "export const a = 1;\n" });
  assert.equal(outcome.result, "unknown");
  assert.equal(outcome.reason, "unknown_evaluator_type");
});

test("runEvaluator returns unknown for invalid params", () => {
  const evaluatorUnit = {
    id: "E3",
    kind: "evaluator",
    evaluatorType: "architecture_rule",
    params: { sourcePrefix: "src/domain/" },
  };
  const outcome = runEvaluator(evaluatorUnit, { "src/domain/a.ts": "export const a = 1;\n" });
  assert.equal(outcome.result, "unknown");
  assert.equal(outcome.reason, "evaluator_params_invalid");
});
