# Kraddle Phase 2 Work Order: The Agent Surface

Date: September 2, 2026
Status: Executable work order.
Prerequisite: Phase 1 complete (58 pass / 6 todo / 0 fail, gate held,
unknownRatio 0.000 for src/).
Audience: An implementing agent with write access to `src/` and `test/` only.

---

## 0. Purpose, Bet, and Honesty

Phase 1 proved the control loop on real repository state. Phase 2 gives an
agent an actual surface to work through: an MCP server whose tools route
file reads and writes through admission, preflight architecture rules
before a write touches disk, and refuse to close an episode whose working
tree contains unadmitted changes.

The bet being tested:

```text
Do agents productively route through a bounded write path when it exists,
and does the control system catch everything that doesn't route through it?
```

Perimeter honesty, upgraded but still advisory:

```text
CAN claim:  admission denies writes that violate governing rules;
            closure refuses episodes with unadmitted working-tree changes;
            no tool exists that can mutate governing records.
CANNOT claim: the agent cannot write files. There is no sandbox.
            Direct fs writes remain possible; Phase 2 detects them
            at closure, it does not prevent them.
```

Design consequence, load-bearing: **the server has no mutation surface.**
Episode and authority are transacted by a human before the server starts.
An agent using the surface can read, write (within authority, past
preflight), and request closure. It cannot weaken the rule it is governed
by — not because a check stops it, but because no such tool exists.

---

## 1. Guardrails

Phase 0 G1-G10 and Phase 1 G11-G14 remain in force. Additions:

```text
G15 The server never creates, widens, or accepts authority. Episode and
    authority grant must pre-exist in the workspace, human-transacted.
    tools/list must never contain a record-mutation tool.

G16 Preflight is fail-closed. Unknown or indeterminate evaluation denies
    the write. There is no warn-and-proceed.

G17 No new dependencies. MCP-over-stdio is implemented on node stdlib
    using the exact message shapes in Step 3. Do not improvise protocol
    details; if a shape seems wrong, STOP and report.
```

New DENIAL codes added by this plan (the plan IS the amendment):

```text
EVIDENCE_SCOPE_MISMATCH
PREFLIGHT_VIOLATED
PREFLIGHT_UNKNOWN
```

---

## 2. Scope

```text
IN:   evidence scoping + recomputation audit, evaluator config-as-data,
      MCP stdio protocol layer, read/write/close tools, preflight,
      closure-time bypass detection, end-to-end subprocess tests.

OUT:  sandbox / enforced prevention, git commits by the server
      (working tree only), sync, exceptions, invalidation, KRD,
      parser extractor, multi-episode orchestration (one episode per
      server run), watching/polling (bypass detected only at closure).
```

---

## 3. Steps

### Step 1 — Evidence scoping and recomputation audit

```text
GOAL       An evidence record declares its extraction region, the
           resolver enforces it, and cherry-picked evidence is
           detectable by recomputation.

FILES      src/kernel.js, test/adversarial.test.js,
           test/demo.test.js, test/dogfood.test.js (fixture edits only)

API        Evidence records carrying `edges` MUST also carry:
             extractionScope: { fromPrefixes: string[] }   // non-empty

           resolveApplicableContext, after the existing pin checks:
             a. every targetPath must fall under at least one
                evidence.fromPrefixes entry
                -> else addReason(EVIDENCE_SCOPE_MISMATCH)
             b. every evidence edge's `from` must fall under the scope
                the record itself declares
                -> else addReason(EVIDENCE_SCOPE_MISMATCH)
             c. evidence with edges but missing/empty extractionScope
                -> addReason(EVIDENCE_SCOPE_MISMATCH)

           export function verifyExtraction(evidence, files)
             Re-runs extractDependencies(files), filters edges to the
             evidence's declared scope, and diffs against
             evidence.edges by (from, to, spec, resolution).
             Returns { verified: true } or
                     { verified: false, missing: [...], extra: [...] }
             Pure. No IO. Does NOT re-check the digest (the pin check
             owns that).

FIXTURE    STRENGTHENING CHANGE (G1 exception, this step only): the
EDITS      evidence records in test/demo.test.js and
           test/dogfood.test.js gain
           extractionScope: { fromPrefixes: ["src/"] }.
           dogfood's region-scoped evidence is now honest by
           declaration: the record says what it covers, and the
           resolver verifies targets fall inside it.

TEST       Five tests in adversarial.test.js:
             1. edges present, extractionScope absent
                -> complete false, EVIDENCE_SCOPE_MISMATCH
             2. targetPath outside declared scope
                -> EVIDENCE_SCOPE_MISMATCH
             3. evidence contains an edge whose from is outside its
                own declared scope -> EVIDENCE_SCOPE_MISMATCH
             4. verifyExtraction on a hand-built evidence record with
                one real edge REMOVED (cherry-picked)
                -> verified false, missing names that edge
             5. positive: scoped evidence, in-scope targets,
                full edge set -> complete true; verifyExtraction
                verified true

VERIFY     npm test -> 63 pass / 6 todo / 0 fail.
```

