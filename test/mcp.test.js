import assert from "node:assert/strict";
import { test } from "node:test";
import { createMcpServer } from "../src/mcp.js";

const stubTools = [
  { name: "stub_one", description: "first stub", inputSchema: { type: "object" }, handler: async () => ({ text: "one" }) },
  { name: "stub_two", description: "second stub", inputSchema: { type: "object" }, handler: async () => ({ text: "two" }) },
];

function makeServer() {
  return createMcpServer({
    tools: stubTools,
    serverInfo: { name: "kraddle-agent-surface", version: "0.1.0" },
  });
}

test("initialize handshake returns the exact result shape", async () => {
  const server = makeServer();
  const line = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "x", version: "0" },
    },
  });
  const response = await server.handleMessage(line);
  const parsed = JSON.parse(response);
  assert.equal(parsed.jsonrpc, "2.0");
  assert.equal(parsed.id, 1);
  assert.deepEqual(parsed.result, {
    protocolVersion: "2025-06-18",
    capabilities: { tools: {} },
    serverInfo: { name: "kraddle-agent-surface", version: "0.1.0" },
  });
});

test("tools/list returns the stub tool names exactly, no extras", async () => {
  const server = makeServer();
  await server.handleMessage(JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "0" } },
  }));
  await server.handleMessage(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
  const response = await server.handleMessage(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
  const parsed = JSON.parse(response);
  assert.deepEqual(
    parsed.result.tools.map((tool) => tool.name),
    ["stub_one", "stub_two"],
  );
  assert.deepEqual(parsed.result.tools[0].inputSchema, { type: "object" });
});

test("an unknown method returns error -32601", async () => {
  const server = makeServer();
  const response = await server.handleMessage(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "no/such/method" }));
  const parsed = JSON.parse(response);
  assert.equal(parsed.error.code, -32601);
  assert.equal(parsed.error.message, "Method not found");
  assert.equal(parsed.id, 3);
});

test("a malformed line returns error -32700", async () => {
  const server = makeServer();
  const response = await server.handleMessage("{not json");
  const parsed = JSON.parse(response);
  assert.equal(parsed.error.code, -32700);
  assert.equal(parsed.error.message, "Parse error");
  assert.equal(parsed.id, null);
});

test("tools/call with an unknown tool name returns error -32602", async () => {
  const server = makeServer();
  await server.handleMessage(JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "0" } },
  }));
  const response = await server.handleMessage(JSON.stringify({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "no_such_tool", arguments: {} },
  }));
  const parsed = JSON.parse(response);
  assert.equal(parsed.error.code, -32602);
  assert.equal(parsed.id, 4);
});
