import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { computeFileMapDigest, extractDependencies } from "../src/extract.js";
import { architectureRuleEvaluator } from "../src/evaluators.js";
import * as kernel from "../src/kernel.js";

const { DENIAL, Workspace, admitEffect, evaluate, recordObservedEffect, resolveApplicableContext, validateEpisodeClosure } = kernel;

const env = (over = {}) => ({
  origin: "human", epistemic_basis: "asserted",
  approval_state: "accepted", freshness_state: "current",
  recorded_at: 1756771200000, ...over,
});

const unitRecord = (recordId, kind, extra = {}) => ({ id: recordId, kind, ...env(), ...extra });
const commitmentRecord = (recordId, value, extra = {}) => ({ id: recordId, kind: "commitment", value, ...env(), ...extra });
const rel = (recordId, profileId, role, targetId, targetType) => ({ id: recordId, kind: "relationship", profileId, role, targetId, targetType, ...env() });

async function runDemoSequence(files) {
  const stateRef = { repository: "demo-repo", revision: "rev-b", contentDigest: computeFileMapDigest(files) };
  const root = await mkdtemp(join(tmpdir(), "kraddle-"));
  const store = new Workspace(root);
  await store.init();

  await store.transact([
    { type: "scope.create", value: { id: "SC1", kind: "scope", ...env() } },
    { type: "unit.create", value: unitRecord("EV-UNIT", "evaluator") },
    { type: "commitment.create", value: commitmentRecord("C1", "domain must not import ui", { forbiddenPathPrefix: "src/ui/" }) },
    { type: "commitment.create", value: commitmentRecord("S1", { type: "path_prefix", value: "src/domain/" }) },
    { type: "commitment.create", value: commitmentRecord("M1", "prohibition") },
    { type: "unit.create", value: unitRecord("CB1", "control_binding") },
    { type: "relationship.add", value: rel("cb-governed", "CB1", "governed_commitment", "C1", "commitment") },
    { type: "relationship.add", value: rel("cb-selector", "CB1", "subject_selector", "S1", "commitment") },
    { type: "relationship.add", value: rel("cb-modality", "CB1", "modality", "M1", "commitment") },
    { type: "relationship.add", value: rel("cb-evaluator", "CB1", "evaluator", "EV-UNIT", "unit") },
  ], { profileIds: ["CB1"] });

    const { edges, subjects, limitations } = extractDependencies(files);
    await store.transact([
      { type: "evidence.create", value: {
        id: "EV-DEP", kind: "evidence", ...env({ origin: "extractor", epistemic_basis: "observed" }),
        stateRef, edges, subjects, limitations,
        extractionScope: { fromPrefixes: ["src/"] },
      } },
    ]);

  const resolved = resolveApplicableContext(store.state, {
    targetPaths: ["src/domain/service.ts"],
    declaredApplicable: ["CB1"],
    revision: "rev-b",
    dependencyEvidenceId: "EV-DEP",
  });
  assert.equal(resolved.complete, true);
  assert.deepEqual(resolved.applicable, ["CB1"]);

  await store.transact([
    { type: "commitment.create", value: commitmentRecord("EP-PURPOSE", "add a domain service without importing ui") },
    { type: "commitment.create", value: commitmentRecord("EP-BASE", "rev-a") },
    { type: "commitment.create", value: commitmentRecord("EP-OUTCOME", "service added under the governing control") },
    { type: "unit.create", value: unitRecord("EP-CTX", "context_envelope", { valid: true, completeness: "complete", complete: true, incompleteReasons: [] }) },
    { type: "unit.create", value: unitRecord("EP-AUTH", "authority_grant", { operations: ["write"], allowRecordIds: [] }) },
    { type: "unit.create", value: unitRecord("EP-DELTA", "software_element") },
    { type: "unit.create", value: unitRecord("EP1", "execution_episode", {
      lifecycle: "running",
      baseStateRef: { repository: "demo-repo", revision: "rev-a", contentDigest: "digest-a" },
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

  const admission = admitEffect(store.state, "EP1", { operation: "write", target: "src/domain/service.ts" });
  assert.equal(admission.admitted, true);
  recordObservedEffect(store.state, "EP1", {
    operation: "write",
    target: "src/domain/service.ts",
    admissionId: admission.admissionId,
  });

  const ev = await evaluate(store.state, {
    evaluationId: "EV1",
    evaluatorId: "architecture-rule",
    evaluatorVersion: "0.1.0",
    subjects: ["src/domain/service.ts", "src/domain/helper.ts"],
    stateRef,
    run: () => architectureRuleEvaluator({ sourcePrefix: "src/domain/", forbiddenPrefix: "src/ui/", files }),
  });

  await store.transact([
    { type: "unit.create", value: ev },
    { type: "commitment.create", value: commitmentRecord("EV-RESULT", ev.result) },
    { type: "commitment.create", value: commitmentRecord("EV-COVERAGE", "typed") },
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

  return { root, store, ev };
}

test("the two-block demo", async () => {
  const files = {
    "src/domain/service.ts": `import { Button } from "../ui/Button";\n`,
    "src/domain/helper.ts": `export const helper = () => 1;\n`,
    "src/ui/Button.tsx": `import React from "react";\n`,
  };
  const { root, store, ev } = await runDemoSequence(files);
  try {
    assert.equal(ev.result, "violated");

    assert.throws(
      () => validateEpisodeClosure(store.state, "EP1"),
      (e) => e.code === DENIAL.EVALUATION_NOT_SATISFIED,
    );

    const eventsDir = join(root, ".kraddle", "events");
    const countSegments = async () => (await readdir(eventsDir)).filter((name) => name.endsWith(".krd")).length;
    const before = await countSegments();
    const c1 = store.state.commitments.get("C1");

    await assert.rejects(
      () => store.transact(
        [{ type: "commitment.update", value: { ...c1, value: "domain may import ui" } }],
        { actorId: "agent-1", episodeId: "EP1" },
      ),
      (e) => e.code === DENIAL.SELF_AMENDMENT_DENIED,
    );
    assert.equal(await countSegments(), before);
    assert.equal(store.state.commitments.get("C1").value, "domain must not import ui");

    await assert.rejects(
      () => store.transact(
        [{ type: "relationship.add", value: { ...rel("graft-1", "CB1", "evaluator", "fake-evaluator", "unit"), approval_state: "proposed" } }],
        { actorId: "agent-1", episodeId: "EP1" },
      ),
      (e) => e.code === DENIAL.PROFILE_GRAFT_DENIED,
    );
    assert.equal(await countSegments(), before);
    assert.equal(store.state.commitments.get("C1").value, "domain must not import ui");
    const evaluatorEdges = [...store.state.relationships.values()].filter((r) => r.profileId === "CB1" && r.role === "evaluator");
    assert.equal(evaluatorEdges.length, 1);
    assert.equal(evaluatorEdges[0].targetId, "EV-UNIT");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the clean control closes", async () => {
  const files = {
    "src/domain/service.ts": `import { helper } from "./helper";\n`,
    "src/domain/helper.ts": `export const helper = () => 1;\n`,
    "src/ui/Button.tsx": `import React from "react";\n`,
  };
  const { root, store, ev } = await runDemoSequence(files);
  try {
    assert.equal(ev.result, "satisfied");
    assert.deepEqual(validateEpisodeClosure(store.state, "EP1"), { closable: true, episodeId: "EP1" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
