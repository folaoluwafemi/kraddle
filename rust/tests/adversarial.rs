//! Port of test/adversarial.test.js — the adversarial manifest.
//! Tests are ported progressively with the kernel steps; AD-12 (quarantine)
//! lands here with Step 2.

mod common;

use common::{
    closure_state, coverage_object, episode_fixture_operations, episode_state, expect_control, rel,
    unit, TempDir,
};
use kraddle::kernel::{
    admit_effect, classify_effect, compute_coverage_digest, episode_status, evaluate,
    record_observed_effect, validate_coverage, validate_episode_closure, DenialCode, Effect,
    EvalError, EvaluateArgs, Record, RunOutcome, TransactOptions, Workspace,
};
use serde_json::{json, Value};
use std::path::Path;

use std::thread::sleep;
use std::time::Duration;

fn sleep_ms(ms: u64) {
    sleep(Duration::from_millis(ms));
}

fn count_segments(events_dir: &Path) -> usize {
    std::fs::read_dir(events_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.ends_with(".krd"))
        .count()
}

#[test]
fn ad12_an_interrupted_transaction_is_never_projected() {
    let temp = TempDir::new("kraddle-ad12");
    let store = Workspace::new(temp.path());
    store.init().expect("init");
    let t1 = "unit-t1";
    let t2 = "unit-t2";
    let t3 = "unit-t3";
    store.transact(&[json!({ "type": "unit.create", "value": unit(t1, "behavior").to_json() })], &TransactOptions::default()).unwrap();
    sleep_ms(5);
    store.transact(&[json!({ "type": "unit.create", "value": unit(t2, "behavior").to_json() })], &TransactOptions::default()).unwrap();
    sleep_ms(5);
    store.transact(&[json!({ "type": "unit.create", "value": unit(t3, "behavior").to_json() })], &TransactOptions::default()).unwrap();

    let pristine = Workspace::new(temp.path());
    let pristine_result = pristine.load().expect("pristine load");
    assert!(pristine_result.trusted);
    assert_eq!(pristine_result.projected_through, 3);

    let events_dir = temp.path().join(".kraddle").join("events");
    let mut files: Vec<String> = std::fs::read_dir(&events_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.ends_with(".krd"))
        .collect();
    files.sort();
    assert_eq!(files.len(), 3);
    let interrupted = events_dir.join(&files[1]);
    let content = std::fs::read_to_string(&interrupted).unwrap();
    assert!(content.contains(t2), "middle segment in lexical order must be T2 for this fixture");
    let lines: Vec<&str> = content.trim().split('\n').filter(|l| !l.trim().is_empty()).collect();
    std::fs::write(&interrupted, format!("{}\n", lines[..lines.len() - 1].join("\n"))).unwrap();

    let reloaded = Workspace::new(temp.path());
    let result = reloaded.load().expect("load");
    assert!(!result.trusted);
    assert_eq!(result.quarantined.len(), 1);
    assert_eq!(
        result.quarantined[0].get("code").and_then(|c| c.as_str()),
        Some(DenialCode::SegmentCommitMarkerMissing.as_str())
    );
    assert!(result.state.units.contains_key(t1));
    assert!(!result.state.units.contains_key(t3));
    assert_eq!(result.projected_through, 1);
}

// The six deferred adversarial cases (R2): todo tests become #[ignore]
// tests with the blocker stated in the name.

