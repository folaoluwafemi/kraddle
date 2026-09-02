# Kraddle Phase 0 Implementation Work Order

Date: September 2, 2026
Status: Executable work order. Not theory. Not a checkpoint.
Revision: 2 — amended after second adversarial review. 12 findings incorporated.
Audience: An implementing agent with write access to `src/` and `test/` only.

---

## 0a. Verified Starting State

Read at `836c34e`, working tree clean. Two findings from the earlier review are
**already fixed**. This plan accounts for that. Do not re-fix them.

```text
ALREADY FIXED — verify only, do not redo

src/kernel.js:165-168   authority fallback is gone.
                        Reads `const allowed = authority?.operations` and throws
                        when it is not an array. Step 4(a) is therefore a
                        regression guard, not new work.

src/kernel.js:254-261   load() no longer silently skips. It now throws on a
                        missing commit marker or a digest mismatch. The silent
                        omission is gone. Step 3 changes this from a hard throw
                        to quarantine semantics, which is a different fix.

STILL BROKEN — this plan's actual work

src/kernel.js:72-88     applyOperation accepts any object with an id.
                        No envelope. No origin, epistemic_basis, approval_state,
                        or freshness_state anywhere in the runtime.

src/kernel.js:274       actorId is stamped onto every operation and authorizes
                        nothing. Any actor can update any record.

src/kernel.js:199       coverage sufficiency is `coverage.value === "complete"`.

src/kernel.js:198       a satisfied result at the wrong revision reads as a pass.
                        No revision is pinned anywhere.

test/adversarial.test.js  15 typeof-checks. 4 pass because admitEffect and
                        validateEpisodeClosure exist. Zero behavior asserted.

test/kernel.test.js:60  "does not expose an incomplete transaction after a
                        temporary-file interruption" interrupts nothing.

absent                  resolveApplicableContext, authorizeMutation, evaluate,
                        validateCoverage do not exist.
```

---

## 0b. Perimeter Status: Advisory

Phase 0 admission is **advisory classification, not enforcement**.

There is no sandbox, no CLI wrapper, and no controlled write path in this
phase. An agent can write files, run commands, and edit package.json directly,
then call the runtime afterward. What this phase builds is the ability to
**detect and refuse to represent** that as controlled execution.

```text
May claim:      "Kraddle denies admission and refuses to record the
                 effect as controlled execution."
May NOT claim:  "Kraddle blocked the agent's effect."
```

An enforced perimeter is future work, out of scope here. Do not let advisory
wording drift into enforcement wording — in code comments, tests, or
report-backs.

---

## 0. How To Use This Document

This is a sequenced work order. Execute steps in order. Do not skip. Do not reorder.

Each step has the same shape:

```text
GOAL        one sentence
FILES       exact paths you may touch
API         exact signatures and return shapes, pre-decided
TEST        write this first; confirm it fails for the stated reason
IMPLEMENT   make it pass
VERIFY      exact command and exact expected output
```

Every step follows red-then-green. Write the test, run it, confirm it fails **with the reason
the step names**. If it fails for a different reason, stop and report; do not proceed.

---

## 1. Non-Negotiable Guardrails

These exist because this codebase's entire thesis is that guarantees must not be silently
weakened. Weakening a check to make a test pass is the specific failure this project exists
to prevent. Violating any rule below invalidates the work.

```text
G1  Never weaken an assertion to make a test pass.
    If a test fails, fix the implementation, not the test.
    The one exception is Step 2, which explicitly rewrites existing test helpers.

G2  Never delete or skip a failing test to get a green run.
    Deferred cases use test.todo(). Nothing else is permitted to disappear.

G3  Never widen a permission to make admission succeed.
    Denial is the correct default. If unsure whether to admit, deny.

G4  Never assert on human-readable error message text.
    Assert only on ControlDenial.code. Message text may change freely.

G5  Do not create files other than those listed in a step's FILES section.
    Do not modify README.md, DESIGN.md, docs/, or any file in contexts/.

G6  Do not add exported symbols that no step asks for.
    The export surface is a contract. Extra capability is scope creep.

G7  Do not implement anything in Section 9 (Out Of Scope).
    If a step seems to require it, stop and report instead of building it.

G8  The six existing tests in test/kernel.test.js are the green baseline.
    They may only change in Step 2 and Step 3, and only as those steps describe.
    They must be green at the end of every step.

G9  Do not install dependencies. Node's built-in test runner and node:crypto
    are sufficient for every step here. package.json must stay dependency-free.

G10 Commit once per completed step, with the step number in the message,
    tests and verification included. A step already satisfied by existing
    code needs no commit. Do not batch steps.
```

---

## 2. Scope Decision: Nine In, Six Deferred

The current `test/adversarial.test.js` reports 15 cases. It verifies zero behavior. It
asserts that functions with certain names exist. Four cases "pass" only because
`admitEffect` and `validateEpisodeClosure` already exist for unrelated reasons.

Replace it. Nine cases become real behavioral tests in this phase. Six become `test.todo()`
because they require subsystems this phase deliberately defers.

### In scope this phase

```text
AD-01  narrow context omits an applicable prohibition       needs applicability resolver
AD-02  agent mutates its own governing control              needs mutation authorization
AD-03  evaluation_failed cannot satisfy a blocking obligation
AD-04  coverage excludes changed files                      needs typed coverage
AD-05  base-revision evaluation cannot close a later revision  needs revision pinning
AD-10  effects recorded after bypassing admission           needs admission ledger
AD-11  evaluator parse failure is never a pass
AD-12  interrupted transaction is never projected           needs fail-closed load
AD-13  revoked authority suspends the next effect
```

### Deferred this phase — `test.todo()` with a stated blocker

