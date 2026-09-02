import { access, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";

const PROFILE_KINDS = new Set(["control_binding", "evaluation", "execution_episode"]);
const TERMINAL_EPISODE_STATES = new Set(["completed", "aborted"]);
const EVALUATION_RESULTS = new Set([
  "satisfied",
  "violated",
  "unknown",
  "not_applicable",
  "indeterminate",
  "evaluation_failed",
]);

const digest = (value) => createHash("sha256").update(value).digest("hex");

export class ControlDenial extends Error {
  constructor(code, detail = {}) {
    super(`${code}: ${JSON.stringify(detail)}`);
    this.name = "ControlDenial";
    this.code = code;
    this.detail = detail;
  }
}

export const DENIAL = Object.freeze({
  ENVELOPE_INVALID:                 "ENVELOPE_INVALID",
  ENVELOPE_ENUM_INVALID:            "ENVELOPE_ENUM_INVALID",
  ACCEPTANCE_NOT_AUTHORIZED:        "ACCEPTANCE_NOT_AUTHORIZED",

  SELF_AMENDMENT_DENIED:            "SELF_AMENDMENT_DENIED",
  AUTHORITY_SELF_AMENDMENT_DENIED:  "AUTHORITY_SELF_AMENDMENT_DENIED",
  AUTHORITY_MISSING_OPERATIONS:     "AUTHORITY_MISSING_OPERATIONS",
  AUTHORITY_EXPIRED:                "AUTHORITY_EXPIRED",
  AUTHORITY_REVOKED:                "AUTHORITY_REVOKED",

  OPERATION_NOT_AUTHORIZED:         "OPERATION_NOT_AUTHORIZED",
  OPERATION_FORBIDDEN:              "OPERATION_FORBIDDEN",
  TARGET_OUTSIDE_AUTHORITY:         "TARGET_OUTSIDE_AUTHORITY",
  MUTATION_NOT_AUTHORIZED:          "MUTATION_NOT_AUTHORIZED",
  PROFILE_GRAFT_DENIED:             "PROFILE_GRAFT_DENIED",

  CONTEXT_INCOMPLETE:               "CONTEXT_INCOMPLETE",
  OMITTED_APPLICABLE_COMMITMENT:    "OMITTED_APPLICABLE_COMMITMENT",
  UNRESOLVED_SELECTOR:              "UNRESOLVED_SELECTOR",
  UNRESOLVED_DEPENDENCY_EDGE:       "UNRESOLVED_DEPENDENCY_EDGE",

  EPISODE_NOT_ACTIVE:               "EPISODE_NOT_ACTIVE",
  EPISODE_OUTCOME_MISSING:          "EPISODE_OUTCOME_MISSING",
  UNCONTROLLED_EFFECT:              "UNCONTROLLED_EFFECT",

  EVALUATION_RESULT_INVALID:        "EVALUATION_RESULT_INVALID",
  EVALUATION_NOT_SATISFIED:         "EVALUATION_NOT_SATISFIED",
  EVALUATION_FAILED_NOT_A_PASS:     "EVALUATION_FAILED_NOT_A_PASS",
  EVALUATION_REVISION_MISMATCH:     "EVALUATION_REVISION_MISMATCH",
  EVALUATION_STALE:                 "EVALUATION_STALE",

  COVERAGE_INCOMPLETE:              "COVERAGE_INCOMPLETE",
  COVERAGE_UNKNOWN_NONEMPTY:        "COVERAGE_UNKNOWN_NONEMPTY",
  COVERAGE_EXCLUSION_NOT_PERMITTED: "COVERAGE_EXCLUSION_NOT_PERMITTED",
  COVERAGE_DIGEST_MISMATCH:         "COVERAGE_DIGEST_MISMATCH",

  SEGMENT_DIGEST_MISMATCH:          "SEGMENT_DIGEST_MISMATCH",
  SEGMENT_COMMIT_MARKER_MISSING:    "SEGMENT_COMMIT_MARKER_MISSING",
  PROJECTION_UNTRUSTED:             "PROJECTION_UNTRUSTED",
  EVIDENCE_PIN_MISMATCH:            "EVIDENCE_PIN_MISMATCH",
  WORKSPACE_EXISTS:                 "WORKSPACE_EXISTS",
  NO_OP_NOT_DECLARED:               "NO_OP_NOT_DECLARED",
});

function profileRoot(state, profileId) {
  const root = state.units.get(profileId);
  if (!root || !PROFILE_KINDS.has(root.kind)) {
    throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { profileId, reason: "unknown_profile_root" });
  }
  return root;
}

