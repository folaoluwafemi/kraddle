//! The Phase R crown: Node and Rust interoperate on the same canonical
//! state. Node bootstraps and writes; Rust reads and refuses re-entry —
//! and the reverse. On-disk format identical (R8).

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::time::Duration;

struct TempDir(PathBuf);

impl TempDir {
    fn new(prefix: &str) -> Self {
        let path = std::env::temp_dir().join(format!("{}-{}", prefix, uuid_v4()));
        std::fs::create_dir_all(&path).expect("temp dir");
        TempDir(path)
    }
}

fn uuid_v4() -> String {
    // Without pulling extra crates: derive from the process + time + a
    // counter. Only uniqueness matters for the temp dir name.
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{}-{}", now, COUNTER.fetch_add(1, Ordering::SeqCst))
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("rust dir has a parent")
        .to_path_buf()
}

fn make_fixture_repo(parent: &Path) -> PathBuf {
    let repo = parent.join("repo");
    std::fs::create_dir_all(repo.join("src/domain")).unwrap();
    std::fs::create_dir_all(repo.join("src/ui")).unwrap();
    std::fs::write(repo.join("src/domain/a.ts"), "export const a = 1;\n").unwrap();
    std::fs::write(repo.join("src/ui/Button.tsx"), "import React from \"react\";\n").unwrap();
    let run = |args: &[&str]| {
        let status = Command::new("git").args(args).current_dir(&repo).status().unwrap();
        assert!(status.success(), "git {:?} failed", args);
    };
    run(&["init"]);
    run(&["config", "user.email", "diff@example.com"]);
    run(&["config", "user.name", "Differential"]);
    run(&["add", "src/domain/a.ts", "src/ui/Button.tsx"]);
    run(&["commit", "-m", "fixture"]);
    repo
}

fn run_capture(command: &mut Command) -> (i32, String, String) {
    let output = command.output().expect("command runs");
    (
        output.status.code().unwrap_or(-1),
        String::from_utf8_lossy(&output.stdout).to_string(),
        String::from_utf8_lossy(&output.stderr).to_string(),
    )
}

struct McpClient {
    child: Child,
    next_id: u64,
    pending: std::sync::mpsc::Receiver<(u64, Value)>,
}

impl McpClient {
    fn spawn(command: &mut Command) -> Self {
        let mut child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("server spawns");
        let stdout = child.stdout.take().expect("stdout piped");
        let (tx, rx) = channel::<(u64, Value)>();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                let Ok(line) = line else { break };
                if line.trim().is_empty() {
                    continue;
                }
                let Ok(message) = serde_json::from_str::<Value>(&line) else { continue };
                let id = message.get("id").and_then(|i| i.as_u64()).unwrap_or(0);
                if tx.send((id, message)).is_err() {
                    break;
                }
            }
        });
        McpClient { child, next_id: 1, pending: rx }
    }

    fn call(&mut self, method: &str, params: Value) -> Value {
        let id = self.next_id;
        self.next_id += 1;
        let request = json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });
        let mut stdin = self.child.stdin.take().expect("stdin piped");
        stdin.write_all(format!("{}\n", request).as_bytes()).expect("write request");
        stdin.flush().expect("flush request");
        self.child.stdin.replace(stdin);
        loop {
            match self.pending.recv_timeout(Duration::from_secs(30)) {
                Ok((response_id, message)) if response_id == id => return message,
                Ok(_) => continue,
                Err(RecvTimeoutError::Timeout) => panic!("timeout awaiting {}", method),
                Err(RecvTimeoutError::Disconnected) => panic!("server closed stdout awaiting {}", method),
            }
        }
    }
}

