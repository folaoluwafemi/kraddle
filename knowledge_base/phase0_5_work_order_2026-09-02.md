# Kraddle Phase 0.5 Work Order: Repairs and the First Demo

Date: September 2, 2026
Status: Executable work order.
Prerequisite: Phase 0 complete (23 pass / 6 todo / 0 fail at `0684dc7`).
Audience: An implementing agent with write access to `src/` and `test/` only.

---

## 0. Verified Starting State

```text
src/kernel.js            753 lines, 10 steps landed
test/kernel.test.js      6 pass
test/envelope.test.js    8 pass
test/adversarial.test.js 9 pass, 6 todo
npm test                 23 pass / 6 todo / 0 fail
```

Three audit findings to repair before new capability:

```text
A1  test/kernel.test.js "rejects a blocking control without an evaluator"
    still fails on governed_commitment, not the evaluator rule.
    The blocking-modality rule at src/kernel.js:190 has ZERO coverage.

A2  src/kernel.js:345-347 evidence pin is vacuous:
    evidence.stateRef?.revision === revision passes when BOTH are undefined.
    Caller omits revision + evidence lacks stateRef -> pin "passes".
    Fail-open edge in a fail-closed design.

A3  src/kernel.js:604 revision binding only runs when resultingStateRef
    exists. A no-op-claiming episode with effects absent and no resulting
    state skips binding entirely.

From the second external review (verified against code):

A4  src/kernel.js:431-449 classifyEffect matches ONLY admissionId.
    An observed effect carrying a real admissionId but a different
    operation/target (admitted "write src/domain/a.ts", recorded as
    "delete src/other/secrets.txt") classifies as controlled.
    The most important remaining gap in the effect boundary.

A5  src/kernel.js:658-666 init() unconditionally overwrites manifest.krd
    with a new workspace UUID and resets heads. Running init() twice
    silently changes workspace identity.

A6  src/kernel.js:714-749 transact() has no serialization. Two concurrent
    calls clone the same state; the later in-memory assignment and
    heads.krd write can discard the earlier transaction. This is
    in-process concurrency, not the deferred AD-08 branch problem.
```

---

## 1. Guardrails

Phase 0 plan guardrails G1-G10 (`knowledge_base/phase0_implementation_plan_2026-09-02.md`)
remain in force. Restating the critical five:

```text
G1  Never weaken an assertion or fixture to make a test pass.
    Fixture changes are permitted ONLY where a step explicitly instructs one,
    and only in the strengthening direction.
G3  Denial is the default. If unsure, deny.
G4  Assert on ControlDenial.code, never message text.
G5  Write only to src/ and test/. Never touch docs/, knowledge_base/, README.md.
G10 One commit per completed step, message "step N: <what>".
```

---

## 2. Scope

```text
IN:   three repairs (A1-A3), a regex dependency extractor,
      an architecture-rule evaluator, the two-block demo as an
      end-to-end test.

OUT: everything in Phase 0 Section 9, still deferred. AD-06 through
      AD-15 remain test.todo(). No parser (tree-sitter, LSP), no git
      integration, no CLI, no fs walking — the extractor consumes an
      in-memory file map.
```

---

## 3. Steps

### Step 1 — Match observed effects to their admissions  (repair A4)

```text
GOAL       An admission ID authorizes exactly the effect it admitted,
           not any effect that quotes it.

FILES      src/kernel.js, test/adversarial.test.js

IMPLEMENT  In classifyEffect, after finding the ledger entry, compare:
             observedEffect.operation === admission.operation
             observedEffect.target     === admission.target
           Any mismatch:
             { controlled: false, code: DENIAL.UNCONTROLLED_EFFECT,
               reason: "effect_mismatch" }
           The existing observedAt ordering check stays.

TEST       New test "an observed effect must match its admission":
             1. closureState; admitEffect write src/domain/a.ts;
                recordObservedEffect with that admissionId but
                operation "delete", target "src/other/secrets.txt"
                -> classifyEffect controlled === false,
                   reason "effect_mismatch"
                -> validateEpisodeClosure throws UNCONTROLLED_EFFECT
             2. positive: same admissionId with the matching
                operation and target -> controlled === true,
                closure passes.
           Existing AD-10 tests record matching effects and must
           pass unmodified.

VERIFY     npm test -> 25 pass / 6 todo / 0 fail.
```