function profileMembers(state, profileId) {
  return [...state.relationships.values()].filter((edge) => edge.profileId === profileId);
}

function relationshipsForRole(state, profileId, role) {
  return profileMembers(state, profileId).filter((edge) => edge.role === role);
}

function roleTarget(state, edge) {
  if (edge.targetType === "unit") return state.units.get(edge.targetId);
  if (edge.targetType === "commitment") return state.commitments.get(edge.targetId);
  if (edge.targetType === "evidence") return state.evidence.get(edge.targetId);
  if (edge.targetType === "scope") return state.scopes.get(edge.targetId);
  return undefined;
}

function requireRole(state, profileId, role, targetType, count = 1) {
  const edges = relationshipsForRole(state, profileId, role);
  if (edges.length !== count) {
    throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { profileId, role, expected: count, targetType });
  }
  if (edges.some((edge) => edge.targetType !== targetType || !roleTarget(state, edge))) {
    throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { profileId, role, reason: "invalid_target" });
  }
  return edges;
}

function optionalRole(state, profileId, role, targetType) {
  const edges = relationshipsForRole(state, profileId, role);
  if (edges.length > 1) throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { profileId, role, expected: 1 });
  if (edges.length && (edges[0].targetType !== targetType || !roleTarget(state, edges[0]))) {
    throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { profileId, role, reason: "invalid_target" });
  }
  return edges;
}

export function emptyState() {
  return {
    units: new Map(),
    commitments: new Map(),
    relationships: new Map(),
    evidence: new Map(),
    scopes: new Map(),
  };
}

export const ENVELOPE_ENUMS = Object.freeze({
  origin:          ["human", "extractor", "agent", "policy", "import"],
  epistemic_basis: ["observed", "derived", "interpreted", "asserted"],
  approval_state:  ["proposed", "accepted", "rejected", "superseded"],
  freshness_state: ["current", "stale", "expired"],
});

const ENVELOPE_REQUIRED = ["id", "kind", "origin", "epistemic_basis", "approval_state", "freshness_state", "recorded_at"];

export function validateEnvelope(record) {
  const missing = ENVELOPE_REQUIRED.filter((field) => record?.[field] === undefined || record?.[field] === null);
  if (missing.length) {
    throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { id: record?.id, missing });
  }
  for (const [field, allowed] of Object.entries(ENVELOPE_ENUMS)) {
    if (!allowed.includes(record[field])) {
      throw new ControlDenial(DENIAL.ENVELOPE_ENUM_INVALID, { id: record.id, field, value: record[field] });
    }
  }
  if (
    record.confidence !== undefined &&
    (typeof record.confidence !== "number" || record.confidence < 0 || record.confidence > 1)
  ) {
    throw new ControlDenial(DENIAL.ENVELOPE_ENUM_INVALID, { id: record.id, field: "confidence", value: record.confidence });
  }
  return record;
}

export function applyOperation(state, operation) {
  const { type, value } = operation;
  if (!value?.id) throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { type, missing: ["id"] });
  if (type !== "unit.tombstone") validateEnvelope(value);

  if (type === "unit.create" || type === "unit.update") state.units.set(value.id, value);
  else if (type === "commitment.create" || type === "commitment.update") state.commitments.set(value.id, value);
  else if (type === "relationship.add" || type === "relationship.update") state.relationships.set(value.id, value);
  else if (type === "evidence.create" || type === "evidence.update") state.evidence.set(value.id, value);
  else if (type === "scope.create" || type === "scope.update") state.scopes.set(value.id, value);
  else if (type === "unit.tombstone") {
    const unit = state.units.get(value.id);
    if (!unit) throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { type, id: value.id, reason: "unknown_record" });
    state.units.set(value.id, { ...unit, tombstoned: true });
  } else {
    throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { type, reason: "unknown_operation" });
  }
}

