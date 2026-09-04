# Kraddle

> **Kraddle makes abstraction trustworthy:** it preserves what may safely be forgotten, exposes what remains uncertain, binds consequential meaning to authority and proof, and prevents actors from silently exceeding the context or control available to them.

Kraddle is an early-stage, local-first **semantic control system for software**.

It begins where ordinary AI coding tools move too quickly: between “I want this to exist” and generated code. Kraddle helps a builder clarify that intent into structured software meaning, connects the meaning to implementation and evidence, gives agents bounded context and authority, and checks whether resulting reality still agrees.

```text
intent
  → structured meaning
  → commitments
  → control and authority
  → bounded execution
  → observation and evaluation
  → intervention and reconciliation
```

## Current Status

Kraddle is in **implementation of the Phase 0/0.5 control kernel**. The repository currently contains:

- The evolving theory and checkpoints in `contexts/`.
- The canonical terminology and format reference in `docs/`.
- A working Phase 0/0.5 kernel runtime in `src/kernel.js`: envelope validation, committed transactions, quarantine-on-corruption, default-deny mutation authorization, effect admission, revision-pinned closure, typed coverage, and the two-block demo (`test/demo.test.js`).
- A regex dependency extractor (`src/extract.js`) and architecture-rule evaluator (`src/evaluators.js`).
- Test suite: `npm test` reports 44 pass / 6 todo / 0 fail. Six adversarial cases (AD-06..AD-09, AD-14, AD-15) are deferred with stated blockers.
- KRD binary encoding, repository analysis, agent-facing surface, and sync remain unimplemented.

Maturity labels used throughout the project:

| Label | Meaning |
| --- | --- |
| **Conceptual** | A theory or candidate semantic design |
| **Specified** | A normative contract detailed enough to implement |
| **Implemented** | Working software exists |
| **Verified** | Conformance tests establish the implementation's behavior |

## Quickstart (local, hand-installed)

Requirements: Node >= 20, git on PATH. No dependencies to install.

1. Clone the repository and run `npm install` (there are no runtime dependencies; this only satisfies tooling expectations).

2. Create a workspace for your repository:

   ```sh
   node src/cli.js init
   ```

   This creates `.kraddle/` in the current directory (run it from your repo root, or pass `--repo <dir>`).

3. Declare one rule, in your own words:

   ```sh
   node src/cli.js rule add --source src/domain --forbid src/ui \
     --text "domain must not import ui"
   ```

   The rule is pinned to your current git revision and to the dependency evidence extracted at that revision.

4. Launch an episode for your agent:

   ```sh
   node src/cli.js episode start --task "add a small domain service" \
     --write-prefix src/domain
   ```

   The command prints four environment variables. Paste them and start the MCP server:

   ```sh
   npm start
   ```

5. Point any MCP client at the server over stdio. The agent sees exactly three tools: read a file, write a file, request episode closure.

6. What you should see:
   - The agent reads and writes through those three tools and nothing else.
   - A write that would violate your rule is **denied, with your rule text quoted**, and the file is never written.
   - If the agent changes files outside the tool (directly on disk), closing the episode is **refused** and the changed paths are named.

What Kraddle is *not* doing here: there is no sandbox and no enforced perimeter. An agent can still write files directly; Kraddle denies admission for violating writes, refuses to record unadmitted changes as controlled execution, and offers no tool that can weaken the governing rule. It detects and refuses — it does not prevent. See the maturity table above for what is verified versus specified.

## The Problem

As software and agent activity grow, neither humans nor models can continuously hold all relevant context. Ordinary abstractions help by hiding detail, but each abstraction makes a wager:

> Hidden details cannot affect decisions above this boundary while the stated assumptions and invariants hold.

Control decays when that wager becomes false, invisible, stale, or unenforced.

Kraddle does not try to make every actor remember everything. It makes the abstraction boundary explicit:

```text
what is hidden
what is exported
what must remain true
under which assumptions
how it is evaluated
who may act or waive
what happens when it fails
```

## Product Loop

