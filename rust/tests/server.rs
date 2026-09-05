//! Port of test/server.test.js — the bounded write path, preflight, and
//! closure with bypass detection, driving tool handlers in process.

mod common;

use common::{server_bootstrap, server_bootstrap_with, expect_control, ServerFixture};
use kraddle::kernel::{DenialCode, TransactOptions, Workspace};
use kraddle::mcp::ToolResult;
use kraddle::server::ServerConfig;
use serde_json::json;

fn write(fixture: &ServerFixture, path: &str, content: &str) -> ToolResult {
    fixture.server.call_tool("kraddle_write_file", &json!({ "path": path, "content": content }))
}

fn close(fixture: &ServerFixture) -> ToolResult {
    fixture.server.call_tool("kraddle_close_episode", &json!({}))
}

fn file_exists(root: &std::path::Path, path: &str) -> bool {
    root.join(path.replace('/', std::path::MAIN_SEPARATOR_STR)).exists()
}

#[test]
fn a_write_outside_the_authority_prefix_is_denied_and_never_touches_disk() {
    let fixture = server_bootstrap(&[], false);
    let result = write(&fixture, "src/ui/other.tsx", "export const x = 1;\n");
    assert!(result.is_error);
    assert!(result.text.contains("TARGET_OUTSIDE_AUTHORITY"));
    assert!(!file_exists(&fixture.repo_dir, "src/ui/other.tsx"));
}

#[test]
fn a_write_violating_the_governing_rule_is_denied_by_preflight_before_disk() {
    let fixture = server_bootstrap(&[], false);
    let result = write(
        &fixture,
        "src/domain/service.ts",
        "import { Button } from \"../ui/Button\";\nexport const service = Button;\n",
    );
    assert!(result.is_error);
    assert!(result.text.contains("PREFLIGHT_VIOLATED"));
    assert!(result.text.contains("domain must not import ui"));
    assert!(!file_exists(&fixture.repo_dir, "src/domain/service.ts"));
}

#[test]
fn a_write_whose_evaluation_is_unknown_is_denied_fail_closed() {
    let fixture = server_bootstrap(&[], false);
    let result = write(
        &fixture,
        "src/domain/service.ts",
        "const mod = import(cfg.button);\nexport const service = mod;\n",
    );
    assert!(result.is_error);
    assert!(result.text.contains("PREFLIGHT_UNKNOWN"));
    assert!(!file_exists(&fixture.repo_dir, "src/domain/service.ts"));
}

#[test]
fn a_clean_write_is_admitted_written_and_observed_with_its_admission_id() {
    let fixture = server_bootstrap(&[], false);
    let content = "export const service = () => 1;\n";
    let result = write(&fixture, "src/domain/service.ts", content);
    assert!(!result.is_error);
    let state = fixture.server.core.workspace.state();
    let episode = state.units.get("EP1").unwrap();
    let observed = episode.field("observedEffects").and_then(|f| f.as_array()).cloned().unwrap_or_default();
    assert_eq!(observed.len(), 1);
    let admission_id = observed[0].get("admissionId").and_then(|a| a.as_str()).unwrap().to_string();
    assert!(result.text.contains(&admission_id));
    let on_disk = std::fs::read_to_string(fixture.repo_dir.join("src/domain/service.ts")).unwrap();
    assert_eq!(on_disk, content);
    assert_eq!(
        fixture
            .server
            .core
            .admitted_writes
            .lock()
            .unwrap()
            .get("src/domain/service.ts")
            .map(String::as_str),
        Some(content)
    );
}