### Step 2 — Evaluator config as data

```text
GOAL       A binding's evaluator unit carries its own configuration,
           so the server can run governing evaluators without any
           out-of-band wiring.

FILES      src/evaluators.js, test/evaluators.test.js

API        Evaluator units gain optional fields:
             evaluatorType: "architecture_rule"
             params: { sourcePrefix: string, forbiddenPrefixes: string[] }

           export function runEvaluator(evaluatorUnit, files)
             Reads evaluatorType:
               "architecture_rule" -> runs architectureRuleEvaluator
                 once per forbiddenPrefixes entry, combining:
                 any violated -> violated; any unknown -> unknown;
                 else satisfied. Returns { result, coverage }.
               missing/unknown evaluatorType
                 -> { result: "unknown",
                      reason: "unknown_evaluator_type" }
               params invalid (missing sourcePrefix, empty prefixes)
                 -> { result: "unknown",
                      reason: "evaluator_params_invalid" }
             Fail-closed by construction. It never throws and never
             guesses.

TEST       Three tests:
             1. unit with evaluatorType architecture_rule over a map
                containing a forbidden import -> violated
             2. unit with evaluatorType "semantic_vibes"
                -> unknown, reason unknown_evaluator_type
             3. unit with params missing forbiddenPrefixes
                -> unknown, reason evaluator_params_invalid

VERIFY     npm test -> 66 pass / 6 todo / 0 fail.
```

### Step 3 — MCP stdio protocol layer

```text
GOAL       A dependency-free MCP server: JSON-RPC 2.0 over
           newline-delimited JSON on stdio.

FILES      src/mcp.js (new), src/server.js (new), test/mcp.test.js (new),
           package.json (add "start": "node src/server.js")

API        src/mcp.js exports:
             export function createMcpServer({ tools, serverInfo })
               tools: [{ name, description, inputSchema, handler }]
               handler: async (args) => { text } or
                        { text, isError: true }
               Returns an object with:
                 handleMessage(line) -> response line | null
                   (null for notifications)
                 Exposes the exact shapes below. No state beyond
                 initialized flag.

           PROTOCOL SHAPES — exact, do not vary:
             initialize request:
               {"jsonrpc":"2.0","id":1,"method":"initialize",
                "params":{"protocolVersion":"2025-06-18",
                "capabilities":{},"clientInfo":{"name":"x","version":"0"}}}
             initialize response result:
               {"protocolVersion":"2025-06-18",
                "capabilities":{"tools":{}},
                "serverInfo":{"name":"kraddle-agent-surface","version":"0.1.0"}}
             notification (no response):
               {"jsonrpc":"2.0","method":"notifications/initialized"}
             tools/list response result:
               {"tools":[{"name":...,"description":...,"inputSchema":...},...]}
             tools/call request:
               {"jsonrpc":"2.0","id":N,"method":"tools/call",
                "params":{"name":"kraddle_write_file","arguments":{...}}}
             tools/call success result:
               {"content":[{"type":"text","text":"..."}],"isError":false}
             tools/call denial result:
               {"content":[{"type":"text","text":"<DENIAL code + detail>"}],
                "isError":true}
             unknown method -> {"jsonrpc":"2.0","id":N,
               "error":{"code":-32601,"message":"Method not found"}}
             malformed JSON -> {"jsonrpc":"2.0","id":null,
               "error":{"code":-32700,"message":"Parse error"}}

           src/server.js: entry point. Reads env (all required):
             KRADDLE_REPO, KRADDLE_WORKSPACE_DIR, KRADDLE_EPISODE_ID
           STARTUP VALIDATION, in order, exit non-zero with a stderr
           message on any failure:
             1. new Workspace(dir).load() -> requireTrustedProjection
             2. episode exists, kind execution_episode
             3. episodeStatus not "suspended"
             4. authority present, not revoked, not expired
             5. readRepoFiles(KRADDLE_REPO); the map digest MUST equal
                episode.baseStateRef.contentDigest (the server starts
                pinned to the episode's base state)
           Then serves exactly three tools:
             kraddle_read_file   { path }
             kraddle_write_file  { path, content }
             kraddle_close_episode {}
           main() guarded by import.meta.url === process.argv[1]
           comparison so tests can import without side effects.

TEST       Five tests in test/mcp.test.js against an in-memory server
           with stub tools:
             1. initialize handshake returns the exact result shape
             2. tools/list returns the stub tool names exactly;
                no extras
             3. unknown method -> error code -32601
             4. malformed line -> error code -32700
             5. tools/call with unknown tool name -> error -32602

VERIFY     npm test -> 71 pass / 6 todo / 0 fail.
```