```text
AD-06  ambiguous anchor pauses execution      blocked on: code anchor subsystem
AD-07  unknown extension cannot authorize     blocked on: schema capability negotiation (P9)
AD-08  concurrent heads block execution       blocked on: causal clocks and heads (P3)
AD-09  exception request is not authorization blocked on: exception subsystem (P7)
AD-14  expired exception suspends effect      blocked on: exception subsystem (P7)
AD-15  delayed invalidation preserves stale authorization  blocked on: typed invalidation (P6)
```

A `todo` test is honest. A capability check that passes because a function name exists is not.
This distinction is the point.

---

## 3. Shared Primitives

Add these first. Every later step depends on them.

### 3.1 ControlDenial

All control refusals throw this. Never a bare `Error`. Never a string match in a test.

```js
export class ControlDenial extends Error {
  constructor(code, detail = {}) {
    super(`${code}: ${JSON.stringify(detail)}`);
    this.name = "ControlDenial";
    this.code = code;
    this.detail = detail;
  }
}
```

### 3.2 Closed code set

Export as a frozen object. Adding a code requires a plan amendment.

```js
export const DENIAL = Object.freeze({
  ENVELOPE_INVALID:                 "ENVELOPE_INVALID",
  ENVELOPE_ENUM_INVALID:            "ENVELOPE_ENUM_INVALID",
  ACCEPTANCE_NOT_AUTHORIZED:        "ACCEPTANCE_NOT_AUTHORIZED",

  SELF_AMENDMENT_DENIED:            "SELF_AMENDMENT_DENIED",
  AUTHORITY_SELF_AMENDMENT_DENIED:  "AUTHORITY_SELF_AMENDMENT_DENIED",
  AUTHORITY_MISSING_OPERATIONS:     "AUTHORITY_MISSING_OPERATIONS",
  AUTHORITY_EXPIRED:                "AUTHORITY_EXPIRED",
  AUTHORITY_REVOKED:                "AUTHORITY_REVOKED",

  OPERATION_NOT_AUTHORIZED:         "OPERATION_NOT_AUTHORIZED",
  OPERATION_FORBIDDEN:              "OPERATION_FORBIDDEN",
  TARGET_OUTSIDE_AUTHORITY:         "TARGET_OUTSIDE_AUTHORITY",
  MUTATION_NOT_AUTHORIZED:          "MUTATION_NOT_AUTHORIZED",
  PROFILE_GRAFT_DENIED:             "PROFILE_GRAFT_DENIED",

  CONTEXT_INCOMPLETE:               "CONTEXT_INCOMPLETE",
  OMITTED_APPLICABLE_COMMITMENT:    "OMITTED_APPLICABLE_COMMITMENT",
  UNRESOLVED_SELECTOR:              "UNRESOLVED_SELECTOR",
  UNRESOLVED_DEPENDENCY_EDGE:       "UNRESOLVED_DEPENDENCY_EDGE",

  EPISODE_NOT_ACTIVE:               "EPISODE_NOT_ACTIVE",
  EPISODE_OUTCOME_MISSING:          "EPISODE_OUTCOME_MISSING",
  UNCONTROLLED_EFFECT:              "UNCONTROLLED_EFFECT",

  EVALUATION_RESULT_INVALID:        "EVALUATION_RESULT_INVALID",
  EVALUATION_NOT_SATISFIED:         "EVALUATION_NOT_SATISFIED",
  EVALUATION_FAILED_NOT_A_PASS:     "EVALUATION_FAILED_NOT_A_PASS",
  EVALUATION_REVISION_MISMATCH:     "EVALUATION_REVISION_MISMATCH",
  EVALUATION_STALE:                 "EVALUATION_STALE",

  COVERAGE_INCOMPLETE:              "COVERAGE_INCOMPLETE",
  COVERAGE_UNKNOWN_NONEMPTY:        "COVERAGE_UNKNOWN_NONEMPTY",
  COVERAGE_EXCLUSION_NOT_PERMITTED: "COVERAGE_EXCLUSION_NOT_PERMITTED",
  COVERAGE_DIGEST_MISMATCH:         "COVERAGE_DIGEST_MISMATCH",

  SEGMENT_DIGEST_MISMATCH:          "SEGMENT_DIGEST_MISMATCH",
  SEGMENT_COMMIT_MARKER_MISSING:    "SEGMENT_COMMIT_MARKER_MISSING",
  PROJECTION_UNTRUSTED:             "PROJECTION_UNTRUSTED",
  EVIDENCE_PIN_MISMATCH:            "EVIDENCE_PIN_MISMATCH",
});
```

### 3.3 Record envelope

Every canonical record carries this. No exceptions, no optional bypass.

```text
id              string, required
kind            string, required
origin          human | extractor | agent | policy | import          required
epistemic_basis observed | derived | interpreted | asserted          required
approval_state  proposed | accepted | rejected | superseded          required
freshness_state current | stale | expired                            required
confidence      number 0..1                                          optional
scope_id        string                                               optional
recorded_at     number, epoch ms                                     required
```

### 3.4 StateReference

```text
StateReference
  repository     string
  revision       string
  contentDigest  string
```

### 3.5 Dependency edge resolution class

Not used until Step 8, but define the shape now so the extractor built later has a target.

```text
resolved    single statically determined target
ambiguous   more than one candidate target
unresolved  dynamic or computed target; cannot be determined statically
external    target outside the workspace boundary
```

Rule, load-bearing: **any `ambiguous` or `unresolved` edge reachable within the traversed
region forces the context to `complete: false`.** A dependency graph that silently omits
edges it could not resolve produces a false completeness claim, which is the exact failure
this system exists to prevent.

---

## 4. Steps

### Step 1 — ControlDenial and the code set

