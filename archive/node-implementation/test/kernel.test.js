import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DENIAL, Workspace, admitEffect, id, validateEpisodeClosure, validateProfile } from "../src/kernel.js";

const env = (over = {}) => ({
  origin: "human", epistemic_basis: "asserted",
  approval_state: "accepted", freshness_state: "current",
  recorded_at: 1756771200000, ...over,
});

const unit = (id, kind, title = kind) => ({ id, kind, title, ...env() });
const commitment = (id, value, type = "statement") => ({ id, kind: "commitment", type, value, ...env() });
const edge = (id, profileId, role, targetId, targetType) => ({ id, kind: "relationship", profileId, role, targetId, targetType, ...env() });

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "kraddle-"));
  const store = new Workspace(root);
  await store.init();
  return { root, store };
}

test("writes and reloads a valid ControlBinding from committed files", async () => {
  const { root, store } = await workspace();
  try {
    const profile = id();
    const governed = id();
    const selector = id();
    const modality = id();
    const evaluator = id();
    await store.transact([
      { type: "unit.create", value: unit(profile, "control_binding") },
      { type: "commitment.create", value: commitment(governed, "Domain does not import UI") },
      { type: "commitment.create", value: commitment(selector, "src/domain/**") },
      { type: "commitment.create", value: commitment(modality, "invariant", "has_modality") },
      { type: "unit.create", value: unit(evaluator, "evaluator") },
      { type: "relationship.add", value: edge(id(), profile, "governed_commitment", governed, "commitment") },
      { type: "relationship.add", value: edge(id(), profile, "subject_selector", selector, "commitment") },
      { type: "relationship.add", value: edge(id(), profile, "modality", modality, "commitment") },
      { type: "relationship.add", value: edge(id(), profile, "evaluator", evaluator, "unit") },
    ], { profileIds: [profile] });
    const reloaded = new Workspace(root);
    await reloaded.load();
    assert.equal(reloaded.state.units.get(profile).kind, "control_binding");
    assert.equal(reloaded.heads.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a blocking control without an evaluator", async () => {
  const { root, store } = await workspace();
  try {
    const profile = id();
    const governed = id();
    const selector = id();
    const modality = id();
    await assert.rejects(() => store.transact([
      { type: "unit.create", value: unit(profile, "control_binding") },
      { type: "commitment.create", value: commitment(governed, "domain must not import ui") },
      { type: "commitment.create", value: commitment(selector, "src/domain/**") },
      { type: "commitment.create", value: commitment(modality, "prohibition", "has_modality") },
      { type: "relationship.add", value: edge(id(), profile, "governed_commitment", governed, "commitment") },
      { type: "relationship.add", value: edge(id(), profile, "subject_selector", selector, "commitment") },
      { type: "relationship.add", value: edge(id(), profile, "modality", modality, "commitment") },
    ], { profileIds: [profile] }), (e) => {
      assert.equal(e.code, DENIAL.ENVELOPE_INVALID);
      assert.equal(e.detail.reason, "blocking_modality_requires_evaluator");
      return true;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("accepts a blocking control with an evaluator", async () => {
  const { root, store } = await workspace();
  try {
    const profile = id();
    const governed = id();
    const selector = id();
    const modality = id();
    const evaluator = id();
    const transactionId = await store.transact([
      { type: "unit.create", value: unit(profile, "control_binding") },
      { type: "commitment.create", value: commitment(governed, "domain must not import ui") },
      { type: "commitment.create", value: commitment(selector, "src/domain/**") },
      { type: "commitment.create", value: commitment(modality, "prohibition", "has_modality") },
      { type: "unit.create", value: unit(evaluator, "evaluator") },
      { type: "relationship.add", value: edge(id(), profile, "governed_commitment", governed, "commitment") },
      { type: "relationship.add", value: edge(id(), profile, "subject_selector", selector, "commitment") },
      { type: "relationship.add", value: edge(id(), profile, "modality", modality, "commitment") },
      { type: "relationship.add", value: edge(id(), profile, "evaluator", evaluator, "unit") },
    ], { profileIds: [profile] });
    assert.ok(transactionId);
    const summary = validateProfile(store.state, profile);
    assert.equal(summary.kind, "control_binding");
    assert.ok(summary.roles.includes("evaluator"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reloads a committed transaction", async () => {
  const { root, store } = await workspace();
  try {
    await store.transact([{ type: "unit.create", value: unit(id(), "behavior") }]);
    const reloaded = new Workspace(root);
    const result = await reloaded.load();
    assert.equal(result.state.units.size, 1);
    assert.equal(result.trusted, true);
    assert.equal(result.projectedThrough, 1);
    const files = await readFile(join(root, ".kraddle", "heads.krd"), "utf8");
    assert.match(files, /heads/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects invalid evaluation results", () => {
  const state = {
    units: new Map([["p", unit("p", "evaluation")], ["s", unit("s", "selector")], ["scope", unit("scope", "scope")], ["eval", unit("eval", "evaluator")]]),
    commitments: new Map([["target", commitment("target", "target")], ["result", commitment("result", "maybe")], ["coverage", commitment("coverage", "all")]]),
    relationships: new Map([
      ["a", edge("a", "p", "target_commitment", "target", "commitment")],
      ["b", edge("b", "p", "target_selector", "s", "unit")],
      ["c", edge("c", "p", "source_scope", "scope", "scope")],
      ["d", edge("d", "p", "evaluator", "eval", "unit")],
      ["e", edge("e", "p", "result", "result", "commitment")],
      ["f", edge("f", "p", "coverage", "coverage", "commitment")],
    ]),
    evidence: new Map(),
    scopes: new Map([["scope", { id: "scope" }]]),
  };
  assert.throws(() => validateProfile(state, "p"), (e) => e.code === DENIAL.EVALUATION_RESULT_INVALID);
});

test("denies effects outside an episode authority envelope", () => {
  const state = {
    units: new Map([
      ["episode", { id: "episode", kind: "execution_episode", lifecycle: "running" }],
      ["purpose", unit("purpose", "purpose")],
      ["delta", unit("delta", "software_element")],
      ["context", { id: "context", kind: "context_envelope", valid: true, completeness: "complete" }],
      ["authority", { id: "authority", kind: "authority_grant", operations: ["write"], targetPrefix: "src/research/" }],
    ]),
    commitments: new Map([
      ["base", commitment("base", "revision-a")],
      ["purpose-commitment", commitment("purpose-commitment", "restore context")],
    ]),
    relationships: new Map([
      ["purpose-edge", edge("purpose-edge", "episode", "purpose", "purpose-commitment", "commitment")],
      ["delta-edge", edge("delta-edge", "episode", "intended_delta", "delta", "unit")],
      ["scope-edge", edge("scope-edge", "episode", "target_scope", "scope", "scope")],
      ["base-edge", edge("base-edge", "episode", "base_revision", "base", "commitment")],
      ["context-edge", edge("context-edge", "episode", "context_envelope", "context", "unit")],
      ["authority-edge", edge("authority-edge", "episode", "authority_grant", "authority", "unit")],
    ]),
    evidence: new Map(),
    scopes: new Map([["scope", { id: "scope" }]]),
  };
  assert.deepEqual(admitEffect(state, "episode", { operation: "write", target: "src/research/context.ts" }).admitted, true);
  assert.throws(() => admitEffect(state, "episode", { operation: "write", target: "src/ui/App.tsx" }), (e) => e.code === DENIAL.TARGET_OUTSIDE_AUTHORITY);
  assert.throws(() => admitEffect(state, "episode", { operation: "execute", target: "src/research/run.js" }), (e) => e.code === DENIAL.OPERATION_NOT_AUTHORIZED);
});

test("does not close an episode without an outcome", () => {
  const state = {
    units: new Map([
      ["episode", { id: "episode", kind: "execution_episode", lifecycle: "running" }],
      ["delta", unit("delta", "software_element")],
      ["context", unit("context", "context_envelope")],
      ["authority", unit("authority", "authority_grant")],
    ]),
    commitments: new Map([["purpose", commitment("purpose", "do work")], ["base", commitment("base", "revision-a")]]),
    relationships: new Map([
      ["purpose-edge", edge("purpose-edge", "episode", "purpose", "purpose", "commitment")],
      ["delta-edge", edge("delta-edge", "episode", "intended_delta", "delta", "unit")],
      ["scope-edge", edge("scope-edge", "episode", "target_scope", "scope", "scope")],
      ["base-edge", edge("base-edge", "episode", "base_revision", "base", "commitment")],
      ["context-edge", edge("context-edge", "episode", "context_envelope", "context", "unit")],
      ["authority-edge", edge("authority-edge", "episode", "authority_grant", "authority", "unit")],
    ]),
    evidence: new Map(),
    scopes: new Map([["scope", { id: "scope" }]]),
  };
  assert.throws(() => validateEpisodeClosure(state, "episode"), (e) => e.code === DENIAL.EPISODE_OUTCOME_MISSING);
});

test("init refuses to overwrite an existing workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "kraddle-"));
  const store = new Workspace(root);
  try {
    const first = await store.init();
    await assert.rejects(() => store.init(), (e) => e.code === DENIAL.WORKSPACE_EXISTS);
    const onDisk = JSON.parse(await readFile(join(root, ".kraddle", "manifest.krd"), "utf8"));
    assert.equal(onDisk.workspaceId, first.workspaceId);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an existing workspace opens with load, not init", async () => {
  const { root, store } = await workspace();
  try {
    const recordId = id();
    await store.transact([{ type: "unit.create", value: unit(recordId, "behavior") }]);
    const reloaded = new Workspace(root);
    const result = await reloaded.load();
    assert.equal(result.state.units.has(recordId), true);
    assert.equal(result.trusted, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("concurrent transactions are serialized", async () => {
  const { root, store } = await workspace();
  try {
    const first = id();
    const second = id();
    const [tx1, tx2] = await Promise.all([
      store.transact([{ type: "unit.create", value: unit(first, "behavior") }]),
      store.transact([{ type: "unit.create", value: unit(second, "behavior") }]),
    ]);
    const eventsDir = join(root, ".kraddle", "events");
    const segments = (await readdir(eventsDir)).filter((name) => name.endsWith(".krd"));
    assert.equal(segments.length, 2);
    const heads = JSON.parse(await readFile(join(root, ".kraddle", "heads.krd"), "utf8"));
    assert.equal(heads.heads.length, 2);
    assert.ok(heads.heads.includes(tx1));
    assert.ok(heads.heads.includes(tx2));
    assert.equal(store.state.units.has(first), true);
    assert.equal(store.state.units.has(second), true);
    const fresh = new Workspace(root);
    const result = await fresh.load();
    assert.equal(result.trusted, true);
    assert.equal(result.projectedThrough, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