#[test]
fn closure_succeeds_on_a_clean_flow_and_persists_the_resulting_records() {
    let fixture = server_bootstrap(&[], false);
    let content = "export const service = () => 1;\n";
    let written = write(&fixture, "src/domain/service.ts", content);
    assert!(!written.is_error);

    let closed = close(&fixture);
    assert!(!closed.is_error, "{}", closed.text);
    let mut expected_files = fixture.files.clone();
    expected_files.insert("src/domain/service.ts".into(), content.into());
    let expected_digest = kraddle::extract::compute_file_map_digest(&expected_files);
    assert!(closed.text.contains(&expected_digest));

    let reloaded = Workspace::new(&fixture.ws_dir);
    let result = reloaded.load().expect("reload");
    assert!(result.trusted);
    let worktree_evidence = result
        .state
        .evidence
        .values()
        .find(|record| {
            record
                .field("stateRef")
                .and_then(|r| r.get("revision"))
                .and_then(|r| r.as_str())
                .map(|revision| revision.ends_with("+worktree"))
                .unwrap_or(false)
        })
        .cloned()
        .expect("resulting evidence must persist");
    assert_eq!(worktree_evidence.origin, "extractor");
    assert_eq!(worktree_evidence.approval_state, "accepted");
    let evaluation = result
        .state
        .units
        .values()
        .find(|unit| unit.kind == "evaluation")
        .cloned()
        .expect("evaluation profile must persist");
    assert_eq!(evaluation.str_field("result"), Some("satisfied"));
    assert_eq!(
        evaluation.field("stateRef").and_then(|r| r.get("revision")),
        worktree_evidence.field("stateRef").and_then(|r| r.get("revision"))
    );
    let proof = result
        .state
        .relationships
        .values()
        .any(|r| r.str_field("profileId") == Some("EP1") && r.str_field("role") == Some("proof_obligation"));
    assert!(proof, "proof obligation must persist");
}

#[test]
fn closure_refuses_an_episode_whose_working_tree_contains_an_unadmitted_change() {
    let fixture = server_bootstrap(&[], false);
    let written = write(&fixture, "src/domain/service.ts", "export const service = () => 1;\n");
    assert!(!written.is_error);

    std::fs::write(
        fixture.repo_dir.join("src/domain/rogue.ts"),
        "export const rogue = 1;\n",
    )
    .unwrap();

    let closed = close(&fixture);
    assert!(closed.is_error);
    assert!(closed.text.contains("UNCONTROLLED_EFFECT"));
    assert!(closed.text.contains("src/domain/rogue.ts"));
}

#[test]
fn closure_refuses_an_episode_whose_package_json_was_edited_outside_admission() {
    let fixture = server_bootstrap(&[], false);
    let written = write(&fixture, "src/domain/service.ts", "export const service = () => 1;\n");
    assert!(!written.is_error);

    std::fs::write(fixture.repo_dir.join("package.json"), "{\n  \"name\": \"weakened\"\n}\n").unwrap();

    let closed = close(&fixture);
    assert!(closed.is_error);
    assert!(closed.text.contains("UNCONTROLLED_EFFECT"));
    assert!(closed.text.contains("package.json"));
}

#[test]
fn closure_refuses_an_episode_in_which_a_base_file_was_deleted_outside_admission() {
    let fixture = server_bootstrap(&[], false);
    let written = write(&fixture, "src/domain/service.ts", "export const service = () => 1;\n");
    assert!(!written.is_error);

    std::fs::remove_file(fixture.repo_dir.join("src/domain/a.ts")).unwrap();

    let closed = close(&fixture);
    assert!(closed.is_error);
    assert!(closed.text.contains("UNCONTROLLED_EFFECT"));
    assert!(closed.text.contains("src/domain/a.ts"));
}

#[test]
fn closure_evidence_edges_obey_the_records_declared_extraction_scope() {
    let fixture = server_bootstrap(&[], true);
    let written = write(&fixture, "src/domain/service.ts", "export const service = () => 1;\n");
    assert!(!written.is_error);

    let closed = close(&fixture);
    assert!(!closed.is_error, "{}", closed.text);

    let reloaded = Workspace::new(&fixture.ws_dir);
    let result = reloaded.load().expect("reload");
    assert!(result.trusted);
    let worktree_evidence = result
        .state
        .evidence
        .values()
        .find(|record| {
            record
                .field("stateRef")
                .and_then(|r| r.get("revision"))
                .and_then(|r| r.as_str())
                .map(|revision| revision.ends_with("+worktree"))
                .unwrap_or(false)
        })
        .cloned()
        .expect("worktree evidence");
    assert_eq!(
        worktree_evidence.field("extractionScope"),
        Some(&json!({ "fromPrefixes": ["src/"] }))
    );
    let edges = worktree_evidence
        .field("edges")
        .and_then(|e| e.as_array())
        .cloned()
        .unwrap_or_default();
    assert!(!edges.is_empty());
    for edge in &edges {
        let from = edge.get("from").and_then(|f| f.as_str()).unwrap_or("");
        assert!(from.starts_with("src/"), "closure edge outside declared scope: {}", edge);
    }
}

