# Kraddle Rust Rewrite Work Order (Phase R)

Date: September 4, 2026
Status: Executable work order.
Prerequisite: Phase 2.5 + 4 complete (101 pass / 6 todo / 0 fail in the
Node implementation).
Audience: An implementing agent with write access to `rust/` (new) and,
for Step 0 only, `src/kernel.js`.

---

## 0. Purpose and Posture

```text
This is a TRANSLATION, not a redesign.

The Node implementation and its 101-test conformance suite are the
executable specification. The Rust port must reproduce that behavior
exactly. Discovered ambiguity is reported, never "improved."
```

Why Rust: the Tauri desktop app embeds the kernel directly (one
language, no Node sidecar), distribution becomes a single binary
(the "second engineer" path collapses), and a control system deserves
infrastructure-grade construction.

The Node implementation stays, runnable and green, as the ORACLE until
full parity, then as the archived reference. It is never deleted.

```text
Rust  = the shipping implementation
Node  = the executable spec and differential oracle
Tests = the portable artifact: 101 tests, ported one-for-one
```

### 0b. Frontend: explicitly out of scope

Tauri, any VS Code fork, any editor integration — NONE of it is in
this plan. Kraddle is editor-agnostic by construction: the agent
channel is MCP-over-stdio, which any client can speak. The Tauri app
(when built) embeds the `kraddle` crate as a library. Do not build,
scaffold, or stub any frontend here.

---

## 1. Guardrails

```text
R1  Behavior parity is the bar. No semantic changes. If Rust and
    Node disagree, the divergence is a bug in the port. If the
    correct behavior is genuinely unclear, STOP and report the case.

R2  One Rust test per Node test. Same name (snake_case), same
    assertions, same fixtures. The 6 todo cases become #[ignore]
    tests with the blocker in the test name.

R3  After every step: BOTH suites green (cargo test AND npm test).

R4  Digest rule: digests over canonical JSON — object keys sorted,
    arrays in order. serde_json's default (BTreeMap) serializes this
    way natively; Node gets a canonicalJson() in Step 0. No other
    Node-side changes are authorized, ever.

R5  Dependency allowlist, complete: serde, serde_json, sha2, uuid
    (v4 feature), regex. NOTHING else. No tokio, no clap, no walkdir.
    The core is synchronous. The MCP server uses std threads.

R6  One generic Record struct (typed envelope + extra field map).
    Do NOT invent a per-kind typed record taxonomy. Typed accessors
    yes; a type hierarchy no. Tightening types is post-parity work.

R7  DenialCode enum: variant names = Node's DENIAL keys; the string
    form is byte-identical to Node's (wire compatibility).

R8  On-disk format is IDENTICAL: same .kraddle layout, same JSON-lines
    segments, same field names, same manifest/heads files. A
    Node-written workspace MUST load in Rust and vice versa. This is
    the differential test in Step 12.

R9  git via std::process::Command with fixed argv. Never a shell.

R10 All semantic guardrails carry over: fail-closed, default-deny,
    never weaken a test to pass it.

R11 Windows-first. Repo paths are POSIX-normalized keys, exactly as
    in Node (src/repo.js toPosix).

R12 One commit per step, "step N: <what>". The Node repo receives
    exactly one commit in this entire plan (Step 0).
```

---

## 2. Architecture

Single crate, two binaries. The Tauri app later consumes it as a
path dependency.

```text
rust/
  Cargo.toml            package "kraddle", lib + 2 bins
  src/
    lib.rs              pub mod declarations
    kernel.rs           <- src/kernel.js        (state, envelope,
                        profiles, admission, mutation auth, closure,
                        coverage, evaluate, resolver, Workspace)
    denials_text.rs     <- src/denials-text.js
    extract.rs          <- src/extract.js
    evaluators.rs       <- src/evaluators.js
    repo.rs             <- src/repo.js
    mcp.rs              <- src/mcp.js
    server.rs           <- src/server.js        (lib fns + thin bin)
    cli.rs              <- src/cli.js           (lib fns + thin bin)
  src/bin/
    kraddle.rs          CLI entry        (calls cli::main())
    kraddle-mcp-server.rs  server entry  (calls server::main())
  tests/
    kernel.rs, envelope.rs, adversarial.rs, extract.rs,
    evaluators.rs, demo.rs, repo.rs, report.rs, dogfood.rs,
    mcp.rs, server.rs, e2e.rs, cli.rs, journey.rs, differential.rs
```