impl Drop for McpClient {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn parse_env(output: &str) -> std::collections::BTreeMap<String, String> {
    let mut env: std::collections::BTreeMap<String, String> = Default::default();
    for line in output.lines() {
        if let Some(rest) = line.strip_prefix("KRADDLE_") {
            if let Some((key, value)) = rest.split_once('=') {
                env.insert(format!("KRADDLE_{}", key), value.to_string());
            }
        }
    }
    env
}

/// One admitted write through whichever server binary `command` launches.
fn admitted_write_through_server(command: &mut Command, path: &str, content: &str) {
    let mut client = McpClient::spawn(command);
    let init = client.call(
        "initialize",
        json!({
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": { "name": "differential", "version": "0" },
        }),
    );
    assert_eq!(init["result"]["serverInfo"]["name"], json!("kraddle-agent-surface"));
    let written = client.call(
        "tools/call",
        json!({
            "name": "kraddle_write_file",
            "arguments": { "path": path, "content": content }
        }),
    );
    assert_eq!(
        written["result"]["isError"], json!(false),
        "{}",
        written["result"]["content"][0]["text"]
    );
}

#[test]
fn node_bootstraps_rust_reads_and_refuses_reentry() {
    let temp = TempDir::new("kraddle-diff-node");
    let repo = make_fixture_repo(&temp.0);
    let repo_str = repo.to_string_lossy().to_string();
    let cli_js = repo_root().join("archive").join("node-implementation").join("src").join("cli.js");

    // 1. Node bootstraps: init, rule add, episode start.
    let (code, output, stderr) = run_capture(Command::new("node").arg(&cli_js).args(["init", "--repo", &repo_str]));
    assert_eq!(code, 0, "{}{}", output, stderr);
    let (code, output, stderr) = run_capture(Command::new("node").arg(&cli_js).args([
        "rule", "add", "--repo", &repo_str,
        "--source", "src/domain", "--forbid", "src/ui",
        "--text", "domain must not import ui",
    ]));
    assert_eq!(code, 0, "{}{}", output, stderr);
    let binding_line = output.lines().find(|l| l.starts_with("binding ")).unwrap().to_string();
    let node_binding_id = binding_line["binding ".len()..].trim().to_string();
    let (code, output, stderr) = run_capture(Command::new("node").arg(&cli_js).args([
        "episode", "start", "--repo", &repo_str,
        "--task", "differential episode",
        "--write-prefix", "src/domain",
    ]));
    assert_eq!(code, 0, "{}{}", output, stderr);
    let env = parse_env(&output);

    // 2. One admitted write through the NODE server: the ledger Node
    //    writes is the thing Rust must read.
    let server_js = repo_root().join("archive").join("node-implementation").join("src").join("server.js");
    let mut node_server = Command::new("node");
    node_server.arg(&server_js);
    node_server
        .env("KRADDLE_REPO", &repo)
        .env("KRADDLE_WORKSPACE_DIR", &repo)
        .env("KRADDLE_EPISODE_ID", &env["KRADDLE_EPISODE_ID"])
        .env("KRADDLE_BASE_EVIDENCE_ID", &env["KRADDLE_BASE_EVIDENCE_ID"]);
    admitted_write_through_server(&mut node_server, "src/domain/service.ts", "export const service = () => 1;\n");

    // 3. Rust kraddle status on the Node-bootstrapped workspace.
    let (code, output, stderr) = run_capture(
        Command::new(env!("CARGO_BIN_EXE_kraddle")).arg("status").arg("--repo").arg(&repo),
    );
    assert_eq!(code, 0, "{}{}", output, stderr);
    let sorted: Vec<&str> = {
        let mut lines: Vec<&str> = output.lines().collect();
        lines.sort_unstable();
        lines
    };
    assert!(sorted.iter().any(|l| l.contains("trusted: true")), "{}", output);
    assert!(sorted.iter().any(|l| l.contains("domain must not import ui")), "{}", output);
    assert!(sorted.iter().any(|l| l.contains("admitted effects: 1")), "{}", output);

    // 4. Rust server startup on the SAME episode: the Node-written ledger
    //    forces the EPISODE_ALREADY_ACTIVE refusal.
    let rust_startup = kraddle::server::create_kraddle_server(&kraddle::server::ServerConfig {
        repo_dir: repo.clone(),
        workspace_dir: repo.clone(),
        episode_id: env["KRADDLE_EPISODE_ID"].clone(),
        base_evidence_id: env["KRADDLE_BASE_EVIDENCE_ID"].clone(),
    });
    let err = match rust_startup {
        Ok(_) => panic!("rust server must refuse the node-active episode"),
        Err(err) => err,
    };
    assert_eq!(err.code(), Some(kraddle::kernel::DenialCode::EpisodeAlreadyActive));
    assert_eq!(err.detail().get("admittedCount"), Some(&json!(1)));

    // 5. Segment-level: the .krd files Node wrote load in Rust with the
    //    identical record-id sets per collection.
    let workspace = kraddle::kernel::Workspace::new(&repo);
    let loaded = workspace.load().expect("rust loads node workspace");
    assert!(loaded.trusted);
    assert!(loaded.state.units.contains_key(&node_binding_id));
    assert!(loaded.state.units.contains_key(&env["KRADDLE_EPISODE_ID"]));
    assert!(loaded.state.evidence.contains_key(&env["KRADDLE_BASE_EVIDENCE_ID"]));
    let episode = loaded.state.units.get(&env["KRADDLE_EPISODE_ID"]).unwrap();
    let admitted = episode
        .field("admittedEffects")
        .and_then(|f| f.as_array())
        .cloned()
        .unwrap_or_default();
    assert_eq!(admitted.len(), 1, "the node-written ledger is read by rust");
    // And a rust-side transact on the same workspace survives a node reload
    // (covered by the reverse direction test below).
}

#[test]
fn rust_bootstraps_node_reads_and_refuses_reentry() {
    let temp = TempDir::new("kraddle-diff-rust");
    let repo = make_fixture_repo(&temp.0);
    let repo_str = repo.to_string_lossy().to_string();
    let cli_js = repo_root().join("archive").join("node-implementation").join("src").join("cli.js");
    let kraddle_bin = env!("CARGO_BIN_EXE_kraddle");

    // 1. Rust bootstraps: init, rule add, episode start.
    let (code, output, stderr) = run_capture(Command::new(kraddle_bin).arg("init").arg("--repo").arg(&repo));
    assert_eq!(code, 0, "{}{}", output, stderr);
    let (code, output, stderr) = run_capture(Command::new(kraddle_bin).args([
        "rule", "add", "--repo", &repo_str,
        "--source", "src/domain", "--forbid", "src/ui",
        "--text", "domain must not import ui",
    ]));
    assert_eq!(code, 0, "{}{}", output, stderr);
    let (code, output, stderr) = run_capture(Command::new(kraddle_bin).args([
        "episode", "start", "--repo", &repo_str,
        "--task", "differential episode",
        "--write-prefix", "src/domain",
    ]));
    assert_eq!(code, 0, "{}{}", output, stderr);
    let env = parse_env(&output);

    // 2. One admitted write through the RUST server: the ledger Rust
    //    writes is the thing Node must read.
    let mut rust_server = Command::new(env!("CARGO_BIN_EXE_kraddle-mcp-server"));
    rust_server
        .env("KRADDLE_REPO", &repo)
        .env("KRADDLE_WORKSPACE_DIR", &repo)
        .env("KRADDLE_EPISODE_ID", &env["KRADDLE_EPISODE_ID"])
        .env("KRADDLE_BASE_EVIDENCE_ID", &env["KRADDLE_BASE_EVIDENCE_ID"]);
    admitted_write_through_server(&mut rust_server, "src/domain/service.ts", "export const service = () => 1;\n");

    // 3. Node status loads the Rust-bootstrapped workspace.
    let (code, output, stderr) = run_capture(Command::new("node").arg(&cli_js).arg("status").arg("--repo").arg(&repo));
    assert_eq!(code, 0, "{}{}", output, stderr);
    let sorted: Vec<&str> = {
        let mut lines: Vec<&str> = output.lines().collect();
        lines.sort_unstable();
        lines
    };
    assert!(sorted.iter().any(|l| l.contains("trusted: true")), "{}", output);
    assert!(sorted.iter().any(|l| l.contains("domain must not import ui")), "{}", output);
    assert!(sorted.iter().any(|l| l.contains("admitted effects: 1")), "{}", output);

    // 4. Node server startup on the SAME episode: the Rust-written ledger
    //    forces the identical refusal.
    let (code, _stdout, stderr) = run_capture(
        Command::new("node")
            .arg(repo_root().join("archive").join("node-implementation").join("src").join("server.js"))
            .env("KRADDLE_REPO", &repo)
            .env("KRADDLE_WORKSPACE_DIR", &repo)
            .env("KRADDLE_EPISODE_ID", &env["KRADDLE_EPISODE_ID"])
            .env("KRADDLE_BASE_EVIDENCE_ID", &env["KRADDLE_BASE_EVIDENCE_ID"]),
    );
    assert_ne!(code, 0, "node server must refuse the rust-active episode");
    assert!(stderr.contains("EPISODE_ALREADY_ACTIVE"), "{}", stderr);
}
