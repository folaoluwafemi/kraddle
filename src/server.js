import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { isAbsolute, join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { createMcpServer } from "./mcp.js";
import { computeFileMapDigest } from "./extract.js";
import { runEvaluator } from "./evaluators.js";
import {
  ControlDenial,
  DENIAL,
  Workspace,
  admitEffect,
  episodeStatus,
  recordObservedEffect,
  requireTrustedProjection,
  resolveApplicableContext,
} from "./kernel.js";
import { readRepoFiles } from "./repo.js";

const SERVER_INFO = { name: "kraddle-agent-surface", version: "0.1.0" };

function profileRoleRecords(state, profileId, role) {
  const out = [];
  for (const relationship of state.relationships.values()) {
    if (relationship.profileId !== profileId || relationship.role !== role) continue;
    const target =
      relationship.targetType === "unit" ? state.units.get(relationship.targetId)
      : relationship.targetType === "commitment" ? state.commitments.get(relationship.targetId)
      : relationship.targetType === "scope" ? state.scopes.get(relationship.targetId)
      : relationship.targetType === "evidence" ? state.evidence.get(relationship.targetId)
      : undefined;
    if (target) out.push(target);
  }
  return out;
}

function validateToolPath(path) {
  if (typeof path !== "string" || path.length === 0) {
    throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { path, reason: "invalid_path" });
  }
  if (isAbsolute(path) || path.includes("\\") || path.split("/").includes("..")) {
    throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { path, reason: "path_escape" });
  }
  return path;
}

function asToolResult(handler) {
  return async (args) => {
    try {
      return await handler(args ?? {});
    } catch (thrown) {
      return { text: thrown instanceof Error ? thrown.message : String(thrown), isError: true };
    }
  };
}

function episodeAuthorityUnit(state, episodeId) {
  for (const relationship of state.relationships.values()) {
    if (relationship.profileId === episodeId && relationship.role === "authority_grant") {
      return state.units.get(relationship.targetId);
    }
  }
  return undefined;
}

