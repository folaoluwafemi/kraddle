#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { ControlDenial, DENIAL, episodeStatus, resolveApplicableContext, validateProfile, Workspace } from "./kernel.js";
import { computeFileMapDigest, extractDependencies } from "./extract.js";
import { gitStateRef, readRepoFiles } from "./repo.js";

const USAGE = `kraddle — semantic control runtime (human channel)

usage:
  kraddle init [--repo <dir>]                     create the .kraddle workspace
  kraddle rule add --repo <dir> --source <prefix> --forbid <prefix> [--forbid <prefix>...]
                  --text "<commitment sentence>"  declare a governing rule
  kraddle episode start --repo <dir> --task "<purpose>" --write-prefix <prefix> [--read-only]
                                                  launch an episode and print server env vars
  kraddle status [--repo <dir>]                   list rules and episodes
  kraddle episode abort <id> [--repo <dir>]       abort an episode
  kraddle help                                    this text

defaults: --repo is the current working directory.
The CLI is the human trust root; the agent only ever sees the MCP server.`;

function fail(message) {
  return { code: 1, output: `${message}\n\n${USAGE}` };
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("--")) {
      const name = token.slice(2);
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[name] = true;
      } else {
        flags[name] = next;
        index += 1;
      }
    } else {
      positional.push(token);
    }
  }
  return { flags, positional };
}

function collectRepeatable(argv, name) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === `--${name}` && argv[index + 1] !== undefined) {
      values.push(argv[index + 1]);
      index += 1;
    }
  }
  return values;
}