State representation (R6):

```rust
pub struct Record {
    pub id: String,
    pub kind: String,
    pub origin: String,            // envelope fields, validated
    pub epistemic_basis: String,
    pub approval_state: String,
    pub freshness_state: String,
    pub recorded_at: u64,
    pub confidence: Option<f64>,
    pub scope_id: Option<String>,
    pub extra: serde_json::Map<String, serde_json::Value>,
}
// state: five BTreeMap<String, Record> (units, commitments,
// relationships, evidence, scopes). BTreeMap = deterministic
// iteration, matches canonical ordering. Differential tests
// compare sorted collections, never sequences.
```

Error type:

```rust
pub enum KraddleError {
    Control { code: DenialCode, detail: Value },
    Io(std::io::Error),
    Json(serde_json::Error),
    // ControlDenial analog; everything user-visible routes through
    // denials_text::describe_denial, CODE-first, parity table below.
}
```

---

## 3. Porting Decisions — Read Before Porting

```text
D1  Canonical digests. Node Step 0 adds canonicalJson() (recursively
    sort object keys) used for operationsDigest. serde_json default
    BTreeMap serializes identically. Key sort is byte-wise on both
    sides (all field names are ASCII). computeCoverageDigest and
    computeFileMapDigest contain no objects — port byte-identical.

D2  Regex. The regex crate has NO lookaheads. Node's
    DYNAMIC_COMPUTED pattern /(?:import|require)\s*\(\s*(?![\s"'])/
    must be restructured: match \b(?:import|require)\s*\\( with
    captures_iter, then inspect the next character in code — if it
    is neither whitespace nor a quote, emit an unresolved edge.
    Behavioral parity is asserted by the extract test suite (it has
    a dynamic-import case; it will catch a wrong port).

D3  matchAll -> captures_iter; the `g` flag and lastIndex resets are
    irrelevant in Rust. JS \b and Rust \b are both ASCII word
    boundaries. Character classes port directly.

D4  structuredClone -> #[derive(Clone)] on Record and a manual
    Workspace::clone_state (BTreeMaps of Records clone deep).

D5  Date.now() -> SystemTime millis. randomUUID -> uuid::Uuid::new_v4().

D6  Node's readline loop -> two std threads (reader + writer) with a
    channel; per-line JSON-RPC handling is serialized through a mutex,
    matching the Node event-loop behavior. No async.

D7  CLI argv parsing is HAND-ROLLED, mirroring cli.js exactly
    (repeatable --forbid, --repo defaulting, unknown-flag behavior,
    exit codes). Do not substitute a parsing library; the CLI tests
    assert exact messages and codes.

D8  Spawning binaries in tests: env!("CARGO_BIN_EXE_kraddle") and
    env!("CARGO_BIN_EXE_kraddle-mcp-server") with std::process::Command,
    fixed argv, env vars set explicitly.

D9  describe_denial: the full parity table from denials-text.js,
    same em-dash format, CODE first, same fallback
    "<CODE> — (no description yet)".

D10 Iteration order: Node Maps are insertion-ordered; Rust uses
    BTreeMap (sorted). No behavior depends on insertion order
    (resolver output is explicitly sorted; status lists are
    order-unspecified in tests). If a ported test depends on order,
    the port is wrong — report it.
```

---

## 4. Steps

### Step 0 — Canonical digests (Node) + Rust skeleton

```text
FILES   src/kernel.js (the ONLY Node commit in this plan), rust/*

NODE    Add canonicalJson(value): arrays keep order, objects emit
        keys sorted, numbers/strings per JSON.stringify. Use it for
        the operationsDigest computation in transact() AND the
        digest check in load(). No other change. npm test must stay
        101 pass / 6 todo / 0 fail (tests never hardcode digests).

RUST    Cargo.toml (deps: serde, serde_json, sha2, uuid/v4, regex),
        lib.rs, kernel.rs skeleton with DenialCode enum (ALL codes
        from Node's DENIAL object; #[strum-like] manual Display
        returning the exact same strings), KraddleError,
        ENVELOPE_ENUMS parity, validateEnvelope.

TESTS   rust/tests/envelope.rs — port all 8 envelope.test.js cases.

VERIFY  npm test -> 101/6/0.  cargo test -> 8 pass.
        Commit Node ("step 0: canonical operation digests for
        cross-implementation parity") and Rust ("step 0: ...").
```

### Step 1 — State and profile validation

