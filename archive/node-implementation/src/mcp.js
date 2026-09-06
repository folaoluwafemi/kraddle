export function createMcpServer({ tools, serverInfo }) {
  const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
  let initialized = false;

  async function handleMessage(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    }
    if (message === null || typeof message !== "object" || Array.isArray(message)) {
      return JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } });
    }
    const { id, method, params } = message;
    if (id === undefined || id === null) {
      if (method === "notifications/initialized") initialized = true;
      return null;
    }
    if (method === "initialize") {
      initialized = true;
      return JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo,
        },
      });
    }
    if (method === "tools/list") {
      return JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: {
          tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        },
      });
    }
    if (method === "tools/call") {
      const tool = toolMap.get(params?.name);
      if (!tool) {
        return JSON.stringify({
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "Unknown tool" },
        });
      }
      let outcome;
      try {
        outcome = await tool.handler(params?.arguments ?? {});
      } catch (thrown) {
        outcome = { text: thrown instanceof Error ? thrown.message : String(thrown), isError: true };
      }
      return JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: outcome?.text ?? "" }],
          isError: outcome?.isError === true,
        },
      });
    }
    return JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Method not found" },
    });
  }

  return { handleMessage };
}
