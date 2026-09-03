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

export function runEvaluator(evaluatorUnit, files) {
  const evaluatorType = evaluatorUnit?.evaluatorType;
  if (evaluatorType !== "architecture_rule") {
    return { result: "unknown", reason: "unknown_evaluator_type" };
  }
  const params = evaluatorUnit?.params;
  const sourcePrefix = params?.sourcePrefix;
  const forbiddenPrefixes = params?.forbiddenPrefixes;
  if (
    typeof sourcePrefix !== "string" || sourcePrefix.length === 0 ||
    !Array.isArray(forbiddenPrefixes) || forbiddenPrefixes.length === 0 ||
    !forbiddenPrefixes.every((prefix) => typeof prefix === "string" && prefix.length > 0)
  ) {
    return { result: "unknown", reason: "evaluator_params_invalid" };
  }
  const runs = forbiddenPrefixes.map((forbiddenPrefix) =>
    architectureRuleEvaluator({ sourcePrefix, forbiddenPrefix, files }),
  );
  const result = runs.some((run) => run.result === "violated") ? "violated"
    : runs.some((run) => run.result === "unknown") ? "unknown"
    : "satisfied";
  const coverage = {
    requiredSubjects: [...new Set(runs.flatMap((run) => run.coverage.requiredSubjects))].sort(),
    coveredSubjects: [...new Set(runs.flatMap((run) => run.coverage.coveredSubjects))].sort(),
    unknownSubjects: [...new Set(runs.flatMap((run) => run.coverage.unknownSubjects))].sort(),
    excludedSubjects: [],
    selectionMethod: "source_prefix_files_combined",
  };
  coverage.coverageDigest = computeCoverageDigest(coverage);
  return { result, coverage };
}
