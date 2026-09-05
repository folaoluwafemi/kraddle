//! Port of test/cli.test.js — the human channel.

mod common;

use common::TempDir;
use kraddle::cli::run_cli;
use kraddle::kernel::Workspace;
use kraddle::server::{create_kraddle_server, ServerConfig};
use serde_json::json;
use std::process::Command;

fn temp_repo() -> (TempDir, String) {
    let temp = TempDir::new("kraddle-cli");
    let root = temp.path().to_string_lossy().to_string();
    std::fs::create_dir_all(temp.path().join("src/domain")).unwrap();
    std::fs::create_dir_all(temp.path().join("src/ui")).unwrap();
    std::fs::write(temp.path().join("src/domain/a.ts"), "export const a = 1;\n").unwrap();
    std::fs::write(temp.path().join("src/ui/Button.tsx"), "import React from \"react\";\n").unwrap();
    let run = |args: &[&str]| {
        let status = Command::new("git").args(args).current_dir(&root).status().unwrap();
        assert!(status.success(), "git {:?} failed", args);
    };
    run(&["init"]);
    run(&["config", "user.email", "test@example.com"]);
    run(&["config", "user.name", "Test"]);
    run(&["add", "src/domain/a.ts", "src/ui/Button.tsx"]);
    run(&["commit", "-m", "init"]);
    (temp, root)
}

fn argv(items: &[&str]) -> Vec<String> {
    items.iter().map(|item| item.to_string()).collect()
}

fn line_value(output: &str, prefix: &str) -> String {
    output
        .lines()
        .find(|line| line.starts_with(prefix))
        .map(|line| line[prefix.len()..].trim().to_string())
        .unwrap_or_else(|| panic!("output names {}: {}", prefix, output))
}

#[test]
fn init_creates_a_workspace_and_reports_its_path() {
    let (temp, root) = temp_repo();
    let result = run_cli(&argv(&["init", "--repo", &root]), None);
    assert_eq!(result.code, 0);
    assert!(result.output.contains(".kraddle"), "{}", result.output);
    assert!(temp.path().join(".kraddle/manifest.krd").exists());
    assert!(result.output.contains("governs"));
}

#[test]
fn init_twice_is_refused_with_workspace_exists() {
    let (temp, root) = temp_repo();
    let first = run_cli(&argv(&["init", "--repo", &root]), None);
    assert_eq!(first.code, 0);
    let second = run_cli(&argv(&["init", "--repo", &root]), None);
    assert_eq!(second.code, 1);
    assert!(second.output.contains("WORKSPACE_EXISTS"));
    assert!(!second.output.contains("    at "), "no stack frames in CLI failure output");
    let _ = temp;
}

#[test]
fn rule_add_declares_a_governing_rule_pinned_to_head_and_scoped() {
    let (temp, root) = temp_repo();
    run_cli(&argv(&["init", "--repo", &root]), None);
    let result = run_cli(
        &argv(&[
            "rule", "add", "--repo", &root,
            "--source", "src/domain", "--forbid", "src/ui",
            "--text", "domain must not import ui",
        ]),
        None,
    );
    assert_eq!(result.code, 0, "{}", result.output);
    let binding_id = line_value(&result.output, "binding");
    let evidence_id = line_value(&result.output, "evidence");
    assert!(result.output.contains("rev"), "{}", result.output);

    let store = Workspace::new(&root);
    let loaded = store.load().unwrap();
    let summary = kraddle::kernel::validate_profile(&loaded.state, &binding_id).unwrap();
    assert_eq!(summary.get("kind"), Some(&json!("control_binding")));
    let evidence = loaded.state.evidence.get(&evidence_id).unwrap();
    let head = Command::new("git")
        .args(["-C", &root, "rev-parse", "HEAD"])
        .output()
        .unwrap();
    let expected = String::from_utf8_lossy(&head.stdout).trim().to_string();
    assert_eq!(
        evidence.field("stateRef").and_then(|r| r.get("revision")),
        Some(&json!(expected))
    );
    let files = kraddle::repo::read_repo_files(temp.path()).unwrap().files;
    let edges = kraddle::extract::extract_dependencies(&files).edges;
    let scoped: Vec<&serde_json::Value> = edges
        .iter()
        .filter(|edge| {
            edge.get("from")
                .and_then(|f| f.as_str())
                .map(|from| from.starts_with("src/domain/"))
                .unwrap_or(false)
        })
        .collect();
    let stored_edges = evidence
        .field("edges")
        .and_then(|e| e.as_array())
        .cloned()
        .unwrap_or_default();
    assert_eq!(stored_edges.len(), scoped.len());
    assert_eq!(
        evidence.field("extractionScope"),
        Some(&json!({ "fromPrefixes": ["src/domain/"] }))
    );
    let governed = loaded
        .state
        .commitments
        .values()
        .find(|commitment| commitment.str_field("value") == Some("domain must not import ui"))
        .cloned()
        .unwrap();
    assert_eq!(governed.field("forbiddenPathPrefixes"), Some(&json!(["src/ui/"])));
    let evaluator = loaded
        .state
        .units
        .values()
        .find(|unit| unit.kind == "evaluator" && unit.str_field("evaluatorType") == Some("architecture_rule"))
        .cloned()
        .unwrap();
    assert_eq!(
        evaluator.field("params").and_then(|p| p.get("sourcePrefix")),
        Some(&json!("src/domain/"))
    );
    assert_eq!(
        evaluator.field("params").and_then(|p| p.get("forbiddenPrefixes")),
        Some(&json!(["src/ui/"]))
    );
}

