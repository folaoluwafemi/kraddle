import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { SOURCE_EXTENSIONS } from "./extract.js";

export const IGNORED_DIRS = ["node_modules", ".git", ".kraddle", "dist", "build", "coverage"];

function toPosix(path) {
  return path.split("\\").join("/");
}

export async function readRepoFiles(rootDir, {
  extensions = SOURCE_EXTENSIONS,
  maxFiles = 5000,
  maxBytes = 1_000_000,
} = {}) {
  const files = {};
  const skipped = [];
  const extensionSet = new Set(extensions);

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
        if (!extensionSet.has(toPosix(entry.name).match(/\.[^.]+$/)?.[0] ?? "")) continue;
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
