import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { createMcpServer } from "./mcp.js";
import { computeFileMapDigest } from "./extract.js";
import { ControlDenial, DENIAL, Workspace, episodeStatus, requireTrustedProjection } from "./kernel.js";
import { readRepoFiles } from "./repo.js";

const SERVER_INFO = { name: "kraddle-agent-surface", version: "0.1.0" };

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
  const tools = [
    {
      name: "kraddle_read_file",
      description: "Read a file from the governed repository, admitted through the episode authority.",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
      handler: async () => ({ text: "not implemented", isError: true }),
    },
    {
      name: "kraddle_write_file",
      description: "Write a file inside the episode authority, after preflight of governing architecture rules.",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
      handler: async () => ({ text: "not implemented", isError: true }),
    },
    {
      name: "kraddle_close_episode",
      description: "Request closure of the episode; unadmitted working-tree changes are refused.",
      inputSchema: { type: "object", properties: {} },
      handler: async () => ({ text: "not implemented", isError: true }),
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