#[test]
fn ad13_revoked_authority_suspends_the_next_effect() {
    let mut state = episode_state(
        &[("operations", json!(["write"])), ("revoked", json!(true))],
        &[],
        &[],
    );
    expect_control(
        admit_effect(&mut state, "EP1", &Effect { operation: "write".into(), target: Some("src/domain/a.ts".into()) }),
        DenialCode::AuthorityRevoked,
    );
    assert_eq!(episode_status(&state, "EP1").unwrap(), "suspended");
    assert_eq!(state.units.get("EP1").unwrap().str_field("lifecycle"), Some("running"));

    let mut regression = episode_state(&[], &[("allowedOperations", json!(["write"]))], &[]);
    expect_control(
        admit_effect(&mut regression, "EP1", &Effect { operation: "write".into(), target: Some("src/domain/a.ts".into()) }),
        DenialCode::AuthorityMissingOperations,
    );

    let temp = TempDir::new("kraddle-ad13");
    let store = Workspace::new(temp.path());
    store.init().expect("init");
    store
        .transact(
            &episode_fixture_operations(&[("operations", json!(["write"])), ("revoked", json!(true))], &[]),
            &TransactOptions { profile_ids: vec!["EP1".into()], ..Default::default() },
        )
        .expect("transact");
    let reloaded = Workspace::new(temp.path());
    let result = reloaded.load().expect("load");
    assert_eq!(episode_status(&result.state, "EP1").unwrap(), "suspended");

    let mut active = episode_state(&[("operations", json!(["write"]))], &[], &[]);
    let admission = admit_effect(
        &mut active,
        "EP1",
        &Effect { operation: "write".into(), target: Some("src/domain/a.ts".into()) },
    )
    .expect("admitted");
    assert!(admission.admitted);
    assert_eq!(episode_status(&active, "EP1").unwrap(), "running");
}

#[test]
fn ad02_an_agent_cannot_mutate_its_own_governing_control() {
    let temp = TempDir::new("kraddle-ad02");
    let store = Workspace::new(temp.path());
    store.init().expect("init");

    let c1 = common::commitment("C1", "domain must not import ui");
    let mut c2 = common::commitment("C2", "unrelated");
    c2.approval_state = "proposed".into();
    c2.set_field("title", json!("unrelated commitment"));

    let mut ops = vec![
        common::op("unit.create", &unit("CB1", "control_binding")),
        common::op("commitment.create", &c1),
        common::op("commitment.create", &common::commitment("S1", "src/domain/")),
        common::op("commitment.create", &common::commitment("M1", "prohibition").with("type", json!("has_modality"))),
        common::op("unit.create", &unit("E1", "evaluator")),
        common::op("commitment.create", &c2),
    ];
    ops.extend(episode_fixture_operations(
        &[("operations", json!(["write"])), ("allowRecordIds", json!([]))],
        &[],
    ));
    ops.extend(vec![
        common::op("relationship.add", &rel("cb-governed", "CB1", "governed_commitment", "C1", "commitment")),
        common::op("relationship.add", &rel("cb-selector", "CB1", "subject_selector", "S1", "commitment")),
        common::op("relationship.add", &rel("cb-modality", "CB1", "modality", "M1", "commitment")),
        common::op("relationship.add", &rel("cb-evaluator", "CB1", "evaluator", "E1", "unit")),
    ]);
    store
        .transact(
            &ops,
            &TransactOptions { profile_ids: vec!["CB1".into(), "EP1".into()], ..Default::default() },
        )
        .expect("bootstrap transact");

    let events_dir = temp.path().join(".kraddle").join("events");
    let before = count_segments(&events_dir);

    // Self-amendment: weakening the governing commitment.
    let weakened = Record::from_json(&c1.to_json()).unwrap().with("value", json!("domain may import ui"));
    expect_control(
        store.transact(
            &[common::op("commitment.update", &weakened)],
            &TransactOptions { actor_id: "agent-1".into(), episode_id: Some("EP1".into()), ..Default::default() },
        ),
        DenialCode::SelfAmendmentDenied,
    );
    assert_eq!(store.state().commitments.get("C1").unwrap().value_field(), Some(&json!("domain must not import ui")));
    assert_eq!(count_segments(&events_dir), before);

    // Graft: a second evaluator onto the governing profile.
    let mut graft = rel("graft-1", "CB1", "evaluator", "fake-evaluator", "unit");
    graft.approval_state = "proposed".into();
    expect_control(
        store.transact(
            &[common::op("relationship.add", &graft)],
            &TransactOptions { actor_id: "agent-1".into(), episode_id: Some("EP1".into()), ..Default::default() },
        ),
        DenialCode::ProfileGraftDenied,
    );
    let state_now = store.state();
    let evaluator_edges: Vec<&Record> = state_now
        .relationships
        .values()
        .filter(|r| r.str_field("profileId") == Some("CB1") && r.str_field("role") == Some("evaluator"))
        .collect();
    assert_eq!(evaluator_edges.len(), 1);
    assert_eq!(evaluator_edges[0].str_field("targetId"), Some("E1"));
    assert_eq!(count_segments(&events_dir), before);

    // Default-deny: an unrelated commitment with an empty allowRecordIds.
    expect_control(
        store.transact(
            &[common::op("commitment.update", &c2)],
            &TransactOptions { actor_id: "agent-1".into(), episode_id: Some("EP1".into()), ..Default::default() },
        ),
        DenialCode::MutationNotAuthorized,
    );
    assert_eq!(count_segments(&events_dir), before);

    // Allowed case: the human widens allowRecordIds, then the agent's
    // update of C2 is authorized (and stays non-accepted).
    let mut authority = store.state().units.get("authority-u").unwrap().clone();
    authority.set_field("allowRecordIds", json!(["C2"]));
    store
        .transact(&[common::op("unit.update", &authority)], &TransactOptions::default())
        .expect("human widens allowRecordIds");
    let renamed = c2.with("title", json!("renamed by agent"));
    store
        .transact(
            &[common::op("commitment.update", &renamed)],
            &TransactOptions { actor_id: "agent-1".into(), episode_id: Some("EP1".into()), ..Default::default() },
        )
        .expect("agent update authorized");
    let updated = store.state().commitments.get("C2").unwrap().clone();
    assert_eq!(updated.str_field("title"), Some("renamed by agent"));
    assert_ne!(updated.approval_state, "accepted");
}