```text
1. Capture an idea, document, repository, or observation.
2. Clarify consequential ambiguity.
3. Compose software meaning across abstraction levels.
4. Accept commitments and preserve decisions and negative knowledge.
5. Compile consequential meaning into the strongest appropriate guardrails.
6. Resolve a context envelope and delegated authority for one task.
7. Execute one bounded episode.
8. Observe and evaluate the result.
9. Continue, close, repair, replan, escalate, waive, or abort.
10. Invalidate stale knowledge and reconcile meaning with reality.
```

## Architecture Vocabulary

### Kernel

The smallest physical semantic algebra:

```text
Unit          An identifiable thing Kraddle can discuss.
Commitment    What should be true, why, or under what constraint.
Relationship  A typed connection between records.
Evidence      What supports, challenges, or explains a statement.
Scope         Where and when meaning applies.
```

### Profile

A validated, standardized arrangement of kernel records representing one recurring concept. Profiles add semantics without inflating the kernel.

Examples:

```text
DecisionProfile
ProtocolProfile
EnvelopeProfile
NegativeKnowledgeProfile
ControlBinding
EvaluationProfile
AuthorityGrant
ContextEnvelope
ExecutionEpisode
ExceptionProfile
```

### Envelope

A profile whose purpose is to declare a boundary. A context envelope says what an actor knows and does not know. A resource envelope says under which quantitative operating conditions a commitment applies.

### Plane

A conceptual subsystem grouped by responsibility. A plane is not stored as a record.

```text
Semantic plane                Preserves meaning and evidence.
Control plane                 Resolves applicability, context, authority, and responses.
Execution/observation plane   Performs bounded work and emits evidence.
Evaluation plane              Compares resulting reality against commitments.
```

### Projection

A task-specific human or agent view derived from the same canonical records: meaning outline, element inspector, relationship map, context packet, evaluation report, or execution HUD.

## Meaning Model

Every software element may express four commitment families:

```text
does             Observable computation or behavior.
is_for           Purpose or higher-level capability served.
must_preserve    Contracts, invariants, boundaries, and prohibitions.
becomes_in_use   Runtime emergence and human experience.
```

Meaning connects vertically and horizontally:

```text
Vertical:   purpose → capability → behavior → component → function
Horizontal: dependencies, collaboration, state sharing, ordering, alternatives
```

Kraddle separates:

```text
Commitment      What should be true and why.
Computation     What implementation does.
Observation     What happened when it ran.
Interpretation  What the result means to a person or agent.
```

## Orthogonal State

A single status cannot faithfully represent semantic truth.

```text
epistemic_basis   observed | derived | interpreted | asserted
approval_state    proposed | accepted | rejected | superseded
evaluation_state  satisfied | violated | unknown | not_applicable |
                  indeterminate | evaluation_failed
freshness_state   current | stale | expired
confidence        explicit estimate
```

An accepted commitment may still be violated, unknown, or supported only by stale evidence.

## Precision Gradient

Meaning becomes as formal as risk requires:

```text
R0 Exploratory   Feeling, aspiration, unresolved thought.
R1 Descriptive   Scoped human-readable statement.
R2 Structured    Typed conditions, effects, thresholds, and exceptions.
R3 Evaluatable   A defined protocol can return a qualified result.
R4 Executable    A test, analyzer, monitor, type rule, or review procedure exists.
R5 Enforced      Failure gates, restricts, blocks, or escalates action.
```

Not all meaning should reach R5. “The interface should feel calm” may use a structured human review. “Domain must not import UI” can compile to a deterministic architecture rule.

## Meaning Compiler

The meaning compiler maps accepted commitments to the strongest appropriate operational artifacts while preserving the original meaning:

```text
original meaning
  → operationalization
  → evaluator or guardrail
  → invalidation dependencies
  → response policy
  → resulting evidence
```

Compiled outputs may include types, schemas, dependency rules, property tests, protocol checks, performance tests, runtime assertions, monitors, resource limits, sandbox permissions, human review rubrics, or escalation rules.

Determinism does not imply completeness. Every evaluator records coverage, blind spots, assumptions, version, and freshness.

## Control Objects

### Context Envelope

Declares task, scope, revision, included meaning, applicable commitments, allowed and forbidden effects, source inventory, traversal policy, omissions, stale inputs, unavailable sources, and a **relative completeness claim**.

### Execution Episode

