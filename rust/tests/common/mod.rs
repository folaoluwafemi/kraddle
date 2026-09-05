//! Shared helpers for the ported Node test fixtures.

use kraddle::kernel::{empty_state, DenialCode, KraddleError, Record, State};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub struct TempDir(PathBuf);

impl TempDir {
    pub fn new(prefix: &str) -> Self {
        let path = std::env::temp_dir().join(format!("{}-{}", prefix, kraddle::kernel::new_uuid()));
        std::fs::create_dir_all(&path).expect("temp dir creates");
        TempDir(path)
    }

    pub fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

pub fn unit(id: &str, kind: &str) -> Record {
    Record::human(id, kind).with("title", json!(kind))
}

pub fn commitment(id: &str, value: &str) -> Record {
    Record::human(id, "commitment")
        .with("type", json!("statement"))
        .with("value", json!(value))
}

pub fn rel(id: &str, profile_id: &str, role: &str, target_id: &str, target_type: &str) -> Record {
    Record::human(id, "relationship")
        .with("profileId", json!(profile_id))
        .with("role", json!(role))
        .with("targetId", json!(target_id))
        .with("targetType", json!(target_type))
}

pub fn op(kind: &str, record: &Record) -> Value {
    json!({ "type": kind, "value": record.to_json() })
}

pub fn expect_control<T>(result: Result<T, KraddleError>, code: DenialCode) -> KraddleError {
    match result {
        Err(err @ KraddleError::Control { code: actual, .. }) => {
            assert_eq!(actual, code, "expected {:?}, got {:?}", code, err);
            err
        }
        other => panic!("expected denial {:?}, got {:?}", code, other.map(|_| "()")),
    }
}

/// Port of the adversarial suite's episodeState fixture: EP1 with the six
/// required role relationships, overridable authority/episode/context units.
pub fn episode_state(
    authority: &[(&str, Value)],
    episode: &[(&str, Value)],
    context: &[(&str, Value)],
) -> State {
    let mut state = empty_state();
    let mut ep = Record::human("EP1", "execution_episode").with("lifecycle", json!("running"));
    for (key, value) in episode {
        ep = ep.with(key, value.clone());
    }
    state.units.insert("EP1".into(), ep);
    state.commitments.insert("purpose-c".into(), commitment("purpose-c", "do work"));
    state.scopes.insert("scope-r".into(), Record::human("scope-r", "scope"));
    state.commitments.insert("base-c".into(), commitment("base-c", "revision-a"));
    let mut ctx = Record::human("context-u", "context_envelope")
        .with("valid", json!(true))
        .with("completeness", json!("complete"));
    for (key, value) in context {
        ctx = ctx.with(key, value.clone());
    }
    state.units.insert("context-u".into(), ctx);
    let mut auth = Record::human("authority-u", "authority_grant");
    for (key, value) in authority {
        auth = auth.with(key, value.clone());
    }
    state.units.insert("authority-u".into(), auth);
    state.units.insert("delta-u".into(), Record::human("delta-u", "software_element"));
    for (id, role, target_id, target_type) in [
        ("rel-purpose", "purpose", "purpose-c", "commitment"),
        ("rel-scope", "target_scope", "scope-r", "scope"),
        ("rel-base", "base_revision", "base-c", "commitment"),
        ("rel-context", "context_envelope", "context-u", "unit"),
        ("rel-authority", "authority_grant", "authority-u", "unit"),
        ("rel-delta", "intended_delta", "delta-u", "unit"),
    ] {
        state.relationships.insert(id.into(), rel(id, "EP1", role, target_id, target_type));
    }
    state
}

/// Port of episodeFixtureOperations: the same fixture as transactable ops.
pub fn episode_fixture_operations(authority: &[(&str, Value)], episode: &[(&str, Value)]) -> Vec<Value> {
    let state = episode_state(authority, episode, &[]);
    let mut ops = vec![
        op("unit.create", state.units.get("EP1").unwrap()),
        op("commitment.create", state.commitments.get("purpose-c").unwrap()),
        op("scope.create", state.scopes.get("scope-r").unwrap()),
        op("commitment.create", state.commitments.get("base-c").unwrap()),
        op("unit.create", state.units.get("context-u").unwrap()),
        op("unit.create", state.units.get("authority-u").unwrap()),
        op("unit.create", state.units.get("delta-u").unwrap()),
    ];
    for (id, _, _, _) in [
        ("rel-purpose", "purpose", "purpose-c", "commitment"),
        ("rel-scope", "target_scope", "scope-r", "scope"),
        ("rel-base", "base_revision", "base-c", "commitment"),
        ("rel-context", "context_envelope", "context-u", "unit"),
        ("rel-authority", "authority_grant", "authority-u", "unit"),
        ("rel-delta", "intended_delta", "delta-u", "unit"),
    ] {
        ops.push(op("relationship.add", state.relationships.get(id).unwrap()));
    }
    ops
}