#[test]
fn closure_denies_on_resolver_incompleteness_same_as_preflight() {
    let fixture = server_bootstrap(&[], false);
    let written = write(&fixture, "src/domain/service.ts", "export const service = () => 1;\n");
    assert!(!written.is_error);

    let selector = fixture.server.core.workspace.state().commitments.get("S1").unwrap().clone();
    let mut sabotaged = selector;
    sabotaged.set_field(
        "value",
        json!({ "type": "semantic_similarity", "value": "auth-ish" }),
    );
    fixture
        .server
        .core
        .workspace
        .transact(
            &[json!({ "type": "commitment.update", "value": sabotaged.to_json() })],
            &TransactOptions::default(),
        )
        .expect("sabotage transact");

    let closed = close(&fixture);
    assert!(closed.is_error);
    assert!(closed.text.contains("CONTEXT_INCOMPLETE"));
}

#[test]
fn a_denied_write_leaves_no_admission_ledger_entry() {
    let fixture = server_bootstrap(&[], false);
    let denied = write(
        &fixture,
        "src/domain/service.ts",
        "import { Button } from \"../ui/Button\";\nexport const service = Button;\n",
    );
    assert!(denied.is_error);
    assert!(denied.text.contains("PREFLIGHT_VIOLATED"));
    let episode = fixture.server.core.workspace.state().units.get("EP1").unwrap().clone();
    let admitted = episode
        .field("admittedEffects")
        .and_then(|f| f.as_array())
        .cloned()
        .unwrap_or_default();
    assert!(admitted.is_empty());

    let clean = write(&fixture, "src/domain/service.ts", "export const service = () => 1;\n");
    assert!(!clean.is_error);
    let episode = fixture.server.core.workspace.state().units.get("EP1").unwrap().clone();
    let admitted = episode
        .field("admittedEffects")
        .and_then(|f| f.as_array())
        .cloned()
        .unwrap_or_default();
    let observed = episode
        .field("observedEffects")
        .and_then(|f| f.as_array())
        .cloned()
        .unwrap_or_default();
    assert_eq!(admitted.len(), 1);
    assert_eq!(observed.len(), 1);
}

#[test]
fn a_restarted_server_refuses_an_already_active_episode() {
    let fixture = server_bootstrap(&[], false);
    let written = write(&fixture, "src/domain/service.ts", "export const service = () => 1;\n");
    assert!(!written.is_error);

    let err = expect_control(
        kraddle::server::create_kraddle_server(&ServerConfig {
            repo_dir: fixture.repo_dir.clone(),
            workspace_dir: fixture.ws_dir.clone(),
            episode_id: "EP1".into(),
            base_evidence_id: "EV-BASE".into(),
        }),
        DenialCode::EpisodeAlreadyActive,
    );
    assert_eq!(err.detail().get("episodeId"), Some(&json!("EP1")));
    assert_eq!(err.detail().get("admittedCount"), Some(&json!(1)));
}

#[test]
fn a_read_is_denied_when_the_authority_omits_the_read_operation() {
    let fixture = server_bootstrap_with(&[], false, Some(json!({ "operations": ["write"], "targetPrefix": "src/domain/" })));
    let result = fixture.server.call_tool("kraddle_read_file", &json!({ "path": "src/domain/a.ts" }));
    assert!(result.is_error);
    assert!(result.text.contains("OPERATION_NOT_AUTHORIZED"));
}
