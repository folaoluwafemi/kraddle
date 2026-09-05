//! Port of src/evaluators.js — architecture-rule evaluation with
//! unknowns blocking satisfaction.

use crate::extract::extract_dependencies;
use crate::kernel::{compute_coverage_digest, Record};
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;

#[derive(Debug, Clone)]
pub struct EvalOutcome {
    pub result: String,
    pub coverage: Option<Value>,
    pub reason: Option<String>,
}

impl EvalOutcome {
    fn with_coverage(result: &str, coverage: Value) -> Self {
        EvalOutcome { result: result.to_string(), coverage: Some(coverage), reason: None }
    }

    fn unknown_reason(result: &str, reason: &str) -> Self {
        EvalOutcome { result: result.to_string(), coverage: None, reason: Some(reason.to_string()) }
    }
}

fn coverage_with_digest(required: Vec<String>, covered: Vec<String>, unknown: Vec<String>, selection_method: &str) -> Value {
    let mut coverage = json!({
        "requiredSubjects": required,
        "coveredSubjects": covered,
        "unknownSubjects": unknown,
        "excludedSubjects": [],
        "selectionMethod": selection_method,
    });
    if let Ok(digest) = compute_coverage_digest(&coverage) {
        if let Some(map) = coverage.as_object_mut() {
            map.insert("coverageDigest".into(), json!(digest));
        }
    }
    coverage
}

/// Port of architectureRuleEvaluator.
pub fn architecture_rule_evaluator(
    source_prefix: &str,
    forbidden_prefix: &str,
    files: &BTreeMap<String, String>,
) -> EvalOutcome {
    let extraction = extract_dependencies(files);
    let relevant: Vec<&Value> = extraction
        .edges
        .iter()
        .filter(|edge| {
            edge.get("from")
                .and_then(|f| f.as_str())
                .map(|from| from.starts_with(source_prefix))
                .unwrap_or(false)
        })
        .collect();
    let violating = relevant.iter().any(|edge| {
        edge.get("resolution").and_then(|r| r.as_str()) == Some("resolved")
            && edge
                .get("to")
                .and_then(|t| t.as_str())
                .map(|to| to.starts_with(forbidden_prefix))
                .unwrap_or(false)
    });
    let mut unknown_files: Vec<String> = relevant
        .iter()
        .filter(|edge| {
            let resolution = edge.get("resolution").and_then(|r| r.as_str());
            resolution == Some("ambiguous") || resolution == Some("unresolved")
        })
        .filter_map(|edge| edge.get("from").and_then(|f| f.as_str()).map(str::to_string))
        .collect();
    unknown_files.sort();
    unknown_files.dedup();

    let mut required_subjects: Vec<String> = files
        .keys()
        .filter(|path| path.starts_with(source_prefix))
        .cloned()
        .collect();
    required_subjects.sort();
    let covered_subjects: Vec<String> = required_subjects
        .iter()
        .filter(|path| !unknown_files.contains(path))
        .cloned()
        .collect();
    let unknown_subjects = unknown_files;
    let coverage = coverage_with_digest(
        required_subjects,
        covered_subjects,
        unknown_subjects,
        "source_prefix_files",
    );
    let unknown_non_empty = coverage
        .get("unknownSubjects")
        .and_then(|u| u.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(false);
    if violating {
        EvalOutcome::with_coverage("violated", coverage)
    } else if unknown_non_empty {
        EvalOutcome::with_coverage("unknown", coverage)
    } else {
        EvalOutcome::with_coverage("satisfied", coverage)
    }
}

/// Port of runEvaluator: fail-closed by construction. It never panics and
/// never guesses.
pub fn run_evaluator(evaluator_unit: &Record, files: &BTreeMap<String, String>) -> EvalOutcome {
    let evaluator_type = evaluator_unit.str_field("evaluatorType");
    if evaluator_type != Some("architecture_rule") {
        return EvalOutcome::unknown_reason("unknown", "unknown_evaluator_type");
    }
    let params = evaluator_unit.field("params");
    let source_prefix = params
        .and_then(|p| p.get("sourcePrefix"))
        .and_then(|s| s.as_str())
        .unwrap_or("");
    let forbidden_prefixes = params
        .and_then(|p| p.get("forbiddenPrefixes"))
        .and_then(|f| f.as_array());
    let Some(forbidden_prefixes) = forbidden_prefixes else {
        return EvalOutcome::unknown_reason("unknown", "evaluator_params_invalid");
    };
    if source_prefix.is_empty()
        || forbidden_prefixes.is_empty()
        || !forbidden_prefixes
            .iter()
            .all(|prefix| prefix.as_str().map(|p| !p.is_empty()).unwrap_or(false))
    {
        return EvalOutcome::unknown_reason("unknown", "evaluator_params_invalid");
    }
    let prefixes: Vec<String> = forbidden_prefixes
        .iter()
        .filter_map(|p| p.as_str().map(str::to_string))
        .collect();
    let runs: Vec<EvalOutcome> = prefixes
        .iter()
        .map(|forbidden_prefix| architecture_rule_evaluator(source_prefix, forbidden_prefix, files))
        .collect();
    let result = if runs.iter().any(|run| run.result == "violated") {
        "violated"
    } else if runs.iter().any(|run| run.result == "unknown") {
        "unknown"
    } else {
        "satisfied"
    };

    let union = |field: &str| -> Vec<String> {
        let mut all: Vec<String> = runs
            .iter()
            .filter_map(|run| run.coverage.as_ref())
            .filter_map(|coverage| coverage.get(field).and_then(|f| f.as_array()).cloned())
            .flatten()
            .filter_map(|v| v.as_str().map(str::to_string))
            .collect();
        all.sort();
        all.dedup();
        all
    };
    let mut coverage = json!({
        "requiredSubjects": union("requiredSubjects"),
        "coveredSubjects": union("coveredSubjects"),
        "unknownSubjects": union("unknownSubjects"),
        "excludedSubjects": [],
        "selectionMethod": "source_prefix_files_combined",
    });
    if let Ok(digest) = compute_coverage_digest(&coverage) {
        if let Some(map) = coverage.as_object_mut() {
            map.insert("coverageDigest".into(), json!(digest));
        }
    }
    let _ = Map::new();
    EvalOutcome::with_coverage(result, coverage)
}
