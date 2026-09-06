export function describeDenial(code, detail = {}) {
  const safe = (value) => (value === undefined || value === null ? "" : String(value));
  switch (code) {
    case "PREFLIGHT_VIOLATED":
      return `PREFLIGHT_VIOLATED — This write would violate the rule '${safe(detail.commitment)}' that governs this episode. The file was not written.`;
    case "PREFLIGHT_UNKNOWN":
      return "PREFLIGHT_UNKNOWN — this write could not be verified — the check did not run or could not decide; writes are denied when checks cannot run.";
    case "TARGET_OUTSIDE_AUTHORITY":
      return `TARGET_OUTSIDE_AUTHORITY — the target ${safe(detail.target)} is outside this episode's write bounds (${safe(detail.targetPrefix)}). The file was not written.`;
    case "UNCONTROLLED_EFFECT":
      return `UNCONTROLLED_EFFECT — changes outside the admitted surface were found in the working tree: ${safeList(detail.paths)}. Every change must go through the write tool, or the episode cannot close.`;
    case "AUTHORITY_REVOKED":
      return "AUTHORITY_REVOKED — the authority grant governing this episode was revoked; no further effects are admitted.";
    case "AUTHORITY_EXPIRED":
      return "AUTHORITY_EXPIRED — the authority grant governing this episode has expired; no further effects are admitted.";
    case "AUTHORITY_MISSING_OPERATIONS":
      return "AUTHORITY_MISSING_OPERATIONS — the authority grant lists no operations; nothing is authorized. Ask the human who started the episode to fix the grant.";
    case "SELF_AMENDMENT_DENIED":
      return "SELF_AMENDMENT_DENIED — the rule that governs this episode cannot be changed from inside it. Propose the change to a human instead.";
    case "PROFILE_GRAFT_DENIED":
      return `PROFILE_GRAFT_DENIED — members cannot be grafted onto the governing profile ${safe(detail.profileId)} from inside the episode. Membership changes go through the human channel.`;
    case "CONTEXT_INCOMPLETE":
      return `CONTEXT_INCOMPLETE — the governing context is incomplete: ${safeList(detail.reasons)}. The episode cannot proceed until every reason is resolved.`;
    case "EPISODE_ALREADY_ACTIVE":
      return `EPISODE_ALREADY_ACTIVE — this episode already has ${safe(detail.admittedCount)} admitted effect(s) from a previous server run; restarting would fork its state. Start a new episode instead.`;
    case "EVIDENCE_PIN_MISMATCH":
      return "EVIDENCE_PIN_MISMATCH — the dependency evidence is missing, unaccepted, or pinned to a different revision than the one being governed.";
    case "EVIDENCE_SCOPE_MISMATCH":
      return "EVIDENCE_SCOPE_MISMATCH — the evidence record's contents do not match the extraction region it declares; it cannot be trusted to pin a context.";
    case "EPISODE_NOT_ACTIVE":
      return `EPISODE_NOT_ACTIVE — the episode is not in an active state (${safe(detail.lifecycle)}); effects are not admitted.`;
    case "EPISODE_OUTCOME_MISSING":
      return "EPISODE_OUTCOME_MISSING — the episode has no outcome commitment and cannot close.";
    case "NO_OP_NOT_DECLARED":
      return "NO_OP_NOT_DECLARED — an episode with no recorded effects must explicitly declare that it did nothing before it can close.";
    case "WORKSPACE_EXISTS":
      return "WORKSPACE_EXISTS — a workspace already exists here; it was left untouched.";
    default:
      return `${safe(code)} — (no description yet)`;
  }
}

function safeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  return String(value ?? "");
}
