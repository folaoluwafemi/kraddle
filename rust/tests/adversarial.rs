//! Port of test/adversarial.test.js — the adversarial manifest.
//! Tests are ported progressively with the kernel steps; AD-12 (quarantine)
//! lands here with Step 2.

mod common;

use common::{episode_fixture_operations, episode_state, expect_control, rel, unit, TempDir};
use kraddle::kernel::{
    admit_effect, episode_status, DenialCode, Effect, Record, TransactOptions, Workspace,
};
use serde_json::json;
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
