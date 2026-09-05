//! Port of test/repo.test.js — source discovery, worktree observation,
//! git state capture.

mod common;

use common::TempDir;
use kraddle::repo::{
    git_state_ref, read_repo_files, read_repo_files_with, read_worktree_files, IGNORED_DIRS,
};
use std::process::Command;

fn run_git(dir: &std::path::Path, args: &[&str]) {
    let status = Command::new("git").args(args).current_dir(dir).status().expect("git runs");
    assert!(status.success(), "git {:?} failed", args);
}

#[test]
fn reads_only_source_files_with_posix_keys_skipping_ignored_and_dot_dirs() {
    let temp = TempDir::new("kraddle-repo");
    let root = temp.path();
    for dir in ["src/domain", "src/ui", "node_modules", ".git", "dist", ".cache"] {
        std::fs::create_dir_all(root.join(dir)).unwrap();
    }
    std::fs::write(root.join("src/domain/a.ts"), "export const a = 1;\n").unwrap();
    std::fs::write(root.join("src/ui/b.tsx"), "export const b = 2;\n").unwrap();
    std::fs::write(root.join("node_modules/x.js"), "module.exports = 1;\n").unwrap();
    std::fs::write(root.join(".git/config"), "[core]\n").unwrap();
    std::fs::write(root.join("dist/out.js"), "export const out = 1;\n").unwrap();
    std::fs::write(root.join(".cache/y.ts"), "export const y = 1;\n").unwrap();
    let result = read_repo_files(root).expect("walk");
    let keys: Vec<&String> = result.files.keys().collect();
    assert_eq!(keys, vec!["src/domain/a.ts", "src/ui/b.tsx"]);
    assert!(result.skipped.is_empty());
}

#[test]
fn exceeding_maxfiles_throws_an_explicit_truncation_signal() {
    let temp = TempDir::new("kraddle-repo");
    let root = temp.path();
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("src/a.ts"), "export const a = 1;\n").unwrap();
    std::fs::write(root.join("src/b.ts"), "export const b = 2;\n").unwrap();
    let result = read_repo_files_with(root, 1, 1_000_000);
    assert!(result.is_err());
}

#[test]
fn an_oversized_file_is_skipped_and_reported() {
    let temp = TempDir::new("kraddle-repo");
    let root = temp.path();
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("src/small.ts"), "export const a = 1;").unwrap();
    std::fs::write(root.join("src/large.ts"), "x".repeat(64)).unwrap();
    let result = read_repo_files_with(root, 5000, 20).expect("walk");
    let keys: Vec<&String> = result.files.keys().collect();
    assert_eq!(keys, vec!["src/small.ts"]);
    assert_eq!(
        serde_json::to_value(&result.skipped).unwrap(),
        serde_json::json!([{ "path": "src/large.ts", "reason": "too_large" }])
    );
}

#[test]
fn an_empty_directory_yields_an_empty_map_without_throwing() {
    let temp = TempDir::new("kraddle-repo");
    let result = read_repo_files(temp.path()).expect("walk");
    assert!(result.files.is_empty());
    assert!(result.skipped.is_empty());
}

#[test]
fn ignored_dirs_contains_the_phase_1_ignore_set() {
    assert_eq!(
        IGNORED_DIRS,
        ["node_modules", ".git", ".kraddle", "dist", "build", "coverage"]
    );
}

#[test]
fn gitstateref_pins_the_committed_head_sha_and_repo_basename() {
    let temp = TempDir::new("kraddle-repo");
    let root = temp.path();
    std::fs::write(root.join("a.ts"), "export const a = 1;\n").unwrap();
    run_git(root, &["init"]);
    run_git(root, &["config", "user.email", "test@example.com"]);
    run_git(root, &["config", "user.name", "Test"]);
    run_git(root, &["add", "a.ts"]);
    run_git(root, &["commit", "-m", "init"]);
    let output = Command::new("git")
        .args(["-C", root.to_string_lossy().as_ref(), "rev-parse", "HEAD"])
        .output()
        .unwrap();
    let expected = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let top = Command::new("git")
        .args(["-C", root.to_string_lossy().as_ref(), "rev-parse", "--show-toplevel"])
        .output()
        .unwrap();
    let toplevel = String::from_utf8_lossy(&top.stdout).trim().to_string();
    let state = git_state_ref(root).expect("git state");
    assert_eq!(state.revision, expected);
    let basename = toplevel.split(['\\', '/']).next_back().unwrap();
    assert_eq!(state.repository, basename);
}

