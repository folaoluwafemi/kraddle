//! Port of test/report.test.js — the extraction honesty report.

mod common;

use common::TempDir;
use kraddle::extract::extract_dependencies;
use kraddle::report::extraction_report;
use serde_json::{json, Value};
use std::process::Command;

fn edge(from: &str, to: Value, spec: &str, resolution: &str) -> serde_json::Value {
    json!({ "from": from, "to": to, "spec": spec, "resolution": resolution })
}

#[test]
fn an_all_resolved_edge_set_reports_full_resolution() {
    let report = extraction_report(&[
        edge("a.ts", json!("b.ts"), "./b", "resolved"),
        edge("b.ts", json!("a.ts"), "./a", "resolved"),
    ]);
    assert_eq!(report.get("totalEdges"), Some(&json!(2)));
    assert_eq!(
        report.get("byResolution"),
        Some(&json!({ "resolved": 2, "ambiguous": 0, "unresolved": 0, "external": 0 }))
    );
    assert_eq!(report.get("resolvedRatio"), Some(&json!(1.0)));
    assert_eq!(report.get("unknownRatio"), Some(&json!(0.0)));
}

#[test]
fn a_mixed_edge_set_reports_exact_counts_and_ratios() {
    let report = extraction_report(&[
        edge("a.ts", json!("b.ts"), "./b", "resolved"),
        edge("c.ts", json!("d.ts"), "./d", "resolved"),
        edge("e.ts", json!(null), "./x", "ambiguous"),
        edge("f.ts", json!(null), "./y", "unresolved"),
        edge("g.ts", json!("react"), "react", "external"),
        edge("h.ts", json!("node:fs"), "node:fs", "external"),
        edge("i.ts", json!("lodash"), "lodash", "external"),
    ]);
    assert_eq!(report.get("totalEdges"), Some(&json!(7)));
    assert_eq!(
        report.get("byResolution"),
        Some(&json!({ "resolved": 2, "ambiguous": 1, "unresolved": 1, "external": 3 }))
    );
    assert_eq!(report.get("resolvedRatio"), Some(&json!(0.286)));
    assert_eq!(report.get("unknownRatio"), Some(&json!(0.286)));
}

#[test]
fn the_from_prefix_breakdown_groups_by_first_path_segment() {
    let report = extraction_report(&[
        edge("src/domain/a.ts", json!("react"), "react", "external"),
        edge("src/kernel.js", json!("src/x.js"), "./x", "resolved"),
        edge("test/a.test.js", json!(null), "./missing", "unresolved"),
    ]);
    assert_eq!(
        report.get("fromPrefixBreakdown"),
        Some(&json!({
            "src": { "resolved": 1, "ambiguous": 0, "unresolved": 0, "external": 1 },
            "test": { "resolved": 0, "ambiguous": 0, "unresolved": 1, "external": 0 },
        }))
    );
}

#[test]
fn an_integration_run_surfaces_a_dynamic_import_as_unresolved() {
    let temp = TempDir::new("kraddle-report");
    let root = temp.path();
    for (path, content) in [
        ("a.ts", "import { b } from \"./b\";\nimport { readFile } from \"node:fs/promises\";\n"),
        ("b.ts", "export const b = 1;\n"),
        ("c.ts", "const mod = import(someName);\n"),
    ] {
        std::fs::write(root.join(path), content).unwrap();
    }
    let status = Command::new("git").arg("init").current_dir(root).status().unwrap();
    assert!(status.success());
    let walk = kraddle::repo::read_repo_files(root).expect("walk");
    let extraction = extract_dependencies(&walk.files);
    let report = extraction_report(&extraction.edges);
    assert_eq!(report.get("totalEdges"), Some(&json!(3)));
    assert_eq!(report.get("byResolution").and_then(|b| b.get("resolved")), Some(&json!(1)));
    assert_eq!(report.get("byResolution").and_then(|b| b.get("external")), Some(&json!(1)));
    assert_eq!(report.get("byResolution").and_then(|b| b.get("unresolved")), Some(&json!(1)));
    assert_eq!(report.get("byResolution").and_then(|b| b.get("ambiguous")), Some(&json!(0)));
    assert_eq!(report.get("unknownRatio"), Some(&json!(0.333)));
    assert_eq!(
        report.get("fromPrefixBreakdown").and_then(|b| b.get(".")),
        Some(&json!({ "resolved": 1, "ambiguous": 0, "unresolved": 1, "external": 1 }))
    );
}
