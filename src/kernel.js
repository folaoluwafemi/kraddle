import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
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

export function applyOperation(state, operation) {
  const { type, value } = operation;
  if (!value?.id) throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { type, missing: ["id"] });

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

export function admitEffect(state, episodeId, effect) {
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
  if (authority?.revoked || (authority?.expiresAt && authority.expiresAt <= Date.now())) {
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
  return { admitted: true, episodeId, effect };
}

export function validateEpisodeClosure(state, episodeId) {
  const episode = profileRoot(state, episodeId);
  if (episode.kind !== "execution_episode") throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { episodeId, kind: episode.kind, reason: "not_execution_episode" });
  validateProfile(state, episodeId);
  if (!profileRole(state, episodeId, "outcome", "commitment")) {
    throw new ControlDenial(DENIAL.EPISODE_OUTCOME_MISSING, { episodeId });
  }

  const obligations = relationshipsForRole(state, episodeId, "proof_obligation");
  for (const obligation of obligations) {
    if (obligation.targetType !== "unit") throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { episodeId, obligationId: obligation.id, reason: "invalid_proof_obligation" });
    const evaluation = state.units.get(obligation.targetId);
    if (!evaluation || evaluation.kind !== "evaluation") throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { episodeId, obligationId: obligation.id, reason: "invalid_evaluation_obligation" });
    validateProfile(state, evaluation.id);
    const result = profileRole(state, evaluation.id, "result", "commitment");
    const coverage = profileRole(state, evaluation.id, "coverage", "commitment");
    if (!result || result.value !== "satisfied") throw new ControlDenial(DENIAL.EVALUATION_NOT_SATISFIED, { episodeId, evaluationId: evaluation.id });
    if (!coverage || coverage.value !== "complete") throw new ControlDenial(DENIAL.COVERAGE_INCOMPLETE, { episodeId, evaluationId: evaluation.id });
    if (evaluation.freshness === "stale" || evaluation.evaluationFailed) {
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
  }

  async init() {
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
    const files = (await readdir(this.events)).filter((name) => name.endsWith(".krd")).sort();
    this.state = emptyState();
    this.heads = [];
    for (const file of files) {
      const lines = (await readFile(join(this.events, file), "utf8")).trim().split("\n").filter(Boolean);
      const transaction = lines.map((line) => JSON.parse(line));
      if (!transaction.length || transaction.at(-1).type !== "transaction.commit") {
        throw new ControlDenial(DENIAL.SEGMENT_COMMIT_MARKER_MISSING, { file });
      }
      const commit = transaction.at(-1).value;
      const operations = transaction.slice(0, -1);
      if (digest(JSON.stringify(operations)) !== commit.operationsDigest) {
        throw new ControlDenial(DENIAL.SEGMENT_DIGEST_MISMATCH, { file });
      }
      for (const operation of operations) applyOperation(this.state, operation);
      this.heads.push(commit.transactionId);
    }
    return this.state;
  }

  async transact(operations, { profileIds = [], actorId = "human" } = {}) {
    if (!operations.length) throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { reason: "empty_transaction" });
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
    await writeFile(temporary, prepared.concat(commit).map((item) => JSON.stringify(item)).join("\n") + "\n", "utf8");
    await rename(temporary, join(this.events, file));
    this.state = next;
    this.heads.push(transactionId);
    await writeFile(join(this.kraddle, "heads.krd"), JSON.stringify({ heads: this.heads }) + "\n", "utf8");
    return transactionId;
  }
}

export const id = () => randomUUID();