### Step 2 — Make init() non-destructive  (repair A5)

```text
GOAL       Initialization can no longer silently replace an existing
           workspace identity.

FILES      src/kernel.js, test/kernel.test.js

API        Add DENIAL.WORKSPACE_EXISTS: "WORKSPACE_EXISTS".
           init() throws ControlDenial(WORKSPACE_EXISTS, { root })
           when .kraddle/manifest.krd already exists.
           Opening an existing workspace is done with new Workspace(root)
           followed by load(). No idempotent-init path in this phase.

TEST       Two tests in kernel.test.js:
             1. init() twice on the same root
                -> second call throws e.code === WORKSPACE_EXISTS,
                   manifest on disk unchanged (read it back, same
                   workspaceId as the first init returned).
             2. init(), transact one unit, new Workspace(root).load()
                -> state present, trusted true, no init() call needed.

VERIFY     npm test -> 27 pass / 6 todo / 0 fail.
```

### Step 3 — Serialize transact() and load()  (repair A6)

```text
GOAL       Concurrent calls within one process cannot lose a committed
           transaction or corrupt heads.

FILES      src/kernel.js, test/kernel.test.js

IMPLEMENT  Add a private promise chain: this._lock = Promise.resolve().
           transact() and load() each wrap their entire body in:
             const release = this._chain();
             try { ...body... } finally { release(); }
           where _chain() appends to the lock and returns a resolver.
           Sequential semantics; no parallelism within a Workspace.
           Add one code comment on transact(): rename is atomic but
           not fsync-durable; a crash after rename may lose the tail
           of the event history. This is a stated durability
           limitation of Phase 0, not a guarantee.

TEST       One test "concurrent transactions are serialized":
             init(); fire TWO transacts without awaiting the first
             (Promise.all). Then:
             - both event files exist (count === 2)
             - heads.krd contains both transaction ids, length 2
             - in-memory state contains both records
             - a fresh Workspace(root).load() projects both,
               trusted true, projectedThrough 2.

VERIFY     npm test -> 28 pass / 6 todo / 0 fail.
```

### Step 4 — Cover the blocking-modality rule  (repair A1)

```text
GOAL       The rule at src/kernel.js:190-192 gets a real test.

FILES      test/kernel.test.js

TEST       New test: "rejects a blocking control without an evaluator".
           Build a control_binding with ALL required roles present
           (governed_commitment, subject_selector, modality = "prohibition"),
           plus the evaluator role OMITTED. Transact with
           profileIds: [profile].
           Assert rejection with:
             e.code === DENIAL.ENVELOPE_INVALID
             e.detail.reason === "blocking_modality_requires_evalulator"
           Positive control: same fixture plus a valid evaluator unit and
           relationship -> the profile validates.

           Keep or replace the old test at line 57 as needed; the old
           version asserted the wrong failure and must not survive
           unchanged alongside a correct one.

VERIFY     npm test -> 29 pass / 6 todo / 0 fail.
```

### Step 5 — Fail closed on vacuous evidence pins  (repair A2)