#[test]
fn ad05_a_base_revision_evaluation_cannot_close_a_later_revision() {
    let mut mismatched = closure_state(
        &[],
        &[("stateRef", json!({ "repository": "repo", "revision": "rev-a", "contentDigest": "digest-a" }))],
        "satisfied",
    );
    admit_effect(&mut mismatched, "EP1", &Effect { operation: "write".into(), target: Some("src/domain/a.ts".into()) }).expect("admit");
    let err = expect_control(validate_episode_closure(&mismatched, "EP1"), DenialCode::EvaluationRevisionMismatch);
    assert_eq!(err.detail().get("evaluated"), Some(&json!("rev-a")));
    assert_eq!(err.detail().get("required"), Some(&json!("rev-b")));

    let mut digest_mismatch = closure_state(
        &[],
        &[("stateRef", json!({ "repository": "repo", "revision": "rev-b", "contentDigest": "digest-x" }))],
        "satisfied",
    );
    admit_effect(&mut digest_mismatch, "EP1", &Effect { operation: "write".into(), target: Some("src/domain/a.ts".into()) }).expect("admit");
    let err = expect_control(validate_episode_closure(&digest_mismatch, "EP1"), DenialCode::EvaluationRevisionMismatch);
    assert_eq!(err.detail().get("fields"), Some(&json!(["contentDigest"])));

    let mut matched = closure_state(&[], &[], "satisfied");
    admit_effect(&mut matched, "EP1", &Effect { operation: "write".into(), target: Some("src/domain/a.ts".into()) }).expect("admit");
    assert_eq!(
        validate_episode_closure(&matched, "EP1").unwrap(),
        json!({ "closable": true, "episodeId": "EP1" })
    );
}

#[test]
fn an_episode_without_effects_must_explicitly_declare_no_op() {
    let state = closure_state(&[], &[], "satisfied");
    expect_control(validate_episode_closure(&state, "EP1"), DenialCode::NoOpNotDeclared);
}

#[test]
fn a_declared_no_op_episode_with_a_satisfied_obligation_closes() {
    let state = closure_state(&[("noOp", json!(true))], &[], "satisfied");
    assert_eq!(
        validate_episode_closure(&state, "EP1").unwrap(),
        json!({ "closable": true, "episodeId": "EP1" })
    );
}