```text
GOAL       Introduce structured denials. No behavior change yet.

FILES      src/kernel.js

API        export class ControlDenial (§3.1)
           export const DENIAL       (§3.2)

IMPLEMENT  Add both. Convert every existing `throw new Error(...)` in kernel.js to
           `throw new ControlDenial(DENIAL.<CODE>, { ...detail })` using the mapping below.
           Do not change any control logic. Only change the throw type.

           existing message fragment            ->  code
           ---------------------------------------------------------------
           "Unknown profile root"               ->  ENVELOPE_INVALID
           "role ... requires exactly"          ->  ENVELOPE_INVALID
           "role ... has an invalid target"     ->  ENVELOPE_INVALID
           "blocking modality requires"         ->  ENVELOPE_INVALID
           "invalid evaluation result"          ->  EVALUATION_RESULT_INVALID
           "is not active"                      ->  EPISODE_NOT_ACTIVE
           "incomplete context envelope"        ->  CONTEXT_INCOMPLETE
           "expired or revoked authority"       ->  AUTHORITY_EXPIRED
           "incomplete authority operations"    ->  AUTHORITY_MISSING_OPERATIONS
           "Uncommitted event segment"          ->  SEGMENT_COMMIT_MARKER_MISSING
           "Corrupt event segment"              ->  SEGMENT_DIGEST_MISMATCH
           "is not authorized"                  ->  OPERATION_NOT_AUTHORIZED
           "is forbidden"                       ->  OPERATION_FORBIDDEN
           "outside authority scope"            ->  TARGET_OUTSIDE_AUTHORITY
           "requires an outcome"                ->  EPISODE_OUTCOME_MISSING
           "unsatisfied proof obligation"       ->  EVALUATION_NOT_SATISFIED
           "insufficient proof coverage"        ->  COVERAGE_INCOMPLETE
           "stale or failed evaluation"         ->  EVALUATION_STALE

TEST       Update the four regex assertions in test/kernel.test.js to assert on code:
             assert.rejects(fn, (e) => e.code === DENIAL.ENVELOPE_INVALID)
             assert.throws(fn,   (e) => e.code === DENIAL.<CODE>)
           This is permitted under G8. Do not change what the tests exercise.

VERIFY     npm test
           Expect: 6 kernel tests pass. Adversarial file untouched, still 4 pass / 11 fail.
```

---

### Step 2 — Record envelope, enforced

```text
GOAL       Make Format Invariant 03 real. Inference cannot become accepted meaning silently.

FILES      src/kernel.js, test/kernel.test.js, test/envelope.test.js (new)

API        export function validateEnvelope(record)
             throws ControlDenial(ENVELOPE_INVALID, { id, missing: [...] })
                 or ControlDenial(ENVELOPE_ENUM_INVALID, { id, field, value })
             returns record unchanged on success

           export const ENVELOPE_ENUMS = Object.freeze({
             origin:          ["human","extractor","agent","policy","import"],
             epistemic_basis: ["observed","derived","interpreted","asserted"],
             approval_state:  ["proposed","accepted","rejected","superseded"],
             freshness_state: ["current","stale","expired"],
           });

IMPLEMENT  Call validateEnvelope(value) at the top of applyOperation for every
           create and update operation type. Tombstone is exempt.
           Enforce: required fields present; each enum field's value is in its list;
           confidence, if present, is a number in [0,1].

           Cross-field rule (acceptance authority), enforced in Workspace.transact:
           if actorId is not "human" and does not start with "policy-", any
           operation whose value.approval_state === "accepted" throws
           ControlDenial(ACCEPTANCE_NOT_AUTHORIZED, { actorId, recordId }).
           An agent may propose. Only a human or policy actor may accept.
           Envelope fields alone do not enforce the thesis; this rule does.

TEST       test/envelope.test.js — six cases, one per rule:
             missing origin                  -> ENVELOPE_INVALID
             missing epistemic_basis         -> ENVELOPE_INVALID
             missing approval_state          -> ENVELOPE_INVALID
             missing freshness_state         -> ENVELOPE_INVALID
             origin: "robot"                 -> ENVELOPE_ENUM_INVALID
              confidence: 1.5                 -> ENVELOPE_ENUM_INVALID
              actor "agent-1" sets approval_state "accepted"
                                             -> ACCEPTANCE_NOT_AUTHORIZED
            Plus one positive: a fully valid record, created by actorId "human",
            is accepted.

           test/kernel.test.js — the helpers `unit`, `commitment`, `edge` must now
           produce valid envelopes. Add a shared default:

             const env = (over = {}) => ({
               origin: "human", epistemic_basis: "asserted",
               approval_state: "accepted", freshness_state: "current",
               recorded_at: 1756771200000, ...over,
             });

           G1 APPLIES WITH FULL FORCE HERE. All six baseline tests will break.
           Fix them by giving records valid envelopes. Do NOT make envelope
           validation optional, conditional, or opt-in to get them green.

VERIFY     npm test
           Expect: 6 kernel tests pass, 8 envelope tests pass.
```

---

### Step 3 — Fail closed on corrupt segments  → AD-12

