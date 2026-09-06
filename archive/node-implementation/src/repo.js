import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { SOURCE_EXTENSIONS } from "./extract.js";
import { ControlDenial, DENIAL } from "./kernel.js";

const exec = promisify(execFile);

export const IGNORED_DIRS = ["node_modules", ".git", ".kraddle", "dist", "build", "coverage"];

function toPosix(path) {
  return path.split("\\").join("/");
}

export async function readRepoFiles(rootDir, {
  extensions = SOURCE_EXTENSIONS,
  maxFiles = 5000,
  maxBytes = 1_000_000,
} = {}) {
  const extensionSet = new Set(extensions);
  return walkFiles(rootDir, {
    maxFiles,
    maxBytes,
    includeFile: (name) => extensionSet.has(extensionOf(name)),
  });
}

export async function readWorktreeFiles(rootDir, {
  maxFiles = 20000,
  maxBytes = 5_000_000,
} = {}) {
  return walkFiles(rootDir, { maxFiles, maxBytes, includeFile: () => true });
}

function extensionOf(name) {
  const toPosix = name.split("\\").join("/");
  return toPosix.match(/\.[^.]+$/)?.[0] ?? "";
}

async function walkFiles(rootDir, { maxFiles, maxBytes, includeFile }) {
  const files = {};
  const skipped = [];

  async function walk(dir, relativePrefix) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const relative = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.includes(entry.name) || entry.name.startsWith(".")) continue;
        await walk(join(dir, entry.name), relative);
      } else if (entry.isFile()) {
        if (entry.name.startsWith(".")) continue;
        if (!includeFile(entry.name)) continue;
        if (Object.keys(files).length >= maxFiles) {
          throw new Error(`readRepoFiles: maxFiles (${maxFiles}) exceeded at ${relative}`);
        }
        const fullPath = join(dir, entry.name);
        let info;
        try {
          info = await stat(fullPath);
        } catch {
          continue;
        }
        if (info.size > maxBytes) {
          skipped.push({ path: relative, reason: "too_large" });
          continue;
        }
        files[relative] = await readFile(fullPath, "utf8");
      }
    }
  }

  await walk(rootDir, "");
  return { files, skipped };
}

export async function gitStateRef(repoDir) {
  try {
    const head = await exec("git", ["-C", repoDir, "rev-parse", "HEAD"]);
    const toplevel = await exec("git", ["-C", repoDir, "rev-parse", "--show-toplevel"]);
    const revision = head.stdout.trim();
    const toplevelPath = toplevel.stdout.trim();
    if (!revision || !toplevelPath) {
      throw new Error("empty git output");
    }
    const repository = toplevelPath.split(/[\\/]/).at(-1);
    return { repository, revision };
  } catch {
    throw new ControlDenial(DENIAL.ENVELOPE_INVALID, { reason: "git_unavailable" });
  }
}