```text
GOAL       An unpinned or partially-pinned evidence record can never
           count as pinned, including when the caller omits revision.

FILES      src/kernel.js, test/adversarial.test.js

IMPLEMENT  In resolveApplicableContext, replace the pin test with ALL of:
             - revision is a non-empty string
             - evidence exists
             - evidence.origin === "extractor"
             - evidence.approval_state === "accepted"
             - evidence.stateRef has repository, revision, contentDigest
               as non-empty strings
             - evidence.stateRef.revision === revision
           Any failure -> addReason(EVIDENCE_PIN_MISMATCH).
           Do NOT call validateStateReference here (it throws; we add a
           reason instead).

           NOTE the new approval_state requirement: extractor output is
           evidence, not truth. A human accepts it before it can pin a
           context. Existing fixtures already use env() default
           "accepted", so they keep passing.

TEST       Two new tests in adversarial.test.js:
             1. evidence WITHOUT stateRef, resolver called with no
                revision -> complete false, reasons include
                EVIDENCE_PIN_MISMATCH (the vacuous-pass case).
             2. evidence with full stateRef but resolver called WITHOUT
                revision -> EVIDENCE_PIN_MISMATCH.
           All existing AD-01 assertions must still pass unmodified.

VERIFY     npm test -> 31 pass / 6 todo / 0 fail.
```

### Step 6 — Require explicit no-op declaration  (repair A3)

```text
GOAL       An episode with no recorded effects must explicitly declare
           no-op, or closure is denied.

FILES      src/kernel.js, test/adversarial.test.js

API        Add DENIAL.NO_OP_NOT_DECLARED: "NO_OP_NOT_DECLARED".

IMPLEMENT  In validateEpisodeClosure, after computing hasEffects:
             if (!hasEffects && episode.noOp !== true)
               throw ControlDenial(NO_OP_NOT_DECLARED, { episodeId })
           This runs BEFORE the obligation loop.

           STRENGTHENING FIXTURE CHANGE (G1 exception, this step only):
           AD-05 and AD-03 positive-control fixtures have no admitted
           effects, so the new rule would deny them. Fix each fixture by
           calling admitEffect(state, "EP1", { operation: "write",
           target: "src/domain/a.ts" }) before closure. Their authority
           grants already allow "write" and lifecycle is "running".
           Do not delete or relax any existing assertion.

TEST       Two new tests:
             1. closureState({}) with NO admitted effects and no noOp
                -> throws NO_OP_NOT_DECLARED.
             2. same fixture with episode.noOp = true, plus a satisfied
                obligation -> closes.

VERIFY     npm test -> 33 pass / 6 todo / 0 fail.
```

### Step 7 — Regex dependency extractor

```text
GOAL       Classify import edges from an in-memory file map, honestly.

FILES      src/extract.js (new), test/extract.test.js (new)

API        export const SOURCE_EXTENSIONS = [".ts",".tsx",".js",".jsx",".mjs",".cjs"];

           export function computeFileMapDigest(files)
             files: object mapping repo-relative POSIX paths to string content
             returns sha256 hex over sorted `${path}\n${content}` joined by \n

           export function extractDependencies(files)
             returns { edges: [...], subjects: [...], limitations: "regex-extraction" }
             subjects = sorted Object.keys(files)
             edge = { from, to, spec, resolution, candidates? }
               from      importer path
               spec      the raw specifier string, or null for computed
               to        resolved target path, or null
               resolution in { resolved, ambiguous, unresolved, external }

RECOGNITION (regex only, no parser, no dependencies):
             Static import:  import ... from "spec", import "spec",
                             export ... from "spec"
             Static require: require("spec") with a string literal
             Dynamic:        import( or require( whose argument is NOT a
                             string literal -> unresolved edge, to: null

SPEC CLASSIFICATION:
             starts with "." or "/"  -> relative:
               exact key match in files            -> resolved
               else build candidates: spec + each extension in
                 SOURCE_EXTENSIONS order, then spec/index + each extension;
                 keep candidates that exist as keys:
                 1 candidate   -> resolved
                 >1 candidates -> ambiguous (to: null, candidates array)
                 0 candidates  -> unresolved (to: null)
             otherwise                -> external (to: the spec itself)

HONESTY     The module must open with a docstring stating: regex-based
            extraction can under-extract (unrecognized import forms are
            invisible); completeness claims are limited to recognized
            forms; a parser-based extractor is future work. Under-extraction
            is exactly why the evaluator treats unknowns as blocking, and
            why coverage subjects are the input files.

TEST       test/extract.test.js, six tests:
             1. relative spec resolving to an exact key -> resolved
             2. bare specifier "react" -> external
             3. "./Button" with Button.tsx AND Button.tsx? no — build a real
                ambiguity: keys "a/Button.ts" and "a/Button.js" both exist,
                spec "./Button" from "a/x.ts" -> ambiguous, 2 candidates
             4. import(VARIABLE) -> unresolved, to null, spec null
             5. "./missing" with no candidate -> unresolved
             6. computeFileMapDigest: same map in different key order
                -> same digest; different content -> different digest

VERIFY     npm test -> 39 pass / 6 todo / 0 fail.
```