### Step 4 — The write path with preflight

```text
GOAL       A write is admitted only inside authority, and only when
           every applicable architecture rule passes on the PROPOSED
           file map, before disk is touched.

FILES      src/server.js, test/server.test.js (new)

IMPLEMENT  kraddle_write_file(path, content):
             1. requireTrustedProjection
             2. admitEffect(state, episodeId,
                  { operation: "write", target: path })
                Denial -> tool result isError with the DENIAL code.
             3. PREFLIGHT: proposedMap = { ...baseFiles, [path]: content }
                resolver = resolveApplicableContext(state, {
                  targetPaths: [path], revision: <base revision>,
                  declaredApplicable: computed by calling the resolver
                  with declaredApplicable set to every accepted binding
                  id (the server declares what the resolver itself
                  finds; omission is impossible by construction),
                  dependencyEvidenceId: <base evidence id from env —
                  add KRADDLE_BASE_EVIDENCE_ID> })
                For each applicable binding that has an evaluator role:
                  runEvaluator(evaluatorUnit, proposedMap)
                    violated -> tool result isError,
                      code PREFLIGHT_VIOLATED, detail names the
                      governing commitment's value
                    unknown -> isError, code PREFLIGHT_UNKNOWN
                Nothing written to disk on any denial.
             4. Write the file under KRADDLE_REPO (path is
                repo-relative; reject absolute or ..-escaping paths
                with ENVELOPE_INVALID before touching fs).
             5. recordObservedEffect with the real admissionId.
             6. Track { path -> content } in the server's admitted
                writes map (for Step 5's diff).
             7. Success text includes the admissionId.

           kraddle_read_file(path): admitEffect with operation "read",
           then read from baseFiles. Path validation identical.

TEST       Four tests in test/server.test.js, each bootstrapping a
           temp git repo (one commit, fixture files src/domain/a.ts,
           src/ui/Button.tsx), a workspace with a human-transacted
           binding (domain must not import ui, evaluator unit with
           evaluatorType architecture_rule, params
           { sourcePrefix: "src/domain/", forbiddenPrefixes: ["src/ui/"] }),
           base evidence with extractionScope ["src/"], episode
           (authority operations ["read","write"],
           targetPrefix "src/domain/"), then driving the tool handlers
           directly (in-process, not the protocol layer):
             1. write to "src/ui/other.tsx" (outside prefix)
                -> isError, code TARGET_OUTSIDE_AUTHORITY,
                   file not on disk
             2. write to "src/domain/service.ts" whose content imports
                "../ui/Button" -> isError, code PREFLIGHT_VIOLATED,
                   file not on disk, detail names
                   "domain must not import ui"
             3. write with a dynamic import(variable) in content
                -> isError, code PREFLIGHT_UNKNOWN, not on disk
             4. clean write -> admitted, file on disk with the exact
                content, observed effect recorded with the admissionId

VERIFY     npm test -> 75 pass / 6 todo / 0 fail.
```

### Step 5 — Closure with bypass detection

