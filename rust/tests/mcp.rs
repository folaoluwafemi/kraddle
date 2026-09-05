//! Port of test/mcp.test.js — the MCP stdio protocol layer, exact shapes.

use kraddle::mcp::{McpServer, Tool, ToolResult};
use serde_json::{json, Value};

fn stub_tools() -> Vec<Tool> {
    let one: kraddle::mcp::ToolHandler = std::sync::Arc::new(|_args| ToolResult::ok("one"));
    let two: kraddle::mcp::ToolHandler = std::sync::Arc::new(|_args| ToolResult::ok("two"));
    vec![
        Tool {
            name: "stub_one".into(),
            description: "first stub".into(),
            input_schema: json!({ "type": "object" }),
            handler: one,
        },
        Tool {
            name: "stub_two".into(),
            description: "second stub".into(),
            input_schema: json!({ "type": "object" }),
            handler: two,
        },
    ]
}

fn make_server() -> McpServer {
    McpServer::new(
        stub_tools(),
        json!({ "name": "kraddle-agent-surface", "version": "0.1.0" }),
    )
}

fn initialize_request(id: Value) -> String {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": { "name": "x", "version": "0" },
        }
    })
    .to_string()
}

#[test]
fn initialize_handshake_returns_the_exact_result_shape() {
    let server = make_server();
    let response = server.handle_message(&initialize_request(json!(1))).unwrap();
    let parsed: Value = serde_json::from_str(&response).unwrap();
    assert_eq!(parsed.get("jsonrpc"), Some(&json!("2.0")));
    assert_eq!(parsed.get("id"), Some(&json!(1)));
    assert_eq!(
        parsed.get("result"),
        Some(&json!({
            "protocolVersion": "2025-06-18",
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "kraddle-agent-surface", "version": "0.1.0" },
        }))
    );
}

#[test]
fn tools_list_returns_the_stub_tool_names_exactly_no_extras() {
    let server = make_server();
    server.handle_message(&initialize_request(json!(1))).unwrap();
    server.handle_message(&json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }).to_string());
    let response = server.handle_message(&json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }).to_string()).unwrap();
    let parsed: Value = serde_json::from_str(&response).unwrap();
    let names: Vec<&str> = parsed["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|tool| tool["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, vec!["stub_one", "stub_two"]);
    assert_eq!(parsed["result"]["tools"][0].get("inputSchema"), Some(&json!({ "type": "object" })));
}

#[test]
fn an_unknown_method_returns_error_32601() {
    let server = make_server();
    let response = server.handle_message(&json!({ "jsonrpc": "2.0", "id": 3, "method": "no/such/method" }).to_string()).unwrap();
    let parsed: Value = serde_json::from_str(&response).unwrap();
    assert_eq!(parsed["error"]["code"], json!(-32601));
    assert_eq!(parsed["error"]["message"], json!("Method not found"));
    assert_eq!(parsed.get("id"), Some(&json!(3)));
}

#[test]
fn a_malformed_line_returns_error_32700() {
    let server = make_server();
    let response = server.handle_message("{not json").unwrap();
    let parsed: Value = serde_json::from_str(&response).unwrap();
    assert_eq!(parsed["error"]["code"], json!(-32700));
    assert_eq!(parsed["error"]["message"], json!("Parse error"));
    assert_eq!(parsed.get("id"), Some(&json!(null)));
}

#[test]
fn tools_call_with_an_unknown_tool_name_returns_error_32602() {
    let server = make_server();
    server.handle_message(&initialize_request(json!(1))).unwrap();
    let response = server.handle_message(&json!({
        "jsonrpc": "2.0",
        "id": 4,
        "method": "tools/call",
        "params": { "name": "no_such_tool", "arguments": {} },
    }).to_string()).unwrap();
    let parsed: Value = serde_json::from_str(&response).unwrap();
    assert_eq!(parsed["error"]["code"], json!(-32602));
    assert_eq!(parsed.get("id"), Some(&json!(4)));
}