### Step 8 — Architecture-rule evaluator

```text
GOAL       Evaluate "X must not import Y" over extracted edges, with
           unknowns blocking satisfaction.

FILES      src/evaluators.js (new), test/evaluators.test.js (new)

API        export function architectureRuleEvaluator({ sourcePrefix, forbiddenPrefix, files })
             Returns { result, coverage } shaped as the return of
             kernel.evaluate's injected run:
               1. edges = extractDependencies(files).edges
               2. relevant = edges where from starts with sourcePrefix
               3. violating = relevant resolved edges whose to starts
                  with forbiddenPrefix
               4. unknownFiles = unique froms of relevant edges with
                  resolution ambiguous or unresolved
               5. requiredSubjects = sorted file keys starting with
                  sourcePrefix
                  coveredSubjects = required minus unknownFiles
                  unknownSubjects = unknownFiles
                  excludedSubjects = []
                  selectionMethod = "source_prefix_files"
                  coverageDigest = computeCoverageDigest(coverage)
                  (import from kernel.js)
               6. result:
                    violating.length > 0      -> "violated"
                    unknownSubjects.length>0  -> "unknown"
                    otherwise                 -> "satisfied"

NOTE       The binding's forbidden prefix lives on the governed
           commitment record as an optional field forbiddenPathPrefix
           (e.g. "src/ui/"). The evaluator itself takes plain prefixes;
           callers pass the same constants used to build the binding, so
           rule and evaluator agree by construction.

TEST       test/evaluators.test.js, three tests (build file maps inline):
             1. src/domain/service.ts importing ../ui/Button.tsx
                (key src/ui/Button.tsx exists) -> "violated"
             2. same but the import is dynamic import(cfg.button)
                -> "unknown", unknownSubjects contains service.ts
             3. clean map: domain imports only domain helper -> "satisfied",
                coverage sufficient via kernel.validateCoverage

VERIFY     npm test -> 42 pass / 6 todo / 0 fail.
```

### Step 9 — The two-block demo, end to end

