import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { applyOperation, DENIAL, emptyState, Workspace } from "../src/kernel.js";

const base = {
  id: "rec-1",
  kind: "unit",
  origin: "human",
  epistemic_basis: "asserted",
  approval_state: "accepted",
  freshness_state: "current",
  recorded_at: 1756771200000,
};

const attempt = (value) => () => applyOperation(emptyState(), { type: "unit.create", value });

const without = (field) => {
  const value = { ...base };
  delete value[field];
  return value;
};

test("missing origin is rejected", () => {
  assert.throws(attempt(without("origin")), (e) => e.code === DENIAL.ENVELOPE_INVALID);
});

test("missing epistemic_basis is rejected", () => {
  assert.throws(attempt(without("epistemic_basis")), (e) => e.code === DENIAL.ENVELOPE_INVALID);
});

test("missing approval_state is rejected", () => {
  assert.throws(attempt(without("approval_state")), (e) => e.code === DENIAL.ENVELOPE_INVALID);
});

test("missing freshness_state is rejected", () => {
  assert.throws(attempt(without("freshness_state")), (e) => e.code === DENIAL.ENVELOPE_INVALID);
});

test("origin outside the enum is rejected", () => {
  assert.throws(attempt({ ...base, origin: "robot" }), (e) => e.code === DENIAL.ENVELOPE_ENUM_INVALID);
});

test("confidence above 1 is rejected", () => {
  assert.throws(attempt({ ...base, confidence: 1.5 }), (e) => e.code === DENIAL.ENVELOPE_ENUM_INVALID);
});

test("a non-human actor cannot set approval_state accepted", async () => {
  const root = await mkdtemp(join(tmpdir(), "kraddle-"));
  const store = new Workspace(root);
  await store.init();
  try {
    await assert.rejects(
      () => store.transact([{ type: "unit.create", value: { ...base } }], { actorId: "agent-1" }),
      (e) => e.code === DENIAL.ACCEPTANCE_NOT_AUTHORIZED,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a human actor may create an accepted record", async () => {
  const root = await mkdtemp(join(tmpdir(), "kraddle-"));
  const store = new Workspace(root);
  await store.init();
  try {
    await store.transact([{ type: "unit.create", value: { ...base } }], { actorId: "human" });
    assert.equal(store.state.units.get("rec-1").approval_state, "accepted");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