export function validateProfile(state, profileId) {
  const root = profileRoot(state, profileId);
  const members = profileMembers(state, profileId);
  const roles = new Set(members.map((edge) => edge.role));
  for (const edge of members) {
    if (edge.profileId !== profileId) throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { profileId, relationshipId: edge.id, reason: "foreign_profile_member" });
    if (!edge.role || !edge.targetType || !roleTarget(state, edge)) {
      throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { profileId, relationshipId: edge.id, reason: "malformed_profile_member" });
    }
  }

  if (root.kind === "control_binding") {
    requireRole(state, profileId, "governed_commitment", "commitment");
    requireRole(state, profileId, "subject_selector", "commitment");
    requireRole(state, profileId, "modality", "commitment");
    optionalRole(state, profileId, "response_policy", "unit");
    optionalRole(state, profileId, "authority_policy", "unit");
    optionalRole(state, profileId, "evaluator", "unit");
    const modality = roleTarget(state, relationshipsForRole(state, profileId, "modality")[0]);
    if (["invariant", "prohibition", "requirement"].includes(modality.value) && !roles.has("evaluator")) {
      throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { profileId, modality: modality.value, reason: "blocking_modality_requires_evaluator" });
    }
  }

  if (root.kind === "evaluation") {
    requireRole(state, profileId, "target_commitment", "commitment");
    requireRole(state, profileId, "target_selector", "unit");
    requireRole(state, profileId, "source_scope", "scope");
    requireRole(state, profileId, "evaluator", "unit");
    const result = requireRole(state, profileId, "result", "commitment")[0];
    const resultValue = roleTarget(state, result)?.value;
    if (!EVALUATION_RESULTS.has(resultValue)) throw new ControlDenial(DENIAL.EVALUATION_RESULT_INVALID, { profileId, result: resultValue });
    requireRole(state, profileId, "coverage", "commitment");
  }

  if (root.kind === "execution_episode") {
    requireRole(state, profileId, "purpose", "commitment");
    requireRole(state, profileId, "target_scope", "scope");
    requireRole(state, profileId, "base_revision", "commitment");
    requireRole(state, profileId, "context_envelope", "unit");
    requireRole(state, profileId, "authority_grant", "unit");
    requireRole(state, profileId, "intended_delta", "unit");
    optionalRole(state, profileId, "outcome", "commitment");
    optionalRole(state, profileId, "resulting_revision", "commitment");
  }

  return { id: profileId, kind: root.kind, roles: [...roles] };
}

function profileRole(state, profileId, role, targetType) {
  const relationship = relationshipsForRole(state, profileId, role)[0];
  return relationship && relationship.targetType === targetType ? roleTarget(state, relationship) : undefined;
}

function profileState(root) {
  return root.lifecycle ?? "draft";
}

export function requireTrustedProjection(workspace) {
  if (workspace?.trusted === false) {
    throw new ControlDenial(DENIAL.PROJECTION_UNTRUSTED, { quarantined: workspace.quarantined ?? [] });
  }
}

function authorityGrantIds(state, episodeId) {
  const ids = new Set();
  for (const edge of relationshipsForRole(state, episodeId, "authority_grant")) {
    ids.add(edge.targetId);
    for (const rel of state.relationships.values()) {
      if (rel.profileId === edge.targetId) ids.add(rel.targetId);
    }
  }
  return ids;
}

export function governingRecordIds(state, episodeId) {
  const ids = new Set();
  for (const unit of state.units.values()) {
    if (unit.kind === "control_binding" && unit.approval_state === "accepted") ids.add(unit.id);
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const edge of state.relationships.values()) {
      if (ids.has(edge.profileId) && !ids.has(edge.targetId)) {
        ids.add(edge.targetId);
        grew = true;
      }
    }
  }
  for (const id of authorityGrantIds(state, episodeId)) ids.add(id);
  return ids;
}

export function authorizeMutation(state, { actorId, operation, targetId, episodeId }) {
  const governing = governingRecordIds(state, episodeId);
  const type = operation?.type;

  if ((type === "relationship.add" || type === "relationship.update") && governing.has(operation.value?.profileId)) {
    throw new ControlDenial(DENIAL.PROFILE_GRAFT_DENIED, { actorId, profileId: operation.value.profileId, episodeId });
  }
  for (const authorityId of authorityGrantIds(state, episodeId)) {
    if (authorityId === targetId) {
      throw new ControlDenial(DENIAL.AUTHORITY_SELF_AMENDMENT_DENIED, { actorId, targetId, episodeId });
    }
  }
  if (governing.has(targetId)) {
    throw new ControlDenial(DENIAL.SELF_AMENDMENT_DENIED, { actorId, targetId, episodeId });
  }
  if (
    type === "unit.create" || type === "commitment.create" || type === "relationship.add" ||
    type === "evidence.create" || type === "scope.create"
  ) {
    return { authorized: true };
  }
  if (
    type === "unit.update" || type === "commitment.update" || type === "relationship.update" ||
    type === "evidence.update" || type === "scope.update" || type === "unit.tombstone"
  ) {
    const authority = profileRole(state, episodeId, "authority_grant", "unit");
    const allowed = Array.isArray(authority?.allowRecordIds) ? authority.allowRecordIds : [];
    if (allowed.includes(targetId)) return { authorized: true };
    throw new ControlDenial(DENIAL.MUTATION_NOT_AUTHORIZED, { actorId, targetId, episodeId });
  }
  throw new ControlDenial(DENIAL.MUTATION_NOT_AUTHORIZED, { actorId, targetId, episodeId, type });
}

