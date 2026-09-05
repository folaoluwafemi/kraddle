//! Port of test/demo.test.js — the two-block demo, the project's
//! differentiator: the violation denial and the self-amendment denial.

mod common;

use common::{expect_control, TempDir};
use kraddle::evaluators::architecture_rule_evaluator;
use kraddle::extract::{compute_file_map_digest, extract_dependencies};
use kraddle::kernel::{
    admit_effect, evaluate, record_observed_effect, resolve_applicable_context,
    validate_episode_closure, DenialCode, Effect, EvaluateArgs, Record, ResolverArgs,
    RunOutcome, TransactOptions, Workspace,
};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::Path;

struct DemoRun {
    _temp: TempDir,
    store: Workspace,
    ev: Record,
}

fn human(id: &str, kind: &str, over: &[(&str, Value)]) -> Record {
    let mut record = Record::human(id, kind);
    for (key, value) in over {
        record.set_field(key, value.clone());
    }
    record
}

fn count_segments(events_dir: &Path) -> usize {
    std::fs::read_dir(events_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.ends_with(".krd"))
        .count()
}

fn run_demo_sequence(files: &BTreeMap<String, String>) -> DemoRun {
    let state_ref = json!({
        "repository": "demo-repo",
        "revision": "rev-b",
        "contentDigest": compute_file_map_digest(files),
    });
    let temp = TempDir::new("kraddle-demo");
    let store = Workspace::new(temp.path());
    store.init().expect("init");

    let ops = vec![
        common::op("scope.create", &human("SC1", "scope", &[])),
        common::op("unit.create", &human("EV-UNIT", "evaluator", &[
            ("evaluatorType", json!("architecture_rule")),
            ("params", json!({ "sourcePrefix": "src/domain/", "forbiddenPrefixes": ["src/ui/"] })),
        ])),
        common::op("commitment.create", &human("C1", "commitment", &[
            ("value", json!("domain must not import ui")),
            ("forbiddenPathPrefixes", json!(["src/ui/"])),
        ])),
        common::op("commitment.create", &human("S1", "commitment", &[
            ("value", json!({ "type": "path_prefix", "value": "src/domain/" })),
        ])),
        common::op("commitment.create", &human("M1", "commitment", &[
            ("value", json!("prohibition")),
        ])),
        common::op("unit.create", &human("CB1", "control_binding", &[])),
        common::op("relationship.add", &common::rel("cb-governed", "CB1", "governed_commitment", "C1", "commitment")),
        common::op("relationship.add", &common::rel("cb-selector", "CB1", "subject_selector", "S1", "commitment")),
        common::op("relationship.add", &common::rel("cb-modality", "CB1", "modality", "M1", "commitment")),
        common::op("relationship.add", &common::rel("cb-evaluator", "CB1", "evaluator", "EV-UNIT", "unit")),
    ];
    store
        .transact(&ops, &TransactOptions { profile_ids: vec!["CB1".into()], ..Default::default() })
        .expect("binding transact");

    let extraction = extract_dependencies(files);
    let mut evidence = human("EV-DEP", "evidence", &[]);
    evidence.origin = "extractor".into();
    evidence.epistemic_basis = "observed".into();
    evidence.set_field("stateRef", state_ref.clone());
    evidence.set_field("edges", json!(extraction.edges));
    evidence.set_field("subjects", json!(extraction.subjects));
    evidence.set_field("limitations", json!(extraction.limitations));
    evidence.set_field("extractionScope", json!({ "fromPrefixes": ["src/"] }));
    store
        .transact(&[common::op("evidence.create", &evidence)], &TransactOptions::default())
        .expect("evidence transact");

    let resolved = resolve_applicable_context(
        &store.state(),
        &ResolverArgs {
            task_scope_id: None,
            target_paths: vec!["src/domain/service.ts".into()],
            revision: Some("rev-b"),
            declared_applicable: vec!["CB1".into()],
            dependency_evidence_id: Some("EV-DEP"),
        },
    );
    assert!(resolved.complete);
    assert_eq!(resolved.applicable, vec!["CB1".to_string()]);

    let episode_ops = vec![
        common::op("commitment.create", &human("EP-PURPOSE", "commitment", &[("value", json!("add a domain service without importing ui"))])),
        common::op("commitment.create", &human("EP-BASE", "commitment", &[("value", json!("rev-a"))])),
        common::op("commitment.create", &human("EP-OUTCOME", "commitment", &[("value", json!("service added under the governing control"))])),
        common::op("unit.create", &human("EP-CTX", "context_envelope", &[
            ("valid", json!(true)),
            ("completeness", json!("complete")),
            ("complete", json!(true)),
            ("incompleteReasons", json!([])),
        ])),
        common::op("unit.create", &human("EP-AUTH", "authority_grant", &[
            ("operations", json!(["write"])),
            ("allowRecordIds", json!([])),
        ])),
        common::op("unit.create", &human("EP-DELTA", "software_element", &[])),
        common::op("unit.create", &human("EP1", "execution_episode", &[
            ("lifecycle", json!("running")),
            ("baseStateRef", json!({ "repository": "demo-repo", "revision": "rev-a", "contentDigest": "digest-a" })),
            ("resultingStateRef", state_ref.clone()),
        ])),
        common::op("relationship.add", &common::rel("ep-purpose", "EP1", "purpose", "EP-PURPOSE", "commitment")),
        common::op("relationship.add", &common::rel("ep-scope", "EP1", "target_scope", "SC1", "scope")),
        common::op("relationship.add", &common::rel("ep-base", "EP1", "base_revision", "EP-BASE", "commitment")),
        common::op("relationship.add", &common::rel("ep-context", "EP1", "context_envelope", "EP-CTX", "unit")),
        common::op("relationship.add", &common::rel("ep-authority", "EP1", "authority_grant", "EP-AUTH", "unit")),
        common::op("relationship.add", &common::rel("ep-delta", "EP1", "intended_delta", "EP-DELTA", "unit")),
        common::op("relationship.add", &common::rel("ep-outcome", "EP1", "outcome", "EP-OUTCOME", "commitment")),
    ];
    store
        .transact(&episode_ops, &TransactOptions { profile_ids: vec!["EP1".into()], ..Default::default() })
        .expect("episode transact");

    store.with_state_mut(|state| {
        let admission = admit_effect(
            state,
            "EP1",
            &Effect { operation: "write".into(), target: Some("src/domain/service.ts".into()) },
        )
        .expect("admit");
        record_observed_effect(
            state,
            "EP1",
            &json!({
                "operation": "write",
                "target": "src/domain/service.ts",
                "admissionId": admission.admission_id,
            }),
        )
        .expect("observe");
    });

    let ev = evaluate(
        &EvaluateArgs {
            evaluation_id: "EV1",
            evaluator_id: "architecture-rule",
            evaluator_version: "0.1.0",
            subjects: Some(vec!["src/domain/service.ts".into(), "src/domain/helper.ts".into()]),
            state_ref: Some(state_ref.clone()),
        },
        |_| {
            let outcome = architecture_rule_evaluator("src/domain/", "src/ui/", files);
            Ok(RunOutcome { result: outcome.result, coverage: outcome.coverage })
        },
    );

    let evaluation_ops = vec![
        common::op("unit.create", &ev),
        common::op("commitment.create", &human("EV-RESULT", "commitment", &[("value", json!(ev.str_field("result").unwrap_or_default()))])),
        common::op("commitment.create", &human("EV-COVERAGE", "commitment", &[("value", json!("typed"))])),
        common::op("unit.create", &human("EV-SEL", "selector", &[])),
        common::op("unit.create", &human("EV-EVAL", "evaluator", &[])),
        common::op("relationship.add", &common::rel("ev-target", "EV1", "target_commitment", "C1", "commitment")),
        common::op("relationship.add", &common::rel("ev-selector", "EV1", "target_selector", "EV-SEL", "unit")),
        common::op("relationship.add", &common::rel("ev-scope", "EV1", "source_scope", "SC1", "scope")),
        common::op("relationship.add", &common::rel("ev-evaluator", "EV1", "evaluator", "EV-EVAL", "unit")),
        common::op("relationship.add", &common::rel("ev-result", "EV1", "result", "EV-RESULT", "commitment")),
        common::op("relationship.add", &common::rel("ev-coverage", "EV1", "coverage", "EV-COVERAGE", "commitment")),
        common::op("relationship.add", &common::rel("ep-proof", "EP1", "proof_obligation", "EV1", "unit")),
    ];
    store
        .transact(&evaluation_ops, &TransactOptions { profile_ids: vec!["EV1".into()], ..Default::default() })
        .expect("evaluation transact");

    DemoRun { _temp: temp, store, ev }
}

