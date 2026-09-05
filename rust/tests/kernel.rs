//! Port of test/kernel.test.js — state, profiles, validation.
//! Workspace-persistence cases (reload, init-twice, concurrency) land with
//! the Step 2 port; admission and closure cases land with Steps 3 and 5.

use kraddle::kernel::{
    apply_operation, empty_state, DenialCode, KraddleError, Record, State, validate_profile,
};
use serde_json::{json, Value};

fn unit(id: &str, kind: &str) -> Record {
    Record::human(id, kind).with("title", json!(kind))
}

fn commitment(id: &str, value: &str) -> Record {
    Record::human(id, "commitment")
        .with("type", json!("statement"))
        .with("value", json!(value))
}

fn rel(id: &str, profile_id: &str, role: &str, target_id: &str, target_type: &str) -> Record {
    Record::human(id, "relationship")
        .with("profileId", json!(profile_id))
        .with("role", json!(role))
        .with("targetId", json!(target_id))
        .with("targetType", json!(target_type))
}

fn op(kind: &str, record: &Record) -> Value {
    json!({ "type": kind, "value": record.to_json() })
}

fn apply_all(state: &mut State, ops: &[Value]) {
    for operation in ops {
        apply_operation(state, operation).expect("operation applies");
    }
}

fn expect_control(result: Result<Value, KraddleError>, code: DenialCode) -> KraddleError {
    match result {
        Err(err @ KraddleError::Control { code: actual, .. }) => {
            assert_eq!(actual, code, "expected {:?}, got {:?}", code, err);
            err
        }
        other => panic!("expected denial {:?}, got {:?}", code, other.map(|v| v.to_string())),
    }
}

#[test]
fn rejects_a_blocking_control_without_an_evaluator() {
    let mut state = empty_state();
    apply_all(&mut state, &[
        op("unit.create", &unit("profile", "control_binding")),
        op("commitment.create", &commitment("governed", "domain must not import ui")),
        op("commitment.create", &commitment("selector", "src/domain/**")),
        op("commitment.create", &commitment("modality", "prohibition").with("type", json!("has_modality"))),
        op("relationship.add", &rel("r1", "profile", "governed_commitment", "governed", "commitment")),
        op("relationship.add", &rel("r2", "profile", "subject_selector", "selector", "commitment")),
        op("relationship.add", &rel("r3", "profile", "modality", "modality", "commitment")),
    ]);

    let err = expect_control(validate_profile(&state, "profile"), DenialCode::EnvelopeInvalid);
    assert_eq!(err.detail().get("reason"), Some(&json!("blocking_modality_requires_evaluator")));
}

#[test]
fn accepts_a_blocking_control_with_an_evaluator() {
    let mut state = empty_state();
    apply_all(&mut state, &[
        op("unit.create", &unit("profile", "control_binding")),
        op("commitment.create", &commitment("governed", "domain must not import ui")),
        op("commitment.create", &commitment("selector", "src/domain/**")),
        op("commitment.create", &commitment("modality", "prohibition").with("type", json!("has_modality"))),
        op("unit.create", &unit("evaluator", "evaluator")),
        op("relationship.add", &rel("r1", "profile", "governed_commitment", "governed", "commitment")),
        op("relationship.add", &rel("r2", "profile", "subject_selector", "selector", "commitment")),
        op("relationship.add", &rel("r3", "profile", "modality", "modality", "commitment")),
        op("relationship.add", &rel("r4", "profile", "evaluator", "evaluator", "unit")),
    ]);

    let summary = validate_profile(&state, "profile").expect("profile validates");
    assert_eq!(summary.get("kind"), Some(&json!("control_binding")));
    let roles = summary.get("roles").and_then(|r| r.as_array()).unwrap();
    assert!(roles.contains(&json!("evaluator")));
}

#[test]
fn rejects_invalid_evaluation_results() {
    let mut state = empty_state();
    state.units.insert("p".into(), unit("p", "evaluation"));
    state.units.insert("s".into(), unit("s", "selector"));
    state.scopes.insert("scope".into(), unit("scope", "scope"));
    state.units.insert("eval".into(), unit("eval", "evaluator"));
    state.commitments.insert("target".into(), commitment("target", "target"));
    state.commitments.insert("result".into(), commitment("result", "maybe"));
    state.commitments.insert("coverage".into(), commitment("coverage", "all"));
    for (id, role, target_id, target_type) in [
        ("a", "target_commitment", "target", "commitment"),
        ("b", "target_selector", "s", "unit"),
        ("c", "source_scope", "scope", "scope"),
        ("d", "evaluator", "eval", "unit"),
        ("e", "result", "result", "commitment"),
        ("f", "coverage", "coverage", "commitment"),
    ] {
        state.relationships.insert(id.into(), rel(id, "p", role, target_id, target_type));
    }

    expect_control(validate_profile(&state, "p"), DenialCode::EvaluationResultInvalid);
}
