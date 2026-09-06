//! Port of test/dogfood.test.js — Kraddle's own rules governing Kraddle's
//! own source.
//!
//! RETARGETED after the Node implementation was archived to
//! `archive/node-implementation/` (the live implementation is `rust/`).
//! The Phase 1 regex extractor understands only JavaScript import
//! syntax, so `rust/src/*.rs` yields no extractable edges and the
//! archived Node tree remains the only real-code corpus the extractor
//! can honestly read. DEBT: when a Rust-import extractor exists,
//! retarget this suite to `rust/src/` with prefixes `rust/src/` and
//! `rust/tests/`. Until then this suite proves the control loop over
//! the archived implementation's real source.

mod common;

use kraddle::evaluators::architecture_rule_evaluator;
use kraddle::extract::{compute_file_map_digest, extract_dependencies};
use kraddle::kernel::{
    compute_coverage_digest, evaluate, resolve_applicable_context, validate_episode_closure,
    EvaluateArgs, Record, ResolverArgs, RunOutcome, TransactOptions, Workspace,
};
use kraddle::repo::{git_state_ref, read_repo_files};
use kraddle::report::extraction_report;
use serde_json::{json, Value};
use std::collections::BTreeMap;

fn scan_root() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("rust dir has a parent")
        .join("archive")
        .join("node-implementation")
}

// "kernel code must not import test or doc code", combined inline from two
// runs of the existing evaluator. No new exported combinator (G6).
fn evaluate_dogfood_rule(files: &BTreeMap<String, String>) -> String {
    let test_run = architecture_rule_evaluator("src/", "test/", files);
    let docs_run = architecture_rule_evaluator("src/", "docs/", files);
    if test_run.result == "violated" || docs_run.result == "violated" {
        "violated".into()
    } else if test_run.result == "unknown" || docs_run.result == "unknown" {
        "unknown".into()
    } else {
        "satisfied".into()
    }
}

#[test]
fn the_dogfood_gate_kraddle_src_imports_neither_its_tests_nor_its_docs() {
    let root = scan_root();
    let files = read_repo_files(&root).expect("read repo").files;
    let git = git_state_ref(&root).expect("git state");
    let state_ref = json!({
        "repository": format!("{}-archive", git.repository),
        "revision": git.revision,
        "contentDigest": compute_file_map_digest(&files),
    });

    assert_eq!(state_ref.get("revision").and_then(|r| r.as_str()).map(str::len), Some(40));
    assert_eq!(state_ref.get("contentDigest").and_then(|d| d.as_str()).map(str::len), Some(64));

    let extraction = extract_dependencies(&files);
    assert!(!extraction.subjects.is_empty(), "subjects must be non-empty");

    let offenders: Vec<&Value> = extraction
        .edges
        .iter()
        .filter(|edge| {
            let from = edge.get("from").and_then(|f| f.as_str()).unwrap_or("");
            let resolution = edge.get("resolution").and_then(|r| r.as_str()).unwrap_or("");
            from.starts_with("src/") && resolution != "resolved" && resolution != "external"
        })
        .collect();
    assert!(
        offenders.is_empty(),
        "dogfood gate: unresolved/ambiguous src/ edges: {:#?}",
        offenders
    );

    assert_eq!(evaluate_dogfood_rule(&files), "satisfied");

    let mut probed = files.clone();
    probed.insert(
        "src/probe.ts".into(),
        "import { anything } from \"../test/dogfood.test.js\";\n".into(),
    );
    assert_eq!(evaluate_dogfood_rule(&probed), "violated");
}