#[test]
fn the_two_block_demo() {
    let mut files = BTreeMap::new();
    files.insert("src/domain/service.ts".into(), "import { Button } from \"../ui/Button\";\n".into());
    files.insert("src/domain/helper.ts".into(), "export const helper = () => 1;\n".into());
    files.insert("src/ui/Button.tsx".into(), "import React from \"react\";\n".into());
    let DemoRun { _temp, store, ev } = run_demo_sequence(&files);

    assert_eq!(ev.str_field("result"), Some("violated"));

    // FIRST BLOCK: the violation denial.
    expect_control(
        validate_episode_closure(&store.state(), "EP1"),
        DenialCode::EvaluationNotSatisfied,
    );

    // SECOND BLOCK: the self-amendment denial.
    let events_dir = _temp.path().join(".kraddle").join("events");
    let before = count_segments(&events_dir);
    let c1 = store.state().commitments.get("C1").unwrap().clone();
    let weakened = Record::from_json(&{
        let mut value = c1.to_json();
        if let Some(map) = value.as_object_mut() {
            map.insert("value".into(), json!("domain may import ui"));
        }
        value
    })
    .unwrap();
    expect_control(
        store.transact(
            &[common::op("commitment.update", &weakened)],
            &TransactOptions { actor_id: "agent-1".into(), episode_id: Some("EP1".into()), ..Default::default() },
        ),
        DenialCode::SelfAmendmentDenied,
    );
    assert_eq!(count_segments(&events_dir), before);
    assert_eq!(
        store.state().commitments.get("C1").unwrap().value_field(),
        Some(&json!("domain must not import ui"))
    );

    let mut graft = common::rel("graft-1", "CB1", "evaluator", "fake-evaluator", "unit");
    graft.approval_state = "proposed".into();
    expect_control(
        store.transact(
            &[common::op("relationship.add", &graft)],
            &TransactOptions { actor_id: "agent-1".into(), episode_id: Some("EP1".into()), ..Default::default() },
        ),
        DenialCode::ProfileGraftDenied,
    );
    assert_eq!(count_segments(&events_dir), before);
    assert_eq!(
        store.state().commitments.get("C1").unwrap().value_field(),
        Some(&json!("domain must not import ui"))
    );
    let evaluator_edges: Vec<Record> = store
        .state()
        .relationships
        .values()
        .filter(|r| r.str_field("profileId") == Some("CB1") && r.str_field("role") == Some("evaluator"))
        .cloned()
        .collect();
    assert_eq!(evaluator_edges.len(), 1);
    assert_eq!(evaluator_edges[0].str_field("targetId"), Some("EV-UNIT"));
}

#[test]
fn the_clean_control_closes() {
    let mut files = BTreeMap::new();
    files.insert("src/domain/service.ts".into(), "import { helper } from \"./helper\";\n".into());
    files.insert("src/domain/helper.ts".into(), "export const helper = () => 1;\n".into());
    files.insert("src/ui/Button.tsx".into(), "import React from \"react\";\n".into());
    let DemoRun { _temp, store, ev } = run_demo_sequence(&files);
    let _ = _temp;

    assert_eq!(ev.str_field("result"), Some("satisfied"));
    assert_eq!(
        validate_episode_closure(&store.state(), "EP1").unwrap(),
        json!({ "closable": true, "episodeId": "EP1" })
    );
}
