import assert from "node:assert/strict";
import { test } from "node:test";
import { describeDenial } from "../src/denials-text.js";

test("PREFLIGHT_VIOLATED names the governing commitment", () => {
  const text = describeDenial("PREFLIGHT_VIOLATED", { commitment: "domain must not import ui" });
  assert.ok(text.startsWith("PREFLIGHT_VIOLATED — "));
  assert.ok(text.includes("domain must not import ui"));
  assert.ok(text.includes("This write would violate the rule"));
});

test("an unknown code is described without throwing", () => {
  const text = describeDenial("SOME_FUTURE_CODE", { anything: true });
  assert.ok(text.startsWith("SOME_FUTURE_CODE — "));
  assert.ok(text.includes("(no description yet)"));
});

test("coverage of the denial surface", () => {
  const unknown = describeDenial("PREFLIGHT_UNKNOWN", {});
  assert.ok(unknown.includes("could not be verified"));
  assert.ok(unknown.includes("denied when checks cannot run"));

  const outside = describeDenial("TARGET_OUTSIDE_AUTHORITY", { targetPrefix: "src/domain/", target: "src/ui/x.tsx" });
  assert.ok(outside.includes("src/domain/"));
  assert.ok(outside.includes("src/ui/x.tsx"));

  const uncontrolled = describeDenial("UNCONTROLLED_EFFECT", { paths: ["src/rogue.ts"] });
  assert.ok(uncontrolled.includes("src/rogue.ts"));
  assert.ok(uncontrolled.includes("changes outside the admitted surface were found in the working tree"));

  const self = describeDenial("SELF_AMENDMENT_DENIED", {});
  assert.ok(self.includes("the rule that governs this episode cannot be changed from inside it"));

  const revoked = describeDenial("AUTHORITY_REVOKED", {});
  assert.ok(revoked.startsWith("AUTHORITY_REVOKED — "));
  const expired = describeDenial("AUTHORITY_EXPIRED", {});
  assert.ok(expired.startsWith("AUTHORITY_EXPIRED — "));
  const missing = describeDenial("AUTHORITY_MISSING_OPERATIONS", {});
  assert.ok(missing.startsWith("AUTHORITY_MISSING_OPERATIONS — "));

  const graft = describeDenial("PROFILE_GRAFT_DENIED", { profileId: "CB1" });
  assert.ok(graft.includes("CB1"));

  const incomplete = describeDenial("CONTEXT_INCOMPLETE", { reasons: ["UNRESOLVED_SELECTOR"] });
  assert.ok(incomplete.includes("UNRESOLVED_SELECTOR"));

  const active = describeDenial("EPISODE_ALREADY_ACTIVE", { admittedCount: 2 });
  assert.ok(active.includes("2"));

  const pin = describeDenial("EVIDENCE_PIN_MISMATCH", {});
  assert.ok(pin.startsWith("EVIDENCE_PIN_MISMATCH — "));
  const scope = describeDenial("EVIDENCE_SCOPE_MISMATCH", {});
  assert.ok(scope.startsWith("EVIDENCE_SCOPE_MISMATCH — "));
});