```text
PORT    emptyState, applyOperation (all op types incl. tombstone),
        validateEnvelope integration, profileRoot/profileMembers/
        relationshipsForRole/roleTarget/requireRole/optionalRole,
        validateProfile (three profile kinds, role tables).

TESTS   rust/tests/kernel.rs — port all 10 kernel.test.js cases,
        INCLUDING "rejects a blocking control without an evaluator"
        (the isolated fixture with all-but-evaluator roles present).

VERIFY  cargo test -> 18 pass. npm test green.
```

### Step 2 — Workspace persistence

```text
PORT    Workspace (root/kraddle/events paths), init (refuses
        existing manifest -> WORKSPACE_EXISTS), load (lexical
        segment order, quarantine on commit-marker-missing /
        digest-mismatch, stop-after-first, quarantine.json in
        local/, trusted flag, projectedThrough, wrapper return),
        transact (promise-chain serialization becomes a std Mutex;
        canonical operationsDigest; atomic write-temp-rename), heads.

PARITY  On-disk bytes: a Node-written 3-segment workspace must load
        in Rust with identical projections (this becomes a Step 12
        fixture, but verify informally now).

TESTS   kernel.rs additions: reload, init-twice, serialization of
        concurrent transacts (spawn threads), quarantine cases from
        AD-12.

VERIFY  cargo test -> ~26. npm test green.
```

### Step 3 — Admission and episode status

```text
PORT    admitEffect (authority checks, split REVOKED/EXPIRED,
        missing-operations, forbidden, target prefix, admissionId
        ledger), recordObservedEffect, classifyEffect (incl. the
        operation/target mismatch check), episodeStatus (derived
        suspension), requireTrustedProjection.

TESTS   port AD-10, AD-13, effect-mismatch, regression cases from
        adversarial.test.js.

VERIFY  cargo test -> ~33.
```

### Step 4 — Mutation authorization

```text
PORT    governingRecordIds (closure loop), authorityGrantIds,
        authorizeMutation (graft / authority-self-amendment /
        self-amendment / default-deny allowRecordIds), acceptance
        authority (non-human actor cannot set approval accepted).

TESTS   port AD-02, graft case, default-deny case, allowed case,
        acceptance-authority cases.

VERIFY  cargo test -> ~41.
```

### Step 5 — Revision pinning and closure

```text
PORT    validateStateReference, validateEpisodeClosure in full:
        outcome requirement, noOp rule, resultingStateRef required
        for effect-bearing episodes, uncontrolled-effect loop,
        obligation loop with the exact check ORDER (evaluation_failed
        -> revision mismatch -> not satisfied -> coverage -> stale).

TESTS   port AD-05 (+ digest-variant), A3 no-op cases, closure
        positive controls.

VERIFY  cargo test -> ~48.
```

### Step 6 — Coverage and evaluate

```text
PORT    normalizeSubjectSet, computeCoverageDigest, validateCoverage
        (digest recompute, unknown/missing/exclusion rules in order),
        evaluate (injected run fn, failure capture, coverage on
        failure, persistence-shaped record).

TESTS   port AD-04 (all variants incl. hand-edited digest and
        normalization equivalence), AD-03, AD-11 (+ persistence).

VERIFY  cargo test -> ~57.
```

### Step 7 — Applicability resolver

```text
PORT    resolveApplicableContext (selector types closed set,
        unsupported -> UNRESOLVED_SELECTOR, evidence pin incl.
        approval_state accepted and full stateRef, extractionScope
        checks on targets and on the record's own edges, edge
        resolution scan, omitted-applicable, completeness),
        verifyExtraction.

TESTS   port AD-01 (all five negative cases + positive), evidence
        pin and scope-mismatch cases, verifyExtraction cherry-pick.

VERIFY  cargo test -> ~66.
```

### Step 8 — Extraction, repo, report

```text
PORT    extract.rs (SOURCE_EXTENSIONS, computeFileMapDigest,
        extractDependencies with D2's lookahead restructure,
        normalizePosixPath, candidate resolution, four resolutions),
        repo.rs (readRepoFiles, readWorktreeFiles, IGNORED_DIRS,
        gitStateRef), report.rs (extractionReport).

TESTS   port extract (6), repo (10), report (4) suites. The dynamic
        import and ambiguity cases are the D2 regression guard.

VERIFY  cargo test -> ~86.
```

### Step 9 — Evaluators and denial text

