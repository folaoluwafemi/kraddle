//! Port of src/mcp.js — dependency-free MCP-over-stdio: JSON-RPC 2.0 with
//! newline-delimited JSON. Exact protocol shapes (G17): do not vary.

use serde_json::{json, Value};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone)]
pub struct ToolResult {
    pub text: String,
    pub is_error: bool,
}

impl ToolResult {
    pub fn ok(text: impl Into<String>) -> Self {
        ToolResult { text: text.into(), is_error: false }
    }

    pub fn error(text: impl Into<String>) -> Self {
        ToolResult { text: text.into(), is_error: true }
    }
}

pub type ToolHandler = Arc<dyn Fn(&Value) -> ToolResult + Send + Sync>;

pub struct Tool {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
    pub handler: ToolHandler,
}

pub struct McpServer {
    tools: Vec<Tool>,
    server_info: Value,
    initialized: Mutex<bool>,
}

impl McpServer {
    pub fn new(tools: Vec<Tool>, server_info: Value) -> Self {
        McpServer { tools, server_info, initialized: Mutex::new(false) }
    }

    pub fn tools_iter(&self) -> impl Iterator<Item = &Tool> {
        self.tools.iter()
    }

    /// Port of handleMessage: returns None for notifications.
    pub fn handle_message(&self, line: &str) -> Option<String> {
        let message: Value = match serde_json::from_str(line) {
            Ok(message) => message,
            Err(_) => {
                return Some(
                    json!({ "jsonrpc": "2.0", "id": null, "error": { "code": -32700, "message": "Parse error" } })
                        .to_string(),
                );
            }
        };
        let is_object = message.as_object().is_some();
        if !is_object {
            return Some(
                json!({ "jsonrpc": "2.0", "id": null, "error": { "code": -32600, "message": "Invalid Request" } })
                    .to_string(),
            );
        }
        let id = message.get("id").cloned();
        let method = message.get("method").and_then(|m| m.as_str()).unwrap_or("").to_string();
        let params = message.get("params").cloned().unwrap_or(json!({}));

        let is_notification = matches!(id, None | Some(Value::Null));
        if is_notification {
            if method == "notifications/initialized" {
                *self.initialized.lock().expect("initialized lock") = true;
            }
            return None;
        }
        let id = id.unwrap_or(Value::Null);

        if method == "initialize" {
            *self.initialized.lock().expect("initialized lock") = true;
            return Some(
                json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {
                        "protocolVersion": "2025-06-18",
                        "capabilities": { "tools": {} },
                        "serverInfo": self.server_info,
                    }
                })
                .to_string(),
            );
        }
        if method == "tools/list" {
            let tools: Vec<Value> = self
                .tools
                .iter()
                .map(|tool| {
                    json!({
                        "name": tool.name,
                        "description": tool.description,
                        "inputSchema": tool.input_schema,
                    })
                })
                .collect();
            return Some(json!({ "jsonrpc": "2.0", "id": id, "result": { "tools": tools } }).to_string());
        }
        if method == "tools/call" {
            let name = params.get("name").and_then(|n| n.as_str()).map(str::to_string);
            let tool = self.tools.iter().find(|tool| Some(tool.name.as_str()) == name.as_deref());
            let Some(tool) = tool else {
                return Some(
                    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32602, "message": "Unknown tool" } })
                        .to_string(),
                );
            };
            let arguments = params.get("arguments").cloned().unwrap_or(json!({}));
            let outcome = (tool.handler)(&arguments);
            return Some(
                json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {
                        "content": [{ "type": "text", "text": outcome.text }],
                        "isError": outcome.is_error,
                    }
                })
                .to_string(),
            );
        }
        Some(
            json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32601, "message": "Method not found" } })
                .to_string(),
        )
    }
}