```text
GOAL       Change hard-throw into quarantine, so partial history is inspectable
           while still refusing to authorize anything.

FILES      src/kernel.js, test/kernel.test.js, test/adversarial.test.js

CURRENT    load() now THROWS on a missing commit marker or digest mismatch.
           The silent skip is already gone. But a throw makes the whole workspace
           unreadable — you cannot see which records were valid, and AD-12 requires
           "old or new valid profile only", which means projecting up to the last
           good point, not refusing to project at all.

API        Workspace.load() returns:
             {
               state,
               trusted: boolean,
               quarantined: [{ file, code, index }],
               projectedThrough: number     // count of segments applied
             }
           Workspace.trusted and Workspace.quarantined are also set as fields.

IMPLEMENT  Iterate segments in LEXICAL SEGMENT ORDER (sorted filename order).
           This is NOT causal order — Phase 0 has no causal clocks — and every
           comment and doc must say "lexical segment order", not "causal order."
           For each segment:
             - missing trailing transaction.commit  -> quarantine SEGMENT_COMMIT_MARKER_MISSING
             - digest mismatch                      -> quarantine SEGMENT_DIGEST_MISMATCH
           On the FIRST quarantine: record it, set trusted = false, and STOP.
           Do not apply that segment or any later segment, ever. Later segments
           after a bad one are ignored regardless of their own validity.

           Persistence: write the quarantine report to
           .kraddle/local/quarantine.json (device-local, never synchronized).
           Repair of a quarantined segment is OUT OF SCOPE. An operator may
           fix or remove the file manually and reload; that is all.

           Add: export function requireTrustedProjection(workspace)
             throws ControlDenial(PROJECTION_UNTRUSTED, { quarantined })
           Call it at the top of admitEffect, evaluate, and
           validateEpisodeClosure whenever a workspace is supplied.
           trusted === false blocks ALL controlled operations, not some.

           BREAKING: load() returns the wrapper object everywhere. Update every
           caller that used the bare state return, including reload assertions
           in test/kernel.test.js.

TEST       AD-12 in test/adversarial.test.js:
             1. init workspace
             2. transact T1 (one valid unit)   -> record its unit id
             3. transact T2 (one valid unit)
             4. transact T3 (one valid unit)   -> record its unit id
             5. on disk, rewrite T2's .krd file with its last line removed
             6. new Workspace(root).load()
           Assert:
             result.trusted === false
             result.quarantined.length === 1
             result.quarantined[0].code === DENIAL.SEGMENT_COMMIT_MARKER_MISSING
             state.units.has(T1 unit id) === true
             state.units.has(T3 unit id) === false      // fail closed, not skip forward
             result.projectedThrough === 1

           ALSO FIX test/kernel.test.js: the test named
           "does not expose an incomplete transaction after a temporary-file interruption"
           does not interrupt anything. It writes a complete transaction and reads it back.
           Rename it to "reloads a committed transaction" and leave it as a
           round-trip test. AD-12 is now the real interruption test.

VERIFY     npm test
           Expect: AD-12 passes. Baseline green.
```

---

### Step 4 — Default-deny mutation authorization  → AD-02, AD-13

```text
GOAL       The governed actor cannot define its own limits, and cannot edit the rule
           that governs it. This is the product differentiator; treat it as such.

FILES      src/kernel.js, test/adversarial.test.js

CURRENT    The fallback is ALREADY REMOVED (src/kernel.js:165-168). What is missing
           is mutation authorization: actorId is stamped at line 274 and authorizes
           nothing. Any actor can update any record, including its own authority
           grant and the control binding that governs it.

API        export function governingRecordIds(state, episodeId) -> Set<string>
             PHASE 0 CONSERVATIVE RULE — the full applicability resolver does not
             exist until Step 8, so this must NOT depend on it.
             Definition: every control_binding in state whose approval_state is
             "accepted". For each: the profile root id and every role target id.
             Plus the episode's authority_grant id and its role target ids.
             Over-broad is correct here. Denying too much is safe. Step 8
             refines applicability without changing this signature.

           export function authorizeMutation(state, { actorId, operation, targetId, episodeId })
             returns { authorized: true } or throws ControlDenial.
             DEFAULT DENY. "Otherwise authorized" does not exist in this model.
             Rules, checked in this order:
               1. operation is relationship.add/update and value.profileId is
                  in governingRecordIds
                  -> PROFILE_GRAFT_DENIED     (no new members onto governing
                                              profiles; membership is frozen)
               2. targetId is the episode's authority_grant or one of its
                  role target ids
                  -> AUTHORITY_SELF_AMENDMENT_DENIED
               3. targetId is in governingRecordIds(state, episodeId)
                  -> SELF_AMENDMENT_DENIED
               4. operation is a .create (unit/commitment/relationship/
                  evidence/scope)
                  -> authorized. The Step 2 cross-field rule independently
                     blocks approval_state "accepted" from non-human actors.
               5. operation is an update or tombstone of an existing record:
                  authorized ONLY IF targetId appears in the authority grant's
                  allowRecordIds array. A missing or empty allowRecordIds
                  denies every update.
                  -> MUTATION_NOT_AUTHORIZED
               6. anything else -> MUTATION_NOT_AUTHORIZED

IMPLEMENT  (a) REGRESSION GUARD ONLY — the authority fallback is already gone.
               Confirm `allowedOperations` appears nowhere in src/. Do not
               rewrite that code.

           (b) Split the combined expiry/revocation throw into two codes:
                 authority.revoked === true      -> AUTHORITY_REVOKED
                 authority.expiresAt <= now      -> AUTHORITY_EXPIRED

           (c) Suspension is DERIVED, never mutated. admitEffect performs no
               state writes. Add:
                 export function episodeStatus(state, episodeId) -> string
               Returns "suspended" when the episode's authority grant is
               revoked or expired, else the episode's lifecycle value. This is
               sound because the revocation itself is event-backed: the
               authority record with revoked:true entered state through a
               committed transaction, so derived suspension survives reload
               with no extra event. No in-memory-only lifecycle mutation is
               permitted anywhere in src/.

           (d) Workspace.transact(operations, { profileIds, actorId, episodeId })
               When episodeId is provided, run authorizeMutation for EVERY
               operation before applying any of them. One denial rejects the
               whole transaction. Nothing is written. Nothing is partially
               applied. When episodeId is absent, the actor is the human trust
               root and mutation authorization does not apply — Phase 0 admits
               this; §0b labels the perimeter.

TEST       AD-02 in test/adversarial.test.js:
              Build: ControlBinding CB1 (approval_state "accepted")
                governed_commitment C1 value "domain must not import ui"
                subject_selector    S1 value "src/domain/"
                modality            M1 value "prohibition"
                evaluator           E1
              Episode EP1, lifecycle "running", context envelope citing CB1,
              authority grant { operations:["write"], allowRecordIds: [] }.
              Agent actorId "agent-1" attempts:
                transact([{ type:"commitment.update",
                            value:{ ...C1, value:"domain may import ui" } }],
                         { actorId:"agent-1", episodeId:"EP1" })
            Assert:
              rejects with e.code === DENIAL.SELF_AMENDMENT_DENIED
              state.commitments.get("C1").value === "domain must not import ui"
              no new .krd segment was written (compare events dir file count before/after)

            AD-13 in test/adversarial.test.js:
              Fixture state: Episode EP1 running, authority grant
              { operations:["write"], revoked:true }
            Assert:
              admitEffect throws e.code === DENIAL.AUTHORITY_REVOKED
              episodeStatus(state, "EP1") === "suspended"
              the episode record itself is unmodified (no lifecycle write)
            Then in a real workspace: transact the revoked authority record,
            reload from disk, assert episodeStatus still returns "suspended".
            This proves suspension is event-backed, not in-memory.

            GRAFT case:
              agent-1 attempts relationship.add with
              { profileId:"CB1", role:"evaluator", targetId:"fake-evaluator" }
            Assert:
              rejects with e.code === DENIAL.PROFILE_GRAFT_DENIED
              no evaluator relationship was added to CB1

            DEFAULT-DENY case:
              agent-1 attempts commitment.update on C2, an unrelated,
              non-governing commitment, with grant allowRecordIds []
            Assert:
              rejects with e.code === DENIAL.MUTATION_NOT_AUTHORIZED

            ALLOWED case (positive control):
              grant allowRecordIds ["C2"]; agent-1 updates C2's title
            Assert:
              authorized; C2 title updated; C2.approval_state !== "accepted"

            REGRESSION case proving the fallback is gone:
              Episode with allowedOperations:["write"], authority grant with NO
              operations array. admitEffect(...,{operation:"write"}) must throw
              AUTHORITY_MISSING_OPERATIONS.
            If this passes by admitting the effect, the fallback was not removed.

VERIFY     npm test
           Expect: AD-02, AD-13 pass. Baseline green.
```

