//! Port of test/envelope.test.js — record envelope validation.

mod common;

use common::{expect_control, TempDir};
use kraddle::kernel::{apply_operation, empty_state, DenialCode, KraddleError, Record, TransactOptions, Workspace};
use serde_json::json;

fn base_record() -> Record {
    Record::human("rec-1", "unit")
}

fn attempt(value: serde_json::Value) -> Result<(), KraddleError> {
    let mut state = empty_state();
    apply_operation(&mut state, &json!({ "type": "unit.create", "value": value }))
}

fn without(field: &str) -> serde_json::Value {
    let mut value = base_record().to_json();
    if let Some(map) = value.as_object_mut() {
        map.remove(field);
    }
    value
}

fn assert_control_code(result: Result<(), KraddleError>, code: DenialCode) {
    match result {
        Err(KraddleError::Control { code: actual, .. }) => assert_eq!(actual, code),
        other => panic!("expected denial {:?}, got {:?}", code, other),
    }
}

#[test]
fn missing_origin_is_rejected() {
    assert_control_code(attempt(without("origin")), DenialCode::EnvelopeInvalid);
}

#[test]
fn missing_epistemic_basis_is_rejected() {
    assert_control_code(attempt(without("epistemic_basis")), DenialCode::EnvelopeInvalid);
}

#[test]
fn missing_approval_state_is_rejected() {
    assert_control_code(attempt(without("approval_state")), DenialCode::EnvelopeInvalid);
}

#[test]
fn missing_freshness_state_is_rejected() {
    assert_control_code(attempt(without("freshness_state")), DenialCode::EnvelopeInvalid);
}

#[test]
fn origin_outside_the_enum_is_rejected() {
    let mut value = base_record();
    value.origin = "robot".into();
    assert_control_code(attempt(value.to_json()), DenialCode::EnvelopeEnumInvalid);
}

#[test]
fn confidence_above_1_is_rejected() {
    let mut value = base_record();
    value.confidence = Some(1.5);
    assert_control_code(attempt(value.to_json()), DenialCode::EnvelopeEnumInvalid);
}

#[test]
fn a_non_human_actor_cannot_set_approval_state_accepted() {
    let temp = TempDir::new("kraddle-envelope");
    let store = Workspace::new(temp.path());
    store.init().expect("init");
    let result = store.transact(
        &[json!({ "type": "unit.create", "value": base_record().to_json() })],
        &TransactOptions { actor_id: "agent-1".into(), ..Default::default() },
    );
    expect_control(result, DenialCode::AcceptanceNotAuthorized);
}

#[test]
fn a_human_actor_may_create_an_accepted_record() {
    let temp = TempDir::new("kraddle-envelope");
    let store = Workspace::new(temp.path());
    store.init().expect("init");
    store
        .transact(
            &[json!({ "type": "unit.create", "value": base_record().to_json() })],
            &TransactOptions { actor_id: "human".into(), ..Default::default() },
        )
        .expect("transact");
    assert_eq!(store.state().units.get("rec-1").map(|r| r.approval_state.as_str()), Some("accepted"));
}
