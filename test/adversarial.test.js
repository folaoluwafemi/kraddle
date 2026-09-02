import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import * as kernel from "../src/kernel.js";

const { DENIAL, Workspace, admitEffect, classifyEffect, computeCoverageDigest, emptyState, episodeStatus, evaluate, id, recordObservedEffect, resolveApplicableContext, validateCoverage, validateEpisodeClosure } = kernel;

const env = (over = {}) => ({
  origin: "human", epistemic_basis: "asserted",
  approval_state: "accepted", freshness_state: "current",
  recorded_at: 1756771200000, ...over,
});

const unitRecord = (recordId, kind = "behavior") => ({ id: recordId, kind, title: kind, ...env() });
const commitmentRecord = (recordId, value, type = "statement", over = {}) => ({ id: recordId, kind: "commitment", type, value, ...env(over) });
const rel = (recordId, profileId, role, targetId, targetType, over = {}) => ({ id: recordId, kind: "relationship", profileId, role, targetId, targetType, ...env(over) });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function episodeState({ authority = {}, episode = {}, context = {} } = {}) {
  const state = emptyState();
  state.units.set("EP1", { id: "EP1", kind: "execution_episode", lifecycle: "running", ...env(), ...episode });
  state.commitments.set("purpose-c", commitmentRecord("purpose-c", "do work"));
  state.scopes.set("scope-r", { id: "scope-r", kind: "scope", ...env() });
  state.commitments.set("base-c", commitmentRecord("base-c", "revision-a"));
  state.units.set("context-u", { id: "context-u", kind: "context_envelope", valid: true, completeness: "complete", ...env(), ...context });
  state.units.set("authority-u", { id: "authority-u", kind: "authority_grant", ...env(), ...authority });
  state.units.set("delta-u", { id: "delta-u", kind: "software_element", ...env() });
  const edges = [
    ["rel-purpose", "purpose", "purpose-c", "commitment"],
    ["rel-scope", "target_scope", "scope-r", "scope"],
    ["rel-base", "base_revision", "base-c", "commitment"],
    ["rel-context", "context_envelope", "context-u", "unit"],
    ["rel-authority", "authority_grant", "authority-u", "unit"],
    ["rel-delta", "intended_delta", "delta-u", "unit"],
  ];
  for (const [recordId, role, targetId, targetType] of edges) {
    state.relationships.set(recordId, rel(recordId, "EP1", role, targetId, targetType));
  }
  return state;
}

const episodeFixtureOperations = ({ authority = {}, episode = {} } = {}) => {
  const state = episodeState({ authority, episode });
  return [
    { type: "unit.create", value: state.units.get("EP1") },
    { type: "commitment.create", value: state.commitments.get("purpose-c") },
    { type: "scope.create", value: state.scopes.get("scope-r") },
    { type: "commitment.create", value: state.commitments.get("base-c") },
    { type: "unit.create", value: state.units.get("context-u") },
    { type: "unit.create", value: state.units.get("authority-u") },
    { type: "unit.create", value: state.units.get("delta-u") },
    ...[...state.relationships.values()].map((value) => ({ type: "relationship.add", value })),
  ];
};