---

### Step 5 — Revision pinning  → AD-05

```text
GOAL       An evaluation of old code cannot close an episode that produced new code.

FILES      src/kernel.js, test/adversarial.test.js

API        export function validateStateReference(ref)
             requires repository, revision, contentDigest; all non-empty strings
             throws ControlDenial(ENVELOPE_INVALID, { field }) otherwise

IMPLEMENT  Episode records gain: baseStateRef, resultingStateRef (both StateReference).
           Evaluation records gain: stateRef.

           validateStateReference(ref) requires repository, revision, AND
           contentDigest — all three, non-empty strings. A bare revision string
           is not a state reference.

           In validateEpisodeClosure:
             1. If the episode has admitted effects or observed effects,
                resultingStateRef is REQUIRED. An effect-bearing episode
                without a resulting state reference throws
                EVALUATION_REVISION_MISMATCH with reason "resulting_state_missing".
                A no-op episode must carry an outcome that explicitly
                declares no-op.
             2. For every proof obligation's evaluation, require FULL state
                reference equality: repository, revision, and contentDigest
                must each match episode.resultingStateRef. Any mismatch
                throws EVALUATION_REVISION_MISMATCH with the differing
                field(s) named in detail.
           Check revision binding BEFORE the satisfied check. A satisfied
           result at the wrong state must not read as a pass on the way to a
           different denial.

TEST       AD-05 in test/adversarial.test.js:
             Episode EP1: baseStateRef.revision "rev-a", resultingStateRef.revision "rev-b",
                          outcome present.
             Evaluation EV1: result "satisfied", coverage "complete",
                             stateRef.revision "rev-a"
             EP1 has proof_obligation -> EV1
           Assert:
             validateEpisodeClosure throws e.code === DENIAL.EVALUATION_REVISION_MISMATCH
             e.detail.evaluated === "rev-a"
             e.detail.required  === "rev-b"

            Variant: EV1.stateRef.revision === "rev-b" but contentDigest differs
              -> still EVALUATION_REVISION_MISMATCH, detail names contentDigest

            Positive control: same fixture with EV1.stateRef fully equal to
            EP1.resultingStateRef must close successfully. Without this, the
            test could pass by always throwing.

VERIFY     npm test
           Expect: AD-05 passes plus its positive control. Baseline green.
```

---

### Step 6 — Typed coverage  → AD-04

