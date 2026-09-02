import { computeCoverageDigest } from "./kernel.js";
import { extractDependencies } from "./extract.js";

export function architectureRuleEvaluator({ sourcePrefix, forbiddenPrefix, files } = {}) {
  const { edges } = extractDependencies(files);
  const relevant = edges.filter((edge) => edge.from.startsWith(sourcePrefix));
  const violating = relevant.filter(
    (edge) => edge.resolution === "resolved" && edge.to.startsWith(forbiddenPrefix),
  );
  const unknownFiles = [
    ...new Set(
      relevant
        .filter((edge) => edge.resolution === "ambiguous" || edge.resolution === "unresolved")
        .map((edge) => edge.from),
    ),
  ].sort();
  const requiredSubjects = Object.keys(files)
    .filter((path) => path.startsWith(sourcePrefix))
    .sort();
  const coverage = {
    requiredSubjects,
    coveredSubjects: requiredSubjects.filter((path) => !unknownFiles.includes(path)),
    unknownSubjects: unknownFiles,
    excludedSubjects: [],
    selectionMethod: "source_prefix_files",
  };
  coverage.coverageDigest = computeCoverageDigest(coverage);
  let result;
  if (violating.length > 0) result = "violated";
  else if (coverage.unknownSubjects.length > 0) result = "unknown";
  else result = "satisfied";
  return { result, coverage };
}
