//! Port of test/adversarial.test.js — the adversarial manifest.
//! Tests are ported progressively with the kernel steps; AD-12 (quarantine)
//! lands here with Step 2.

mod common;

use common::{episode_fixture_operations, episode_state, expect_control, unit, TempDir};
use kraddle::kernel::{
    admit_effect, episode_status, DenialCode, Effect, TransactOptions, Workspace,
};
use serde_json::json;

use std::thread::sleep;
use std::time::Duration;

fn sleep_ms(ms: u64) {
    sleep(Duration::from_millis(ms));
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
