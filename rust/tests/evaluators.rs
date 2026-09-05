//! Port of test/evaluators.test.js — architecture-rule evaluation.

use kraddle::evaluators::{architecture_rule_evaluator, run_evaluator};
use kraddle::kernel::{validate_coverage, Record};
use serde_json::json;
use std::collections::BTreeMap;

fn files(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
    pairs
        .iter()
        .map(|(path, content)| (path.to_string(), content.to_string()))
        .collect()
}

#[test]
fn a_domain_file_importing_ui_is_violated() {
    let map = files(&[
        ("src/domain/service.ts", "import { Button } from \"../ui/Button.tsx\";\n"),
        ("src/ui/Button.tsx", "import React from \"react\";\n"),
    ]);
    let outcome = architecture_rule_evaluator("src/domain/", "src/ui/", &map);
    assert_eq!(outcome.result, "violated");
    assert_eq!(
        outcome.coverage.as_ref().and_then(|c| c.get("unknownSubjects")),
        Some(&json!([]))
    );
}

#[test]
fn a_dynamic_import_in_a_domain_file_is_unknown() {
    let map = files(&[
        ("src/domain/service.ts", "const mod = import(cfg.button);\n"),
        ("src/ui/Button.tsx", "import React from \"react\";\n"),
    ]);
    let outcome = architecture_rule_evaluator("src/domain/", "src/ui/", &map);
    assert_eq!(outcome.result, "unknown");
    let unknown = outcome
        .coverage
        .as_ref()
        .and_then(|c| c.get("unknownSubjects"))
        .and_then(|u| u.as_array())
        .cloned()
        .unwrap_or_default();
    assert!(unknown.contains(&json!("src/domain/service.ts")));
}

#[test]
fn a_clean_domain_map_is_satisfied_with_sufficient_coverage() {
    let map = files(&[
        ("src/domain/service.ts", "import { helper } from \"./helper\";\n"),
        ("src/domain/helper.ts", "export const helper = () => 1;\n"),
        ("src/ui/Button.tsx", "import React from \"react\";\n"),
    ]);
    let outcome = architecture_rule_evaluator("src/domain/", "src/ui/", &map);
    assert_eq!(outcome.result, "satisfied");
    assert_eq!(
        validate_coverage(outcome.coverage.as_ref(), &[]).unwrap(),
        json!({ "sufficient": true })
    );
}

#[test]
fn run_evaluator_executes_a_configured_architecture_rule() {
    let evaluator_unit = Record::human("E1", "evaluator")
        .with("evaluatorType", json!("architecture_rule"))
        .with(
            "params",
            json!({ "sourcePrefix": "src/domain/", "forbiddenPrefixes": ["src/ui/"] }),
        );
    let map = files(&[
        ("src/domain/service.ts", "import { Button } from \"../ui/Button.tsx\";\n"),
        ("src/ui/Button.tsx", "import React from \"react\";\n"),
    ]);
    let outcome = run_evaluator(&evaluator_unit, &map);
    assert_eq!(outcome.result, "violated");
}

#[test]
fn run_evaluator_returns_unknown_for_an_unrecognized_evaluator_type() {
    let evaluator_unit = Record::human("E2", "evaluator")
        .with("evaluatorType", json!("semantic_vibes"))
        .with(
            "params",
            json!({ "sourcePrefix": "src/domain/", "forbiddenPrefixes": ["src/ui/"] }),
        );
    let map = files(&[("src/domain/a.ts", "export const a = 1;\n")]);
    let outcome = run_evaluator(&evaluator_unit, &map);
    assert_eq!(outcome.result, "unknown");
    assert_eq!(outcome.reason.as_deref(), Some("unknown_evaluator_type"));
}

#[test]
fn run_evaluator_returns_unknown_for_invalid_params() {
    let evaluator_unit = Record::human("E3", "evaluator")
        .with("evaluatorType", json!("architecture_rule"))
        .with("params", json!({ "sourcePrefix": "src/domain/" }));
    let map = files(&[("src/domain/a.ts", "export const a = 1;\n")]);
    let outcome = run_evaluator(&evaluator_unit, &map);
    assert_eq!(outcome.result, "unknown");
    assert_eq!(outcome.reason.as_deref(), Some("evaluator_params_invalid"));
}
