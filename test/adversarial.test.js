import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import * as kernel from "../src/kernel.js";

const { DENIAL, Workspace, id } = kernel;

const env = (over = {}) => ({
  origin: "human", epistemic_basis: "asserted",
  approval_state: "accepted", freshness_state: "current",
  recorded_at: 1756771200000, ...over,
});

const unitRecord = (recordId, kind = "behavior") => ({ id: recordId, kind, title: kind, ...env() });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const cases = [
  ["AD-01", "narrow context cannot omit an applicable prohibition", "resolveApplicableContext"],
  ["AD-02", "an actor cannot change its own governing control", "authorizeMutation"],
  ["AD-03", "evaluator failure cannot satisfy a blocking obligation", "evaluate"],
  ["AD-04", "coverage cannot exclude changed files", "validateCoverage"],
  ["AD-05", "a base-revision evaluation cannot close a later revision", "validateEpisodeClosure"],
  ["AD-06", "an ambiguous anchor pauses affected execution", "invalidateForAnchorRemap"],
  ["AD-07", "unknown control extensions cannot authorize execution", "validateExtensionCapabilities"],
  ["AD-08", "concurrent governing heads block execution", "resolveHeads"],
  ["AD-09", "an exception request is not an exception authorization", "authorizeException"],
  ["AD-10", "effects cannot be documented after bypassing admission", "admitEffect"],
  ["AD-11", "an evaluator parse failure is never a pass", "evaluate"],
  ["AD-12", "an incomplete profile transaction is never projected", "load"],
  ["AD-13", "revoked authority suspends the next effect", "admitEffect"],
  ["AD-14", "an expired exception suspends the next effect", "admitEffect"],
  ["AD-15", "delayed invalidation cannot preserve stale authorization", "validateDependencies"],
];

function requireCapability(name) {
  assert.equal(
    typeof kernel[name],
    "function",
    `Phase 0 capability missing: ${name}`,
  );
  return kernel[name];
}

for (const [id, description, capability] of cases) {
  test(`${id}: ${description}`, () => {
    requireCapability(capability);
  });
}

test("adversarial manifest contains all cases in order", () => {
  assert.deepEqual(cases.map(([id]) => id), Array.from({ length: 15 }, (_, index) => `AD-${String(index + 1).padStart(2, "0")}`));
});

export { cases };

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
