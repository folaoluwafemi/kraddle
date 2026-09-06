// Regex-based dependency extraction. This module can UNDER-EXTRACT: import
// forms its regexes do not recognize are invisible to it, so completeness
// claims hold only for recognized forms. A parser-based extractor is future
// work. Under-extraction is exactly why the evaluator treats unknowns as
// blocking, and why coverage subjects are the input files.
import { createHash } from "node:crypto";

export const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

export function computeFileMapDigest(files) {
  const payload = Object.keys(files)
    .sort()
    .map((path) => `${path}\n${files[path]}`)
    .join("\n");
  return createHash("sha256").update(payload).digest("hex");
}

const STATIC_IMPORT_FROM = /\bimport\s+[^;'"]*?\bfrom\s*["']([^"']+)["']/g;
const BARE_IMPORT = /\bimport\s*["']([^"']+)["']/g;
const EXPORT_FROM = /\bexport\s+[^;'"]*?\bfrom\s*["']([^"']+)["']/g;
const STATIC_REQUIRE = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;
const DYNAMIC_IMPORT_LITERAL = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const DYNAMIC_COMPUTED = /\b(?:import|require)\s*\(\s*(?![\s"'])/g;

function normalizePosixPath(path) {
  const out = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") out.pop();
    else out.push(segment);
  }
  return out.join("/");
}

function classifySpec(from, spec, files) {
  if (!spec.startsWith(".") && !spec.startsWith("/")) {
    return { resolution: "external", to: spec };
  }
  const baseDir = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
  const joined = spec.startsWith("/")
    ? spec.slice(1)
    : baseDir ? `${baseDir}/${spec}` : spec;
  const normalized = normalizePosixPath(joined);
  if (Object.hasOwn(files, normalized)) {
    return { resolution: "resolved", to: normalized };
  }
  const candidates = [];
  for (const extension of SOURCE_EXTENSIONS) {
    if (Object.hasOwn(files, normalized + extension)) candidates.push(normalized + extension);
  }
  for (const extension of SOURCE_EXTENSIONS) {
    if (Object.hasOwn(files, `${normalized}/index${extension}`)) candidates.push(`${normalized}/index${extension}`);
  }
  if (candidates.length === 1) return { resolution: "resolved", to: candidates[0] };
  if (candidates.length > 1) return { resolution: "ambiguous", to: null, candidates };
  return { resolution: "unresolved", to: null };
}

export function extractDependencies(files) {
  const edges = [];
  for (const from of Object.keys(files).sort()) {
    const content = files[from];
    for (const pattern of [STATIC_IMPORT_FROM, BARE_IMPORT, EXPORT_FROM, STATIC_REQUIRE, DYNAMIC_IMPORT_LITERAL]) {
      pattern.lastIndex = 0;
      for (const match of content.matchAll(pattern)) {
        const spec = match[1];
        const classified = classifySpec(from, spec, files);
        edges.push({ from, spec, to: classified.to, resolution: classified.resolution, ...(classified.candidates ? { candidates: classified.candidates } : {}) });
      }
    }
    DYNAMIC_COMPUTED.lastIndex = 0;
    for (const match of content.matchAll(DYNAMIC_COMPUTED)) {
      edges.push({ from, spec: null, to: null, resolution: "unresolved" });
    }
  }
  return { edges, subjects: Object.keys(files).sort(), limitations: "regex-extraction" };
}