```text
GOAL       Closure re-reads reality and refuses to represent a working
           tree containing unadmitted changes as controlled execution.

FILES      src/server.js, test/server.test.js

IMPLEMENT  kraddle_close_episode():
             1. requireTrustedProjection.
             2. Re-read readRepoFiles(KRADDLE_REPO) -> currentFiles.
             3. expectedFiles = { ...baseFiles, ...admittedWrites }.
                DIFF: every path where currentFiles differs from
                expectedFiles (content mismatch, new file, or deleted
                file) is an unadmitted delta.
                Non-empty diff -> tool result isError,
                  code UNCONTROLLED_EFFECT, detail lists the paths.
                  Nothing closes.
             4. Build the resulting worktree stateRef:
                  repository: base repository
                  revision: base revision + "+worktree"
                  contentDigest: computeFileMapDigest(currentFiles)
             5. Transact a new evidence record for currentFiles
                (origin extractor, observed, accepted,
                extractionScope ["src/"], edges from extraction,
                the worktree stateRef).
             6. For each applicable binding with an evaluator:
                runEvaluator(unit, currentFiles) — persist each as an
                evaluation profile (result commitment + typed coverage),
                proof_obligation from the episode.
                Any violated/unknown result -> attempt closure and
                return the denial the closure validator throws
                (EVALUATION_NOT_SATISFIED etc.) as isError.
             7. validateEpisodeClosure -> { closable: true } ->
                success text with the resulting digest.

TEST       Three tests:
             1. clean flow: one admitted clean write, then close
                -> closable true; the resulting evidence and
                evaluation records are in the workspace (reload from
                disk and assert they persisted)
             2. BYPASS: one admitted clean write, then write a
                DIFFERENT file directly with node:fs (bypassing the
                server), then close -> isError,
                code UNCONTROLLED_EFFECT, detail names that file
             3. read with an authority grant whose operations omit
                "read" -> isError, code OPERATION_NOT_AUTHORIZED

VERIFY     npm test -> 78 pass / 6 todo / 0 fail.
```

### Step 6 — End-to-end over the real protocol

```text
GOAL       The Phase 2 demo: a scripted agent drives the actual server
           subprocess over stdio JSON-RPC.

FILES      test/e2e.test.js (new)

MECHANICS  test/e2e.test.js spawns `node src/server.js` with
           child_process spawn (fixed argv), env as specified, writes
           JSON lines to stdin, reads lines from stdout, matches
           responses by id. Bootstrap (temp git repo, workspace,
           binding, evidence, episode) done in-test via Workspace
           directly — the human channel.

TEST       Two tests:
             1. "the agent surface two-block scenario":
                  initialize handshake -> tools/list (assert exactly
                  the three tools; assert NO tool name contains
                  "update", "create", "delete", "transact", or
                  "grant" — the structural no-mutation-surface check)
                  -> kraddle_read_file src/domain/a.ts succeeds
                  -> kraddle_write_file src/domain/service.ts with a
                     forbidden ../ui/Button import
                     -> isError, PREFLIGHT_VIOLATED, text contains
                        "domain must not import ui"
                  -> assert the file does NOT exist on disk
                  -> kraddle_write_file clean content -> success
                  -> assert file on disk
                  -> kraddle_close_episode -> success
             2. "bypass is caught at closure":
                  clean write via tool -> direct fs write of another
                  file -> kraddle_close_episode -> isError,
                  UNCONTROLLED_EFFECT, text names the bypassed path

VERIFY     npm test -> 80 pass / 6 todo / 0 fail.
```

---

## 4. Definition Of Done

```text
npm test: 80 pass / 6 todo / 0 fail. Exact tally reported.
Evidence records declare their extraction region; the resolver
  enforces scope on targets and on the record's own edges.
verifyExtraction detects cherry-picked edges by recomputation.
The MCP server is stdlib-only and speaks the exact shapes in Step 3.
Admission denies writes that violate governing architecture rules
  before disk is touched, naming the governing commitment.
Unknown evaluation at preflight denies (fail-closed).
Closure refuses episodes with unadmitted working-tree changes.
tools/list contains exactly read/write/close — no mutation surface.
Episode and authority are human-transacted before server start (G15).
One commit per completed step, "step N: <what>".
```

---

## 5. Report Back

```text
Final tally:            __ pass / __ todo / __ fail
Steps completed:        __ of 6
Preflight denials exercised: violated __ | unknown __ | outside __
Bypass detection:       caught at closure | not caught (describe)
Guardrails violated:    none | list
Deviations from plan:   none | list with reason
Blocked on:             nothing | describe
Files changed:          list
```

---

## 6. Standing Instruction

The server exists to prove an agent can work productively inside a
boundary it cannot weaken. Every feature that does not serve admission,
preflight, or closure is out of scope. If the protocol shapes in Step 3
conflict with the MCP specification as you understand it, STOP and
report rather than adapting them silently.