#[test]
fn ad10_effects_cannot_be_documented_after_bypassing_admission() {
    let mut unadmitted = closure_state(&[], &[], "satisfied");
    let observation = record_observed_effect(&mut unadmitted, "EP1", &json!({
        "operation": "write",
        "target": "src/domain/a.ts",
        "admissionId": Value::Null,
    }))
    .expect("record");
    let classification = classify_effect(&unadmitted, "EP1", &observation);
    assert_eq!(classification.get("controlled"), Some(&json!(false)));
    expect_control(validate_episode_closure(&unadmitted, "EP1"), DenialCode::UncontrolledEffect);
    let observed_list = unadmitted
        .units
        .get("EP1")
        .unwrap()
        .field("observedEffects")
        .and_then(|f| f.as_array())
        .cloned()
        .unwrap_or_default();
    assert_eq!(observed_list.len(), 1);

    let mut forged = closure_state(&[], &[], "satisfied");
    let forged_observation = record_observed_effect(&mut forged, "EP1", &json!({
        "operation": "write",
        "target": "src/domain/a.ts",
        "admissionId": "not-a-real-admission",
    }))
    .expect("record");
    assert_eq!(classify_effect(&forged, "EP1", &forged_observation).get("controlled"), Some(&json!(false)));
    expect_control(validate_episode_closure(&forged, "EP1"), DenialCode::UncontrolledEffect);

    let mut controlled = closure_state(&[], &[], "satisfied");
    let admission = admit_effect(
        &mut controlled,
        "EP1",
        &Effect { operation: "write".into(), target: Some("src/domain/a.ts".into()) },
    )
    .expect("admit");
    assert!(admission.admitted);
    record_observed_effect(&mut controlled, "EP1", &json!({
        "operation": "write",
        "target": "src/domain/a.ts",
        "admissionId": admission.admission_id,
    }))
    .expect("record");
    assert_eq!(
        validate_episode_closure(&controlled, "EP1").unwrap(),
        json!({ "closable": true, "episodeId": "EP1" })
    );
}

#[test]
fn an_observed_effect_must_match_its_admission() {
    let mut state = closure_state(&[], &[], "satisfied");
    let admission = admit_effect(
        &mut state,
        "EP1",
        &Effect { operation: "write".into(), target: Some("src/domain/a.ts".into()) },
    )
    .expect("admit");
    let observation = record_observed_effect(&mut state, "EP1", &json!({
        "operation": "delete",
        "target": "src/other/secrets.txt",
        "admissionId": admission.admission_id,
    }))
    .expect("record");
    let classification = classify_effect(&state, "EP1", &observation);
    assert_eq!(classification.get("controlled"), Some(&json!(false)));
    assert_eq!(classification.get("reason"), Some(&json!("effect_mismatch")));
    expect_control(validate_episode_closure(&state, "EP1"), DenialCode::UncontrolledEffect);
}

#[test]
fn a_matching_observed_effect_is_controlled() {
    let mut state = closure_state(&[], &[], "satisfied");
    let admission = admit_effect(
        &mut state,
        "EP1",
        &Effect { operation: "write".into(), target: Some("src/domain/a.ts".into()) },
    )
    .expect("admit");
    record_observed_effect(&mut state, "EP1", &json!({
        "operation": "write",
        "target": "src/domain/a.ts",
        "admissionId": admission.admission_id,
    }))
    .expect("record");
    assert_eq!(classify_effect(&state, "EP1", &json!({
        "operation": "write",
        "target": "src/domain/a.ts",
        "admissionId": admission.admission_id,
    })), json!({ "controlled": true }));
    assert_eq!(
        validate_episode_closure(&state, "EP1").unwrap(),
        json!({ "closable": true, "episodeId": "EP1" })
    );
}

