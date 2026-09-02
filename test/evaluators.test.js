import assert from "node:assert/strict";
import { test } from "node:test";
import { architectureRuleEvaluator } from "../src/evaluators.js";
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
