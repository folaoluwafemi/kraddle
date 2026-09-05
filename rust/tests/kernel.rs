//! Port of test/kernel.test.js — state, profiles, validation, persistence.
//! Admission and closure cases land with Steps 3 and 5.

mod common;

use common::{commitment, episode_state, expect_control, op, rel, TempDir, unit};
use kraddle::kernel::{
    admit_effect, empty_state, validate_episode_closure, DenialCode, Effect, State,
    TransactOptions, Workspace, validate_profile,
};
use serde_json::{json, Value};
use std::sync::Arc;

fn apply_all(state: &mut State, ops: &[Value]) {
    for operation in ops {
        kraddle::kernel::apply_operation(state, operation).expect("operation applies");
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

#[test]
fn writes_and_reloads_a_valid_control_binding_from_committed_files() {
    let temp = TempDir::new("kraddle-kernel");
    let store = Workspace::new(temp.path());
    store.init().expect("init");

    let operations = vec![
        op("unit.create", &unit("profile", "control_binding")),
        op("commitment.create", &commitment("governed", "Domain does not import UI")),
        op("commitment.create", &commitment("selector", "src/domain/**")),
        op("commitment.create", &commitment("modality", "invariant").with("type", json!("has_modality"))),
        op("unit.create", &unit("evaluator", "evaluator")),
        op("relationship.add", &rel("r1", "profile", "governed_commitment", "governed", "commitment")),
        op("relationship.add", &rel("r2", "profile", "subject_selector", "selector", "commitment")),
        op("relationship.add", &rel("r3", "profile", "modality", "modality", "commitment")),
        op("relationship.add", &rel("r4", "profile", "evaluator", "evaluator", "unit")),
    ];
    store
        .transact(&operations, &TransactOptions { profile_ids: vec!["profile".into()], ..Default::default() })
        .expect("transact");

    let reloaded = Workspace::new(temp.path());
    let result = reloaded.load().expect("load");
    assert_eq!(result.state.units.get("profile").map(|r| r.kind.as_str()), Some("control_binding"));
    assert_eq!(result.heads.len(), 1);
}

#[test]
fn reloads_a_committed_transaction() {
    let temp = TempDir::new("kraddle-kernel");
    let store = Workspace::new(temp.path());
    store.init().expect("init");

    store
        .transact(&[op("unit.create", &unit("u1", "behavior"))], &TransactOptions::default())
        .expect("transact");

    let reloaded = Workspace::new(temp.path());
    let result = reloaded.load().expect("load");
    assert_eq!(result.state.units.len(), 1);
    assert!(result.trusted);
    assert_eq!(result.projected_through, 1);
    let heads = std::fs::read_to_string(temp.path().join(".kraddle").join("heads.krd")).unwrap();
    assert!(heads.contains("heads"));
}

#[test]
fn init_refuses_to_overwrite_an_existing_workspace() {
    let temp = TempDir::new("kraddle-kernel");
    let store = Workspace::new(temp.path());
    let first = store.init().expect("init");
    let err = expect_control(store.init(), DenialCode::WorkspaceExists);
    assert_eq!(err.code(), Some(DenialCode::WorkspaceExists));
    let on_disk: Value = serde_json::from_str(
        &std::fs::read_to_string(temp.path().join(".kraddle").join("manifest.krd")).unwrap(),
    )
    .unwrap();
    assert_eq!(on_disk.get("workspaceId"), first.get("workspaceId"));
}

#[test]
fn an_existing_workspace_opens_with_load_not_init() {
    let temp = TempDir::new("kraddle-kernel");
    let store = Workspace::new(temp.path());
    store.init().expect("init");

    store
        .transact(&[op("unit.create", &unit("u1", "behavior"))], &TransactOptions::default())
        .expect("transact");

    let reloaded = Workspace::new(temp.path());
    let result = reloaded.load().expect("load");
    assert!(result.state.units.contains_key("u1"));
    assert!(result.trusted);
}

#[test]
fn denies_effects_outside_an_episode_authority_envelope() {
    let mut state = episode_state(
        &[("operations", json!(["write"])), ("targetPrefix", json!("src/research/"))],
        &[],
        &[],
    );
    let admitted = admit_effect(
        &mut state,
        "EP1",
        &Effect { operation: "write".into(), target: Some("src/research/context.ts".into()) },
    )
    .expect("admitted");
    assert!(admitted.admitted);
    expect_control(
        admit_effect(&mut state, "EP1", &Effect { operation: "write".into(), target: Some("src/ui/App.tsx".into()) }),
        DenialCode::TargetOutsideAuthority,
    );
    expect_control(
        admit_effect(&mut state, "EP1", &Effect { operation: "execute".into(), target: Some("src/research/run.js".into()) }),
        DenialCode::OperationNotAuthorized,
    );
}

#[test]
fn does_not_close_an_episode_without_an_outcome() {
    let state = episode_state(&[("operations", json!(["write"]))], &[], &[]);
    expect_control(validate_episode_closure(&state, "EP1"), DenialCode::EpisodeOutcomeMissing);
}

#[test]
fn concurrent_transactions_are_serialized() {
    let temp = TempDir::new("kraddle-kernel");
    let store = Arc::new(Workspace::new(temp.path()));
    store.init().expect("init");

    let left = Arc::clone(&store);
    let right = Arc::clone(&store);
    let handle_left = std::thread::spawn(move || {
        left.transact(&[op("unit.create", &unit("t1", "behavior"))], &TransactOptions::default()).unwrap()
    });
    let handle_right = std::thread::spawn(move || {
        right.transact(&[op("unit.create", &unit("t2", "behavior"))], &TransactOptions::default()).unwrap()
    });
    let tx1 = handle_left.join().expect("left transact");
    let tx2 = handle_right.join().expect("right transact");

    let events_dir = temp.path().join(".kraddle").join("events");
    let segments: Vec<_> = std::fs::read_dir(&events_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.ends_with(".krd"))
        .collect();
    assert_eq!(segments.len(), 2);

    let heads: Value = serde_json::from_str(
        &std::fs::read_to_string(temp.path().join(".kraddle").join("heads.krd")).unwrap(),
    )
    .unwrap();
    let heads_list = heads.get("heads").and_then(|h| h.as_array()).unwrap();
    assert_eq!(heads_list.len(), 2);
    assert!(heads_list.contains(&json!(tx1)));
    assert!(heads_list.contains(&json!(tx2)));

    let state = store.state();
    assert!(state.units.contains_key("t1"));
    assert!(state.units.contains_key("t2"));

    let fresh = Workspace::new(temp.path());
    let result = fresh.load().expect("load");
    assert!(result.trusted);
    assert_eq!(result.projected_through, 2);
}