```text
GOAL       The demo from Phase 0 §8, as one honest test. Advisory
           perimeter language per Phase 0 §0b applies: we claim
           "denies admission and refuses to record as controlled",
           never "blocked the agent's write".

FILES      test/demo.test.js (new)

FIXTURE    File map:
             src/domain/service.ts   imports ../ui/Button
             src/domain/helper.ts    (no imports)
             src/ui/Button.tsx       imports react (external)
           const stateRef = { repository: "demo-repo", revision: "rev-b",
             contentDigest: computeFileMapDigest(files) }

SEQUENCE   1. Workspace init.
           2. Human transacts, one transaction, profileIds ["CB1"]:
                scope, evaluator unit,
                governed commitment C1 value "domain must not import ui"
                  with forbiddenPathPrefix "src/ui/",
                subject selector commitment S1 value
                  { type: "path_prefix", value: "src/domain/" }   <- OBJECT
                  (the resolver reads value.type; a bare string will
                  silently become an unresolved selector),
                modality commitment "prohibition",
                binding unit CB1 (control_binding), and the four role
                relationships. All records env() defaults (accepted,
                human origin).
           3. Extract: extractDependencies(files); build an Evidence
              record (kind "evidence", origin "extractor",
              epistemic_basis "observed", approval_state "accepted",
              stateRef, edges). Human transacts it.
           4. Resolve: resolveApplicableContext(state, { targetPaths:
              ["src/domain/service.ts"], declaredApplicable: ["CB1"],
              revision: "rev-b", dependencyEvidenceId })
              -> complete === true, applicable deep-equals ["CB1"].
           5. Human transacts episode EP1 (profileIds ["EP1"]):
              lifecycle "running", context envelope carrying
              complete: true and the resolver's incompleteReasons: [],
              authority grant operations ["write"], allowRecordIds: [],
              baseStateRef, resultingStateRef = stateRef, plus the six
              required role relationships (mirror the adversarial
              episode fixture).
           6. admitEffect write to src/domain/service.ts -> admitted.
              recordObservedEffect with the real admissionId.
           7. Evaluate: kernel.evaluate(state, { evaluationId: "EV1",
              evaluatorId: "architecture-rule",
              evaluatorVersion: "0.1.0",
              subjects: ["src/domain/service.ts","src/domain/helper.ts"],
              stateRef, run: () => architectureRuleEvaluator({
                sourcePrefix: "src/domain/",
                forbiddenPrefix: "src/ui/", files }) })
              -> result "violated".
           8. Human transacts the evaluation profile (mirror AD-11's
              profile construction: target_commitment = C1,
              target_selector, source_scope, evaluator, result
              commitment value "violated", coverage commitment), plus
              relationship role "proof_obligation" from EP1 to EV1.
           9. FIRST BLOCK: validateEpisodeClosure throws
              EVALUATION_NOT_SATISFIED.
          10. SECOND BLOCK: agent attempts, each via transact with
              { actorId: "agent-1", episodeId: "EP1" }:
                a. commitment.update weakening C1 value to
                   "domain may import ui"
                   -> SELF_AMENDMENT_DENIED
                b. relationship.add grafting a second evaluator onto CB1
                   -> PROFILE_GRAFT_DENIED
              Assert after each: the events directory file count is
              unchanged, C1 value unchanged, CB1 evaluator relationships
              still exactly one.
          11. Positive control, second test: a clean file map
              (service.ts imports ../domain/helper.ts instead) -> full
              sequence -> evaluator "satisfied" -> closure
              { closable: true, episodeId }.

TEST       Two tests: "the two-block demo" (steps 1-10) and
           "the clean control closes" (step 11). Assert on codes, not
           messages. No test-local helpers shared with other files;
           duplicate the small env/rel helpers locally.

VERIFY     npm test -> 44 pass / 6 todo / 0 fail.
```

---

## 4. Definition Of Done

```text
npm test: 44 pass / 6 todo / 0 fail. Exact tally reported.
An observed effect must match the operation and target of its admission.
init() cannot overwrite an existing workspace.
transact() and load() are serialized within a Workspace.
The blocking-modality rule has direct coverage.
A vacuous evidence pin cannot pass.
A no-op episode requires an explicit noOp declaration.
The extractor classifies all four edge resolutions and documents
  its own under-extraction limitation in the module docstring.
The demo test proves both blocks and the clean positive control.
No assertion was weakened. Permitted fixture changes occurred only
  in Step 6, in the strengthening direction.
Nine commits, one per step, each green when made.
```

---

## 5. Report Back

```text
Final tally:          __ pass / __ todo / __ fail
Steps completed:      __ of 9 (plus final verification)
Guardrails violated:  none | list
Deviations from plan: none | list with reason
Blocked on:           nothing | describe
Files changed:        list
```

Stop and report rather than improvise. A blocked report beats a green
run the plan did not authorize.

---

## 6. Standing Instruction

The demo is the deliverable. Everything that does not serve the two
blocks — the violation denial and the self-amendment denial — is out
of scope until a test demands it.
