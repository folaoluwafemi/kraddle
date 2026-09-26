//! Plain-language, CODE-first denials.

use kraddle::denials_text::describe_denial;
use serde_json::json;

#[test]
fn preflight_violated_names_the_governing_commitment() {
    let text = describe_denial(
        "PREFLIGHT_VIOLATED",
        &json!({ "commitment": "domain must not import ui" }),
    );
    assert!(text.starts_with("PREFLIGHT_VIOLATED — "));
    assert!(text.contains("domain must not import ui"));
    assert!(text.contains("breaks your rule"));
}

#[test]
fn an_unknown_code_is_described_without_throwing() {
    let text = describe_denial("SOME_FUTURE_CODE", &json!({ "anything": true }));
    assert!(text.starts_with("SOME_FUTURE_CODE — "));
    assert!(text.contains("(no description yet)"));
}

#[test]
fn coverage_of_the_denial_surface() {
    let unknown = describe_denial("PREFLIGHT_UNKNOWN", &json!({}));
    assert!(unknown.contains("could not be verified"));
    assert!(unknown.contains("denied when checks cannot run"));

    let outside = describe_denial(
        "TARGET_OUTSIDE_AUTHORITY",
        &json!({ "targetPrefix": "src/domain/", "target": "src/ui/x.tsx" }),
    );
    assert!(outside.contains("src/domain/"));
    assert!(outside.contains("src/ui/x.tsx"));

    let uncontrolled = describe_denial("UNCONTROLLED_EFFECT", &json!({ "paths": ["src/rogue.ts"] }));
    assert!(uncontrolled.contains("src/rogue.ts"));
    assert!(uncontrolled.contains("changes outside the allowed tool were found in the working tree"));

    let self_amendment = describe_denial("SELF_AMENDMENT_DENIED", &json!({}));
    assert!(self_amendment.contains("rules cannot be changed from inside a session"));

    let revoked = describe_denial("AUTHORITY_REVOKED", &json!({}));
    assert!(revoked.starts_with("AUTHORITY_REVOKED — "));
    let expired = describe_denial("AUTHORITY_EXPIRED", &json!({}));
    assert!(expired.starts_with("AUTHORITY_EXPIRED — "));
    let missing = describe_denial("AUTHORITY_MISSING_OPERATIONS", &json!({}));
    assert!(missing.starts_with("AUTHORITY_MISSING_OPERATIONS — "));

    let graft = describe_denial("PROFILE_GRAFT_DENIED", &json!({ "profileId": "CB1" }));
    assert!(graft.contains("CB1"));

    let incomplete = describe_denial("CONTEXT_INCOMPLETE", &json!({ "reasons": ["UNRESOLVED_SELECTOR"] }));
    assert!(incomplete.contains("UNRESOLVED_SELECTOR"));

    let active = describe_denial("EPISODE_ALREADY_ACTIVE", &json!({ "admittedCount": 2 }));
    assert!(active.contains('2'));

    let pin = describe_denial("EVIDENCE_PIN_MISMATCH", &json!({}));
    assert!(pin.starts_with("EVIDENCE_PIN_MISMATCH — "));
    let scope = describe_denial("EVIDENCE_SCOPE_MISMATCH", &json!({}));
    assert!(scope.starts_with("EVIDENCE_SCOPE_MISMATCH — "));
}