```text
GOAL       Replace the string coverage === "complete" check with a real subject-set test.

FILES      src/kernel.js, test/adversarial.test.js

CURRENT    validateEpisodeClosure compares coverage.value === "complete". A scalar
           claim. An evaluator that examined one of two changed files can assert it.

API        Coverage shape:
             {
               requiredSubjects: string[],
               coveredSubjects:  string[],
               unknownSubjects:  string[],
               excludedSubjects: string[],
               selectionMethod:  string,
               coverageDigest:   string
             }

           export function normalizeSubjectSet(list) -> sorted, deduplicated copy.
             Throws ENVELOPE_INVALID on any non-string or empty-string item.

           export function computeCoverageDigest(coverage) -> sha256 hex over
             the NORMALIZED (sorted, deduplicated) required/covered/unknown/
             excluded arrays, JSON-serialized in that order.

           export function validateCoverage(coverage, { permittedExclusions = [] } = {})
             returns { sufficient: true } or throws ControlDenial
             Rules, in this order:
               0. normalize all four subject arrays; non-string or empty items
                    -> ENVELOPE_INVALID { field }
               1. coverageDigest missing, or !== computeCoverageDigest(coverage)
                    -> COVERAGE_DIGEST_MISMATCH { expected, actual }
                  Without this check the digest is decoration.
               2. unknownSubjects.length > 0
                    -> COVERAGE_UNKNOWN_NONEMPTY { unknown }
               3. any requiredSubjects element not in coveredSubjects
                    -> COVERAGE_INCOMPLETE { missing }
               4. any excludedSubjects element not in permittedExclusions
                    -> COVERAGE_EXCLUSION_NOT_PERMITTED { notPermitted }

IMPLEMENT  In validateEpisodeClosure, replace the coverage string check with
           validateCoverage(evaluation.coverage, { permittedExclusions:
             episode.permittedExclusions ?? [] }).

TEST       AD-04 in test/adversarial.test.js:
             changed files ["src/domain/a.ts","src/domain/b.ts"]
             coverage: required = both, covered = ["src/domain/a.ts"],
                       unknown = [], excluded = []
           Assert:
             throws e.code === DENIAL.COVERAGE_INCOMPLETE
             e.detail.missing deep-equals ["src/domain/b.ts"]

            More in the same test:
              unknownSubjects ["src/domain/c.ts"] -> COVERAGE_UNKNOWN_NONEMPTY
              excludedSubjects ["src/gen/x.ts"] with permittedExclusions []
                -> COVERAGE_EXCLUSION_NOT_PERMITTED
              coverageDigest computed over unsorted arrays, or hand-edited
                -> COVERAGE_DIGEST_MISMATCH
              ["b","a"] and ["a","a","b"] must normalize to the same digest
              as ["a","b"] — set semantics; normalization exists so digests
              are comparable, and the check recomputes rather than trusts.

           Positive control: covered ⊇ required, unknown empty, excluded empty
             -> { sufficient: true }

VERIFY     npm test
           Expect: AD-04 passes plus positive control. Baseline green.
```

---

### Step 7 — Evaluation semantics  → AD-03, AD-11

```text
GOAL       evaluation_failed is never a pass, and an evaluator that throws produces
           evaluation_failed rather than an absent result.

FILES      src/kernel.js, test/adversarial.test.js

API        export async function evaluate(state, {
              evaluationId, evaluatorId, evaluatorVersion,
              subjects, stateRef, run
            })
              `run` is an injected async function: (subjects) => { result, coverage }
              Behavior:
                - if run throws, or returns a result not in EVALUATION_RESULTS,
                  produce result "evaluation_failed" with the error captured
                - never produce "satisfied" from a throw, a timeout, or an
                  unrecognized return value
              Returns a COMPLETE evaluation record, including on failure:
                evaluator identity, evaluatorVersion, target stateRef, input
                subjects, coverage, failure reason, and the result.
              A failed evaluation is a real observation and MUST enter the
              event history via transact, exactly like a satisfied one.
              Failure never makes the record optional or in-memory-only.

IMPLEMENT  In validateEpisodeClosure, order the obligation checks explicitly:
             1. result === "evaluation_failed" -> EVALUATION_FAILED_NOT_A_PASS
             2. revision mismatch (Step 5)     -> EVALUATION_REVISION_MISMATCH
             3. result !== "satisfied"         -> EVALUATION_NOT_SATISFIED
             4. coverage (Step 6)              -> COVERAGE_* codes
             5. freshness === stale/expired    -> EVALUATION_STALE
           The distinct code for case 1 matters. "Did not run" must be
           distinguishable from "ran and found a violation" in the denial itself.

TEST       AD-03 in test/adversarial.test.js:
             Episode with proof_obligation -> evaluation, result "evaluation_failed",
             everything else valid (correct revision, complete coverage, fresh).
           Assert:
             throws e.code === DENIAL.EVALUATION_FAILED_NOT_A_PASS
             e.code !== DENIAL.EVALUATION_NOT_SATISFIED    // must not be conflated

            AD-11 in test/adversarial.test.js:
              const run = () => { throw new SyntaxError("unexpected token"); };
              const ev = await evaluate(state, { ..., run });
            Assert:
              ev.result === "evaluation_failed"
              ev.result !== "satisfied"
              ev.error is recorded
            Then attach ev as a proof obligation and assert closure throws
            EVALUATION_FAILED_NOT_A_PASS.

            PERSISTENCE: transact ev into a real workspace (profileIds includes
            its id), reload from disk, and assert canonical state contains the
            evaluation_failed record with evaluator identity, evaluatorVersion,
            stateRef, subjects, and the captured error.
            A failure that vanishes on reload is a silent omission.

VERIFY     npm test
           Expect: AD-03, AD-11 pass. Baseline green.
```

---

### Step 8 — Phase-zero applicability resolver  → AD-01