export function episodeStatus(state, episodeId) {
  const episode = profileRoot(state, episodeId);
  const authority = profileRole(state, episodeId, "authority_grant", "unit");
  if (authority?.revoked === true || (authority?.expiresAt && authority.expiresAt <= Date.now())) {
    return "suspended";
  }
  return profileState(episode);
}

const SUPPORTED_SELECTOR_TYPES = new Set(["exact_unit_id", "path_prefix", "scope_membership", "relationship_type"]);

export function resolveApplicableContext(state, {
  taskScopeId, targetPaths = [], revision, declaredApplicable = [], dependencyEvidenceId,
} = {}) {
  const incompleteReasons = [];
  const addReason = (code) => {
    if (!incompleteReasons.includes(code)) incompleteReasons.push(code);
  };
  const unresolvedSelectors = [];
  const unresolvedEdges = [];
  const applicable = new Set();

  for (const unit of state.units.values()) {
    if (unit.kind !== "control_binding" || unit.approval_state !== "accepted") continue;
    const selector = profileRole(state, unit.id, "subject_selector", "commitment")?.value;
    const selectorType = selector?.type;
    if (typeof selectorType !== "string" || !SUPPORTED_SELECTOR_TYPES.has(selectorType)) {
      unresolvedSelectors.push({ bindingId: unit.id, selectorType });
      addReason(DENIAL.UNRESOLVED_SELECTOR);
      continue;
    }
    const value = selector.value;
    let matches = false;
    if (selectorType === "exact_unit_id") {
      matches = state.units.has(value);
    } else if (selectorType === "path_prefix") {
      matches = typeof value === "string" && targetPaths.some((path) => typeof path === "string" && path.startsWith(value));
    } else if (selectorType === "scope_membership") {
      matches = value === taskScopeId;
    } else if (selectorType === "relationship_type") {
      matches = [...state.relationships.values()].some((edge) => edge.role === value);
    }
    if (matches) applicable.add(unit.id);
  }

  // Dependency edges come from state via pinned extractor evidence, never from the caller.
  const evidence = dependencyEvidenceId !== undefined ? state.evidence.get(dependencyEvidenceId) : undefined;
  const pin = evidence?.stateRef;
  const evidencePinned =
    typeof revision === "string" && revision.length > 0 &&
    evidence !== undefined &&
    evidence.origin === "extractor" &&
    evidence.approval_state === "accepted" &&
    typeof pin?.repository === "string" && pin.repository.length > 0 &&
    typeof pin?.revision === "string" && pin.revision.length > 0 &&
    typeof pin?.contentDigest === "string" && pin.contentDigest.length > 0 &&
    pin.revision === revision;
  if (!evidencePinned) {
    addReason(DENIAL.EVIDENCE_PIN_MISMATCH);
  } else {
    for (const edge of evidence.edges ?? []) {
      if (edge.resolution === "ambiguous" || edge.resolution === "unresolved") {
        unresolvedEdges.push({ from: edge.from, to: edge.to, resolution: edge.resolution });
        addReason(DENIAL.UNRESOLVED_DEPENDENCY_EDGE);
      }
    }
  }

  const omitted = [...applicable].filter((bindingId) => !declaredApplicable.includes(bindingId));
  if (omitted.length) addReason(DENIAL.OMITTED_APPLICABLE_COMMITMENT);

  return {
    complete: incompleteReasons.length === 0,
    applicable: [...applicable].sort(),
    omitted,
    unresolvedSelectors,
    unresolvedEdges,
    incompleteReasons,
    revision,
  };
}