#[test]
fn gitstateref_throws_git_unavailable_outside_a_repository() {
    let temp = TempDir::new("kraddle-repo");
    let result = git_state_ref(temp.path());
    let err = common::expect_control(result, kraddle::kernel::DenialCode::EnvelopeInvalid);
    assert_eq!(err.detail().get("reason"), Some(&serde_json::json!("git_unavailable")));
}

#[test]
fn a_dirty_working_tree_still_pins_the_committed_sha() {
    let temp = TempDir::new("kraddle-repo");
    let root = temp.path();
    std::fs::write(root.join("a.ts"), "export const a = 1;\n").unwrap();
    run_git(root, &["init"]);
    run_git(root, &["config", "user.email", "test@example.com"]);
    run_git(root, &["config", "user.name", "Test"]);
    run_git(root, &["add", "a.ts"]);
    run_git(root, &["commit", "-m", "init"]);
    let output = Command::new("git")
        .args(["-C", root.to_string_lossy().as_ref(), "rev-parse", "HEAD"])
        .output()
        .unwrap();
    let committed = String::from_utf8_lossy(&output.stdout).trim().to_string();

    std::fs::write(root.join("a.ts"), "export const a = 2;\n").unwrap();
    std::fs::write(root.join("b.ts"), "export const b = 1;\n").unwrap();

    let state = git_state_ref(root).expect("git state");
    assert_eq!(state.revision, committed);
    let files = read_repo_files(root).expect("walk");
    assert_eq!(files.files.get("b.ts").map(String::as_str), Some("export const b = 1;\n"));
    let digest = kraddle::extract::compute_file_map_digest(&files.files);
    assert_eq!(digest.len(), 64);
}

#[test]
fn readworktreefiles_observes_every_non_ignored_file_regardless_of_extension() {
    let temp = TempDir::new("kraddle-repo");
    let root = temp.path();
    for dir in ["src", "node_modules"] {
        std::fs::create_dir_all(root.join(dir)).unwrap();
    }
    std::fs::write(root.join("src/a.ts"), "export const a = 1;\n").unwrap();
    std::fs::write(root.join("package.json"), "{\n  \"name\": \"x\"\n}\n").unwrap();
    std::fs::write(root.join("README.md"), "# readme\n").unwrap();
    std::fs::write(root.join(".gitignore"), "node_modules\n").unwrap();
    std::fs::write(root.join("node_modules/x.js"), "module.exports = 1;\n").unwrap();
    let result = read_worktree_files(root).expect("walk");
    let keys: Vec<&String> = result.files.keys().collect();
    assert_eq!(keys, vec!["README.md", "package.json", "src/a.ts"]);
    assert!(result.skipped.is_empty());
}

#[test]
fn the_source_filtered_map_is_a_strict_subset_of_the_worktree_map() {
    let temp = TempDir::new("kraddle-repo");
    let root = temp.path();
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("src/a.ts"), "export const a = 1;\n").unwrap();
    std::fs::write(root.join("package.json"), "{\n  \"name\": \"x\"\n}\n").unwrap();
    std::fs::write(root.join("README.md"), "# readme\n").unwrap();
    let source = read_repo_files(root).expect("source walk");
    let worktree = read_worktree_files(root).expect("worktree walk");
    for (path, content) in &source.files {
        assert_eq!(worktree.files.get(path), Some(content));
    }
    assert!(worktree.files.len() > source.files.len());
}