function normalizePrefix(prefix) {
  if (typeof prefix !== "string" || prefix.length === 0) return prefix;
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

async function commandRuleAdd({ flags, rawArgv }) {
  const repo = flags.repo ?? process.cwd();
  const text = flags.text;
  if (typeof text !== "string" || text.trim().length === 0) {
    return fail("rule add requires --text with the commitment sentence a human would say.");
  }
  const source = normalizePrefix(flags.source);
  if (typeof source !== "string" || source.length === 0) {
    return fail("rule add requires --source, the path prefix the rule governs (e.g. src/domain).");
  }
  const forbids = collectRepeatable(rawArgv, "forbid").map(normalizePrefix);
  if (forbids.length === 0) {
    return fail("rule add requires at least one --forbid prefix (e.g. src/ui).");
  }
  if (forbids.some((forbid) => source.startsWith(forbid))) {
    return fail(
      `unsatisfiable rule: the source prefix "${source}" itself falls under the forbidden prefix "${forbids.find((forbid) => source.startsWith(forbid))}". A rule cannot govern a tree it also forbids.`,
    );
  }

  let files;
  let git;
  try {
    ({ files } = await readRepoFiles(repo));
    git = await gitStateRef(repo);
  } catch (thrown) {
    return fail(`rule add could not read the repository at ${repo}: ${messageOf(thrown)}`);
  }
  const stateRef = { repository: git.repository, revision: git.revision, contentDigest: computeFileMapDigest(files) };
  const { edges } = extractDependencies(files);
  const scopedEdges = edges.filter((edge) => edge.from.startsWith(source));

  const workspace = new Workspace(repo);
  let loadResult;
  try {
    loadResult = await workspace.load();
  } catch {
    return fail(`no workspace found at ${joinHuman(repo, ".kraddle")} — run "kraddle init" first.`);
  }
  if (loadResult.trusted === false) {
    return fail(`the workspace at ${joinHuman(repo, ".kraddle")} is quarantined and cannot take new rules (${loadResult.quarantined.map((entry) => entry.code).join(", ")}).`);
  }

  const bindingId = `CB-${randomId()}`;
  const evidenceId = `EV-${randomId()}`;
  const commitmentId = `C-${randomId()}`;
  const selectorId = `S-${randomId()}`;
  const modalityId = `M-${randomId()}`;
  const evaluatorId = `EVAL-${randomId()}`;
  const scopeId = `SC-${randomId()}`;
  const now = Date.now();

  const human = (record) => ({
    origin: "human",
    epistemic_basis: "asserted",
    approval_state: "accepted",
    freshness_state: "current",
    recorded_at: now,
    ...record,
  });

  const operations = [
    { type: "scope.create", value: human({ id: scopeId, kind: "scope" }) },
    { type: "unit.create", value: human({ id: evaluatorId, kind: "evaluator", evaluatorType: "architecture_rule", params: { sourcePrefix: source, forbiddenPrefixes: forbids } }) },
    { type: "commitment.create", value: human({ id: commitmentId, kind: "commitment", value: text, forbiddenPathPrefixes: forbids }) },
    { type: "commitment.create", value: human({ id: selectorId, kind: "commitment", value: { type: "path_prefix", value: source } }) },
    { type: "commitment.create", value: human({ id: modalityId, kind: "commitment", value: "prohibition" }) },
    { type: "unit.create", value: human({ id: bindingId, kind: "control_binding" }) },
    { type: "relationship.add", value: human({ id: `${bindingId}-r1`, kind: "relationship", profileId: bindingId, role: "governed_commitment", targetId: commitmentId, targetType: "commitment" }) },
    { type: "relationship.add", value: human({ id: `${bindingId}-r2`, kind: "relationship", profileId: bindingId, role: "subject_selector", targetId: selectorId, targetType: "commitment" }) },
    { type: "relationship.add", value: human({ id: `${bindingId}-r3`, kind: "relationship", profileId: bindingId, role: "modality", targetId: modalityId, targetType: "commitment" }) },
    { type: "relationship.add", value: human({ id: `${bindingId}-r4`, kind: "relationship", profileId: bindingId, role: "evaluator", targetId: evaluatorId, targetType: "unit" }) },
    { type: "evidence.create", value: {
      id: evidenceId,
      kind: "evidence",
      origin: "extractor",
      epistemic_basis: "observed",
      approval_state: "accepted",
      freshness_state: "current",
      recorded_at: now,
      stateRef,
      edges: scopedEdges,
      extractionScope: { fromPrefixes: [source] },
    } },
  ];

  try {
    await workspace.transact(operations, { profileIds: [bindingId] });
  } catch (thrown) {
    return fail(`rule add failed: ${messageOf(thrown)}`);
  }
  validateProfile(workspace.state, bindingId);

  return {
    code: 0,
    output: [
      `rule added.`,
      `binding ${bindingId}`,
      `governs "${text}" over ${source} (forbids ${forbids.join(", ")})`,
      `pinned to revision ${git.revision}`,
      `evidence ${evidenceId}`,
    ].join("\n"),
  };
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

async function commandEpisodeStart({ flags }) {
  const repo = flags.repo ?? process.cwd();
  const task = flags.task;
  if (typeof task !== "string" || task.trim().length === 0) {
    return fail("episode start requires --task describing what the episode is for.");
  }
  const writePrefix = normalizePrefix(flags["write-prefix"]);
  if (typeof writePrefix !== "string" || writePrefix.length === 0) {
    return fail("episode start requires --write-prefix, the path prefix writes are bounded to (e.g. src/domain).");
  }
  const readOnly = flags["read-only"] === true;

  let files;
  let git;
  try {
    ({ files } = await readRepoFiles(repo));
    git = await gitStateRef(repo);
  } catch (thrown) {
    return fail(`episode start could not read the repository at ${repo}: ${messageOf(thrown)}`);
  }
  const stateRef = { repository: git.repository, revision: git.revision, contentDigest: computeFileMapDigest(files) };
  const { edges } = extractDependencies(files);
  const scopedEdges = edges.filter((edge) => edge.from.startsWith("src/"));

  const workspace = new Workspace(repo);
  let loadResult;
  try {
    loadResult = await workspace.load();
  } catch {
    return fail(`no workspace found at ${joinHuman(repo, ".kraddle")} — run "kraddle init" first.`);
  }
  if (loadResult.trusted === false) {
    return fail(`the workspace at ${joinHuman(repo, ".kraddle")} is quarantined (${loadResult.quarantined.map((entry) => entry.code).join(", ")}).`);
  }

  const now = Date.now();
  const human = (record) => ({
    origin: "human",
    epistemic_basis: "asserted",
    approval_state: "accepted",
    freshness_state: "current",
    recorded_at: now,
    ...record,
  });

  const evidenceId = `EV-${randomId()}`;
  try {
    await workspace.transact([
      { type: "evidence.create", value: {
        id: evidenceId,
        kind: "evidence",
        origin: "extractor",
        epistemic_basis: "observed",
        approval_state: "accepted",
        freshness_state: "current",
        recorded_at: now,
        stateRef,
        edges: scopedEdges,
        extractionScope: { fromPrefixes: ["src/"] },
      } },
    ]);
  } catch (thrown) {
    return fail(`episode start failed while recording base evidence: ${messageOf(thrown)}`);
  }

  const state = workspace.state;
  const acceptedBindings = [...state.units.values()]
    .filter((unit) => unit.kind === "control_binding" && unit.approval_state === "accepted")
    .map((unit) => unit.id);
  const resolver = resolveApplicableContext(state, {
    targetPaths: Object.keys(files),
    revision: git.revision,
    declaredApplicable: acceptedBindings,
    dependencyEvidenceId: evidenceId,
  });
  if (resolver.complete === false) {
    const explanations = resolver.incompleteReasons.map(explainReason).join("\n  ");
    return fail(`episode start refused: the governing context is incomplete, so an episode cannot launch honestly.\n  ${explanations}`);
  }

  const episodeId = `EP-${randomId()}`;
  const purposeId = `EP-${randomId()}-purpose`;
  const baseId = `EP-${randomId()}-base`;
  const outcomeId = `EP-${randomId()}-outcome`;
  const contextId = `EP-${randomId()}-ctx`;
  const authorityId = `EP-${randomId()}-auth`;
  const deltaId = `EP-${randomId()}-delta`;
  const scopeId = `SC-${randomId()}`;

  const operations = [
    { type: "commitment.create", value: human({ id: purposeId, kind: "commitment", value: task }) },
    { type: "commitment.create", value: human({ id: baseId, kind: "commitment", value: git.revision }) },
    { type: "commitment.create", value: human({ id: outcomeId, kind: "commitment", value: "completed under governing commitments" }) },
    { type: "unit.create", value: human({ id: contextId, kind: "context_envelope", valid: true, completeness: "complete", complete: resolver.complete, incompleteReasons: resolver.incompleteReasons }) },
    { type: "unit.create", value: human({ id: authorityId, kind: "authority_grant", operations: readOnly ? ["read"] : ["read", "write"], targetPrefix: writePrefix, allowRecordIds: [] }) },
    { type: "unit.create", value: human({ id: deltaId, kind: "software_element" }) },
    { type: "scope.create", value: human({ id: scopeId, kind: "scope" }) },
    { type: "unit.create", value: human({ id: episodeId, kind: "execution_episode", lifecycle: "authorized", baseStateRef: stateRef, resultingStateRef: stateRef, noOp: true }) },
    { type: "relationship.add", value: human({ id: `${episodeId}-r1`, kind: "relationship", profileId: episodeId, role: "purpose", targetId: purposeId, targetType: "commitment" }) },
    { type: "relationship.add", value: human({ id: `${episodeId}-r2`, kind: "relationship", profileId: episodeId, role: "target_scope", targetId: scopeId, targetType: "scope" }) },
    { type: "relationship.add", value: human({ id: `${episodeId}-r3`, kind: "relationship", profileId: episodeId, role: "base_revision", targetId: baseId, targetType: "commitment" }) },
    { type: "relationship.add", value: human({ id: `${episodeId}-r4`, kind: "relationship", profileId: episodeId, role: "context_envelope", targetId: contextId, targetType: "unit" }) },
    { type: "relationship.add", value: human({ id: `${episodeId}-r5`, kind: "relationship", profileId: episodeId, role: "authority_grant", targetId: authorityId, targetType: "unit" }) },
    { type: "relationship.add", value: human({ id: `${episodeId}-r6`, kind: "relationship", profileId: episodeId, role: "intended_delta", targetId: deltaId, targetType: "unit" }) },
    { type: "relationship.add", value: human({ id: `${episodeId}-r7`, kind: "relationship", profileId: episodeId, role: "outcome", targetId: outcomeId, targetType: "commitment" }) },
  ];

  try {
    await workspace.transact(operations, { profileIds: [episodeId] });
  } catch (thrown) {
    return fail(`episode start failed: ${messageOf(thrown)}`);
  }

  const sep = repo.includes("\\") ? "\\" : "/";
  return {
    code: 0,
    output: [
      `episode ${episodeId} started (lifecycle authorized).`,
      `The agent surface refused nothing at launch: the governing context is complete.`,
      ``,
      `Paste these to run the MCP server (npm start):`,
      `KRADDLE_REPO=${repo}`,
      `KRADDLE_WORKSPACE_DIR=${repo.replace(/[\\/]$/, "")}`,
      `KRADDLE_EPISODE_ID=${episodeId}`,
      `KRADDLE_BASE_EVIDENCE_ID=${evidenceId}`,
    ].join("\n"),
  };
}

function explainReason(code) {
  switch (code) {
    case "OMITTED_APPLICABLE_COMMITMENT":
      return "OMITTED_APPLICABLE_COMMITMENT — a governing rule applies to this repository but was not counted; declare it with rule add.";
    case "UNRESOLVED_SELECTOR":
      return "UNRESOLVED_SELECTOR — a rule uses a selector this runtime cannot evaluate.";
    case "UNRESOLVED_DEPENDENCY_EDGE":
      return "UNRESOLVED_DEPENDENCY_EDGE — the dependency evidence contains an import that could not be resolved statically.";
    case "EVIDENCE_PIN_MISMATCH":
      return "EVIDENCE_PIN_MISMATCH — the dependency evidence is missing, not accepted, or pinned to a different revision.";
    case "EVIDENCE_SCOPE_MISMATCH":
      return "EVIDENCE_SCOPE_MISMATCH — the evidence record's contents do not match the extraction region it declares.";
    default:
      return `${code} — (no description yet)`;
  }
}

async function loadWorkspaceOr(repo, refuse) {
  const workspace = new Workspace(repo);
  let loadResult;
  try {
    loadResult = await workspace.load();
  } catch {
    return refuse(`no workspace found at ${joinHuman(repo, ".kraddle")} — run "kraddle init" first.`);
  }
  if (loadResult.trusted === false) {
    return refuse(`the workspace at ${joinHuman(repo, ".kraddle")} is quarantined (${loadResult.quarantined.map((entry) => entry.code).join(", ")}).`);
  }
  return { workspace, loadResult };
}

async function commandStatus({ flags }) {
  const repo = flags.repo ?? process.cwd();
  const lines = [];
  const outcome = await loadWorkspaceOr(repo, (message) => message);
  if (typeof outcome === "string") {
    return fail(outcome);
  }
  const { workspace, loadResult } = outcome;
  lines.push(`workspace ${joinHuman(repo, ".kraddle")} — trusted: ${loadResult.trusted}${loadResult.quarantined.length ? `, quarantined segments: ${loadResult.quarantined.length}` : ""}`);
  lines.push("");
  const state = workspace.state;
  const bindings = [...state.units.values()].filter((unit) => unit.kind === "control_binding");
  lines.push(`rules (${bindings.length}):`);
  for (const binding of bindings) {
    const governedId = [...state.relationships.values()].find(
      (relationship) => relationship.profileId === binding.id && relationship.role === "governed_commitment",
    )?.targetId;
    const text = governedId ? state.commitments.get(governedId)?.value : undefined;
    const shown = typeof text === "string" && text.length > 60 ? `${text.slice(0, 60)}…` : (text ?? "(no commitment text)");
    lines.push(`  ${binding.id}  "${shown}"  [${binding.approval_state}]`);
  }
  lines.push("");
  const episodes = [...state.units.values()].filter((unit) => unit.kind === "execution_episode");
  lines.push(`episodes (${episodes.length}):`);
  for (const episode of episodes) {
    const status = episodeStatus(state, episode.id);
    const admitted = Array.isArray(episode.admittedEffects) ? episode.admittedEffects.length : 0;
    lines.push(`  ${episode.id}  ${status}  admitted effects: ${admitted}`);
  }
  return { code: 0, output: lines.join("\n") };
}

async function commandEpisodeAbort({ flags, positional }) {
  const repo = flags.repo ?? process.cwd();
  const episodeId = positional[1];
  if (typeof episodeId !== "string" || episodeId.length === 0) {
    return fail("episode abort requires the episode id, e.g. kraddle episode abort EP-xxxx.");
  }
  const outcome = await loadWorkspaceOr(repo, (message) => message);
  if (typeof outcome === "string") {
    return fail(outcome);
  }
  const { workspace } = outcome;
  const episode = workspace.state.units.get(episodeId);
  if (!episode || episode.kind !== "execution_episode") {
    return fail(`no episode with id ${episodeId} exists in this workspace.`);
  }
  const now = Date.now();
  try {
    await workspace.transact([
      {
        type: "unit.update",
        value: {
          ...episode,
          lifecycle: "aborted",
          origin: "human",
          epistemic_basis: "asserted",
          recorded_at: now,
        },
      },
    ]);
  } catch (thrown) {
    return fail(`episode abort failed: ${messageOf(thrown)}`);
  }
  return { code: 0, output: `episode ${episodeId} aborted.` };
}

async function commandInit({ flags }) {
  const repo = flags.repo ?? process.cwd();
  const workspace = new Workspace(repo);
  try {
    await workspace.init();
  } catch (thrown) {
    if (thrown instanceof ControlDenial && thrown.code === DENIAL.WORKSPACE_EXISTS) {
      return fail(`WORKSPACE_EXISTS — a workspace already exists at ${joinHuman(repo, ".kraddle")}; it was left untouched. To reopen it, just run a status or start a server against it.`);
    }
    return fail(`init failed: ${messageOf(thrown)}`);
  }
  return {
    code: 0,
    output: `initialized workspace at ${joinHuman(repo, ".kraddle")}\nit governs the repository at ${repo}`,
  };
}

function joinHuman(dir, child) {
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${dir.replace(/[\\/]$/, "")}${sep}${child}`;
}

function messageOf(thrown) {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

export async function runCli(argv, { cwd } = {}) {
  try {
    const [command, ...rest] = argv;
    const parsed = parseArgs(rest);
    if (cwd !== undefined && parsed.flags.repo === undefined) {
      parsed.flags.repo = cwd;
    }
    switch (command) {
      case "init":
        return await commandInit(parsed);
      case "rule": {
        const subcommand = parsed.positional[0];
        if (subcommand !== "add") {
          return fail(`unknown rule subcommand: ${subcommand ?? "(none)"} — try "kraddle rule add"`);
        }
        parsed.rawArgv = rest;
        return await commandRuleAdd(parsed);
      }
      case "episode": {
        const subcommand = parsed.positional[0];
        if (subcommand === "start") {
          return await commandEpisodeStart(parsed);
        }
        if (subcommand === "abort") {
          return await commandEpisodeAbort(parsed);
        }
        return fail(`unknown episode subcommand: ${subcommand ?? "(none)"} — try "kraddle episode start"`);
      }
      case "status":
        return await commandStatus(parsed);
      case "help":
        return { code: 0, output: USAGE };
      case undefined:
        return fail("no command given.");
      default:
        return fail(`unknown command: ${command}`);
    }
  } catch (thrown) {
    return fail(`kraddle failed: ${messageOf(thrown)}`);
  }
}

async function main() {
  const result = await runCli(process.argv.slice(2));
  process.stdout.write(result.output + "\n");
  process.exit(result.code);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await main();
}