export function admitEffect(state, episodeId, effect, workspace) {
  if (workspace !== undefined) requireTrustedProjection(workspace);
  const episode = profileRoot(state, episodeId);
  if (episode.kind !== "execution_episode") throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { episodeId, kind: episode.kind, reason: "not_execution_episode" });
  validateProfile(state, episodeId);
  if (!["authorized", "running"].includes(profileState(episode))) {
    throw new ControlDenial(DENIAL.EPISODE_NOT_ACTIVE, { episodeId, lifecycle: profileState(episode) });
  }

  const authority = profileRole(state, episodeId, "authority_grant", "unit");
  const context = profileRole(state, episodeId, "context_envelope", "unit");
  if (context?.valid === false || context?.completeness === "incomplete") {
    throw new ControlDenial(DENIAL.CONTEXT_INCOMPLETE, { episodeId });
  }
  if (context?.complete === false) {
    throw new ControlDenial(DENIAL.CONTEXT_INCOMPLETE, { episodeId, reasons: context.incompleteReasons ?? [] });
  }
  if (authority?.revoked === true) {
    throw new ControlDenial(DENIAL.AUTHORITY_REVOKED, { episodeId });
  }
  if (authority?.expiresAt && authority.expiresAt <= Date.now()) {
    throw new ControlDenial(DENIAL.AUTHORITY_EXPIRED, { episodeId });
  }

  const allowed = authority?.operations;
  if (!Array.isArray(allowed)) {
    throw new ControlDenial(DENIAL.AUTHORITY_MISSING_OPERATIONS, { episodeId });
  }
  if (!allowed.includes(effect.operation)) {
    throw new ControlDenial(DENIAL.OPERATION_NOT_AUTHORIZED, { episodeId, operation: effect.operation });
  }
  const forbidden = episode.forbiddenOperations ?? [];
  if (forbidden.includes(effect.operation)) {
    throw new ControlDenial(DENIAL.OPERATION_FORBIDDEN, { episodeId, operation: effect.operation });
  }
  if (effect.target && authority?.targetPrefix && !effect.target.startsWith(authority.targetPrefix)) {
    throw new ControlDenial(DENIAL.TARGET_OUTSIDE_AUTHORITY, { episodeId, target: effect.target, targetPrefix: authority.targetPrefix });
  }
  const admittedAt = Date.now();
  const admissionId = digest(`${episodeId}${effect.operation}${effect.target ?? ""}${admittedAt}`);
  if (!Array.isArray(episode.admittedEffects)) episode.admittedEffects = [];
  episode.admittedEffects.push({ admissionId, admittedAt, operation: effect.operation, target: effect.target });
  return { admitted: true, episodeId, effect, admissionId, admittedAt };
}

export function recordObservedEffect(state, episodeId, observedEffect) {
  const episode = profileRoot(state, episodeId);
  if (!observedEffect || typeof observedEffect !== "object" || !("admissionId" in observedEffect)) {
    throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { episodeId, reason: "observed_effect_requires_admission_id" });
  }
  if (!Array.isArray(episode.observedEffects)) episode.observedEffects = [];
  const record = typeof observedEffect.observedAt === "number"
    ? { ...observedEffect }
    : { observedAt: Date.now(), ...observedEffect };
  episode.observedEffects.push(record);
  return record;
}

export function classifyEffect(state, episodeId, observedEffect) {
  const episode = profileRoot(state, episodeId);
  if (observedEffect?.admissionId == null) {
    return { controlled: false, code: DENIAL.UNCONTROLLED_EFFECT, reason: "observed_without_admission" };
  }
  const ledger = Array.isArray(episode.admittedEffects) ? episode.admittedEffects : [];
  const admission = ledger.find((entry) => entry && entry.admissionId === observedEffect.admissionId);
  if (!admission) {
    return { controlled: false, code: DENIAL.UNCONTROLLED_EFFECT, reason: "admission_not_in_ledger" };
  }
  if (observedEffect.operation !== admission.operation || observedEffect.target !== admission.target) {
    return { controlled: false, code: DENIAL.UNCONTROLLED_EFFECT, reason: "effect_mismatch" };
  }
  if (
    typeof observedEffect.observedAt === "number" &&
    typeof admission.admittedAt === "number" &&
    admission.admittedAt > observedEffect.observedAt
  ) {
    return { controlled: false, code: DENIAL.UNCONTROLLED_EFFECT, reason: "admitted_after_observation" };
  }
  return { controlled: true };
}

export function validateStateReference(ref) {
  for (const field of ["repository", "revision", "contentDigest"]) {
    if (typeof ref?.[field] !== "string" || ref[field].length === 0) {
      throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { field });
    }
  }
  return ref;
}

