//! Port of test/envelope.test.js — record envelope validation.

use kraddle::kernel::{
    apply_operation, empty_state, DenialCode, KraddleError, Record,
};
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