#[test]
fn ad04_coverage_cannot_exclude_changed_files() {
    let with_digest = |over: Vec<(&str, Value)>| -> Value {
        let mut coverage = json!({
            "requiredSubjects": ["src/domain/a.ts", "src/domain/b.ts"],
            "coveredSubjects": ["src/domain/a.ts"],
            "unknownSubjects": [],
            "excludedSubjects": [],
            "selectionMethod": "changed_files",
        });
        if let Some(map) = coverage.as_object_mut() {
            for (key, value) in over {
                map.insert(key.into(), value);
            }
        }
        let digest = compute_coverage_digest(&coverage).expect("digest");
        if let Some(map) = coverage.as_object_mut() {
            map.insert("coverageDigest".into(), json!(digest));
        }
        coverage
    };

    let err = expect_control(
        validate_coverage(Some(&with_digest(vec![])), &[]),
        DenialCode::CoverageIncomplete,
    );
    assert_eq!(err.detail().get("missing"), Some(&json!(["src/domain/b.ts"])));

    expect_control(
        validate_coverage(Some(&with_digest(vec![("unknownSubjects", json!(["src/domain/c.ts"]))])), &[]),
        DenialCode::CoverageUnknownNonempty,
    );

    expect_control(
        validate_coverage(
            Some(&with_digest(vec![
                ("coveredSubjects", json!(["src/domain/a.ts", "src/domain/b.ts"])),
                ("excludedSubjects", json!(["src/gen/x.ts"])),
            ])),
            &[],
        ),
        DenialCode::CoverageExclusionNotPermitted,
    );

    let mut hand_edited = with_digest(vec![]);
    if let Some(map) = hand_edited.as_object_mut() {
        map.insert("coverageDigest".into(), json!("0".repeat(64)));
    }
    expect_control(
        validate_coverage(Some(&hand_edited), &[]),
        DenialCode::CoverageDigestMismatch,
    );

    // Node's fixture computes the digest inside withDigest, so the
    // ENVELOPE_INVALID for an empty subject surfaces there.
    let empty_required = json!({
        "requiredSubjects": [""],
        "coveredSubjects": ["src/domain/a.ts"],
        "unknownSubjects": [],
        "excludedSubjects": [],
        "selectionMethod": "changed_files",
    });
    expect_control(
        compute_coverage_digest(&empty_required).map(|_| json!(())),
        DenialCode::EnvelopeInvalid,
    );

    let digest_of = |required: Value| compute_coverage_digest(&json!({
        "requiredSubjects": required,
        "coveredSubjects": ["src/domain/a.ts"],
        "unknownSubjects": [],
        "excludedSubjects": [],
    }))
    .unwrap();
    assert_eq!(digest_of(json!(["b", "a"])), digest_of(json!(["a", "b"])));
    assert_eq!(digest_of(json!(["a", "a", "b"])), digest_of(json!(["a", "b"])));

    assert_eq!(
        validate_coverage(
            Some(&with_digest(vec![("coveredSubjects", json!(["src/domain/a.ts", "src/domain/b.ts"]))])),
            &[]
        )
        .unwrap(),
        json!({ "sufficient": true })
    );

    let mut insufficient = closure_state(
        &[],
        &[("coverage", with_digest(vec![]))],
        "satisfied",
    );
    admit_effect(&mut insufficient, "EP1", &Effect { operation: "write".into(), target: Some("src/domain/a.ts".into()) }).expect("admit");
    expect_control(validate_episode_closure(&insufficient, "EP1"), DenialCode::CoverageIncomplete);
}

#[test]
fn ad03_an_evaluator_failure_cannot_satisfy_a_blocking_obligation() {
    let mut failed = closure_state(
        &[],
        &[("stateRef", json!({ "repository": "repo", "revision": "rev-b", "contentDigest": "digest-b" }))],
        "evaluation_failed",
    );
    admit_effect(&mut failed, "EP1", &Effect { operation: "write".into(), target: Some("src/domain/a.ts".into()) }).expect("admit");
    let err = expect_control(validate_episode_closure(&failed, "EP1"), DenialCode::EvaluationFailedNotAPass);
    assert_ne!(err.code(), Some(DenialCode::EvaluationNotSatisfied));

    let mut satisfied = closure_state(&[], &[], "satisfied");
    admit_effect(&mut satisfied, "EP1", &Effect { operation: "write".into(), target: Some("src/domain/a.ts".into()) }).expect("admit");
    assert_eq!(
        validate_episode_closure(&satisfied, "EP1").unwrap(),
        json!({ "closable": true, "episodeId": "EP1" })
    );
}