test("AD-12: an interrupted transaction is never projected", async () => {
  const root = await mkdtemp(join(tmpdir(), "kraddle-"));
  try {
    const store = new Workspace(root);
    await store.init();
    const t1 = id();
    await store.transact([{ type: "unit.create", value: unitRecord(t1) }]);
    await sleep(3);
    const t2 = id();
    await store.transact([{ type: "unit.create", value: unitRecord(t2) }]);
    await sleep(3);
    const t3 = id();
    await store.transact([{ type: "unit.create", value: unitRecord(t3) }]);

    const pristine = new Workspace(root);
    const pristineResult = await pristine.load();
    assert.equal(pristineResult.trusted, true);
    assert.equal(pristineResult.projectedThrough, 3);

    const eventsDir = join(root, ".kraddle", "events");
    const files = (await readdir(eventsDir)).filter((name) => name.endsWith(".krd")).sort();
    assert.equal(files.length, 3);
    const interrupted = join(eventsDir, files[1]);
    const content = await readFile(interrupted, "utf8");
    assert.ok(content.includes(t2), "middle segment in lexical order must be T2 for this fixture");
    const lines = content.trim().split("\n").filter(Boolean);
    await writeFile(interrupted, lines.slice(0, -1).join("\n") + "\n", "utf8");

    const reloaded = new Workspace(root);
    const result = await reloaded.load();
    assert.equal(result.trusted, false);
    assert.equal(result.quarantined.length, 1);
    assert.equal(result.quarantined[0].code, DENIAL.SEGMENT_COMMIT_MARKER_MISSING);
    assert.equal(result.state.units.has(t1), true);
    assert.equal(result.state.units.has(t3), false);
    assert.equal(result.projectedThrough, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AD-02: an agent cannot mutate its own governing control", async () => {
  const root = await mkdtemp(join(tmpdir(), "kraddle-"));
  try {
    const store = new Workspace(root);
    await store.init();

    const c1 = commitmentRecord("C1", "domain must not import ui");
    const c2 = commitmentRecord("C2", "unrelated", "statement", { approval_state: "proposed" });
    c2.title = "unrelated commitment";
    const authorityU = { id: "authority-u", kind: "authority_grant", operations: ["write"], allowRecordIds: [], ...env() };

    await store.transact([
      { type: "unit.create", value: unitRecord("CB1", "control_binding") },
      { type: "commitment.create", value: c1 },
      { type: "commitment.create", value: commitmentRecord("S1", "src/domain/") },
      { type: "commitment.create", value: commitmentRecord("M1", "prohibition", "has_modality") },
      { type: "unit.create", value: unitRecord("E1", "evaluator") },
      { type: "commitment.create", value: c2 },
      ...episodeFixtureOperations({ authority: { operations: ["write"], allowRecordIds: [] } }),
      { type: "relationship.add", value: rel("cb-governed", "CB1", "governed_commitment", "C1", "commitment") },
      { type: "relationship.add", value: rel("cb-selector", "CB1", "subject_selector", "S1", "commitment") },
      { type: "relationship.add", value: rel("cb-modality", "CB1", "modality", "M1", "commitment") },
      { type: "relationship.add", value: rel("cb-evaluator", "CB1", "evaluator", "E1", "unit") },
    ], { profileIds: ["CB1", "EP1"] });

    const eventsDir = join(root, ".kraddle", "events");
    const countSegments = async () => (await readdir(eventsDir)).filter((name) => name.endsWith(".krd")).length;
    const before = await countSegments();

    await assert.rejects(
      () => store.transact(
        [{ type: "commitment.update", value: { ...c1, value: "domain may import ui" } }],
        { actorId: "agent-1", episodeId: "EP1" },
      ),
      (e) => e.code === DENIAL.SELF_AMENDMENT_DENIED,
    );
    assert.equal(store.state.commitments.get("C1").value, "domain must not import ui");
    assert.equal(await countSegments(), before);

    await assert.rejects(
      () => store.transact(
        [{ type: "relationship.add", value: rel("graft-1", "CB1", "evaluator", "fake-evaluator", "unit", { approval_state: "proposed" }) }],
        { actorId: "agent-1", episodeId: "EP1" },
      ),
      (e) => e.code === DENIAL.PROFILE_GRAFT_DENIED,
    );
    const evaluatorEdges = [...store.state.relationships.values()].filter((r) => r.profileId === "CB1" && r.role === "evaluator");
    assert.equal(evaluatorEdges.length, 1);
    assert.equal(evaluatorEdges[0].targetId, "E1");
    assert.equal(await countSegments(), before);

    await assert.rejects(
      () => store.transact(
        [{ type: "commitment.update", value: { ...c2, value: "agent edit" } }],
        { actorId: "agent-1", episodeId: "EP1" },
      ),
      (e) => e.code === DENIAL.MUTATION_NOT_AUTHORIZED,
    );
    assert.equal(await countSegments(), before);

    await store.transact([{ type: "unit.update", value: { ...authorityU, allowRecordIds: ["C2"] } }]);
    const transactionId = await store.transact(
      [{ type: "commitment.update", value: { ...c2, title: "renamed by agent" } }],
      { actorId: "agent-1", episodeId: "EP1" },
    );
    assert.ok(transactionId);
    assert.equal(store.state.commitments.get("C2").title, "renamed by agent");
    assert.notEqual(store.state.commitments.get("C2").approval_state, "accepted");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AD-13: revoked authority suspends the next effect", async () => {
  const state = episodeState({ authority: { operations: ["write"], revoked: true } });
  assert.throws(
    () => admitEffect(state, "EP1", { operation: "write", target: "src/domain/a.ts" }),
    (e) => e.code === DENIAL.AUTHORITY_REVOKED,
  );
  assert.equal(episodeStatus(state, "EP1"), "suspended");
  assert.equal(state.units.get("EP1").lifecycle, "running");

  const regression = episodeState({
    authority: {},
    episode: { allowedOperations: ["write"] },
  });
  assert.throws(
    () => admitEffect(regression, "EP1", { operation: "write", target: "src/domain/a.ts" }),
    (e) => e.code === DENIAL.AUTHORITY_MISSING_OPERATIONS,
  );

  const root = await mkdtemp(join(tmpdir(), "kraddle-"));
  try {
    const store = new Workspace(root);
    await store.init();
    await store.transact(
      episodeFixtureOperations({ authority: { operations: ["write"], revoked: true } }),
      { profileIds: ["EP1"] },
    );
    const reloaded = new Workspace(root);
    const result = await reloaded.load();
    assert.equal(episodeStatus(result.state, "EP1"), "suspended");
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  const active = episodeState({ authority: { operations: ["write"] } });
  assert.equal(admitEffect(active, "EP1", { operation: "write", target: "src/domain/a.ts" }).admitted, true);
  assert.equal(episodeStatus(active, "EP1"), "running");
});

const coverageObject = (over = {}) => {
  const coverage = {
    requiredSubjects: ["src/domain/a.ts"],
    coveredSubjects: ["src/domain/a.ts"],
    unknownSubjects: [],
    excludedSubjects: [],
    selectionMethod: "changed_files",
    ...over,
  };
  return { ...coverage, coverageDigest: computeCoverageDigest(coverage) };
};

function closureState({ episode = {}, evaluation = {}, resultValue = "satisfied" } = {}) {
  const state = emptyState();
  state.units.set("EP1", {
    id: "EP1", kind: "execution_episode", lifecycle: "running",
    baseStateRef: { repository: "repo", revision: "rev-a", contentDigest: "digest-a" },
    resultingStateRef: { repository: "repo", revision: "rev-b", contentDigest: "digest-b" },
    ...env(), ...episode,
  });
  state.units.set("EV1", {
    id: "EV1", kind: "evaluation",
    stateRef: { repository: "repo", revision: "rev-b", contentDigest: "digest-b" },
    coverage: coverageObject(),
    ...env(), ...evaluation,
  });
  state.commitments.set("purpose-c", commitmentRecord("purpose-c", "do work"));
  state.scopes.set("scope-r", { id: "scope-r", kind: "scope", ...env() });
  state.commitments.set("base-c", commitmentRecord("base-c", "revision-a"));
  state.units.set("context-u", { id: "context-u", kind: "context_envelope", valid: true, completeness: "complete", ...env() });
  state.units.set("authority-u", { id: "authority-u", kind: "authority_grant", operations: ["write"], ...env() });
  state.units.set("delta-u", { id: "delta-u", kind: "software_element", ...env() });
  state.commitments.set("outcome-c", commitmentRecord("outcome-c", "work complete"));
  state.commitments.set("target-c", commitmentRecord("target-c", "domain must not import ui"));
  state.units.set("selector-u", unitRecord("selector-u", "selector"));
  state.units.set("evaluator-u", unitRecord("evaluator-u", "evaluator"));
  state.commitments.set("result-c", commitmentRecord("result-c", resultValue));
  state.commitments.set("coverage-c", commitmentRecord("coverage-c", "complete"));
  const edges = [
    ["ep-purpose", "EP1", "purpose", "purpose-c", "commitment"],
    ["ep-scope", "EP1", "target_scope", "scope-r", "scope"],
    ["ep-base", "EP1", "base_revision", "base-c", "commitment"],
    ["ep-context", "EP1", "context_envelope", "context-u", "unit"],
    ["ep-authority", "EP1", "authority_grant", "authority-u", "unit"],
    ["ep-delta", "EP1", "intended_delta", "delta-u", "unit"],
    ["ep-outcome", "EP1", "outcome", "outcome-c", "commitment"],
    ["ep-proof", "EP1", "proof_obligation", "EV1", "unit"],
    ["ev-target", "EV1", "target_commitment", "target-c", "commitment"],
    ["ev-selector", "EV1", "target_selector", "selector-u", "unit"],
    ["ev-scope", "EV1", "source_scope", "scope-r", "scope"],
    ["ev-evaluator", "EV1", "evaluator", "evaluator-u", "unit"],
    ["ev-result", "EV1", "result", "result-c", "commitment"],
    ["ev-coverage", "EV1", "coverage", "coverage-c", "commitment"],
  ];
  for (const [recordId, profileId, role, targetId, targetType] of edges) {
    state.relationships.set(recordId, rel(recordId, profileId, role, targetId, targetType));
  }
  return state;
}

test("AD-05: a base-revision evaluation cannot close a later revision", () => {
  const mismatched = closureState({
    evaluation: { stateRef: { repository: "repo", revision: "rev-a", contentDigest: "digest-a" } },
  });
  assert.throws(() => validateEpisodeClosure(mismatched, "EP1"), (e) => {
    assert.equal(e.code, DENIAL.EVALUATION_REVISION_MISMATCH);
    assert.equal(e.detail.evaluated, "rev-a");
    assert.equal(e.detail.required, "rev-b");
    return true;
  });

  const digestMismatch = closureState({
    evaluation: { stateRef: { repository: "repo", revision: "rev-b", contentDigest: "digest-x" } },
  });
  assert.throws(() => validateEpisodeClosure(digestMismatch, "EP1"), (e) => {
    assert.equal(e.code, DENIAL.EVALUATION_REVISION_MISMATCH);
    assert.deepEqual(e.detail.fields, ["contentDigest"]);
    return true;
  });

  const matched = closureState({
    evaluation: { stateRef: { repository: "repo", revision: "rev-b", contentDigest: "digest-b" } },
  });
  assert.deepEqual(validateEpisodeClosure(matched, "EP1"), { closable: true, episodeId: "EP1" });
});

test("AD-04: coverage cannot exclude changed files", () => {
  const withDigest = (over = {}) => {
    const coverage = {
      requiredSubjects: ["src/domain/a.ts", "src/domain/b.ts"],
      coveredSubjects: ["src/domain/a.ts"],
      unknownSubjects: [],
      excludedSubjects: [],
      selectionMethod: "changed_files",
      ...over,
    };
    return { ...coverage, coverageDigest: computeCoverageDigest(coverage) };
  };

  assert.throws(() => validateCoverage(withDigest()), (e) => {
    assert.equal(e.code, DENIAL.COVERAGE_INCOMPLETE);
    assert.deepEqual(e.detail.missing, ["src/domain/b.ts"]);
    return true;
  });

  assert.throws(
    () => validateCoverage(withDigest({ unknownSubjects: ["src/domain/c.ts"] })),
    (e) => e.code === DENIAL.COVERAGE_UNKNOWN_NONEMPTY,
  );

  assert.throws(
    () => validateCoverage(withDigest({
      coveredSubjects: ["src/domain/a.ts", "src/domain/b.ts"],
      excludedSubjects: ["src/gen/x.ts"],
    })),
    (e) => e.code === DENIAL.COVERAGE_EXCLUSION_NOT_PERMITTED,
  );

  const handEdited = withDigest();
  handEdited.coverageDigest = "0".repeat(64);
  assert.throws(
    () => validateCoverage(handEdited),
    (e) => e.code === DENIAL.COVERAGE_DIGEST_MISMATCH,
  );

  assert.throws(
    () => validateCoverage(withDigest({ requiredSubjects: [""] })),
    (e) => e.code === DENIAL.ENVELOPE_INVALID,
  );

  const digestOf = (requiredSubjects) =>
    computeCoverageDigest({
      requiredSubjects,
      coveredSubjects: ["src/domain/a.ts"],
      unknownSubjects: [],
      excludedSubjects: [],
    });
  assert.equal(digestOf(["b", "a"]), digestOf(["a", "b"]));
  assert.equal(digestOf(["a", "a", "b"]), digestOf(["a", "b"]));

  assert.deepEqual(
    validateCoverage(withDigest({ coveredSubjects: ["src/domain/a.ts", "src/domain/b.ts"] })),
    { sufficient: true },
  );

  const insufficient = closureState({
    evaluation: {
      stateRef: { repository: "repo", revision: "rev-b", contentDigest: "digest-b" },
      coverage: withDigest(),
    },
  });
  assert.throws(
    () => validateEpisodeClosure(insufficient, "EP1"),
    (e) => e.code === DENIAL.COVERAGE_INCOMPLETE,
  );
});

test("AD-03: an evaluator failure cannot satisfy a blocking obligation", () => {
  const failed = closureState({
    resultValue: "evaluation_failed",
    evaluation: { stateRef: { repository: "repo", revision: "rev-b", contentDigest: "digest-b" } },
  });
  assert.throws(() => validateEpisodeClosure(failed, "EP1"), (e) => {
    assert.equal(e.code, DENIAL.EVALUATION_FAILED_NOT_A_PASS);
    assert.notEqual(e.code, DENIAL.EVALUATION_NOT_SATISFIED);
    return true;
  });

  const satisfiedClosure = closureState({
    evaluation: { stateRef: { repository: "repo", revision: "rev-b", contentDigest: "digest-b" } },
  });
  assert.deepEqual(validateEpisodeClosure(satisfiedClosure, "EP1"), { closable: true, episodeId: "EP1" });
});

test("AD-11: an evaluator parse failure is never a pass", async () => {
  const stateRef = { repository: "repo", revision: "rev-b", contentDigest: "digest-b" };
  const run = () => {
    throw new SyntaxError("unexpected token");
  };
  const ev = await evaluate(emptyState(), {
    evaluationId: "EV1",
    evaluatorId: "evaluator-1",
    evaluatorVersion: "1.2.3",
    subjects: ["src/domain/a.ts"],
    stateRef,
    run,
  });
  assert.equal(ev.result, "evaluation_failed");
  assert.notEqual(ev.result, "satisfied");
  assert.ok(ev.error);
  assert.equal(ev.error.message, "unexpected token");

  const healthy = await evaluate(emptyState(), {
    evaluationId: "EV2",
    evaluatorId: "evaluator-1",
    evaluatorVersion: "1.2.3",
    subjects: ["src/domain/a.ts"],
    stateRef,
    run: async () => ({ result: "satisfied", coverage: coverageObject() }),
  });
  assert.equal(healthy.result, "satisfied");
  assert.equal(healthy.error, undefined);

  const attached = closureState({ resultValue: ev.result });
  attached.units.set("EV1", { ...ev });
  assert.throws(
    () => validateEpisodeClosure(attached, "EP1"),
    (e) => e.code === DENIAL.EVALUATION_FAILED_NOT_A_PASS,
  );

  const root = await mkdtemp(join(tmpdir(), "kraddle-"));
  try {
    const store = new Workspace(root);
    await store.init();
    await store.transact([
      { type: "unit.create", value: { ...ev } },
      { type: "commitment.create", value: commitmentRecord("target-c", "domain must not import ui") },
      { type: "unit.create", value: unitRecord("selector-u", "selector") },
      { type: "scope.create", value: { id: "scope-r", kind: "scope", ...env() } },
      { type: "unit.create", value: unitRecord("evaluator-u", "evaluator") },
      { type: "commitment.create", value: commitmentRecord("result-c", ev.result) },
      { type: "commitment.create", value: commitmentRecord("coverage-c", "typed") },
      { type: "relationship.add", value: rel("ev-target", "EV1", "target_commitment", "target-c", "commitment") },
      { type: "relationship.add", value: rel("ev-selector", "EV1", "target_selector", "selector-u", "unit") },
      { type: "relationship.add", value: rel("ev-scope", "EV1", "source_scope", "scope-r", "scope") },
      { type: "relationship.add", value: rel("ev-evaluator", "EV1", "evaluator", "evaluator-u", "unit") },
      { type: "relationship.add", value: rel("ev-result", "EV1", "result", "result-c", "commitment") },
      { type: "relationship.add", value: rel("ev-coverage", "EV1", "coverage", "coverage-c", "commitment") },
    ], { profileIds: ["EV1"] });
    const reloaded = new Workspace(root);
    const result = await reloaded.load();
    const persisted = result.state.units.get("EV1");
    assert.equal(persisted.result, "evaluation_failed");
    assert.equal(persisted.evaluatorId, "evaluator-1");
    assert.equal(persisted.evaluatorVersion, "1.2.3");
    assert.deepEqual(persisted.stateRef, stateRef);
    assert.deepEqual(persisted.subjects, ["src/domain/a.ts"]);
    assert.equal(persisted.error.message, "unexpected token");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const addBinding = (state, bindingId, selector) => {
  state.units.set(bindingId, { id: bindingId, kind: "control_binding", ...env() });
  state.commitments.set(`${bindingId}-gov`, commitmentRecord(`${bindingId}-gov`, "domain must not import ui"));
  state.commitments.set(`${bindingId}-sel`, commitmentRecord(`${bindingId}-sel`, selector));
  state.commitments.set(`${bindingId}-mod`, commitmentRecord(`${bindingId}-mod`, "prohibition", "has_modality"));
  state.units.set(`${bindingId}-ev`, unitRecord(`${bindingId}-ev`, "evaluator"));
  state.relationships.set(`${bindingId}-r1`, rel(`${bindingId}-r1`, bindingId, "governed_commitment", `${bindingId}-gov`, "commitment"));
  state.relationships.set(`${bindingId}-r2`, rel(`${bindingId}-r2`, bindingId, "subject_selector", `${bindingId}-sel`, "commitment"));
  state.relationships.set(`${bindingId}-r3`, rel(`${bindingId}-r3`, bindingId, "modality", `${bindingId}-mod`, "commitment"));
  state.relationships.set(`${bindingId}-r4`, rel(`${bindingId}-r4`, bindingId, "evaluator", `${bindingId}-ev`, "unit"));
};

const evidenceRecord = (recordId, over = {}) => ({
  ...env(),
  id: recordId,
  kind: "evidence",
  origin: "extractor",
  stateRef: { repository: "repo", revision: "rev-b", contentDigest: "digest-b" },
  edges: [{ from: "src/domain/a.ts", to: "src/ui/Button.tsx", resolution: "resolved" }],
  ...over,
});

test("AD-01: a narrow context cannot omit an applicable prohibition", () => {
  const state = emptyState();
  addBinding(state, "CB1", { type: "path_prefix", value: "src/domain/" });
  state.evidence.set("EV-OK", evidenceRecord("EV-OK"));

  const narrow = resolveApplicableContext(state, {
    targetPaths: ["src/domain/service.ts"],
    declaredApplicable: [],
  });
  assert.equal(narrow.complete, false);
  assert.ok(narrow.applicable.includes("CB1"));
  assert.ok(narrow.omitted.includes("CB1"));
  assert.ok(narrow.incompleteReasons.includes(DENIAL.OMITTED_APPLICABLE_COMMITMENT));

  const denied = episodeState({
    authority: { operations: ["write"] },
    context: { complete: narrow.complete, incompleteReasons: narrow.incompleteReasons },
  });
  assert.throws(
    () => admitEffect(denied, "EP1", { operation: "write", target: "src/domain/service.ts" }),
    (e) => e.code === DENIAL.CONTEXT_INCOMPLETE,
  );

  const unsupported = emptyState();
  addBinding(unsupported, "CB2", { type: "semantic_similarity", value: "auth-ish" });
  const unresolved = resolveApplicableContext(unsupported, {
    targetPaths: ["src/domain/service.ts"],
    declaredApplicable: [],
  });
  assert.equal(unresolved.complete, false);
  assert.ok(unresolved.incompleteReasons.includes(DENIAL.UNRESOLVED_SELECTOR));

  const edgeState = emptyState();
  edgeState.evidence.set("EV-EDGES", evidenceRecord("EV-EDGES", {
    edges: [{ from: "src/domain/a.ts", to: null, resolution: "unresolved" }],
  }));
  const unresolvedEdge = resolveApplicableContext(edgeState, { revision: "rev-b", dependencyEvidenceId: "EV-EDGES" });
  assert.equal(unresolvedEdge.complete, false);
  assert.ok(unresolvedEdge.incompleteReasons.includes(DENIAL.UNRESOLVED_DEPENDENCY_EDGE));

  const missing = resolveApplicableContext(state, {});
  assert.equal(missing.complete, false);
  assert.ok(missing.incompleteReasons.includes(DENIAL.EVIDENCE_PIN_MISMATCH));

  state.evidence.set("EV-AGENT", evidenceRecord("EV-AGENT", { origin: "agent" }));
  const agentSupplied = resolveApplicableContext(state, { revision: "rev-b", dependencyEvidenceId: "EV-AGENT" });
  assert.equal(agentSupplied.complete, false);
  assert.ok(agentSupplied.incompleteReasons.includes(DENIAL.EVIDENCE_PIN_MISMATCH));

  state.evidence.set("EV-OLD", evidenceRecord("EV-OLD", {
    stateRef: { repository: "repo", revision: "rev-a", contentDigest: "digest-a" },
  }));
  const wrongRevision = resolveApplicableContext(state, { revision: "rev-b", dependencyEvidenceId: "EV-OLD" });
  assert.equal(wrongRevision.complete, false);
  assert.ok(wrongRevision.incompleteReasons.includes(DENIAL.EVIDENCE_PIN_MISMATCH));

  const positive = resolveApplicableContext(state, {
    targetPaths: ["src/domain/service.ts"],
    declaredApplicable: ["CB1"],
    revision: "rev-b",
    dependencyEvidenceId: "EV-OK",
  });
  assert.equal(positive.complete, true);
  assert.deepEqual(positive.omitted, []);
  assert.deepEqual(positive.applicable, ["CB1"]);
});

test("AD-10: effects cannot be documented after bypassing admission", () => {
  const unadmitted = closureState({});
  const observation = recordObservedEffect(unadmitted, "EP1", {
    operation: "write",
    target: "src/domain/a.ts",
    admissionId: null,
  });
  assert.equal(classifyEffect(unadmitted, "EP1", observation).controlled, false);
  assert.throws(
    () => validateEpisodeClosure(unadmitted, "EP1"),
    (e) => e.code === DENIAL.UNCONTROLLED_EFFECT,
  );
  assert.equal(unadmitted.units.get("EP1").observedEffects.length, 1);

  const forged = closureState({});
  const forgedObservation = recordObservedEffect(forged, "EP1", {
    operation: "write",
    target: "src/domain/a.ts",
    admissionId: "not-a-real-admission",
  });
  assert.equal(classifyEffect(forged, "EP1", forgedObservation).controlled, false);
  assert.throws(
    () => validateEpisodeClosure(forged, "EP1"),
    (e) => e.code === DENIAL.UNCONTROLLED_EFFECT,
  );

  const controlled = closureState({});
  const admission = admitEffect(controlled, "EP1", { operation: "write", target: "src/domain/a.ts" });
  assert.equal(admission.admitted, true);
  recordObservedEffect(controlled, "EP1", {
    operation: "write",
    target: "src/domain/a.ts",
    admissionId: admission.admissionId,
  });
  assert.deepEqual(validateEpisodeClosure(controlled, "EP1"), { closable: true, episodeId: "EP1" });
});

test("an observed effect must match its admission", () => {
  const state = closureState({});
  const admission = admitEffect(state, "EP1", { operation: "write", target: "src/domain/a.ts" });
  const observation = recordObservedEffect(state, "EP1", {
    operation: "delete",
    target: "src/other/secrets.txt",
    admissionId: admission.admissionId,
  });
  const classification = classifyEffect(state, "EP1", observation);
  assert.equal(classification.controlled, false);
  assert.equal(classification.reason, "effect_mismatch");
  assert.throws(
    () => validateEpisodeClosure(state, "EP1"),
    (e) => e.code === DENIAL.UNCONTROLLED_EFFECT,
  );
});

test("a matching observed effect is controlled", () => {
  const state = closureState({});
  const admission = admitEffect(state, "EP1", { operation: "write", target: "src/domain/a.ts" });
  const observation = recordObservedEffect(state, "EP1", {
    operation: "write",
    target: "src/domain/a.ts",
    admissionId: admission.admissionId,
  });
  assert.deepEqual(classifyEffect(state, "EP1", observation), { controlled: true });
  assert.deepEqual(validateEpisodeClosure(state, "EP1"), { closable: true, episodeId: "EP1" });
});

test.todo("AD-06: ambiguous anchor pauses affected execution — blocked on code anchor subsystem");
test.todo("AD-07: unknown control extension cannot authorize — blocked on schema capability negotiation (P9)");
test.todo("AD-08: concurrent governing heads block execution — blocked on causal clocks and heads (P3)");
test.todo("AD-09: exception request is not authorization — blocked on exception subsystem (P7)");
test.todo("AD-14: expired exception suspends next effect — blocked on exception subsystem (P7)");
test.todo("AD-15: delayed invalidation cannot preserve stale authorization — blocked on typed invalidation (P6)");
