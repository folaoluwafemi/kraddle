import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { test } from "node:test";
import { runCli } from "../src/cli.js";

const exec = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("the second-engineer journey: declare, launch, get denied, close", async () => {
  // 1. a real repository the engineer owns
  const repoDir = await mkdtemp(join(tmpdir(), "kraddle-journey-"));
  await mkdir(join(repoDir, "src", "domain"), { recursive: true });
  await mkdir(join(repoDir, "src", "ui"), { recursive: true });
  await writeFile(join(repoDir, "src", "domain", "a.ts"), "export const a = 1;\n");
  await writeFile(join(repoDir, "src", "ui", "Button.tsx"), 'import React from "react";\n');
  await exec("git", ["init"], { cwd: repoDir });
  await exec("git", ["config", "user.email", "eng@example.com"], { cwd: repoDir });
  await exec("git", ["config", "user.name", "Second Engineer"], { cwd: repoDir });
  await exec("git", ["add", "src/domain/a.ts", "src/ui/Button.tsx"], { cwd: repoDir });
  await exec("git", ["commit", "-m", "existing code"], { cwd: repoDir });

  try {
    // 2. bootstrap through the CLI only
    const init = await runCli(["init", "--repo", repoDir]);
    assert.equal(init.code, 0, init.output);
    const rule = await runCli([
      "rule", "add", "--repo", repoDir,
      "--source", "src/domain", "--forbid", "src/ui",
      "--text", "domain must not import ui",
    ]);
    assert.equal(rule.code, 0, rule.output);
    const started = await runCli([
      "episode", "start", "--repo", repoDir,
      "--task", "add a small domain service",
      "--write-prefix", "src/domain",
    ]);
    assert.equal(started.code, 0, started.output);

    // 3. launch the agent surface from the printed values
    const env = {};
    for (const line of started.output.split("\n")) {
      const match = line.match(/^(KRADDLE_[A-Z_]+)=(.*)$/);
      if (match) env[match[1]] = match[2];
    }
    assert.ok(env.KRADDLE_REPO && env.KRADDLE_WORKSPACE_DIR && env.KRADDLE_EPISODE_ID && env.KRADDLE_BASE_EVIDENCE_ID);

    const child = spawn(process.execPath, [join(projectRoot, "src", "server.js")], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stderr = [];
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    const pending = new Map();
    let nextId = 1;
    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        waiter(message);
      }
    });
    const call = (method, params) => {
      const id = nextId++;
      const request = { jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) };
      const promise = new Promise((resolveCall, rejectCall) => {
        pending.set(id, resolveCall);
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            rejectCall(new Error(`timeout awaiting ${method}: ${stderr.join("")}`));
          }
        }, 20000);
      });
      child.stdin.write(JSON.stringify(request) + "\n");
      return promise;
    };

    try {
      // 4. over the protocol
      const initResponse = await call("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "journey", version: "0" },
      });
      assert.equal(initResponse.result.serverInfo.name, "kraddle-agent-surface");

      const toolsList = await call("tools/list");
      const names = toolsList.result.tools.map((tool) => tool.name);
      assert.deepEqual([...names].sort(), ["kraddle_close_episode", "kraddle_read_file", "kraddle_write_file"]);
      for (const forbidden of ["update", "create", "delete", "transact", "grant", "cli"]) {
        assert.ok(!names.some((name) => name.includes(forbidden)), `tool names must not contain ${forbidden} (G18)`);
      }

      const read = await call("tools/call", {
        name: "kraddle_read_file",
        arguments: { path: "src/domain/a.ts" },
      });
      assert.equal(read.result.isError, false);

      const denied = await call("tools/call", {
        name: "kraddle_write_file",
        arguments: {
          path: "src/domain/service.ts",
          content: 'import { Button } from "../ui/Button";\nexport const service = Button;\n',
        },
      });
      assert.equal(denied.result.isError, true);
      const denialText = denied.result.content[0].text;
      assert.ok(denialText.includes("PREFLIGHT_VIOLATED"), denialText);
      assert.ok(denialText.includes("domain must not import ui"), denialText);
      await assert.doesNotReject(
        access(join(repoDir, "src", "domain", "service.ts")).then(
          () => { throw new Error("violation file must not exist"); },
          () => {},
        ),
      );

      const written = await call("tools/call", {
        name: "kraddle_write_file",
        arguments: { path: "src/domain/service.ts", content: "export const service = () => 1;\n" },
      });
      assert.equal(written.result.isError, false, written.result.content[0].text);
      await access(join(repoDir, "src", "domain", "service.ts"));

      const closed = await call("tools/call", {
        name: "kraddle_close_episode",
        arguments: {},
      });
      assert.equal(closed.result.isError, false, closed.result.content[0].text);
    } finally {
      child.kill();
    }
  } finally {
    await rm(repoDir, { recursive: true, force: true });
  }
});
