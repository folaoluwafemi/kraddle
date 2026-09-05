//! Port of src/repo.js â€” repository source discovery and git state capture.

use crate::extract::SOURCE_EXTENSIONS;
use crate::kernel::{DenialCode, KraddleError};
use serde_json::json;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::Command;

pub const IGNORED_DIRS: [&str; 6] = ["node_modules", ".git", ".kraddle", "dist", "build", "coverage"];

pub struct WalkResult {
    pub files: BTreeMap<String, String>,
    pub skipped: Vec<serde_json::Value>,
}

/// Node's extensionOf: /\.[^.]+$/ â€” the final dot and everything after it,
/// provided something follows the dot.
fn extension_of(name: &str) -> String {
    match name.rfind('.') {
        Some(index) if index + 1 < name.len() => name[index..].to_string(),
        _ => String::new(),
    }
}

fn walk_files(
    root_dir: &Path,
    max_files: usize,
    max_bytes: u64,
    include_file: &dyn Fn(&str) -> bool,
) -> Result<WalkResult, KraddleError> {
    let mut files: BTreeMap<String, String> = BTreeMap::new();
    let mut skipped: Vec<serde_json::Value> = Vec::new();

    fn walk(
        dir: &Path,
        relative_prefix: &str,
        files: &mut BTreeMap<String, String>,
        skipped: &mut Vec<serde_json::Value>,
        max_files: usize,
        max_bytes: u64,
        include_file: &dyn Fn(&str) -> bool,
    ) -> Result<(), KraddleError> {
        let mut entries: Vec<(String, PathBuf, bool, bool)> = Vec::new();
        let read = match std::fs::read_dir(dir) {
            Ok(read) => read,
            Err(_) => return Ok(()),
        };
        for entry in read {
            let Ok(entry) = entry else { continue };
            let name = entry.file_name().to_string_lossy().to_string();
            let file_type = entry
                .file_type()
                .map(|t| (t.is_dir(), t.is_file()))
                .unwrap_or((false, false));
            entries.push((name, entry.path(), file_type.0, file_type.1));
        }
        entries.sort_by(|a, b| a.0.cmp(&b.0));
        for (name, path, is_dir, is_file) in entries {
            let relative = if relative_prefix.is_empty() {
                name.clone()
            } else {
                format!("{}/{}", relative_prefix, name)
            };
            if is_dir {
                if IGNORED_DIRS.contains(&name.as_str()) || name.starts_with('.') {
                    continue;
                }
                walk(&path, &relative, files, skipped, max_files, max_bytes, include_file)?;
            } else if is_file {
                if name.starts_with('.') {
                    continue;
                }
                if !include_file(&name) {
                    continue;
                }
                if files.len() >= max_files {
                    // Node throws a plain Error here â€” an explicit truncation
                    // signal, never a silent cut.
                    return Err(KraddleError::Io(std::io::Error::other(format!(
                        "readRepoFiles: maxFiles ({}) exceeded at {}",
                        max_files, relative
                    ))));
                }
                let info = match std::fs::metadata(&path) {
                    Ok(info) => info,
                    Err(_) => continue,
                };
                if info.len() > max_bytes {
                    skipped.push(json!({ "path": relative, "reason": "too_large" }));
                    continue;
                }
                match std::fs::read_to_string(&path) {
                    Ok(content) => {
                        files.insert(relative, content);
                    }
                    Err(_) => continue,
                }
            }
        }
        Ok(())
    }

    walk(root_dir, "", &mut files, &mut skipped, max_files, max_bytes, include_file)?;
    Ok(WalkResult { files, skipped })
}

/// Port of readRepoFiles: source files only, POSIX keys.
pub fn read_repo_files(root_dir: &Path) -> Result<WalkResult, KraddleError> {
    read_repo_files_with(root_dir, 5000, 1_000_000)
}

pub fn read_repo_files_with(root_dir: &Path, max_files: usize, max_bytes: u64) -> Result<WalkResult, KraddleError> {
    let extension_set: std::collections::BTreeSet<String> =
        SOURCE_EXTENSIONS.iter().map(|e| e.to_string()).collect();
    let predicate = move |name: &str| extension_set.contains(&extension_of(name));
    walk_files(root_dir, max_files, max_bytes, &predicate)
}

/// Port of readWorktreeFiles: every non-ignored file regardless of extension.
pub fn read_worktree_files(root_dir: &Path) -> Result<WalkResult, KraddleError> {
    read_worktree_files_with(root_dir, 20000, 5_000_000)
}

pub fn read_worktree_files_with(root_dir: &Path, max_files: usize, max_bytes: u64) -> Result<WalkResult, KraddleError> {
    let predicate = |_: &str| true;
    walk_files(root_dir, max_files, max_bytes, &predicate)
}

pub struct GitState {
    pub repository: String,
    pub revision: String,
}

/// Port of gitStateRef: git via std::process::Command with fixed argv (R9).
pub fn git_state_ref(repo_dir: &Path) -> Result<GitState, KraddleError> {
    let unavailable = || KraddleError::control(DenialCode::EnvelopeInvalid, json!({ "reason": "git_unavailable" }));
    let run = |args: &[&str]| -> Result<String, ()> {
        let output = Command::new("git").args(args).output().map_err(|_| ())?;
        if !output.status.success() {
            return Err(());
        }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    };
    let dir = repo_dir.to_string_lossy().to_string();
    let revision = run(&["-C", &dir, "rev-parse", "HEAD"]).map_err(|_| unavailable())?;
    let toplevel = run(&["-C", &dir, "rev-parse", "--show-toplevel"]).map_err(|_| unavailable())?;
    if revision.is_empty() || toplevel.is_empty() {
        return Err(unavailable());
    }
    let repository = Path::new(&toplevel)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    Ok(GitState { repository, revision })
}
