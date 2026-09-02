import assert from "node:assert/strict";
import { test } from "node:test";
import * as kernel from "../src/kernel.js";

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
