//! Shared helpers for the ported Node test fixtures.

use kraddle::kernel::{empty_state, DenialCode, KraddleError, Record, State, TransactOptions, Workspace};
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

/// Port of the adversarial suite's coverageObject fixture helper.
pub fn coverage_object() -> Value {
    let coverage = json!({
        "requiredSubjects": ["src/domain/a.ts"],
        "coveredSubjects": ["src/domain/a.ts"],
        "unknownSubjects": [],
        "excludedSubjects": [],
        "selectionMethod": "changed_files",
    });
    let digest = kraddle::kernel::compute_coverage_digest(&coverage).expect("coverage digest");
    let mut with_digest = coverage;
    if let Some(map) = with_digest.as_object_mut() {
        map.insert("coverageDigest".into(), json!(digest));
    }
    with_digest
}

/// Port of the adversarial suite's closureState fixture: EP1 with base and
/// resulting state refs, outcome, and a proof-obligation evaluation EV1.
pub fn closure_state(
    episode: &[(&str, Value)],
    evaluation: &[(&str, Value)],
    result_value: &str,
) -> State {
    let mut state = empty_state();
    let mut ep = Record::human("EP1", "execution_episode")
        .with("lifecycle", json!("running"))
        .with("baseStateRef", json!({ "repository": "repo", "revision": "rev-a", "contentDigest": "digest-a" }))
        .with("resultingStateRef", json!({ "repository": "repo", "revision": "rev-b", "contentDigest": "digest-b" }));
    for (key, value) in episode {
        ep = ep.with(key, value.clone());
    }
    state.units.insert("EP1".into(), ep);

    let mut ev = Record::human("EV1", "evaluation")
        .with("stateRef", json!({ "repository": "repo", "revision": "rev-b", "contentDigest": "digest-b" }))
        .with("coverage", coverage_object());
    for (key, value) in evaluation {
        ev = ev.with(key, value.clone());
    }
    state.units.insert("EV1".into(), ev);

    state.commitments.insert("purpose-c".into(), commitment("purpose-c", "do work"));
    state.scopes.insert("scope-r".into(), Record::human("scope-r", "scope"));
    state.commitments.insert("base-c".into(), commitment("base-c", "revision-a"));
    state.units.insert("context-u".into(), Record::human("context-u", "context_envelope").with("valid", json!(true)).with("completeness", json!("complete")));
    state.units.insert("authority-u".into(), Record::human("authority-u", "authority_grant").with("operations", json!(["write"])));
    state.units.insert("delta-u".into(), Record::human("delta-u", "software_element"));
    state.commitments.insert("outcome-c".into(), commitment("outcome-c", "work complete"));
    state.commitments.insert("target-c".into(), commitment("target-c", "domain must not import ui"));
    state.units.insert("selector-u".into(), unit("selector-u", "selector"));
    state.units.insert("evaluator-u".into(), unit("evaluator-u", "evaluator"));
    state.commitments.insert("result-c".into(), commitment("result-c", result_value));
    state.commitments.insert("coverage-c".into(), commitment("coverage-c", "complete"));

    for (id, profile_id, role, target_id, target_type) in [
        ("ep-purpose", "EP1", "purpose", "purpose-c", "commitment"),
        ("ep-scope", "EP1", "target_scope", "scope-r", "scope"),
        ("ep-base", "EP1", "base_revision", "base-c", "commitment"),
        ("ep-context", "EP1", "context_envelope", "context-u", "unit"),
        ("ep-authority", "EP1", "authority_grant", "authority-u", "unit"),
        ("ep-delta", "EP1", "intended_delta", "delta-u", "unit"),
        ("ep-outcome", "EP1", "outcome", "outcome-c", "commitment"),
        ("ep-proof", "EP1", "proof_obligation", "EV1", "unit"),
        ("ev-target", "EV1", "target_commitment", "target-c", "commitment"),
        ("ev-selector", "EV1", "target_selector", "selector-u", "unit"),
        ("ev-scope", "EV1", "source_scope", "scope-r", "scope"),
        ("ev-evaluator", "EV1", "evaluator", "evaluator-u", "unit"),
        ("ev-result", "EV1", "result", "result-c", "commitment"),
        ("ev-coverage", "EV1", "coverage", "coverage-c", "commitment"),
    ] {
        state.relationships.insert(id.into(), rel(id, profile_id, role, target_id, target_type));
    }
    state
}

