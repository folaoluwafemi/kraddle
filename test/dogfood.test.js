import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computeFileMapDigest, extractDependencies } from "../src/extract.js";
import { architectureRuleEvaluator } from "../src/evaluators.js";
import { gitStateRef, readRepoFiles } from "../src/repo.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// "kernel code must not import test or doc code", combined inline from two
// runs of the existing evaluator. No new exported combinator (G6).
const evaluateDogfoodRule = (files) => {
  const testRun = architectureRuleEvaluator({ sourcePrefix: "src/", forbiddenPrefix: "test/", files });
  const docsRun = architectureRuleEvaluator({ sourcePrefix: "src/", forbiddenPrefix: "docs/", files });
  if (testRun.result === "violated" || docsRun.result === "violated") return "violated";
  if (testRun.result === "unknown" || docsRun.result === "unknown") return "unknown";
  return "satisfied";
};

test("the dogfood gate: kraddle src imports neither its tests nor its docs", async () => {
  const { files } = await readRepoFiles(repoRoot);
  const { repository, revision } = await gitStateRef(repoRoot);
  const stateRef = { repository, revision, contentDigest: computeFileMapDigest(files) };

  assert.equal(typeof stateRef.revision, "string");
  assert.equal(stateRef.revision.length, 40);
  assert.equal(stateRef.contentDigest.length, 64);

  const { edges, subjects } = extractDependencies(files);
  assert.ok(subjects.length > 0, "subjects must be non-empty");

  const offenders = edges.filter(
    (edge) => edge.from.startsWith("src/") && edge.resolution !== "resolved" && edge.resolution !== "external",
  );
  assert.deepEqual(offenders, [], `dogfood gate: unresolved/ambiguous src/ edges: ${JSON.stringify(offenders, null, 2)}`);

  assert.equal(evaluateDogfoodRule(files), "satisfied");

  const probed = { ...files, "src/probe.ts": `import { anything } from "../test/dogfood.test.js";\n` };
  assert.equal(evaluateDogfoodRule(probed), "violated");
});
