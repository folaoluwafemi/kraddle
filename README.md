# Kraddle — A Medium for Shaping What Software Means

> **One sentence (checkpoint 2026-08-10):** Kraddle is a bidirectional medium where people clarify and shape what software means, agents make that meaning executable, and the system continuously relates intended meaning to observed reality across levels of abstraction, alternatives, revisions, and evidence.

Kraddle began as a local-first **Agent Development Environment (ADE) HUD** — a grid that orchestrates CLI agents (Claude Code, Copilot CLI, Aider, Codex) via native PTY sessions so you stay on your own keys and subscriptions. That HUD is still the north star for *execution*.

What we've learned since (July–August 2026) moves the center of gravity **one layer up**: before autocomplete, before autopilot, there is a missing middle between a vague intention (*"I want this to exist"*) and a generated product. Kraddle's first standalone product is that middle — the **Meaning Layer** — a local, versioned, evidence-backed model of what software is for, what it does, what it must preserve, and how every part relates.

```
Vague desire ──► [ missing editable middle ] ──► generated product
                       ▲ Kraddle lives here
```

If this layer is right, agents guess far less. If it is wrong or stale, no amount of test coverage fixes it.

---

## 💡 Why a Meaning Layer

Existing tools jump `Intent → code/product` with too much hidden interpretation. Corrections then require re-prompting, re-generating, or editing code that is too fine-grained to express the real change:

- *"The button is too low"* → visual correction
- *"New users don't understand the value"* → behavior/experience correction
- *"This module owns the wrong responsibility"* → structural correction
- *"We're solving the wrong problem"* → intent correction

You should be able to correct at the **highest useful level** without translating every intent change into code. Kraddle keeps intended meaning, realized system, alternatives, evidence, and time as **connected, typed, versioned records** — not scattered docs, chats, and tacit knowledge.

Inspired by: the `plan as unit of trust` wedge (Claude), the `decision/engineering commit` durability critique (ChatGPT), Vorflux-style verification, Uncle Bob's *"torture the code with tests"* harness, and Garry Tan's **Personal AGI** thesis — `model (rented) + your context (owned) + harness (markdown skills)` = leverage you keep under your own power.

---

## 🔄 The Core Loop

```
1. Capture  — dump an idea, import docs, or open a repository
2. Extract  — deterministically observe code/docs/runtime (evidence, not truth)
3. Clarify  — surface what's missing, contradictory, or only guessed
4. Compose  — build a connected model: units + commitments + relationships
5. Inspect  — view purpose / behavior / constraints / structure / evidence
6. Revise   — produce explicit meaning diffs, not silent overwrites
7. Reconcile— compare intended meaning vs. extracted reality, choose the level of fix
8. Sync     — durable locally, optionally replicated to cloud (offline-first)
```

Loop is bidirectional:

```
Intent → meaning → behavior → structure → implementation → running system → evidence
  ▲                                                                     │
  └────────────────── infer / observe / reconcile ──────────────────────┘
```

Downward proposes and generates. Upward observes and infers — with explicit uncertainty (`observed | inferred | proposed | accepted | rejected | contradicted | stale`).

---

## 🧩 What Kraddle Models

### Five kernel records (storage rules stay stable; vocabulary grows)