/// Port of the adversarial suite's addBinding fixture: an accepted
/// control_binding with all four roles.
pub fn add_binding(state: &mut State, binding_id: &str, selector: Value) {
    state.units.insert(binding_id.into(), Record::human(binding_id, "control_binding"));
    state.commitments.insert(format!("{}-gov", binding_id), commitment(&format!("{}-gov", binding_id), "domain must not import ui"));
    state
        .commitments
        .insert(format!("{}-sel", binding_id), Record::human(&format!("{}-sel", binding_id), "commitment").with("value", selector));
    state.commitments.insert(
        format!("{}-mod", binding_id),
        commitment(&format!("{}-mod", binding_id), "prohibition").with("type", json!("has_modality")),
    );
    state.units.insert(format!("{}-ev", binding_id), unit(&format!("{}-ev", binding_id), "evaluator"));
    state.relationships.insert(
        format!("{}-r1", binding_id),
        rel(&format!("{}-r1", binding_id), binding_id, "governed_commitment", &format!("{}-gov", binding_id), "commitment"),
    );
    state.relationships.insert(
        format!("{}-r2", binding_id),
        rel(&format!("{}-r2", binding_id), binding_id, "subject_selector", &format!("{}-sel", binding_id), "commitment"),
    );
    state.relationships.insert(
        format!("{}-r3", binding_id),
        rel(&format!("{}-r3", binding_id), binding_id, "modality", &format!("{}-mod", binding_id), "commitment"),
    );
    state.relationships.insert(
        format!("{}-r4", binding_id),
        rel(&format!("{}-r4", binding_id), binding_id, "evaluator", &format!("{}-ev", binding_id), "unit"),
    );
}

/// Port of the adversarial suite's evidenceRecord fixture: extractor
/// evidence pinned to rev-b, scoped to src/.
pub fn evidence_record(id: &str, over: &[(&str, Value)]) -> Record {
    let mut record = Record::human(id, "evidence");
    record.origin = "extractor".into();
    record.epistemic_basis = "observed".into();
    record.set_field(
        "stateRef",
        json!({ "repository": "repo", "revision": "rev-b", "contentDigest": "digest-b" }),
    );
    record.set_field(
        "edges",
        json!([{ "from": "src/domain/a.ts", "to": "src/ui/Button.tsx", "resolution": "resolved" }]),
    );
    record.set_field("extractionScope", json!({ "fromPrefixes": ["src/"] }));
    for (key, value) in over {
        record.set_field(key, value.clone());
    }
    record
}

// ---------------------------------------------------------------------------
// Server-test bootstrap (port of test/server.test.js's bootstrap): a temp
// git repo with fixture files and a separately-rooted workspace holding a
// human-transacted binding, base evidence, and a running episode.

pub struct ServerFixture {
    pub _temp: TempDir,
    pub repo_dir: std::path::PathBuf,
    pub ws_dir: std::path::PathBuf,
    pub files: std::collections::BTreeMap<String, String>,
    pub state_ref: Value,
    pub server: kraddle::server::KraddleServer,
}

pub fn server_bootstrap(
    authority_over: &[(&str, Value)],
    test_fixture: bool,
) -> ServerFixture {
    server_bootstrap_with(authority_over, test_fixture, None)
}