```text
GOAL       The acting agent cannot choose its own applicable commitments, and the
           resolver reports incomplete rather than guessing.

FILES      src/kernel.js, test/adversarial.test.js

SUPPORTED SELECTOR TYPES — this closed list only:
             exact_unit_id     value is a unit id
             path_prefix       value is a string prefix matched against target paths
             scope_membership  value is a scope id
             relationship_type value is a relationship type name

           Any other selector type is UNSUPPORTED. It does not fail silently and it
           does not match nothing. It forces complete: false.

API        export function resolveApplicableContext(state, {
              taskScopeId, targetPaths = [], revision,
              declaredApplicable = [], dependencyEvidenceId
            })
           returns:
             {
               complete: boolean,
               applicable: string[],          // control_binding ids, sorted
               omitted: string[],             // applicable but not declared
               unresolvedSelectors: [{ bindingId, selectorType }],
               unresolvedEdges: [{ from, to, resolution }],
               incompleteReasons: string[],   // DENIAL codes
               revision
             }

IMPLEMENT  1. Enumerate every control_binding whose approval_state === "accepted".
           2. For each, read its subject_selector. If its type is not in the
              supported list, add to unresolvedSelectors and push
              UNRESOLVED_SELECTOR to incompleteReasons.
           3. Otherwise evaluate the selector against taskScopeId / targetPaths /
              relationships. Matches go into `applicable`.
            4. Dependency edges come from STATE, never from the caller.
               dependencyEvidenceId names an Evidence record holding the edge
               set. Rules:
                 - evidence record missing              -> EVIDENCE_PIN_MISMATCH
                 - evidence.origin !== "extractor"      -> EVIDENCE_PIN_MISMATCH
                 - evidence.stateRef.revision !== the revision being resolved
                                                        -> EVIDENCE_PIN_MISMATCH
                 - any of these pushes EVIDENCE_PIN_MISMATCH to
                   incompleteReasons; the resolver does not proceed on
                   agent-supplied or unpinned edges
                 - otherwise scan the evidence's edges: any with resolution
                   "ambiguous" or "unresolved" goes into unresolvedEdges and
                   pushes UNRESOLVED_DEPENDENCY_EDGE (§3.5 honesty rule).
               The acting agent must never be able to hand the resolver a
               clean edge list. A self-reported empty traversal is exactly
               the completeness loophole AD-01 exists to close.
           5. Compute omitted = applicable \ declaredApplicable. If non-empty,
              push OMITTED_APPLICABLE_COMMITMENT.
           6. complete = incompleteReasons.length === 0.

           Wire into admitEffect: if the episode's context envelope has
           complete === false, throw ControlDenial(CONTEXT_INCOMPLETE,
           { reasons: incompleteReasons }). Do not admit on a partial context.

TEST       AD-01 in test/adversarial.test.js:
             CB1: accepted control_binding, modality "prohibition",
                  subject_selector { type:"path_prefix", value:"src/domain/" }
             Agent declares a narrow context:
               declaredApplicable: []           // claims nothing applies
               targetPaths: ["src/domain/service.ts"]
           Assert:
             result.complete === false
             result.applicable includes "CB1"
             result.omitted   includes "CB1"
             result.incompleteReasons includes DENIAL.OMITTED_APPLICABLE_COMMITMENT
           Then attach this context to an episode and assert:
             admitEffect throws e.code === DENIAL.CONTEXT_INCOMPLETE

           Second case, unsupported selector:
             CB2 with subject_selector { type:"semantic_similarity", value:"auth-ish" }
           Assert:
             result.complete === false
             result.incompleteReasons includes DENIAL.UNRESOLVED_SELECTOR

            Third case, unresolved edge in extractor evidence:
              Evidence EV1 { origin:"extractor", stateRef pinned to the
                revision, edges:[{ from:"src/domain/a.ts", to:null,
                resolution:"unresolved" }] }
              call with dependencyEvidenceId: EV1 id
            Assert:
              result.complete === false
              result.incompleteReasons includes DENIAL.UNRESOLVED_DEPENDENCY_EDGE

            Fourth case, missing or unpinned evidence:
              dependencyEvidenceId absent, or evidence pinned to a different
              revision, or evidence with origin "agent"
            Assert:
              result.complete === false
              result.incompleteReasons includes DENIAL.EVIDENCE_PIN_MISMATCH

            Positive control:
              declaredApplicable ["CB1"], all selectors supported, extractor
              evidence with all edges resolved
              -> complete === true, omitted === []

VERIFY     npm test
           Expect: AD-01 passes with all three negative cases and the positive control.
```

---

### Step 9 — Admission ledger and uncontrolled effects  → AD-10

```text
GOAL       An effect that did not pass admission cannot later be described as
           controlled execution.

FILES      src/kernel.js, test/adversarial.test.js

API        admitEffect(...) now returns:
             { admitted: true, episodeId, effect, admissionId, admittedAt }
           where admissionId = sha256(episodeId + operation + target + admittedAt).

           export function recordObservedEffect(state, episodeId, observedEffect)
             appends to episode.observedEffects; requires an admissionId field,
             which may be null for an effect observed without admission.

           export function classifyEffect(state, episodeId, observedEffect)
             -> { controlled: true }
             -> { controlled: false, code: DENIAL.UNCONTROLLED_EFFECT, reason }
             Uncontrolled when: admissionId is null; or admissionId is not present
             in episode.admittedEffects; or admittedAt is later than the observation.

IMPLEMENT  admitEffect pushes its admissionId into episode.admittedEffects.
           validateEpisodeClosure iterates episode.observedEffects and calls
           classifyEffect on each. Any uncontrolled effect:
             throw ControlDenial(UNCONTROLLED_EFFECT, { effect, reason })
           An episode containing an uncontrolled effect cannot close successfully.
           It may still be recorded — the observation is real — but it is not a
           successful controlled episode. Do not silently drop the observation.

TEST       AD-10 in test/adversarial.test.js:
             Episode EP1, valid in every other respect, outcome present.
             recordObservedEffect(state, "EP1",
               { operation:"write", target:"src/domain/a.ts", admissionId:null })
           Assert:
             classifyEffect(...).controlled === false
             validateEpisodeClosure throws e.code === DENIAL.UNCONTROLLED_EFFECT
             the observed effect is still present in state (not deleted)

           Second case, forged admission id:
             admissionId "not-a-real-admission"
           Assert: controlled === false, closure throws UNCONTROLLED_EFFECT

           Positive control:
             const a = admitEffect(state,"EP1",{operation:"write",target:"src/domain/a.ts"})
             recordObservedEffect(state,"EP1",{...,admissionId:a.admissionId})
           -> closure succeeds

VERIFY     npm test
           Expect: AD-10 passes with both negatives and the positive control.
```

