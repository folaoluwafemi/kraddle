#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { ControlDenial, DENIAL, Workspace } from "./kernel.js";

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
