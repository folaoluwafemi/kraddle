//! Port of test/extract.test.js — dependency extraction, four resolutions.

use kraddle::extract::{compute_file_map_digest, extract_dependencies, SOURCE_EXTENSIONS};
use serde_json::json;
use std::collections::BTreeMap;

fn files(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
    pairs
        .iter()
        .map(|(path, content)| (path.to_string(), content.to_string()))
        .collect()
}

#[test]
fn a_relative_spec_matching_a_key_exactly_is_resolved() {
    let map = files(&[
        ("a/x.ts", "import { y } from \"./y.ts\";\n"),
        ("a/y.ts", "export const y = 1;\n"),
    ]);
    let extraction = extract_dependencies(&map);
    assert_eq!(extraction.limitations, "regex-extraction");
    assert_eq!(extraction.subjects, vec!["a/x.ts".to_string(), "a/y.ts".to_string()]);
    assert_eq!(extraction.edges.len(), 1);
    assert_eq!(
        extraction.edges[0],
        json!({ "from": "a/x.ts", "to": "a/y.ts", "spec": "./y.ts", "resolution": "resolved" })
    );
}

#[test]
fn a_bare_specifier_is_external() {
    let map = files(&[("src/ui/Button.tsx", "import React from \"react\";\n")]);
    let extraction = extract_dependencies(&map);
    assert_eq!(extraction.edges.len(), 1);
    assert_eq!(
        extraction.edges[0],
        json!({ "from": "src/ui/Button.tsx", "to": "react", "spec": "react", "resolution": "external" })
    );
}

#[test]
fn two_candidate_extensions_make_an_ambiguous_edge() {
    let map = files(&[
        ("a/x.ts", "import { b } from \"./Button\";\n"),
        ("a/Button.ts", "export const b = 1;\n"),
        ("a/Button.js", "export const b = 2;\n"),
    ]);
    let extraction = extract_dependencies(&map);
    assert_eq!(extraction.edges.len(), 1);
    assert_eq!(extraction.edges[0].get("resolution"), Some(&json!("ambiguous")));
    assert_eq!(extraction.edges[0].get("to"), Some(&json!(null)));
    assert_eq!(
        extraction.edges[0].get("candidates"),
        Some(&json!(["a/Button.ts", "a/Button.js"]))
    );
}

#[test]
fn a_dynamic_import_of_a_computed_value_is_unresolved() {
    let map = files(&[("src/domain/service.ts", "const mod = import(cfg.button);\n")]);
    let extraction = extract_dependencies(&map);
    assert_eq!(extraction.edges.len(), 1);
    assert_eq!(extraction.edges[0].get("resolution"), Some(&json!("unresolved")));
    assert_eq!(extraction.edges[0].get("to"), Some(&json!(null)));
    assert_eq!(extraction.edges[0].get("spec"), Some(&json!(null)));
    assert_eq!(extraction.edges[0].get("from"), Some(&json!("src/domain/service.ts")));
}

#[test]
fn a_relative_spec_with_no_candidate_is_unresolved() {
    let map = files(&[("a/x.ts", "import { missing } from \"./missing\";\n")]);
    let extraction = extract_dependencies(&map);
    assert_eq!(extraction.edges.len(), 1);
    assert_eq!(extraction.edges[0].get("resolution"), Some(&json!("unresolved")));
    assert_eq!(extraction.edges[0].get("to"), Some(&json!(null)));
    assert_eq!(extraction.edges[0].get("spec"), Some(&json!("./missing")));
}

#[test]
fn the_file_map_digest_is_order_insensitive_and_content_sensitive() {
    let a = files(&[("a.ts", "one"), ("b.ts", "two")]);
    let b = files(&[("b.ts", "two"), ("a.ts", "one")]);
    assert_eq!(compute_file_map_digest(&a), compute_file_map_digest(&b));
    let c = files(&[("a.ts", "one"), ("b.ts", "three")]);
    assert_ne!(compute_file_map_digest(&a), compute_file_map_digest(&c));
    assert_eq!(
        SOURCE_EXTENSIONS,
        [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]
    );
}