One bounded attempt to change reality: purpose, intended delta, base revision, context envelope, authority, effects, proof obligations, escalation conditions, resulting revision, and outcome.

### Authority Grant

Distinguishes authorship, responsibility, approval authority, execution authority, waiver authority, and risk-acceptance authority.

### Evaluation

Records target, scope, revision, evaluator and version, inputs, coverage, result, evidence, uncertainty, blind spots, freshness, and invalidation triggers.

### Exception

A scoped, authorized, justified, expiring relaxation. It never deletes the original commitment.

## Project-Native Format

Kraddle's canonical state lives beside the project and uses no database engine or service:

```text
.kraddle/
├── manifest.krd       # workspace identity and format capabilities
├── schema.krd         # vocabulary and profile definitions
├── heads.krd          # current causal event heads
├── events/            # immutable KRD event segments
├── objects/           # content-addressed evidence and snapshots
├── indexes/           # rebuildable file-native KRI indexes
└── local/             # device-local state; never synchronized
```

The KRD/KRI byte layout remains **conceptual**, not implemented. The semantic and profile metamodel must be proven before storage optimization becomes a priority.

## Immediate Design Work

Seven connected specification problems remain:

```text
1. Profile realization metamodel
2. Profile identity and atomicity
3. Typed dependency and invalidation semantics
4. Complete evaluation lifecycle
5. Response-policy resolution
6. Meaning-compilation lifecycle
7. Closed-loop conformance and adversarial test suite
```

The normative completion plan is in `contexts/architecture_completion_plan_2026-09-01.md`. The first profile specification is in `contexts/profile_definition_metamodel_2026-09-01.md`.

## First Adversarial Proof

One test system should contain:

```text
Behavioral requirement
Architectural prohibition
Temporal protocol invariant
Quantitative resource envelope
Rejected alternative
Human-evaluated experience commitment
```

One agent change should deliberately trigger:

```text
local behavior succeeds but architecture fails
static structure succeeds but temporal behavior fails
functional behavior succeeds but the resource budget fails
the agent reintroduces a rejected approach
the agent attempts to weaken its governing commitment
a required evaluator cannot establish sufficient coverage
```

Kraddle succeeds when it resolves applicable meaning, declares context boundaries, bounds authority, distinguishes violations from evaluation failure, applies the correct response, preserves rationale and evidence, and closes only after obligations are satisfied or residual risk is explicitly accepted.

## Repository Guide

```text
docs/                                   Canonical visual reference
contexts/semantic_control_plane_*.md    Current architectural synthesis
contexts/architecture_completion_*.md  Remaining design work and review fixture
contexts/meaning_layer_architecture_*.md Storage and extraction lineage
contexts/kraddle_compositional_*.md     Meaning and deterministic extraction lineage
contexts/kraddle_checkpoint_*.md        Original missing-middle synthesis
```

Start with `docs/index.html`, then read `contexts/profile_definition_metamodel_2026-09-01.md` and the two newest architectural checkpoints.

## Current Claim

Kraddle does not promise that control never decays in an open, changing system. It aims to **bound control decay, make remaining uncertainty visible, and prevent silent movement beyond known context, evidence, or authority**.

Achievable guarantees, with current maturity:

| Guarantee | Maturity |
| --- | --- |
| No silent promotion of inference to accepted meaning | **Verified** (envelope + acceptance authority, test/envelope.test.js) |
| No silent omission of known applicable commitments | **Verified** (resolver, AD-01) |
| No silent execution outside delegated authority | **Verified at admission** (AD-02/AD-13; perimeter is advisory — no sandbox yet) |
| No silent success when required evaluation failed or did not run | **Verified** (AD-03/AD-11) |
| No silent reliance on stale evidence | **Verified for revision binding** (AD-05); general invalidation is unimplemented |
| No silent waiver of violations | **Specified, not implemented** (exception subsystem deferred) |
| No silent completeness claim beyond a declared boundary | **Verified for the Phase 0 decidable subset** (AD-01, typed coverage) |

Additional stated limitations: the admission perimeter is advisory (an agent can still write files directly — detection, not prevention); the event log is rename-atomic but not fsync-durable; dependency extraction is regex-based and can under-extract, which the evaluator treats as unknowns that block closure.
