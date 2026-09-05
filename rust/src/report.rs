//! Port of src/report.js — the extraction honesty report.

use serde_json::{json, Map, Value};

const RESOLUTIONS: [&str; 4] = ["resolved", "ambiguous", "unresolved", "external"];

fn ratio(numerator: f64, denominator: f64) -> f64 {
    if denominator == 0.0 {
        0.0
    } else {
        ((numerator / denominator) * 1000.0).round() / 1000.0
    }
}

/// Port of extractionReport: pure, no IO.
pub fn extraction_report(edges: &[Value]) -> Value {
    let mut by_resolution: Map<String, Value> = Map::new();
    for resolution in RESOLUTIONS {
        by_resolution.insert(resolution.into(), json!(0));
    }
    let mut from_prefix_breakdown: Map<String, Value> = Map::new();
    for edge in edges {
        let resolution = edge.get("resolution").and_then(|r| r.as_str()).unwrap_or("");
        if !RESOLUTIONS.contains(&resolution) {
            continue;
        }
        let current = by_resolution[resolution].as_u64().unwrap_or(0);
        by_resolution.insert(resolution.into(), json!(current + 1));
        let from = edge.get("from").and_then(|f| f.as_str()).unwrap_or("");
        let prefix = match from.find('/') {
            Some(index) => &from[..index],
            None => ".",
        };
        let entry = from_prefix_breakdown
            .entry(prefix.to_string())
            .or_insert_with(|| {
                let mut map = Map::new();
                for resolution in RESOLUTIONS {
                    map.insert(resolution.into(), json!(0));
                }
                Value::Object(map)
            });
        if let Some(map) = entry.as_object_mut() {
            let current = map.get(resolution).and_then(|v| v.as_u64()).unwrap_or(0);
            map.insert(resolution.into(), json!(current + 1));
        }
    }
    let total = edges.len();
    let resolved = by_resolution["resolved"].as_f64().unwrap_or(0.0);
    let ambiguous = by_resolution["ambiguous"].as_f64().unwrap_or(0.0);
    let unresolved = by_resolution["unresolved"].as_f64().unwrap_or(0.0);
    json!({
        "totalEdges": total,
        "byResolution": Value::Object(by_resolution),
        "resolvedRatio": ratio(resolved, total as f64),
        "unknownRatio": ratio(ambiguous + unresolved, total as f64),
        "fromPrefixBreakdown": Value::Object(from_prefix_breakdown),
    })
}
