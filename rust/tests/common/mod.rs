//! Shared helpers for the ported Node test fixtures.

use kraddle::kernel::{DenialCode, KraddleError, Record};
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