const SUBJECT_FIELDS = ["requiredSubjects", "coveredSubjects", "unknownSubjects", "excludedSubjects"];

export function normalizeSubjectSet(list) {
  if (!Array.isArray(list)) {
    throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { reason: "subject_set_not_an_array" });
  }
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (typeof item !== "string" || item.length === 0) {
      throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { item });
    }
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out.sort();
}

export function computeCoverageDigest(coverage) {
  const payload = SUBJECT_FIELDS.map((field) => normalizeSubjectSet(coverage?.[field] ?? []));
  return digest(JSON.stringify(payload));
}

export function validateCoverage(coverage, { permittedExclusions = [] } = {}) {
  const normalized = {};
  for (const field of SUBJECT_FIELDS) {
    if (!Array.isArray(coverage?.[field])) {
      throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { field });
    }
    normalized[field] = normalizeSubjectSet(coverage[field]);
  }
  const expected = computeCoverageDigest(coverage);
  if (typeof coverage.coverageDigest !== "string" || coverage.coverageDigest !== expected) {
    throw new ControlDenial(DENIAL.COVERAGE_DIGEST_MISMATCH, { expected, actual: coverage.coverageDigest });
  }
  if (normalized.unknownSubjects.length > 0) {
    throw new ControlDenial(DENIAL.COVERAGE_UNKNOWN_NONEMPTY, { unknown: normalized.unknownSubjects });
  }
  const covered = new Set(normalized.coveredSubjects);
  const missing = normalized.requiredSubjects.filter((subject) => !covered.has(subject));
  if (missing.length) {
    throw new ControlDenial(DENIAL.COVERAGE_INCOMPLETE, { missing });
  }
  const permitted = new Set(Array.isArray(permittedExclusions) ? permittedExclusions : []);
  const notPermitted = normalized.excludedSubjects.filter((subject) => !permitted.has(subject));
  if (notPermitted.length) {
    throw new ControlDenial(DENIAL.COVERAGE_EXCLUSION_NOT_PERMITTED, { notPermitted });
  }
  return { sufficient: true };
}

export async function evaluate(state, {
  evaluationId, evaluatorId, evaluatorVersion, subjects, stateRef, run, workspace,
} = {}) {
  if (workspace !== undefined) requireTrustedProjection(workspace);
  const subjectList = Array.isArray(subjects) ? [...subjects] : [];
  let result;
  let coverage;
  let error;
  try {
    const outcome = await run(subjectList);
    if (outcome && EVALUATION_RESULTS.has(outcome.result)) {
      result = outcome.result;
      coverage = outcome.coverage;
    } else {
      result = "evaluation_failed";
      error = {
        name: "UnrecognizedResult",
        message: "evaluator returned a result outside the result algebra",
        value: outcome?.result,
      };
    }
  } catch (thrown) {
    result = "evaluation_failed";
    error = thrown instanceof Error
      ? { name: thrown.name, message: thrown.message }
      : { name: "ThrownValue", message: String(thrown) };
  }
  let finalCoverage = coverage;
  if (result === "evaluation_failed") {
    finalCoverage = {
      requiredSubjects: [...subjectList],
      coveredSubjects: [],
      unknownSubjects: [...subjectList],
      excludedSubjects: [],
      selectionMethod: "evaluator_run_failed",
    };
    finalCoverage.coverageDigest = computeCoverageDigest(finalCoverage);
  }
  const record = {
    id: evaluationId,
    kind: "evaluation",
    origin: "extractor",
    epistemic_basis: "derived",
    approval_state: "proposed",
    freshness_state: "current",
    recorded_at: Date.now(),
    evaluatorId,
    evaluatorVersion,
    subjects: subjectList,
    stateRef,
    result,
    coverage: finalCoverage,
  };
  if (error !== undefined) record.error = error;
  return record;
}