#[test]
fn ad11_an_evaluator_parse_failure_is_never_a_pass() {
    let state_ref = json!({ "repository": "repo", "revision": "rev-b", "contentDigest": "digest-b" });
    let args = EvaluateArgs {
        evaluation_id: "EV1",
        evaluator_id: "evaluator-1",
        evaluator_version: "1.2.3",
        subjects: Some(vec!["src/domain/a.ts".into()]),
        state_ref: Some(state_ref.clone()),
    };
    let ev = evaluate(&args, |_| -> Result<RunOutcome, EvalError> {
        Err(EvalError::Named { name: "SyntaxError".into(), message: "unexpected token".into() })
    });
    assert_eq!(ev.str_field("result"), Some("evaluation_failed"));
    assert_eq!(ev.field("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()), Some("unexpected token"));

    let healthy = evaluate(&args, |_| Ok(RunOutcome { result: "satisfied".into(), coverage: Some(coverage_object()) }));
    assert_eq!(healthy.str_field("result"), Some("satisfied"));
    assert!(healthy.field("error").is_none());

    let ev_value = ev.to_json();
    let mut attached = closure_state(&[], &[], "evaluation_failed");
    if let Some(unit) = attached.units.get_mut("EV1") {
        let replacement = Record::from_json(&ev_value).unwrap();
        *unit = replacement;
    }
    admit_effect(&mut attached, "EP1", &Effect { operation: "write".into(), target: Some("src/domain/a.ts".into()) }).expect("admit");
    expect_control(validate_episode_closure(&attached, "EP1"), DenialCode::EvaluationFailedNotAPass);

    // Persistence: a failed evaluation is a real observation and must
    // survive reload, exactly like a satisfied one.
    let temp = TempDir::new("kraddle-ad11");
    let store = Workspace::new(temp.path());
    store.init().expect("init");
    let ev_record = Record::from_json(&ev_value).unwrap();
    let mut ops = vec![
        common::op("unit.create", &ev_record),
        common::op("commitment.create", &common::commitment("target-c", "domain must not import ui")),
        common::op("unit.create", &unit("selector-u", "selector")),
        common::op("scope.create", &Record::human("scope-r", "scope")),
        common::op("unit.create", &unit("evaluator-u", "evaluator")),
        common::op("commitment.create", &common::commitment("result-c", "evaluation_failed")),
        common::op("commitment.create", &common::commitment("coverage-c", "typed")),
    ];
    for (id, role, target_id, target_type) in [
        ("ev-target", "target_commitment", "target-c", "commitment"),
        ("ev-selector", "target_selector", "selector-u", "unit"),
        ("ev-scope", "source_scope", "scope-r", "scope"),
        ("ev-evaluator", "evaluator", "evaluator-u", "unit"),
        ("ev-result", "result", "result-c", "commitment"),
        ("ev-coverage", "coverage", "coverage-c", "commitment"),
    ] {
        ops.push(common::op("relationship.add", &rel(id, "EV1", role, target_id, target_type)));
    }
    store
        .transact(&ops, &TransactOptions { profile_ids: vec!["EV1".into()], ..Default::default() })
        .expect("transact");
    let reloaded = Workspace::new(temp.path());
    let result = reloaded.load().expect("load");
    let persisted = result.state.units.get("EV1").unwrap();
    assert_eq!(persisted.str_field("result"), Some("evaluation_failed"));
    assert_eq!(persisted.str_field("evaluatorId"), Some("evaluator-1"));
    assert_eq!(persisted.str_field("evaluatorVersion"), Some("1.2.3"));
    assert_eq!(persisted.field("stateRef"), Some(&state_ref));
    assert_eq!(persisted.field("subjects"), Some(&json!(["src/domain/a.ts"])));
    assert_eq!(
        persisted.field("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()),
        Some("unexpected token")
    );
}

#[test]
#[ignore = "blocked on code anchor subsystem"]
fn ad06_ambiguous_anchor_pauses_affected_execution() {}

#[test]
#[ignore = "blocked on schema capability negotiation (P9)"]
fn ad07_unknown_control_extension_cannot_authorize() {}

#[test]
#[ignore = "blocked on causal clocks and heads (P3)"]
fn ad08_concurrent_governing_heads_block_execution() {}

#[test]
#[ignore = "blocked on exception subsystem (P7)"]
fn ad09_exception_request_is_not_authorization() {}

#[test]
#[ignore = "blocked on exception subsystem (P7)"]
fn ad14_expired_exception_suspends_next_effect() {}

#[test]
#[ignore = "blocked on typed invalidation (P6)"]
fn ad15_delayed_invalidation_cannot_preserve_stale_authorization() {}
