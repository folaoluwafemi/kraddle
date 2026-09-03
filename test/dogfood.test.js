import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computeFileMapDigest, extractDependencies } from "../src/extract.js";
import { architectureRuleEvaluator } from "../src/evaluators.js";
import { computeCoverageDigest, evaluate, resolveApplicableContext, validateEpisodeClosure, Workspace } from "../src/kernel.js";
import { extractionReport } from "../src/report.js";
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

test("the dogfood episode closes on real state", async () => {
  const { files } = await readRepoFiles(repoRoot);
  const { repository, revision } = await gitStateRef(repoRoot);
  const stateRef = { repository, revision, contentDigest: computeFileMapDigest(files) };
  const { edges, subjects } = extractDependencies(files);

  const report = extractionReport({ edges, subjects });
  const srcBreakdown = report.fromPrefixBreakdown["src"];
  const srcTotal = srcBreakdown
    ? srcBreakdown.resolved + srcBreakdown.ambiguous + srcBreakdown.unresolved + srcBreakdown.external
    : 0;
  const srcUnknown = srcBreakdown ? srcBreakdown.ambiguous + srcBreakdown.unresolved : 0;
  const srcUnknownRatio = srcTotal === 0 ? 1 : srcUnknown / srcTotal;
  assert.ok(srcUnknownRatio < 0.1, `dogfood standing gate: unknownRatio for src/ is ${srcUnknownRatio}`);

  const root = await mkdtemp(join(tmpdir(), "kraddle-episode-"));
  try {
    const store = new Workspace(root);
    await store.init();

    const env = (over = {}) => ({
      origin: "human", epistemic_basis: "asserted",
      approval_state: "accepted", freshness_state: "current",
      recorded_at: 1756771200000, ...over,
    });
    const commitment = (recordId, value, over = {}) => ({ id: recordId, kind: "commitment", value, ...env(over) });
    const unitRecord = (recordId, kind, over = {}) => ({ id: recordId, kind, ...env(over) });
    const rel = (recordId, profileId, role, targetId, targetType) => ({
      id: recordId, kind: "relationship", profileId, role, targetId, targetType, ...env(),
    });

    await store.transact([
      { type: "scope.create", value: { id: "SC1", kind: "scope", ...env() } },
      { type: "unit.create", value: unitRecord("EVAL-UNIT", "evaluator") },
      { type: "commitment.create", value: commitment("C1", "kernel code must not import test or doc code", { forbiddenPathPrefixes: ["test/", "docs/"] }) },
      { type: "commitment.create", value: commitment("S1", { type: "path_prefix", value: "src/" }) },
      { type: "commitment.create", value: commitment("M1", "prohibition") },
      { type: "unit.create", value: unitRecord("CB1", "control_binding") },
      { type: "relationship.add", value: rel("cb-governed", "CB1", "governed_commitment", "C1", "commitment") },
      { type: "relationship.add", value: rel("cb-selector", "CB1", "subject_selector", "S1", "commitment") },
      { type: "relationship.add", value: rel("cb-modality", "CB1", "modality", "M1", "commitment") },
      { type: "relationship.add", value: rel("cb-evaluator", "CB1", "evaluator", "EVAL-UNIT", "unit") },
    ], { profileIds: ["CB1"] });

    // Evidence is scoped to the traversed region (the governed src/ tree):
    // every edge is a real observed edge, the stateRef pins the full file map.
    // Repo-wide, 9 unresolved edges exist — all from test/ fixture strings,
    // outside this region; the standing gate above already measures src/.
    const regionEdges = edges.filter((edge) => edge.from.startsWith("src/"));
    assert.ok(regionEdges.length > 0);
    assert.ok(regionEdges.every((edge) => edge.resolution === "resolved" || edge.resolution === "external"));

    await store.transact([
      { type: "evidence.create", value: {
        id: "EV-DEP", kind: "evidence", ...env({ origin: "extractor", epistemic_basis: "observed" }),
        stateRef, edges: regionEdges, subjects,
        extractionScope: { fromPrefixes: ["src/"] },
      } },
    ]);

    const resolved = resolveApplicableContext(store.state, {
      targetPaths: subjects.filter((path) => path.startsWith("src/")),
      declaredApplicable: ["CB1"],
      revision,
      dependencyEvidenceId: "EV-DEP",
    });
    assert.equal(resolved.complete, true);
    assert.deepEqual(resolved.applicable, ["CB1"]);

    await store.transact([
      { type: "commitment.create", value: commitment("EP-PURPOSE", "verify the dogfood rule on real repository state") },
      { type: "commitment.create", value: commitment("EP-BASE", "real repository state") },
      { type: "commitment.create", value: commitment("EP-OUTCOME", "kernel sources remain layered") },
      { type: "unit.create", value: unitRecord("EP-CTX", "context_envelope", { valid: true, completeness: "complete", complete: true, incompleteReasons: [] }) },
      { type: "unit.create", value: unitRecord("EP-AUTH", "authority_grant", { operations: ["write"], allowRecordIds: [] }) },
      { type: "unit.create", value: unitRecord("EP-DELTA", "software_element") },
      { type: "unit.create", value: unitRecord("EP1", "execution_episode", {
        lifecycle: "running",
        noOp: true,
        baseStateRef: stateRef,
        resultingStateRef: stateRef,
      }) },
      { type: "relationship.add", value: rel("ep-purpose", "EP1", "purpose", "EP-PURPOSE", "commitment") },
      { type: "relationship.add", value: rel("ep-scope", "EP1", "target_scope", "SC1", "scope") },
      { type: "relationship.add", value: rel("ep-base", "EP1", "base_revision", "EP-BASE", "commitment") },
      { type: "relationship.add", value: rel("ep-context", "EP1", "context_envelope", "EP-CTX", "unit") },
      { type: "relationship.add", value: rel("ep-authority", "EP1", "authority_grant", "EP-AUTH", "unit") },
      { type: "relationship.add", value: rel("ep-delta", "EP1", "intended_delta", "EP-DELTA", "unit") },
      { type: "relationship.add", value: rel("ep-outcome", "EP1", "outcome", "EP-OUTCOME", "commitment") },
    ], { profileIds: ["EP1"] });

    const ev = await evaluate(store.state, {
      evaluationId: "EV1",
      evaluatorId: "architecture-rule",
      evaluatorVersion: "0.1.0",
      subjects: subjects.filter((path) => path.startsWith("src/")),
      stateRef,
      run: () => {
        const testRun = architectureRuleEvaluator({ sourcePrefix: "src/", forbiddenPrefix: "test/", files });
        const docsRun = architectureRuleEvaluator({ sourcePrefix: "src/", forbiddenPrefix: "docs/", files });
        const result =
          testRun.result === "violated" || docsRun.result === "violated" ? "violated"
          : testRun.result === "unknown" || docsRun.result === "unknown" ? "unknown"
          : "satisfied";
        const coverage = {
          requiredSubjects: [...new Set([...testRun.coverage.requiredSubjects, ...docsRun.coverage.requiredSubjects])].sort(),
          coveredSubjects: [...new Set([...testRun.coverage.coveredSubjects, ...docsRun.coverage.coveredSubjects])].sort(),
          unknownSubjects: [...new Set([...testRun.coverage.unknownSubjects, ...docsRun.coverage.unknownSubjects])].sort(),
          excludedSubjects: [],
          selectionMethod: "source_prefix_files_combined",
        };
        coverage.coverageDigest = computeCoverageDigest(coverage);
        return { result, coverage };
      },
    });
    assert.equal(ev.result, "satisfied");

    await store.transact([
      { type: "unit.create", value: ev },
      { type: "commitment.create", value: commitment("EV-RESULT", ev.result) },
      { type: "commitment.create", value: commitment("EV-COVERAGE", "typed") },
      { type: "unit.create", value: unitRecord("EV-SEL", "selector") },
      { type: "unit.create", value: unitRecord("EV-EVAL", "evaluator") },
      { type: "relationship.add", value: rel("ev-target", "EV1", "target_commitment", "C1", "commitment") },
      { type: "relationship.add", value: rel("ev-selector", "EV1", "target_selector", "EV-SEL", "unit") },
      { type: "relationship.add", value: rel("ev-scope", "EV1", "source_scope", "SC1", "scope") },
      { type: "relationship.add", value: rel("ev-evaluator", "EV1", "evaluator", "EV-EVAL", "unit") },
      { type: "relationship.add", value: rel("ev-result", "EV1", "result", "EV-RESULT", "commitment") },
      { type: "relationship.add", value: rel("ev-coverage", "EV1", "coverage", "EV-COVERAGE", "commitment") },
      { type: "relationship.add", value: rel("ep-proof", "EP1", "proof_obligation", "EV1", "unit") },
    ], { profileIds: ["EV1"] });

    assert.deepEqual(validateEpisodeClosure(store.state, "EP1"), { closable: true, episodeId: "EP1" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