export function validateEpisodeClosure(state, episodeId, workspace) {
  if (workspace !== undefined) requireTrustedProjection(workspace);
  const episode = profileRoot(state, episodeId);
  if (episode.kind !== "execution_episode") throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { episodeId, kind: episode.kind, reason: "not_execution_episode" });
  validateProfile(state, episodeId);
  if (!profileRole(state, episodeId, "outcome", "commitment")) {
    throw new ControlDenial(DENIAL.EPISODE_OUTCOME_MISSING, { episodeId });
  }
  if (episode.baseStateRef !== undefined) validateStateReference(episode.baseStateRef);
  if (episode.resultingStateRef !== undefined) validateStateReference(episode.resultingStateRef);
  const hasEffects =
    (Array.isArray(episode.admittedEffects) && episode.admittedEffects.length > 0) ||
    (Array.isArray(episode.observedEffects) && episode.observedEffects.length > 0);
  if (hasEffects && !episode.resultingStateRef) {
    throw new ControlDenial(DENIAL.EVALUATION_REVISION_MISMATCH, { episodeId, reason: "resulting_state_missing" });
  }
  if (!hasEffects && episode.noOp !== true) {
    throw new ControlDenial(DENIAL.NO_OP_NOT_DECLARED, { episodeId });
  }
  for (const observed of episode.observedEffects ?? []) {
    const classification = classifyEffect(state, episodeId, observed);
    if (classification.controlled === false) {
      throw new ControlDenial(DENIAL.UNCONTROLLED_EFFECT, { episodeId, effect: observed, reason: classification.reason });
    }
  }

  const obligations = relationshipsForRole(state, episodeId, "proof_obligation");
  for (const obligation of obligations) {
    if (obligation.targetType !== "unit") throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { episodeId, obligationId: obligation.id, reason: "invalid_proof_obligation" });
    const evaluation = state.units.get(obligation.targetId);
    if (!evaluation || evaluation.kind !== "evaluation") throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { episodeId, obligationId: obligation.id, reason: "invalid_evaluation_obligation" });
    validateProfile(state, evaluation.id);
    if (evaluation.stateRef !== undefined) validateStateReference(evaluation.stateRef);
    const result = profileRole(state, evaluation.id, "result", "commitment");
    if (result?.value === "evaluation_failed") {
      throw new ControlDenial(DENIAL.EVALUATION_FAILED_NOT_A_PASS, { episodeId, evaluationId: evaluation.id });
    }
    if (episode.resultingStateRef) {
      const ref = evaluation.stateRef;
      const fields = [];
      if (ref?.repository !== episode.resultingStateRef.repository) fields.push("repository");
      if (ref?.revision !== episode.resultingStateRef.revision) fields.push("revision");
      if (ref?.contentDigest !== episode.resultingStateRef.contentDigest) fields.push("contentDigest");
      if (fields.length) {
        throw new ControlDenial(DENIAL.EVALUATION_REVISION_MISMATCH, {
          episodeId,
          evaluationId: evaluation.id,
          fields,
          evaluated: ref?.revision,
          required: episode.resultingStateRef.revision,
        });
      }
    }
    if (!result || result.value !== "satisfied") throw new ControlDenial(DENIAL.EVALUATION_NOT_SATISFIED, { episodeId, evaluationId: evaluation.id });
    validateCoverage(evaluation.coverage, { permittedExclusions: episode.permittedExclusions ?? [] });
    if (evaluation.freshness_state === "stale" || evaluation.freshness_state === "expired") {
      throw new ControlDenial(DENIAL.EVALUATION_STALE, { episodeId, evaluationId: evaluation.id });
    }
  }
  return { closable: true, episodeId };
}

function cloneState(state) {
  return structuredClone({
    units: [...state.units],
    commitments: [...state.commitments],
    relationships: [...state.relationships],
    evidence: [...state.evidence],
    scopes: [...state.scopes],
  });
}

function restoreState(value) {
  const state = emptyState();
  for (const [id, record] of value.units) state.units.set(id, record);
  for (const [id, record] of value.commitments) state.commitments.set(id, record);
  for (const [id, record] of value.relationships) state.relationships.set(id, record);
  for (const [id, record] of value.evidence) state.evidence.set(id, record);
  for (const [id, record] of value.scopes) state.scopes.set(id, record);
  return state;
}

export class Workspace {
  constructor(root) {
    this.root = root;
    this.kraddle = join(root, ".kraddle");
    this.events = join(this.kraddle, "events");
    this.state = emptyState();
    this.heads = [];
    this._lock = Promise.resolve();
  }

  async _chain() {
    const prior = this._lock;
    let release;
    this._lock = new Promise((resolve) => { release = resolve; });
    await prior;
    return release;
  }

