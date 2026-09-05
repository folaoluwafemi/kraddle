//! Port of test/e2e.test.js — the agent surface over the real protocol,
//! spawning the server binary (D8).

mod common;

use common::server_bootstrap;
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
    fn spawn(repo_dir: &std::path::Path, ws_dir: &std::path::Path) -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_kraddle-mcp-server"))
            .env("KRADDLE_REPO", repo_dir)
            .env("KRADDLE_WORKSPACE_DIR", ws_dir)
            .env("KRADDLE_EPISODE_ID", "EP1")
            .env("KRADDLE_BASE_EVIDENCE_ID", "EV-BASE")
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
        let request = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
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

fn tool_call(client: &mut McpClient, name: &str, arguments: Value) -> Value {
    client.call("tools/call", json!({ "name": name, "arguments": arguments }))
}

#[test]
fn the_agent_surface_two_block_scenario() {
    let fixture = server_bootstrap(&[], false);
    let mut client = McpClient::spawn(&fixture.repo_dir, &fixture.ws_dir);

    let init = client.call(
        "initialize",
        json!({
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": { "name": "e2e-test", "version": "0" },
        }),
    );
    assert_eq!(init["result"]["protocolVersion"], json!("2025-06-18"));
    assert_eq!(init["result"]["serverInfo"]["name"], json!("kraddle-agent-surface"));

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
            "tool names must not contain {}",
            forbidden
        );
    }

    let read = tool_call(&mut client, "kraddle_read_file", json!({ "path": "src/domain/a.ts" }));
    assert_eq!(read["result"]["isError"], json!(false));
    assert_eq!(read["result"]["content"][0]["text"], json!("export const a = 1;\n"));

    let denied = tool_call(
        &mut client,
        "kraddle_write_file",
        json!({
            "path": "src/domain/service.ts",
            "content": "import { Button } from \"../ui/Button\";\nexport const service = Button;\n",
        }),
    );
    assert_eq!(denied["result"]["isError"], json!(true));
    let text = denied["result"]["content"][0]["text"].as_str().unwrap();
    assert!(text.contains("PREFLIGHT_VIOLATED"), "{}", text);
    assert!(text.contains("domain must not import ui"), "{}", text);
    assert!(!fixture.repo_dir.join("src/domain/service.ts").exists());

    let written = tool_call(
        &mut client,
        "kraddle_write_file",
        json!({ "path": "src/domain/service.ts", "content": "export const service = () => 1;\n" }),
    );
    assert_eq!(written["result"]["isError"], json!(false), "{}", written);
    assert!(fixture.repo_dir.join("src/domain/service.ts").exists());

    let closed = tool_call(&mut client, "kraddle_close_episode", json!({}));
    assert_eq!(closed["result"]["isError"], json!(false));
}

#[test]
fn bypass_is_caught_at_closure() {
    let fixture = server_bootstrap(&[], false);
    let mut client = McpClient::spawn(&fixture.repo_dir, &fixture.ws_dir);

    let written = tool_call(
        &mut client,
        "kraddle_write_file",
        json!({ "path": "src/domain/service.ts", "content": "export const service = () => 1;\n" }),
    );
    assert_eq!(written["result"]["isError"], json!(false));

    std::fs::write(
        fixture.repo_dir.join("src/domain/rogue.ts"),
        "export const rogue = 1;\n",
    )
    .unwrap();

    let closed = tool_call(&mut client, "kraddle_close_episode", json!({}));
    assert_eq!(closed["result"]["isError"], json!(true));
    let text = closed["result"]["content"][0]["text"].as_str().unwrap();
    assert!(text.contains("UNCONTROLLED_EFFECT"), "{}", text);
    assert!(text.contains("src/domain/rogue.ts"), "{}", text);
}