| Record | What it is | Examples |
|---|---|---|
| **Meaning Unit** | Any identifiable thing worth discussing | `purpose`, `experience`, `capability`, `behavior`, `concept`, `constraint`, `software_element` (file/class/function/component/service/test), `evidence`, `open_question` |
| **Relationship** | Typed, directed edge between units | vertical: `realized_by`, `implemented_by`, `decomposed_into`, `constrained_by`, `verified_by` · horizontal: `depends_on`, `collaborates_with`, `shares_state_with`, `precedes`, `alternative_to`, `conflicts_with` |
| **Commitment** | What a unit is accountable to | `does` / `is_for` / `must_preserve` / `becomes_in_use` — each with `statement + origin + status + confidence` |
| **Evidence** | What supports/challenges a claim | `user_statement`, `document_excerpt`, `code_structure`, `test_result`, `runtime_trace`, `screenshot`, `git_history`, `human_approval`, `agent_interpretation` |
| **Scope** | Where meaning applies | `product`, `feature`, `journey`, `repository`, `branch`, `worktree`, `revision`, `module`, `alternative` (scopes nest; they don't replace relationships) |

### A unit's inspectable surface

```
What it is         name · kind · location · abstraction level · scope
What it does       inputs · outputs · effects · dependencies (observed contract)
What it is for     commitments served → higher-level behaviors/purposes
What it must preserve  contracts · constraints · invariants · experience requirements
What relates to it peers · parent/child meaning · alternatives
What supports it   source · tests · runtime · human approval
What is uncertain  observed / inferred / proposed / accepted / stale
```

> **Compositional meaning:** A product's meaning is partly realized by coordinated local meanings. A single function can carry an executable contract, a structural responsibility, a product contribution, and a change boundary — all linked upward. But local correctness ≠ global correctness, so Kraddle tracks both local commitments and higher-order interaction constraints.

---

## 🔍 What Can Be Extracted Without an LLM

Kraddle separates epistemic strength:

| Level | How | Example |
|---|---|---|
| **L1 Facts** | Deterministic parsers / compiler APIs / LSP | `restoreContext exists; takes questionId; calls sourceRepository; returns ResearchContext` |
| **L2 Derived properties** | Rules over facts | `depends_on persistence; reachable from reopen-question workflow; no mutation in tests` |
| **L3 Interpretations** | LLM/human, flagged as guesses | `appears responsible for reconstructing research context; likely serves "resume investigation"` |

```
Deterministic extraction → observed structural model → optional interpretation → proposed meaning → human confirmation
```

**Not** `code → "recovered true intent"` (code rarely encodes *why*). Code gives `does`; humans establish `is_for`/`must_preserve`.

Tooling: TypeScript Compiler API for semantic facts (definitions, references, callers, types, imports), Tree-sitter for tolerant syntax, Semgrep-style analysis where useful, git/runtime/tests for provenance and observed behavior. Each language emits one normalized `SoftwareElement`/`SoftwareRelation` format with **stable anchors** (`repo + language + kind + qualified_name + signature fingerprint + structural fingerprint + revision`) — not just paths/line numbers.

---

## 🖥️ Projections — Same Model, Different Views

The model is not a giant graph you stare at. It's one underlying graph seen through task-specific projections:

- **Inbox** — dump ideas/docs/transcripts/screenshots → Kraddle returns *what I understood / what's important / what's missing / what conflicts / what I'm guessing*
- **Meaning outline** — `Purpose → Experience → Capabilities → Behaviors → Concepts → Constraints → Open questions`
- **Element inspector** — `does / is_for / must_preserve / becomes_in_use / relationships / evidence / history` for any selected unit (function → product)
- **Relationship map** — bounded neighborhood: up one level, down one level, peers, evidence, contradictions, change impact
- **Meaning diff** — before accepting: `- Articles are primary + Questions are primary` + affected behaviors/components/anchors
- **Coverage view** — gaps, not vanity scores: `orphan implementation`, `unrealized commitment`, `unverified commitment`, `contradictory implementation`, `overloaded unit`, `fragmented responsibility`, `stale observation`, `ambiguous anchor remap`
- **Workspace Grid (HUD)** — the original Kraddle surface (multi-agent PTY panes, file tree, diff/monaco, markdown live viewers, planner checklist, command guard) now as *one projection* over the same meaning store

> Garry Tan mapping: **Markdown is code, skill files are employees, the resolver is the org chart.** A skill like *"When a Circle Back recording lands, transcribe → extract commitments/deadlines → link people against the library → flag contradictions"* is a page of English an intern or an agent can run. Kraddle treats skills the same way — `fat skills, thin harness`.

---

## 🏗️ Architecture — Local-First, Optionally Synced

### The `.kraddle/` workspace (canonical)

```
project/
  .kraddle/
    manifest.krd       # identity, format version, feature flags
    schema.krd         # vocabulary + relationship type definitions
    heads.krd          # current causal event heads
    events/            # append-only immutable KRD event segments
    objects/           # large evidence blobs, content-addressed by hash
    indexes/           # disposable file-native KRI indexes (rebuildable)
    local/             # device identity and sync cursors; never synced
```

- Every accepted edit appends an **immutable event** (`event_id, workspace_id, actor_id, device_id, type, payload, timestamp, logical_clock, causal_parents, schema_version`) before updating the derived projection — gives auditability, undo/redo, time travel, and sync.
- Two serializations: **readable** (diagnostic export and review) and **compact** (KRD frames with typed values, string dictionaries, binary IDs, and optional segment compression).
- File-native KRI indexes provide ID lookup, adjacency traversal, text search, anchor lookup, and event offsets. They contain no unique meaning and are never synchronized.
- No SQL engine, embedded database, graph database, or database service is part of local or cloud storage.
- Secrets never in the model — OS keychain only.

### Sync (opt-in, never blocks local)

```
local edit → append event segment + update heads atomically → exchange causal heads
→ transfer missing immutable frames and objects → verify checksums → rebuild affected indexes
```

Automatic merge for additive changes (different units/evidence/relationships); **conflicts become first-class records** (same commitment edited differently, accept vs. reject) for user resolution. `.kraddle` is the source of truth, not a cloud DB. Full export/delete without the cloud.

### Required invariants

1. No inferred statement becomes `accepted` without explicit actor/policy
2. Every observation names `source_revision + extractor_version`
3. Every relationship has `type + direction`
4. Every edit is recoverable from history
5. Local writes succeed offline
6. Sync is idempotent
7. Conflicting accepted meaning is never silently discarded
8. Deleting a unit preserves its history/evidence
9. Anchor uncertainty is visible
10. Blobs are content-addressed and integrity-checked
11. Secrets never stored in the model
12. Complete export without the cloud

---

## 📁 Repository Layout

```
kraddle/
├── README.md
├── contexts/                         # theory & transcripts (see below)
│   ├── kraddle_checkpoint_2026-08-10.md          # meaning-to-execution tree, kernel idea
│   ├── kraddle_compositional_meaning_2026-08-10.md # does/is_for/must_preserve, 3 extraction levels
│   ├── meaning_layer_architecture_2026-08-28.md  # .kraddle spec, sync, pipeline, phases
│   ├── convo_with_claude.md / convo_with_chatgpt.md
│   ├── garry_tan-the_future_of_agi_is_personal.md
│   ├── general_context.md
│   └── uncle_bob_on_testing_ai_code.md
├── .agents/skills/conversational-planning/
└── src/                              # (legends — implement per phases below)
    ├── backend/  # ptyManager.ts, server.ts (ws), fileWatcher.ts, extractors/
    └── frontend/ # WorkspaceGrid, FileTree, Planner, TerminalPane (xterm.js), Inspector, Map, Diff
```

**Historical HUD bridge** (kept as reference for the execution projection):

```ts
// src/backend/ptyManager.ts — spawn CLI inside PTY so auth is inherited
import * as pty from 'node-pty';
const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
const proc = pty.spawn(shell, [], { name: 'xterm-256color', cols: 100, rows: 30, cwd: process.cwd(), env: process.env });
proc.onData(data => ws.send(JSON.stringify({ type: 'output', data })));
ws.on('message', m => { const e = JSON.parse(m); if (e.type==='input') proc.write(e.data); else if (e.type==='resize') proc.resize(e.cols, e.rows); });
```

See `contexts/` for the full lineage — start with `kraddle_checkpoint_2026-08-10.md:1`, `kraddle_compositional_meaning_2026-08-10.md:1`, and `meaning_layer_architecture_2026-08-28.md:1`.

---

## 🗺️ Roadmap — Phase-Gated by Meaning, Not Code Volume

| Phase | Build | Exit: a user can… |
|---|---|---|
| **0 — Format lab** | CLI prototype directly on KRD/KRI files; create units/commitments/relationships/scopes/evidence; readable import/export; meaning diff; replay | Represent one real product without losing the theory's distinctions |
| **1 — TS inspector** | Discover TS repo → files/symbols/imports/calls/types/tests; stable anchors; incremental rescan; show deterministic `does`; let user add `is_for`/`must_preserve` | Trace a function → feature purpose and sideways to its dependencies |
| **2 — Workspace UI** | Inbox, outline, inspector, map, evidence drawer, diff/history, coverage gaps | Compose/revise a software model without reading encoded records |
| **3 — Guided composition** | Free-form idea → proposed units/commitments/relationships with source links & uncertainty; ask only gap-closing questions | Turn a vague idea into a model they recognize as concrete and executable |
| **4 — Local-cloud sync** | Auth/device identity, append/pull, object store, offline recovery, conflict UI, export/delete | Edit offline on two devices and reconcile without silent loss |
| **5 — Reconciliation API** | Compare accepted commitments vs. observations; stale/missing links; `get_change_impact`; compact agent tools (`get_unit`, `get_neighbors/ancestors/descendants`, `get_commitments/evidence/open_questions/contradictions`) | Give agents a scoped, evidence-backed slice instead of a project dump |

> **Discipline:** Prove each phase with one real repo modeled end-to-end. Keep the kernel (`identity, version, scope, source, status, evidence, connection`) small; grow vocabulary via `kind` values only when a real project demands it.

---

## 🔐 Positioning & Principles

- **Local trust:** Source, credentials, and meaning stay on your machine. Cloud is an optional replica/relay, not the place where the model lives.
- **BYOK / own your skills:** No proxy, no bundled tokens, no credential pivoting. Skill files are *your* cognition externalized — keep them in a repo you control (`Own your skills, or your job becomes a skill file` — Tan).
- **Extract facts deterministically. Infer explicitly. Let humans establish commitments. Connect all three without confusing them.**
- **Verification before generation:** PTY HUD + Uncle Bob gauntlet (unit/property/mutation/jitter/perf) + architecture conformance (does the dependency graph match approved decisions?) — but verification answers *"did we build it right?"*; the meaning layer answers *"did we decide the right thing?"*
- **Latency vs. determinism:** Steer taste/judgment in latent space (markdown skills); run arithmetic and dependency checks in deterministic code — never ask a model to seat 6,000 people without an executable system.
- **Provenance + hygiene:** Every fact has a source; contradictions are flagged not overridden; the librarian prunes — a brain without hygiene is a confident liar.

---

## ⚙️ Handling Billing & Automation (Historical Note)

Early Kraddle distinguished **PTY Mode** (native PTY → interactive TTY → standard flat-rate subscriptions preserved) vs. **SDK Mode** (`@anthropic-ai/claude-agent-sdk` `query()` generators → usage-based API credits). That distinction still governs the HUD execution projection; the meaning layer itself incurs no model calls unless you opt into L3 interpretation.

---

## 🚀 Getting Started (Current)

This repo is currently a **knowledge base + spec**. The executable prototype follows Phase 0.

```bash
# explore the theory in order
cat contexts/kraddle_checkpoint_2026-08-10.md
cat contexts/kraddle_compositional_meaning_2026-08-10.md
cat contexts/meaning_layer_architecture_2026-08-28.md

# when src/ lands (Tauri + React + TypeScript + KRD/KRI + TS Compiler API + Tree-sitter)
# npm install && npm run dev   # local workspace at ./.kraddle
```

Suggested tech (provisional, validate in Phase 0): `Tauri | React+TS | KRD canonical segments | KRI file-native indexes | content-addressed objects | TypeScript Compiler API | Tree-sitter (incremental) | immutable object storage + event manifests` on the cloud side.

---

## 📄 License

MIT — built locally to give engineers full control over workflows and meaning.

---

### Further Reading

- `contexts/general_context.md:1` — Daniel Steigerwald's *code observatory*, idea tags by agent, recent orchestrator/model notes
- `contexts/garry_tan-the_future_of_agi_is_personal.md:1` — `GBrain` (220k markdown pages), `GStack` (123k★), five-step compounding loop, `skillify`
- `contexts/uncle_bob_on_testing_ai_code.md:1` — 20× code → torture it with tests
- `contexts/convo_with_claude.md:1` / `contexts/convo_with_chatgpt.md:1` — from `plan` → `decision` → `engineering commit` → `capability/intent graph`

Contributions that keep the kernel small and prove vocabulary against real repos are most welcome.