```text
PORT    evaluators.rs (architectureRuleEvaluator, runEvaluator with
        fail-closed unknown evaluator types), denials_text.rs
        (full parity table).

TESTS   port evaluators (6), denials-text cases, demo.rs (the
        two-block demo, 2).

VERIFY  cargo test -> ~99.
```

### Step 10 — MCP server and agent surface

```text
PORT    mcp.rs (exact JSON-RPC shapes from the Phase 2 order:
        initialize/tools list/tools call, -32700/-32601/-32602,
        notifications), server.rs (startup validation chain, base
        digest pin, preflight incl. resolver completeness,
        write-before-admission ordering, path validation, admitted
        writes tracking, persistEpisodeActivity whitelisted fields,
        closure: full-worktree diff, scope-filtered evidence,
        resolver completeness, evaluator runs, resulting stateRef,
        noOp clearing).

TESTS   port mcp (5), server (12), e2e (2) — e2e spawns the bin via
        CARGO_BIN_EXE_kraddle-mcp-server (D8).

VERIFY  cargo test -> ~118 (Node suite count differs here: Rust
        tests were 1-per-Node-test through step 9; server/e2e bring
        additional spawn-based tests. Report exact numbers).
```

### Step 11 — CLI, dogfood, journey

```text
PORT    cli.rs (runCli with {code, output}, hand-rolled argv per D7,
        init / rule add / episode start / status / abort / help,
        empty-source validation with prefix hints, env-var output,
        CODE-first errors via denials_text, no stack traces),
        dogfood.rs (the two dogfood tests against THIS repository).

TESTS   port cli suite, journey.rs (the full second-engineer
        journey: CLI -> spawn server -> protocol -> denied-with-
        rule-text -> clean write -> close).

VERIFY  cargo test full suite green. npm test green (101/6/0).
```

### Step 12 — Differential cross-implementation proof

```text
GOAL    The rewrite's crown: Node and Rust interoperate on the same
        canonical state.

TESTS   rust/tests/differential.rs — a Node subprocess (node
        src/cli.js, fixed argv) bootstraps a temp git fixture repo
        (init, rule add, episode start). Then:
          1. Rust kraddle status on that workspace: trusted, same
             rule text.
          2. Rust kraddle episode start on the SAME episode must be
             refused EPISODE_ALREADY_ACTIVE (the ledger Node wrote
             is read by Rust).
          3. Reverse: Rust bootstraps (init, rule add, episode
             start); Node status loads it; Node episode start on the
             same episode is refused identically.
          4. Segment-level: a .krd file written by Node loads in
             Rust with identical record-id sets per collection.
        Normalize outputs (sorted lines) before comparing.

VERIFY  cargo test green incl. differential; report the final
        tally for BOTH suites side by side.
```

---

## 5. Definition Of Done

```text
cargo test: every Node test ported one-for-one (same names), plus
  server/e2e/differential additions. 6 deferred cases as #[ignore].
npm test:  101 pass / 6 todo / 0 fail, UNCHANGED except Step 0.
Both binaries run the journey scenario end to end.
Cross-implementation differential green in BOTH directions.
Deps: exactly serde, serde_json, sha2, uuid, regex.
Node repo: exactly one commit (Step 0).
One commit per step, "step N: <what>".
```

---

## 6. Report Back

```text
cargo test tally:        __ pass / __ ignored / __ fail
npm test tally:          __ pass / __ todo / __ fail
Steps completed:         __ of 13
Differential:            node->rust OK? rust->node OK? (one line each)
Divergences found:       none | list each with the failing case
Guardrails violated:     none | list
Deviations from plan:    none | list with reason
Blocked on:              nothing | describe
```

---

## 7. Risk Register — Where Ports Go Wrong

```text
Digest mismatches     -> canonicalJson vs serde_json: check D1 first
Regex behavior drift  -> D2; the dynamic-import test is the guard
Iteration order       -> D10; if order matters, the port is wrong
Windows path separators -> R11; keys are POSIX, fs calls use Path
JSON number/escape    -> integers only in digested content; report
                        any non-integer appearing in a digest input
```

---

## 8. Out Of Scope

```text
Tauri app, any editor or VS Code fork integration, any frontend
rules suggest or any new CLI UX beyond parity
npm/crates.io publishing
semantic changes of ANY kind (propose them; do not implement)
deleting or refactoring the Node implementation
multi-episode, sync, KRD binary, exceptions, invalidation
```

---

## 9. Standing Instruction

Translate the verified thing. The spec is the test suite. When in
doubt, make Rust agree with Node, and report the doubt.
