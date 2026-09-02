const RESOLUTIONS = ["resolved", "ambiguous", "unresolved", "external"];

const ratio = (numerator, denominator) =>
  denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 1000;

export function extractionReport({ edges, subjects } = {}) {
  const edgeList = Array.isArray(edges) ? edges : [];
  const byResolution = { resolved: 0, ambiguous: 0, unresolved: 0, external: 0 };
  const fromPrefixBreakdown = {};
  for (const edge of edgeList) {
    if (!RESOLUTIONS.includes(edge.resolution)) continue;
    byResolution[edge.resolution] += 1;
    const prefix = edge.from.includes("/") ? edge.from.slice(0, edge.from.indexOf("/")) : ".";
    if (!fromPrefixBreakdown[prefix]) {
      fromPrefixBreakdown[prefix] = { resolved: 0, ambiguous: 0, unresolved: 0, external: 0 };
    }
    fromPrefixBreakdown[prefix][edge.resolution] += 1;
  }
  const totalEdges = edgeList.length;
  return {
    totalEdges,
    byResolution,
    resolvedRatio: ratio(byResolution.resolved, totalEdges),
    unknownRatio: ratio(byResolution.ambiguous + byResolution.unresolved, totalEdges),
    fromPrefixBreakdown,
  };
}