export async function createKraddleServer({ repoDir, workspaceDir, episodeId, baseEvidenceId }) {
  const workspace = new Workspace(workspaceDir);
  await workspace.load();
  requireTrustedProjection(workspace);
  const state = workspace.state;

  const episode = state.units.get(episodeId);
  if (!episode || episode.kind !== "execution_episode") {
    throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { episodeId, reason: "episode_missing" });
  }
  if (episodeStatus(state, episodeId) === "suspended") {
    throw new ControlDenial(DENIAL.AUTHORITY_REVOKED, { episodeId });
  }
  const authority = episodeAuthorityUnit(state, episodeId);
  if (!authority) {
    throw new ControlDenial(DENIAL.AUTHORITY_MISSING_OPERATIONS, { episodeId });
  }
  if (authority.revoked === true) {
    throw new ControlDenial(DENIAL.AUTHORITY_REVOKED, { episodeId });
  }
  if (authority.expiresAt && authority.expiresAt <= Date.now()) {
    throw new ControlDenial(DENIAL.AUTHORITY_EXPIRED, { episodeId });
  }

  const { files: baseFiles } = await readRepoFiles(repoDir);
  const baseDigest = computeFileMapDigest(baseFiles);
  if (episode.baseStateRef?.contentDigest !== baseDigest) {
    throw new ControlDenial(DENIAL.EVIDENCE_PIN_MISMATCH, {
      episodeId,
      expected: episode.baseStateRef?.contentDigest,
      actual: baseDigest,
    });
  }

  const admittedWrites = new Map();
  const baseRevision = episode.baseStateRef.revision;

  async function preflight(path, content) {
    const proposedMap = { ...baseFiles, [path]: content };
    const acceptedBindings = [...state.units.values()]
      .filter((unit) => unit.kind === "control_binding" && unit.approval_state === "accepted")
      .map((unit) => unit.id);
    const resolver = resolveApplicableContext(state, {
      targetPaths: [path],
      revision: baseRevision,
      declaredApplicable: acceptedBindings,
      dependencyEvidenceId: baseEvidenceId,
    });
    if (resolver.complete === false) {
      throw new ControlDenial(DENIAL.PREFLIGHT_UNKNOWN, {
        path,
        reasons: resolver.incompleteReasons,
      });
    }
    for (const bindingId of resolver.applicable) {
      const evaluatorUnit = profileRoleRecords(state, bindingId, "evaluator")[0];
      if (!evaluatorUnit) continue;
      const governed = profileRoleRecords(state, bindingId, "governed_commitment")[0];
      const outcome = runEvaluator(evaluatorUnit, proposedMap);
      if (outcome.result === "violated") {
        throw new ControlDenial(DENIAL.PREFLIGHT_VIOLATED, {
          path,
          bindingId,
          commitment: governed?.value,
        });
      }
      if (outcome.result !== "satisfied") {
        throw new ControlDenial(DENIAL.PREFLIGHT_UNKNOWN, {
          path,
          bindingId,
          reason: outcome.reason ?? outcome.result,
        });
      }
    }
  }

  const tools = [
    {
      name: "kraddle_read_file",
      description: "Read a file from the governed repository, admitted through the episode authority.",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
      handler: asToolResult(async ({ path }) => {
        requireTrustedProjection(workspace);
        validateToolPath(path);
        admitEffect(state, episodeId, { operation: "read", target: path });
        const content = baseFiles[path];
        if (content === undefined) {
          throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { path, reason: "file_not_in_base_state" });
        }
        return { text: content };
      }),
    },
    {
      name: "kraddle_write_file",
      description: "Write a file inside the episode authority, after preflight of governing architecture rules.",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
      handler: asToolResult(async ({ path, content }) => {
        requireTrustedProjection(workspace);
        validateToolPath(path);
        if (typeof content !== "string") {
          throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { path, reason: "content_required" });
        }
        const admission = admitEffect(state, episodeId, { operation: "write", target: path });
        await preflight(path, content);
        const fullPath = join(repoDir, ...path.split("/"));
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, content, "utf8");
        recordObservedEffect(state, episodeId, {
          operation: "write",
          target: path,
          admissionId: admission.admissionId,
        });
        admittedWrites.set(path, content);
        return { text: `admitted ${path} under admission ${admission.admissionId}` };
      }),
    },
    {
      name: "kraddle_close_episode",
      description: "Request closure of the episode; unadmitted working-tree changes are refused.",
      inputSchema: { type: "object", properties: {} },
      handler: asToolResult(async () => {
        requireTrustedProjection(workspace);
        throw new ControlDenial(DENIAL.EPISODE_NOT_ACTIVE, { episodeId, reason: "not_implemented" });
      }),
    },
  ];

  const server = createMcpServer({ tools, serverInfo: SERVER_INFO });
  return {
    workspace,
    state,
    episode,
    episodeId,
    repoDir,
    baseEvidenceId,
    baseFiles,
    admittedWrites,
    tools,
    handleMessage: server.handleMessage,
  };
}

async function main() {
  const repoDir = process.env.KRADDLE_REPO;
  const workspaceDir = process.env.KRADDLE_WORKSPACE_DIR;
  const episodeId = process.env.KRADDLE_EPISODE_ID;
  if (!repoDir || !workspaceDir || !episodeId) {
    console.error("kraddle server requires KRADDLE_REPO, KRADDLE_WORKSPACE_DIR, KRADDLE_EPISODE_ID");
    process.exit(1);
  }
  let server;
  try {
    server = await createKraddleServer({
      repoDir,
      workspaceDir,
      episodeId,
      baseEvidenceId: process.env.KRADDLE_BASE_EVIDENCE_ID,
    });
  } catch (thrown) {
    console.error(thrown instanceof Error ? thrown.message : String(thrown));
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    server.handleMessage(line).then((response) => {
      if (response !== null) process.stdout.write(response + "\n");
    });
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await main();
}