#[test]
fn the_dogfood_episode_closes_on_real_state() {
    let root = scan_root();
    let files = read_repo_files(&root).expect("read repo").files;
    let git = git_state_ref(&root).expect("git state");
    let state_ref = json!({
        "repository": format!("{}-archive", git.repository),
        "revision": git.revision,
        "contentDigest": compute_file_map_digest(&files),
    });
    let extraction = extract_dependencies(&files);
    let edges = &extraction.edges;
    let subjects = &extraction.subjects;

    let report = extraction_report(edges);
    let src_breakdown = report
        .get("fromPrefixBreakdown")
        .and_then(|b| b.get("src"))
        .cloned()
        .unwrap_or(json!({}));
    let count = |resolution: &str| {
        src_breakdown
            .get(resolution)
            .and_then(|v| v.as_u64())
            .unwrap_or(0)
    };
    let src_total = count("resolved") + count("ambiguous") + count("unresolved") + count("external");
    let src_unknown = count("ambiguous") + count("unresolved");
    let src_unknown_ratio = if src_total == 0 { 1.0 } else { src_unknown as f64 / src_total as f64 };
    assert!(
        src_unknown_ratio < 0.1,
        "dogfood standing gate: unknownRatio for src/ is {}",
        src_unknown_ratio
    );

    let temp = common::TempDir::new("kraddle-dogfood");
    let store = Workspace::new(temp.path());
    store.init().expect("init");

    let now = 1756771200000;
    let human = |id: &str, kind: &str| Record::human_at(id, kind, now);
    let commitment_with = |id: &str, value: Value, over: &[(&str, Value)]| -> Record {
        let mut record = Record::human_at(id, "commitment", now);
        record.set_field("value", value);
        for (key, value) in over {
            record.set_field(key, value.clone());
        }
        record
    };
    let rel = |id: &str, profile_id: &str, role: &str, target_id: &str, target_type: &str| {
        common::rel(id, profile_id, role, target_id, target_type)
    };

    store
        .transact(
            &[
                json!({ "type": "scope.create", "value": human("SC1", "scope").to_json() }),
                json!({ "type": "unit.create", "value": human("EVAL-UNIT", "evaluator").to_json() }),
                json!({ "type": "commitment.create", "value": commitment_with("C1", json!("kernel code must not import test or doc code"), &[("forbiddenPathPrefixes", json!(["test/", "docs/"]))]).to_json() }),
                json!({ "type": "commitment.create", "value": commitment_with("S1", json!({ "type": "path_prefix", "value": "src/" }), &[]).to_json() }),
                json!({ "type": "commitment.create", "value": commitment_with("M1", json!("prohibition"), &[]).to_json() }),
                json!({ "type": "unit.create", "value": human("CB1", "control_binding").to_json() }),
                json!({ "type": "relationship.add", "value": rel("cb-governed", "CB1", "governed_commitment", "C1", "commitment").to_json() }),
                json!({ "type": "relationship.add", "value": rel("cb-selector", "CB1", "subject_selector", "S1", "commitment").to_json() }),
                json!({ "type": "relationship.add", "value": rel("cb-modality", "CB1", "modality", "M1", "commitment").to_json() }),
                json!({ "type": "relationship.add", "value": rel("cb-evaluator", "CB1", "evaluator", "EVAL-UNIT", "unit").to_json() }),
            ],
            &TransactOptions { profile_ids: vec!["CB1".into()], ..Default::default() },
        )
        .expect("binding transact");

    // Evidence is scoped to the traversed region (the governed src/ tree):
    // every edge is a real observed edge, the stateRef pins the full file map.
    let region_edges: Vec<Value> = edges
        .iter()
        .filter(|edge| {
            edge.get("from")
                .and_then(|f| f.as_str())
                .map(|from| from.starts_with("src/"))
                .unwrap_or(false)
        })
        .cloned()
        .collect();
    assert!(!region_edges.is_empty());
    assert!(region_edges.iter().all(|edge| {
        let resolution = edge.get("resolution").and_then(|r| r.as_str()).unwrap_or("");
        resolution == "resolved" || resolution == "external"
    }));

    let mut evidence = human("EV-DEP", "evidence");
    evidence.origin = "extractor".into();
    evidence.epistemic_basis = "observed".into();
    evidence.set_field("stateRef", state_ref.clone());
    evidence.set_field("edges", json!(region_edges));
    evidence.set_field("subjects", json!(subjects));
    evidence.set_field("extractionScope", json!({ "fromPrefixes": ["src/"] }));
    store
        .transact(
            &[json!({ "type": "evidence.create", "value": evidence.to_json() })],
            &TransactOptions::default(),
        )
        .expect("evidence transact");

    let target_paths: Vec<String> = subjects
        .iter()
        .filter(|path| path.starts_with("src/"))
        .cloned()
        .collect();
    let resolved = resolve_applicable_context(
        &store.state(),
        &ResolverArgs {
            task_scope_id: None,
            target_paths,
            revision: Some(&git.revision),
            declared_applicable: vec!["CB1".into()],
            dependency_evidence_id: Some("EV-DEP"),
        },
    );
    assert!(resolved.complete);
    assert_eq!(resolved.applicable, vec!["CB1".to_string()]);

    let mut ctx = human("EP-CTX", "context_envelope");
    ctx.set_field("valid", json!(true));
    ctx.set_field("completeness", json!("complete"));
    ctx.set_field("complete", json!(true));
    ctx.set_field("incompleteReasons", json!([]));
    let mut authority = human("EP-AUTH", "authority_grant");
    authority.set_field("operations", json!(["write"]));
    authority.set_field("allowRecordIds", json!([]));
    let mut episode = human("EP1", "execution_episode");
    episode.set_field("lifecycle", json!("running"));
    episode.set_field("noOp", json!(true));
    episode.set_field("baseStateRef", state_ref.clone());
    episode.set_field("resultingStateRef", state_ref.clone());

    store
        .transact(
            &[
                json!({ "type": "commitment.create", "value": commitment_with("EP-PURPOSE", json!("verify the dogfood rule on real repository state"), &[]).to_json() }),
                json!({ "type": "commitment.create", "value": commitment_with("EP-BASE", json!("real repository state"), &[]).to_json() }),
                json!({ "type": "commitment.create", "value": commitment_with("EP-OUTCOME", json!("kernel sources remain layered"), &[]).to_json() }),
                json!({ "type": "unit.create", "value": ctx.to_json() }),
                json!({ "type": "unit.create", "value": authority.to_json() }),
                json!({ "type": "unit.create", "value": human("EP-DELTA", "software_element").to_json() }),
                json!({ "type": "unit.create", "value": episode.to_json() }),
                json!({ "type": "relationship.add", "value": rel("ep-purpose", "EP1", "purpose", "EP-PURPOSE", "commitment").to_json() }),
                json!({ "type": "relationship.add", "value": rel("ep-scope", "EP1", "target_scope", "SC1", "scope").to_json() }),
                json!({ "type": "relationship.add", "value": rel("ep-base", "EP1", "base_revision", "EP-BASE", "commitment").to_json() }),
                json!({ "type": "relationship.add", "value": rel("ep-context", "EP1", "context_envelope", "EP-CTX", "unit").to_json() }),
                json!({ "type": "relationship.add", "value": rel("ep-authority", "EP1", "authority_grant", "EP-AUTH", "unit").to_json() }),
                json!({ "type": "relationship.add", "value": rel("ep-delta", "EP1", "intended_delta", "EP-DELTA", "unit").to_json() }),
                json!({ "type": "relationship.add", "value": rel("ep-outcome", "EP1", "outcome", "EP-OUTCOME", "commitment").to_json() }),
            ],
            &TransactOptions { profile_ids: vec!["EP1".into()], ..Default::default() },
        )
        .expect("episode transact");

    let src_subjects: Vec<String> = subjects
        .iter()
        .filter(|path| path.starts_with("src/"))
        .cloned()
        .collect();
    let ev = evaluate(
        &EvaluateArgs {
            evaluation_id: "EV1",
            evaluator_id: "architecture-rule",
            evaluator_version: "0.1.0",
            subjects: Some(src_subjects),
            state_ref: Some(state_ref.clone()),
        },
        |_| {
            let test_run = architecture_rule_evaluator("src/", "test/", &files);
            let docs_run = architecture_rule_evaluator("src/", "docs/", &files);
            let result = if test_run.result == "violated" || docs_run.result == "violated" {
                "violated"
            } else if test_run.result == "unknown" || docs_run.result == "unknown" {
                "unknown"
            } else {
                "satisfied"
            };
            let union = |field: &str| -> Vec<Value> {
                let mut all: Vec<Value> = [test_run.coverage.as_ref(), docs_run.coverage.as_ref()]
                    .iter()
                    .filter_map(|coverage| coverage.and_then(|c| c.get(field)).and_then(|f| f.as_array()).cloned())
                    .flatten()
                    .collect();
                all.sort_by_key(|value| value.to_string());
                all.dedup_by_key(|value| value.to_string());
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
            Ok(RunOutcome { result: result.to_string(), coverage: Some(coverage) })
        },
    );
    assert_eq!(ev.str_field("result"), Some("satisfied"));

    store
        .transact(
            &[
                json!({ "type": "unit.create", "value": ev.to_json() }),
                json!({ "type": "commitment.create", "value": commitment_with("EV-RESULT", json!("satisfied"), &[]).to_json() }),
                json!({ "type": "commitment.create", "value": commitment_with("EV-COVERAGE", json!("typed"), &[]).to_json() }),
                json!({ "type": "unit.create", "value": human("EV-SEL", "selector").to_json() }),
                json!({ "type": "unit.create", "value": human("EV-EVAL", "evaluator").to_json() }),
                json!({ "type": "relationship.add", "value": rel("ev-target", "EV1", "target_commitment", "C1", "commitment").to_json() }),
                json!({ "type": "relationship.add", "value": rel("ev-selector", "EV1", "target_selector", "EV-SEL", "unit").to_json() }),
                json!({ "type": "relationship.add", "value": rel("ev-scope", "EV1", "source_scope", "SC1", "scope").to_json() }),
                json!({ "type": "relationship.add", "value": rel("ev-evaluator", "EV1", "evaluator", "EV-EVAL", "unit").to_json() }),
                json!({ "type": "relationship.add", "value": rel("ev-result", "EV1", "result", "EV-RESULT", "commitment").to_json() }),
                json!({ "type": "relationship.add", "value": rel("ev-coverage", "EV1", "coverage", "EV-COVERAGE", "commitment").to_json() }),
                json!({ "type": "relationship.add", "value": rel("ep-proof", "EP1", "proof_obligation", "EV1", "unit").to_json() }),
            ],
            &TransactOptions { profile_ids: vec!["EV1".into()], ..Default::default() },
        )
        .expect("evaluation transact");

    assert_eq!(
        validate_episode_closure(&store.state(), "EP1").unwrap(),
        json!({ "closable": true, "episodeId": "EP1" })
    );
}