pub fn server_bootstrap_with(
    authority_over: &[(&str, Value)],
    test_fixture: bool,
    authority_override: Option<Value>,
) -> ServerFixture {
    use kraddle::server::{create_kraddle_server, ServerConfig};

    let temp = TempDir::new("kraddle-server");
    let repo_dir = temp.path().join("repo");
    let ws_dir = temp.path().join("ws");
    for dir in ["src/domain", "src/ui"] {
        std::fs::create_dir_all(repo_dir.join(dir)).unwrap();
    }
    std::fs::write(repo_dir.join("src/domain/a.ts"), "export const a = 1;\n").unwrap();
    std::fs::write(repo_dir.join("src/ui/Button.tsx"), "import React from \"react\";\n").unwrap();
    if test_fixture {
        std::fs::create_dir_all(repo_dir.join("test")).unwrap();
        std::fs::write(repo_dir.join("test/fixture.test.js"), "import { thing } from \"./missing\";\n").unwrap();
    }
    let run = |args: &[&str]| {
        let status = std::process::Command::new("git")
            .args(args)
            .current_dir(&repo_dir)
            .status()
            .expect("git runs");
        assert!(status.success(), "git {:?} failed", args);
    };
    run(&["init"]);
    run(&["config", "user.email", "test@example.com"]);
    run(&["config", "user.name", "Test"]);
    run(&["add", "src/domain/a.ts", "src/ui/Button.tsx"]);
    if test_fixture {
        run(&["add", "test/fixture.test.js"]);
    }
    run(&["commit", "-m", "init"]);

    let files = kraddle::repo::read_repo_files(&repo_dir).unwrap().files;
    let git = kraddle::repo::git_state_ref(&repo_dir).unwrap();
    let state_ref = json!({
        "repository": git.repository,
        "revision": git.revision,
        "contentDigest": kraddle::extract::compute_file_map_digest(&files),
    });
    let edges = kraddle::extract::extract_dependencies(&files).edges;
    let scoped_edges: Vec<Value> = edges
        .iter()
        .filter(|edge| {
            edge.get("from")
                .and_then(|f| f.as_str())
                .map(|from| from.starts_with("src/"))
                .unwrap_or(false)
        })
        .cloned()
        .collect();

    let store = Workspace::new(&ws_dir);
    store.init().expect("init");

    let authority = match authority_override {
        Some(value) => value,
        None => {
            let mut authority = json!({ "operations": ["read", "write"], "targetPrefix": "src/domain/" });
            if let Some(map) = authority.as_object_mut() {
                for (key, value) in authority_over {
                    map.insert(key.to_string(), value.clone());
                }
            }
            authority
        }
    };

    let mut authority_record = Record::human("EP-AUTH", "authority_grant");
    if let Some(map) = authority.as_object() {
        for (key, value) in map {
            authority_record.set_field(key, value.clone());
        }
    }

    let mut evidence = Record::human("EV-BASE", "evidence");
    evidence.origin = "extractor".into();
    evidence.epistemic_basis = "observed".into();
    evidence.set_field("stateRef", state_ref.clone());
    evidence.set_field("edges", json!(scoped_edges));
    evidence.set_field("extractionScope", json!({ "fromPrefixes": ["src/"] }));

    let ctx = Record::human("EP-CTX", "context_envelope")
        .with("valid", json!(true))
        .with("completeness", json!("complete"))
        .with("complete", json!(true))
        .with("incompleteReasons", json!([]));
    let mut episode = Record::human("EP1", "execution_episode")
        .with("lifecycle", json!("running"));
    episode.set_field("baseStateRef", state_ref.clone());
    let evaluator_unit = Record::human("EV-UNIT", "evaluator")
        .with("evaluatorType", json!("architecture_rule"))
        .with("params", json!({ "sourcePrefix": "src/domain/", "forbiddenPrefixes": ["src/ui/"] }));

    let mut ops = vec![
        op("scope.create", &Record::human("SC1", "scope")),
        op("unit.create", &evaluator_unit),
        op("commitment.create", &commitment("C1", "domain must not import ui")),
        op("commitment.create", &Record::human("S1", "commitment").with("value", json!({ "type": "path_prefix", "value": "src/domain/" }))),
        op("commitment.create", &commitment("M1", "prohibition").with("type", json!("has_modality"))),
        op("unit.create", &Record::human("CB1", "control_binding")),
        op("relationship.add", &rel("cb-governed", "CB1", "governed_commitment", "C1", "commitment")),
        op("relationship.add", &rel("cb-selector", "CB1", "subject_selector", "S1", "commitment")),
        op("relationship.add", &rel("cb-modality", "CB1", "modality", "M1", "commitment")),
        op("relationship.add", &rel("cb-evaluator", "CB1", "evaluator", "EV-UNIT", "unit")),
        op("evidence.create", &evidence),
        op("commitment.create", &commitment("EP-PURPOSE", "add a domain service")),
        op("commitment.create", &commitment("EP-BASE", "base state")),
        op("commitment.create", &commitment("EP-OUTCOME", "service added under the governing control")),
        op("unit.create", &ctx),
        op("unit.create", &authority_record),
        op("unit.create", &Record::human("EP-DELTA", "software_element")),
        op("unit.create", &episode),
        op("relationship.add", &rel("ep-purpose", "EP1", "purpose", "EP-PURPOSE", "commitment")),
        op("relationship.add", &rel("ep-scope", "EP1", "target_scope", "SC1", "scope")),
        op("relationship.add", &rel("ep-base", "EP1", "base_revision", "EP-BASE", "commitment")),
        op("relationship.add", &rel("ep-context", "EP1", "context_envelope", "EP-CTX", "unit")),
        op("relationship.add", &rel("ep-authority", "EP1", "authority_grant", "EP-AUTH", "unit")),
        op("relationship.add", &rel("ep-delta", "EP1", "intended_delta", "EP-DELTA", "unit")),
        op("relationship.add", &rel("ep-outcome", "EP1", "outcome", "EP-OUTCOME", "commitment")),
    ];
    let _ = &mut ops;
    store
        .transact(
            &ops,
            &TransactOptions { profile_ids: vec!["CB1".into(), "EP1".into()], ..Default::default() },
        )
        .expect("bootstrap transact");

    let server = create_kraddle_server(&ServerConfig {
        repo_dir: repo_dir.clone(),
        workspace_dir: ws_dir.clone(),
        episode_id: "EP1".into(),
        base_evidence_id: "EV-BASE".into(),
    })
    .expect("server boots");

    ServerFixture { _temp: temp, repo_dir, ws_dir, files, state_ref, server }
}
