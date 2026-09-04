#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { ControlDenial, DENIAL, validateProfile, Workspace } from "./kernel.js";
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
      case "rule":
      case "episode":
      case "status":
      case "help":
      case undefined:
        return fail(`command not implemented yet: ${command ?? "(none)"}`);
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
