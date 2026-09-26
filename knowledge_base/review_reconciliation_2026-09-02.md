# Kraddle Checkpoint: Review Reconciliation

Date: September 2, 2026
Status: Architecture freeze and implementation correction checkpoint

## 1. Context

Two independent agents reviewed the repository after reading the current architecture, format docs, source, tests, and history.

Their conclusions agree on the most important point:

> Kraddle's theory is substantially ahead of its implementation. The next move is not more ontology. It is to make the smallest falsifiable core honest, then test the control hypothesis.

## 2. What Both Reviews Confirm

The following concepts are strong enough to preserve:

- Orthogonal state: epistemic basis, approval, evaluation, freshness, and confidence.
- `evaluation_failed` is not a pass.
- Coverage must describe the covered subject set, not only a percentage.
- R0-R5 precision gradient.
- Five-record kernel remains plausible:

```text
Unit
Commitment
Relationship
Evidence
Scope
```

- Meaning must work vertically across abstraction levels and horizontally among peers.
- The project-native `.kraddle/` direction is coherent.
- The adversarial manifest is useful.

## 3. What Must Be Frozen

Until the first closed-loop proof passes, do not add more conceptual record types, profiles, or storage optimizations.

Freeze these as provisional but sufficient:

```text
Kernel records
  Unit, Commitment, Relationship, Evidence, Scope

Initial profiles
  ControlBinding, EvaluationProfile, ExecutionEpisode

Initial control capabilities
  profile validation, committed transactions, effect admission,
  evaluation validation, episode closure

Initial storage
  readable JSON-lines event segments inside .kraddle/
```

Defer:

- Custom KRD binary encoding.
- KRI index optimization.
- Multiple programming languages.
- Cloud synchronization.
- Full agent orchestration.
- Universal applicability solving.
- Broad semantic hygiene automation.

These may be necessary later, but none is the current uncertainty.

## 4. Concrete Implementation Findings

### Finding A: Record metadata is not enforced

The current test helpers create records such as `{ id, kind, title }`. The runtime does not require or validate origin, epistemic basis, approval state, freshness state, or confidence.

Correction:

```text
Every canonical record has a validated common envelope.
```

### Finding B: Corrupt event segments are silently skipped

`Workspace.load()` skips a segment with a bad digest and continues loading later segments. This violates Kraddle's no-silent-omission principle.

Correction:

```text
Corrupt, incomplete, or unverifiable canonical segments are quarantined,
reported, and block a trusted projection after the affected causal point.
```

### Finding C: Episode fallback can define its own authority

The current admission code falls back from missing authority operations to `episode.allowedOperations`. The governed actor must not define its own limits when the authority grant is incomplete.

Correction:

```text
Authority must explicitly contain the allowed operation set.
Missing authority data denies admission.
```

### Finding D: Actor identity is stamped but not authorized

`actorId` records who created an event but does not establish permission. Generic update operations can currently alter authority-related records without an authorization check.

Correction:

```text
Mutation admission checks actor, operation, target, scope, and governing authority.
```

### Finding E: Heads and causal order are not implemented

`heads.krd` is written but not read. Events have no implemented logical clock or causal parents. Load order is based on filenames containing wall-clock time and random UUIDs.

Correction:

```text
Implement transaction IDs, causal parents, logical clocks, complete heads,
and deterministic projection order before testing concurrent branches.
```

### Finding F: One test asserted the wrong failure

The test named “rejects a blocking control without an evaluator” currently fails earlier because the governed commitment role is missing. It does not exercise the evaluator rule.

Correction:

```text
Construct all earlier required roles, omit only evaluator,
and assert the evaluator-specific failure.
```

## 5. The Load-Bearing Unsolved Problem

The hardest architecture problem is applicability resolution.

The system cannot let the acting agent choose its own applicable commitments. But “prove that excluded commitments cannot affect this effect” is not generally decidable for arbitrary software and arbitrary semantic claims.

Therefore the first implementation must restrict applicability to a decidable boundary.

### Phase-zero applicability boundary

Support only:

```text
Explicit scope membership
Exact unit IDs
Declared path prefixes
Declared relationship types
Direct dependency closure
Transitive dependency closure over extracted static edges
```

Do not claim universal completeness. For Phase 0, a context is complete only when:

```text
the task scope is explicit
the target revision is pinned
the selector types are supported
all selector inputs are available
the traversal completed without unsupported edges
no blocking conflict or ambiguous anchor exists
```

Anything outside this boundary returns `incomplete`, not “complete enough.”

This is a product strength, not a weakness: Kraddle should begin by controlling the region where it can make honest guarantees.

## 6. Implementation Order After Review

```text
0. Write AD-01 through AD-15 as red conformance tests.
1. Common record envelope and orthogonal state validation.
2. Correct the false-positive test fixture.
3. Fail closed on corrupt or incomplete event segments.
4. Add transaction manifests, causal parents, logical clocks, and heads loading.
5. Close profile membership to immutable profile revisions.
6. Remove authority fallback and enforce mutation authorization.
7. Add explicit phase-zero applicability resolver.
8. Add pinned state references to context, episode, authority, and evaluation.
9. Add typed coverage sets and frozen proof obligations.
10. Add invalidation and immediate episode suspension.
11. Add response and exception state transitions.
12. Re-run AD-01 through AD-15 and let failures determine deferred work.
```

The red conformance fixtures now live in `test/adversarial.test.js`. They intentionally fail until their named runtime capabilities exist. The existing kernel tests remain a separate green baseline.

## 7. What “Execute AD-01 Through AD-15” Means

It does not mean checking whether functions return the expected error strings. Each case must be a conformance test of an end-to-end state transition:

```text
fixture state
  -> actor request
  -> control-plane decision
  -> admitted or denied effect
  -> resulting event/evidence
  -> projection and lifecycle state
  -> expected safe disposition
```

Each test must assert:

- The effect did or did not occur.
- The episode state.
- The evaluation state.
- The evidence and provenance retained.
- The relevant conflict or invalidation record.
- That no weaker fallback path was used.

## 8. Product Validation Boundary

The first meaningful product is not the entire control plane. It is a narrow, local repository control tool that can:

```text
declare one architectural commitment
extract one repository's dependency graph
create one bounded context
admit one bounded change
run one evaluator
block one violation
show why it was blocked
```

The broader idea remains the semantic control plane. The first proof should make one part of that plane real.

## 9. Product Versus Theory

The reviews raise a legitimate product risk: there is currently no external user evidence beyond the founder's own workflow.

That does not invalidate the theory. It means the next proof should produce a usable artifact that can be placed in front of another engineer:

```text
“Here is a repository rule you can state once.
Here is the code graph Kraddle extracted.
Here is the violation an agent introduced.
Here is Kraddle blocking it and showing exactly why.”
```

That is the first credible demo and the first opportunity for user research.

## 10. Current Stance

The correct position is not:

```text
Keep expanding until the theory is exhaustive.
```

Nor:

```text
Discard the theory and immediately build a generic app generator.
```

It is:

```text
Freeze the semantic grammar.
Restrict the first guarantees to decidable boundaries.
Repair the implementation's own invariant violations.
Build the runtime admission boundary.
Run the adversarial proof.
Put the narrow artifact in front of real engineers.
```

The architectural grammar has earned implementation. It has not earned more abstraction yet.

## 11. Follow-Up Review Correction

A later review correctly identified that `test/adversarial.test.js` is not yet a behavioral conformance suite. It currently checks whether named runtime functions exist. Eleven cases fail because capabilities are absent; four cases pass only because similarly named functions already exist. Those four passes do not establish the corresponding adversarial behavior.

The suite must be rewritten as state-transition tests with concrete fixtures. Each case must assert the requested effect, the control decision, the resulting episode/evaluation state, retained evidence, and the absence of a bypass path.

The same review also corrected the implementation order:

```text
1. Commit the existing runtime files when the repository owner authorizes it.
2. Keep the green kernel baseline separate from adversarial tests.
3. Make AD-01 through AD-15 behavioral red tests before implementing their capabilities.
4. Scope applicability to a decidable Phase 0 subset.
5. Treat dependency edges as resolved, ambiguous, unresolved, or external.
6. Make the first demo prove that an agent cannot weaken its own governing rule.
```

The current implementation therefore has a green baseline of six kernel tests, plus a red capability manifest that must not yet be described as verified adversarial conformance.
