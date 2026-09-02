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

function profileRoot(state, profileId) {
  const root = state.units.get(profileId);
  if (!root || !PROFILE_KINDS.has(root.kind)) {
    throw new Error(`Unknown profile root: ${profileId}`);
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
    throw new Error(`${profileId}: role ${role} requires exactly ${count} ${targetType} record(s)`);
  }
  if (edges.some((edge) => edge.targetType !== targetType || !roleTarget(state, edge))) {
    throw new Error(`${profileId}: role ${role} has an invalid target`);
  }
  return edges;
}

function optionalRole(state, profileId, role, targetType) {
  const edges = relationshipsForRole(state, profileId, role);
  if (edges.length > 1) throw new Error(`${profileId}: role ${role} allows at most one record`);
  if (edges.length && (edges[0].targetType !== targetType || !roleTarget(state, edges[0]))) {
    throw new Error(`${profileId}: role ${role} has an invalid target`);
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
  if (!value?.id) throw new Error(`${type}: record id is required`);

  if (type === "unit.create" || type === "unit.update") state.units.set(value.id, value);
  else if (type === "commitment.create" || type === "commitment.update") state.commitments.set(value.id, value);
  else if (type === "relationship.add" || type === "relationship.update") state.relationships.set(value.id, value);
  else if (type === "evidence.create" || type === "evidence.update") state.evidence.set(value.id, value);
  else if (type === "scope.create" || type === "scope.update") state.scopes.set(value.id, value);
  else if (type === "unit.tombstone") {
    const unit = state.units.get(value.id);
    if (!unit) throw new Error(`Cannot tombstone unknown unit: ${value.id}`);
    state.units.set(value.id, { ...unit, tombstoned: true });
  } else {
    throw new Error(`Unknown operation: ${type}`);
  }
}

export function validateProfile(state, profileId) {
  const root = profileRoot(state, profileId);
  const members = profileMembers(state, profileId);
  const roles = new Set(members.map((edge) => edge.role));
  for (const edge of members) {
    if (edge.profileId !== profileId) throw new Error(`${profileId}: foreign profile member`);
    if (!edge.role || !edge.targetType || !roleTarget(state, edge)) {
      throw new Error(`${profileId}: malformed profile member`);
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
      throw new Error(`${profileId}: blocking modality requires an evaluator`);
    }
  }

  if (root.kind === "evaluation") {
    requireRole(state, profileId, "target_commitment", "commitment");
    requireRole(state, profileId, "target_selector", "unit");
    requireRole(state, profileId, "source_scope", "scope");
    requireRole(state, profileId, "evaluator", "unit");
    const result = requireRole(state, profileId, "result", "commitment")[0];
    const resultValue = roleTarget(state, result)?.value;
    if (!EVALUATION_RESULTS.has(resultValue)) throw new Error(`${profileId}: invalid evaluation result`);
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
  if (episode.kind !== "execution_episode") throw new Error("Effect admission requires an execution episode");
  validateProfile(state, episodeId);
  if (!["authorized", "running"].includes(profileState(episode))) {
    throw new Error(`Episode ${episodeId} is not active`);
  }

  const authority = profileRole(state, episodeId, "authority_grant", "unit");
  const context = profileRole(state, episodeId, "context_envelope", "unit");
  if (context?.valid === false || context?.completeness === "incomplete") {
    throw new Error(`Episode ${episodeId} has an incomplete context envelope`);
  }
  if (authority?.revoked || (authority?.expiresAt && authority.expiresAt <= Date.now())) {
    throw new Error(`Episode ${episodeId} has expired or revoked authority`);
  }

  const allowed = authority?.operations;
  if (!Array.isArray(allowed)) {
    throw new Error(`Episode ${episodeId} has incomplete authority operations`);
  }
  if (!allowed.includes(effect.operation)) {
    throw new Error(`Effect operation is not authorized: ${effect.operation}`);
  }
  const forbidden = episode.forbiddenOperations ?? [];
  if (forbidden.includes(effect.operation)) {
    throw new Error(`Effect operation is forbidden: ${effect.operation}`);
  }
  if (effect.target && authority?.targetPrefix && !effect.target.startsWith(authority.targetPrefix)) {
    throw new Error(`Effect target is outside authority scope: ${effect.target}`);
  }
  return { admitted: true, episodeId, effect };
}

export function validateEpisodeClosure(state, episodeId) {
  const episode = profileRoot(state, episodeId);
  if (episode.kind !== "execution_episode") throw new Error("Closure requires an execution episode");
  validateProfile(state, episodeId);
  if (!profileRole(state, episodeId, "outcome", "commitment")) {
    throw new Error(`Episode ${episodeId} requires an outcome before closure`);
  }

  const obligations = relationshipsForRole(state, episodeId, "proof_obligation");
  for (const obligation of obligations) {
    if (obligation.targetType !== "unit") throw new Error(`Episode ${episodeId} has an invalid proof obligation`);
    const evaluation = state.units.get(obligation.targetId);
    if (!evaluation || evaluation.kind !== "evaluation") throw new Error(`Episode ${episodeId} has an invalid evaluation obligation`);
    validateProfile(state, evaluation.id);
    const result = profileRole(state, evaluation.id, "result", "commitment");
    const coverage = profileRole(state, evaluation.id, "coverage", "commitment");
    if (!result || result.value !== "satisfied") throw new Error(`Episode ${episodeId} has an unsatisfied proof obligation`);
    if (!coverage || coverage.value !== "complete") throw new Error(`Episode ${episodeId} has insufficient proof coverage`);
    if (evaluation.freshness === "stale" || evaluation.evaluationFailed) {
      throw new Error(`Episode ${episodeId} has stale or failed evaluation evidence`);
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
        throw new Error(`Uncommitted event segment: ${file}`);
      }
      const commit = transaction.at(-1).value;
      const operations = transaction.slice(0, -1);
      if (digest(JSON.stringify(operations)) !== commit.operationsDigest) {
        throw new Error(`Corrupt event segment: ${file}`);
      }
      for (const operation of operations) applyOperation(this.state, operation);
      this.heads.push(commit.transactionId);
    }
    return this.state;
  }

  async transact(operations, { profileIds = [], actorId = "human" } = {}) {
    if (!operations.length) throw new Error("Transaction must contain operations");
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