  async init() {
    const manifestPath = join(this.kraddle, "manifest.krd");
    let exists = false;
    try {
      await access(manifestPath);
      exists = true;
    } catch {
      exists = false;
    }
    if (exists) {
      throw new ControlDenial(DENIAL.WORKSPACE_EXISTS, { root: this.root });
    }
    await mkdir(this.events, { recursive: true });
    await mkdir(join(this.kraddle, "objects"), { recursive: true });
    await mkdir(join(this.kraddle, "indexes"), { recursive: true });
    await mkdir(join(this.kraddle, "local"), { recursive: true });
    const manifest = { format: "kraddle/alpha", workspaceId: randomUUID() };
    await writeFile(join(this.kraddle, "manifest.krd"), JSON.stringify(manifest) + "\n", "utf8");
    await writeFile(join(this.kraddle, "heads.krd"), JSON.stringify({ heads: [] }) + "\n", "utf8");
    return manifest;
  }

  async load() {
    const release = await this._chain();
    try {
      const files = (await readdir(this.events)).filter((name) => name.endsWith(".krd")).sort();
      this.state = emptyState();
      this.heads = [];
      this.trusted = true;
      this.quarantined = [];
      let projectedThrough = 0;
      let quarantine = null;
      // Segments are applied in lexical segment order (sorted filename order).
      // Phase 0 has no causal clocks; lexical segment order is the only ordering available.
      for (const file of files) {
        let operations = null;
        let commit = null;
        try {
          const lines = (await readFile(join(this.events, file), "utf8")).trim().split("\n").filter(Boolean);
          const transaction = lines.map((line) => JSON.parse(line));
          if (transaction.length && transaction.at(-1).type === "transaction.commit") {
            commit = transaction.at(-1).value;
            operations = transaction.slice(0, -1);
          }
        } catch {
          commit = null;
        }
        if (commit === null) {
          quarantine = { file, code: DENIAL.SEGMENT_COMMIT_MARKER_MISSING, index: projectedThrough };
        } else if (digest(JSON.stringify(operations)) !== commit.operationsDigest) {
          quarantine = { file, code: DENIAL.SEGMENT_DIGEST_MISMATCH, index: projectedThrough };
        }
        if (quarantine) break;
        for (const operation of operations) applyOperation(this.state, operation);
        this.heads.push(commit.transactionId);
        projectedThrough += 1;
      }
      if (quarantine) {
        this.trusted = false;
        this.quarantined.push(quarantine);
      }
      await writeFile(
        join(this.kraddle, "local", "quarantine.json"),
        JSON.stringify({ trusted: this.trusted, quarantined: this.quarantined, projectedThrough }, null, 2) + "\n",
        "utf8",
      );
      return { state: this.state, trusted: this.trusted, quarantined: this.quarantined, projectedThrough };
    } finally {
      release();
    }
  }

  async transact(operations, { profileIds = [], actorId = "human", episodeId } = {}) {
    const release = await this._chain();
    try {
      if (!operations.length) throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { reason: "empty_transaction" });
      if (episodeId !== undefined) {
        for (const operation of operations) {
          authorizeMutation(this.state, { actorId, operation, targetId: operation.value?.id, episodeId });
        }
      }
      if (actorId !== "human" && !String(actorId).startsWith("policy-")) {
        for (const operation of operations) {
          if (operation.value?.approval_state === "accepted") {
            throw new ControlDenial(DENIAL.ACCEPTANCE_NOT_AUTHORIZED, { actorId, recordId: operation.value.id });
          }
        }
      }
      const next = restoreState(cloneState(this.state));
      for (const operation of operations) applyOperation(next, operation);
      for (const profileId of profileIds) validateProfile(next, profileId);
      const transactionId = randomUUID();
      const prepared = operations.map((operation) => ({ ...operation, transactionId, actorId }));
      const commit = {
        type: "transaction.commit",
        value: {
          transactionId,
          actorId,
          operationsDigest: digest(JSON.stringify(prepared)),
          profileIds,
        },
      };
      const file = `${Date.now()}-${transactionId}.krd`;
      const temporary = join(this.events, `.${file}.tmp`);
      // rename is atomic but not fsync-durable; a crash after rename may lose
      // the tail of the event history. Stated durability limitation of Phase 0,
      // not a guarantee.
      await writeFile(temporary, prepared.concat(commit).map((item) => JSON.stringify(item)).join("\n") + "\n", "utf8");
      await rename(temporary, join(this.events, file));
      this.state = next;
      this.heads.push(transactionId);
      await writeFile(join(this.kraddle, "heads.krd"), JSON.stringify({ heads: this.heads }) + "\n", "utf8");
      return transactionId;
    } finally {
      release();
    }
  }
}

export const id = () => randomUUID();
