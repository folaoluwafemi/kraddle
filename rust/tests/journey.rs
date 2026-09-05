//! Port of test/journey.test.js — the second-engineer path: bootstrap
//! through the CLI, launch the agent surface, get denied with the rule
//! named, close clean. The Phase 4 acceptance test as code.

mod common;

use common::TempDir;
use kraddle::cli::run_cli;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::time::Duration;

struct McpClient {
    child: Child,
    next_id: u64,
    pending: std::sync::mpsc::Receiver<(u64, Value)>,
}

impl McpClient {
    fn spawn(repo_dir: &std::path::Path, ws_dir: &std::path::Path, episode_id: &str, evidence_id: &str) -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_kraddle-mcp-server"))
            .env("KRADDLE_REPO", repo_dir)
            .env("KRADDLE_WORKSPACE_DIR", ws_dir)
            .env("KRADDLE_EPISODE_ID", episode_id)
            .env("KRADDLE_BASE_EVIDENCE_ID", evidence_id)
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
            match self.pending.recv_timeout(Duration::from_secs(20)) {
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

#[test]
fn the_second_engineer_journey_declare_launch_get_denied_close() {
    // A real repository the engineer owns.
    let temp = TempDir::new("kraddle-journey");
    let repo_dir = temp.path().to_path_buf();
    std::fs::create_dir_all(repo_dir.join("src/domain")).unwrap();
    std::fs::create_dir_all(repo_dir.join("src/ui")).unwrap();
    std::fs::write(repo_dir.join("src/domain/a.ts"), "export const a = 1;\n").unwrap();
    std::fs::write(repo_dir.join("src/ui/Button.tsx"), "import React from \"react\";\n").unwrap();
    let repo = repo_dir.to_string_lossy().to_string();
    let run_git = |args: &[&str]| {
        let status = Command::new("git").args(args).current_dir(&repo_dir).status().unwrap();
        assert!(status.success(), "git {:?} failed", args);
    };
    run_git(&["init"]);
    run_git(&["config", "user.email", "eng@example.com"]);
    run_git(&["config", "user.name", "Second Engineer"]);
    run_git(&["add", "src/domain/a.ts", "src/ui/Button.tsx"]);
    run_git(&["commit", "-m", "existing code"]);

    // Bootstrap through the CLI only.
    let argv = |items: &[&str]| -> Vec<String> { items.iter().map(|s| s.to_string()).collect() };
    let init = run_cli(&argv(&["init", "--repo", &repo]), None);
    assert_eq!(init.code, 0, "{}", init.output);
    let rule = run_cli(
        &argv(&[
            "rule", "add", "--repo", &repo,
            "--source", "src/domain", "--forbid", "src/ui",
            "--text", "domain must not import ui",
        ]),
        None,
    );
    assert_eq!(rule.code, 0, "{}", rule.output);
    let started = run_cli(
        &argv(&[
            "episode", "start", "--repo", &repo,
            "--task", "add a small domain service",
            "--write-prefix", "src/domain",
        ]),
        None,
    );
    assert_eq!(started.code, 0, "{}", started.output);

    // Launch the agent surface from the printed values.
    let mut env: std::collections::BTreeMap<String, String> = Default::default();
    for line in started.output.lines() {
        if let Some(rest) = line.strip_prefix("KRADDLE_") {
            if let Some((key, value)) = rest.split_once('=') {
                env.insert(format!("KRADDLE_{}", key), value.to_string());
            }
        }
    }
    assert!(env.contains_key("KRADDLE_REPO"));
    assert!(env.contains_key("KRADDLE_WORKSPACE_DIR"));
    assert!(env.contains_key("KRADDLE_EPISODE_ID"));
    assert!(env.contains_key("KRADDLE_BASE_EVIDENCE_ID"));

    let mut client = McpClient::spawn(
        &repo_dir,
        &repo_dir,
        &env["KRADDLE_EPISODE_ID"],
        &env["KRADDLE_BASE_EVIDENCE_ID"],
    );

    let init_response = client.call(
        "initialize",
        json!({
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": { "name": "journey", "version": "0" },
        }),
    );
    assert_eq!(init_response["result"]["serverInfo"]["name"], json!("kraddle-agent-surface"));

    let tools_list = client.call("tools/list", json!({}));
    let names: Vec<&str> = tools_list["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|tool| tool["name"].as_str().unwrap())
        .collect();
    let mut sorted = names.clone();
    sorted.sort();
    assert_eq!(
        sorted,
        vec!["kraddle_close_episode", "kraddle_read_file", "kraddle_write_file"]
    );
    for forbidden in ["update", "create", "delete", "transact", "grant", "cli"] {
        assert!(
            !names.iter().any(|name| name.contains(forbidden)),
            "tool names must not contain {} (G18)",
            forbidden
        );
    }

    let read = client.call(
        "tools/call",
        json!({ "name": "kraddle_read_file", "arguments": { "path": "src/domain/a.ts" } }),
    );
    assert_eq!(read["result"]["isError"], json!(false));

    let denied = client.call(
        "tools/call",
        json!({
            "name": "kraddle_write_file",
            "arguments": {
                "path": "src/domain/service.ts",
                "content": "import { Button } from \"../ui/Button\";\nexport const service = Button;\n",
            }
        }),
    );
    assert_eq!(denied["result"]["isError"], json!(true));
    let denial_text = denied["result"]["content"][0]["text"].as_str().unwrap();
    assert!(denial_text.contains("PREFLIGHT_VIOLATED"), "{}", denial_text);
    assert!(denial_text.contains("domain must not import ui"), "{}", denial_text);
    assert!(!repo_dir.join("src/domain/service.ts").exists());

    let written = client.call(
        "tools/call",
        json!({
            "name": "kraddle_write_file",
            "arguments": { "path": "src/domain/service.ts", "content": "export const service = () => 1;\n" }
        }),
    );
    assert_eq!(written["result"]["isError"], json!(false), "{}", written);
    assert!(repo_dir.join("src/domain/service.ts").exists());

    let closed = client.call("tools/call", json!({ "name": "kraddle_close_episode", "arguments": {} }));
    assert_eq!(closed["result"]["isError"], json!(false), "{}", closed);
}