---

### Step 10 — Honest status for deferred cases

```text
GOAL       Six deferred cases must read as deferred, not as passing and not as noise.

FILES      test/adversarial.test.js

IMPLEMENT  Delete the `cases` array and the requireCapability harness entirely.
           The file now contains nine real behavioral tests from Steps 3-9, plus:

             test.todo("AD-06: ambiguous anchor pauses affected execution — blocked on code anchor subsystem");
             test.todo("AD-07: unknown control extension cannot authorize — blocked on schema capability negotiation (P9)");
             test.todo("AD-08: concurrent governing heads block execution — blocked on causal clocks and heads (P3)");
             test.todo("AD-09: exception request is not authorization — blocked on exception subsystem (P7)");
             test.todo("AD-14: expired exception suspends next effect — blocked on exception subsystem (P7)");
             test.todo("AD-15: delayed invalidation cannot preserve stale authorization — blocked on typed invalidation (P6)");

VERIFY     npm test
            Expected final tally:
              kernel.test.js       6 pass
              envelope.test.js     8 pass
              adversarial.test.js  9 pass, 6 todo, 0 fail
            Report the exact tally. Do not round or summarize it.
```

---

## 5. Definition Of Done

```text
npm test reports 23 pass, 6 todo, 0 fail.
Every AD test asserts on ControlDenial.code, never on message text.
Every AD test has a positive control proving it does not pass by always throwing.
No test was weakened, skipped, or deleted to reach green.
The episode.allowedOperations fallback does not exist anywhere in src/.
Workspace.load() does not contain the word `continue`.
No in-memory-only lifecycle mutation exists in src/. Suspension is derived.
Mutation authorization is default-deny; "otherwise authorized" appears nowhere.
Dependency edges enter the resolver only through pinned extractor evidence.
One commit per completed step, each naming its step number, tests included.
```

---

## 6. Report Back

After Step 10, report exactly this, filled in:

```text
Final tally:            __ pass / __ todo / __ fail
Steps completed:        __ of 10
Guardrails violated:    none | list them
Deviations from plan:   none | list them with reason
Blocked on:             nothing | describe
Files changed:          list
```

If any step could not be completed as written, stop and report rather than
improvising an alternative. An honest blocked report is worth more than a
green run obtained by a route this plan did not authorize.

---

## 7. What This Phase Proves

If all ten steps land, the following claims move from **specified** to **verified**:

```text
Inference does not silently become accepted meaning        Step 2
An agent cannot accept its own proposals                   Step 2
Unverifiable history does not silently project             Step 3
A governed actor cannot widen its own authority            Step 4
A governed actor cannot edit the rule that governs it      Step 4
A governed actor cannot graft members onto a profile       Step 4
Mutation is default-deny, not a blacklist                  Step 4
Stale-revision evidence cannot close an episode            Step 5
Coverage is a subject set with a real digest, not a claim  Step 6
A failed evaluation is never a pass, and never vanishes    Step 7
An omitted applicable commitment blocks execution          Step 8
Resolver evidence is pinned and extractor-backed           Step 8
An unresolvable dependency edge blocks a completeness claim Step 8
An unadmitted effect cannot be reported as controlled      Step 9
```

The remaining README guarantees stay **specified, not implemented** until the six
deferred cases land. Label them that way.

---

## 8. The Demo This Unlocks

Steps 4, 8, and 9 together produce the demo. Sequence it exactly like this:

```text
1. Declare   ControlBinding: domain code must not depend on UI code
2. Extract   dependency edges, each classified resolved/ambiguous/unresolved/external
3. Authorize episode with a bounded authority grant and a resolved context
4. Attempt   agent writes src/domain/service.ts importing src/ui/Button.tsx
5. Deny      admitEffect denies; the denial names the governing commitment
6. Escalate  agent attempts to edit the ControlBinding so the rule permits it
7. Deny      SELF_AMENDMENT_DENIED; the governing record is provably unchanged
8. Show      audit trail contains both attempts, the actor, and the reason
```

Step 6 and 7 are the demo. Steps 1 through 5 are a dependency checker, and
`dependency-cruiser` already does that for free in a config file — a config file
the agent can also edit. The differentiator is not that Kraddle detects the
violation. It is that Kraddle cannot be talked out of it.

HONESTY REQUIREMENT for the demo (§0b applies): Phase 0 has no sandbox and no
enforced write path. The agent can still write files directly. The demo may
claim "Kraddle denies admission and refuses to record the effect as controlled
execution." It may NOT claim "Kraddle blocked the agent's write." Say the
first. Never say the second until an enforced perimeter exists.

Do not build the demo in this phase. Steps 1-10 are the substrate it requires.

---

## 9. Out Of Scope — Do Not Build

If a step appears to require any of these, stop and report instead.

```text
KRD binary encoding            JSON lines stay, permanently, for this phase
KRI index files                no index layer at all
causal parents, logical clocks single writer, single device, no concurrency
concurrent head merge          no branches exist yet
multi-device sync              no network code
exception subsystem            AD-09 and AD-14 stay todo
typed invalidation propagation AD-15 stays todo
code anchor remapping          AD-06 stays todo
schema capability negotiation  AD-07 stays todo
the other 15 response verbs    block and deny only
a real language extractor      Step 8 consumes fixture edges via Evidence
                               records, not parsed source
quarantine repair tooling      operator fixes or removes the file manually
any new profile type           three profiles only
any new kernel record type     five records only
a CLI                          no bin/, no argv parsing
a UI                           none
an enforced perimeter          advisory classification only in Phase 0 (§0b)
```

---

## 10. Standing Instruction

Stop expanding the grammar. Make the grammar enforce one decidable, adversarial,
end-to-end rule.