#[test]
fn rule_add_refuses_an_unsatisfiable_rule() {
    let (_temp, root) = temp_repo();
    run_cli(&argv(&["init", "--repo", &root]), None);
    let result = run_cli(
        &argv(&[
            "rule", "add", "--repo", &root,
            "--source", "src", "--forbid", "src",
            "--text", "src must not import src",
        ]),
        None,
    );
    assert_eq!(result.code, 1);
    assert!(result.output.contains("unsatisfiable"), "{}", result.output);
    assert!(!result.output.contains("    at "));
}

#[test]
fn rule_add_requires_text() {
    let (_temp, root) = temp_repo();
    run_cli(&argv(&["init", "--repo", &root]), None);
    let result = run_cli(
        &argv(&["rule", "add", "--repo", &root, "--source", "src/domain", "--forbid", "src/ui"]),
        None,
    );
    assert_eq!(result.code, 1);
    assert!(result.output.contains("usage"), "{}", result.output);
    assert!(!result.output.contains("    at "));
}

#[test]
fn episode_start_prints_env_vars_the_server_can_boot_from() {
    let (temp, root) = temp_repo();
    run_cli(&argv(&["init", "--repo", &root]), None);
    run_cli(
        &argv(&[
            "rule", "add", "--repo", &root,
            "--source", "src/domain", "--forbid", "src/ui",
            "--text", "domain must not import ui",
        ]),
        None,
    );
    let result = run_cli(
        &argv(&[
            "episode", "start", "--repo", &root,
            "--task", "add a domain service",
            "--write-prefix", "src/domain",
        ]),
        None,
    );
    assert_eq!(result.code, 0, "{}", result.output);

    let mut env: std::collections::BTreeMap<String, String> = Default::default();
    for line in result.output.lines() {
        if let Some(rest) = line.strip_prefix("KRADDLE_") {
            if let Some((key, value)) = rest.split_once('=') {
                env.insert(format!("KRADDLE_{}", key), value.to_string());
            }
        }
    }
    assert_eq!(env.get("KRADDLE_REPO").map(String::as_str), Some(root.as_str()));
    assert!(env.contains_key("KRADDLE_WORKSPACE_DIR"));
    assert!(env.contains_key("KRADDLE_EPISODE_ID"));
    assert!(env.contains_key("KRADDLE_BASE_EVIDENCE_ID"));

    let server = create_kraddle_server(&ServerConfig {
        repo_dir: temp.path().to_path_buf(),
        workspace_dir: temp.path().to_path_buf(),
        episode_id: env["KRADDLE_EPISODE_ID"].clone(),
        base_evidence_id: env["KRADDLE_BASE_EVIDENCE_ID"].clone(),
    })
    .expect("server boots from CLI output");
    let names: Vec<&str> = server.mcp.tools_iter().map(|tool| tool.name.as_str()).collect();
    assert_eq!(names.len(), 3);
}

#[test]
fn episode_start_requires_write_prefix() {
    let (_temp, root) = temp_repo();
    run_cli(&argv(&["init", "--repo", &root]), None);
    run_cli(
        &argv(&[
            "rule", "add", "--repo", &root,
            "--source", "src/domain", "--forbid", "src/ui",
            "--text", "domain must not import ui",
        ]),
        None,
    );
    let result = run_cli(
        &argv(&["episode", "start", "--repo", &root, "--task", "add a domain service"]),
        None,
    );
    assert_eq!(result.code, 1);
    assert!(result.output.contains("usage"), "{}", result.output);
    assert!(!result.output.contains("    at "));
}

fn bootstrapped_repo() -> (TempDir, String, String) {
    let (temp, root) = temp_repo();
    run_cli(&argv(&["init", "--repo", &root]), None);
    run_cli(
        &argv(&[
            "rule", "add", "--repo", &root,
            "--source", "src/domain", "--forbid", "src/ui",
            "--text", "domain must not import ui",
        ]),
        None,
    );
    let started = run_cli(
        &argv(&[
            "episode", "start", "--repo", &root,
            "--task", "add a domain service",
            "--write-prefix", "src/domain",
        ]),
        None,
    );
    assert_eq!(started.code, 0, "{}", started.output);
    let episode_id = line_value(&started.output, "KRADDLE_EPISODE_ID=");
    (temp, root, episode_id)
}

#[test]
fn status_names_rules_and_episodes() {
    let (_temp, root, episode_id) = bootstrapped_repo();
    let result = run_cli(&argv(&["status", "--repo", &root]), None);
    assert_eq!(result.code, 0, "{}", result.output);
    assert!(result.output.contains("trusted"), "{}", result.output);
    assert!(result.output.contains("domain must not import ui"), "{}", result.output);
    assert!(result.output.contains(&episode_id), "{}", result.output);
    assert!(result.output.contains("authorized"), "{}", result.output);
}

#[test]
fn abort_sets_the_episode_lifecycle_to_aborted() {
    let (_temp, root, episode_id) = bootstrapped_repo();
    let result = run_cli(&argv(&["episode", "abort", &episode_id, "--repo", &root]), None);
    assert_eq!(result.code, 0, "{}", result.output);
    let store = Workspace::new(&root);
    let loaded = store.load().unwrap();
    assert_eq!(
        loaded.state.units.get(&episode_id).map(|episode| episode.str_field("lifecycle")),
        Some(Some("aborted"))
    );

    let unknown = run_cli(&argv(&["episode", "abort", "EP-doesnotexist", "--repo", &root]), None);
    assert_eq!(unknown.code, 1);
    assert!(!unknown.output.contains("    at "));
}
