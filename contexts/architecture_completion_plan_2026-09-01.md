# Kraddle Checkpoint: Completing The Architectural Grammar

Date: September 1, 2026
Status: Normative design-work plan and adversarial-review fixture

## 1. Purpose

Kraddle now has a close-to-complete architectural grammar for semantic control. The next work is not broad ontology expansion. It is to make the grammar implementable and falsifiable.

This checkpoint defines:

- Canonical terminology.
- The seven remaining design problems.
- A common completion method.
- Dependency order.
- Required artifacts and acceptance tests.
- The first adversarial closed-loop proof.

## 2. Canonical Terminology Hierarchy

```text
Format
  The complete normative contract for representing and operating Kraddle meaning.

Kernel
  The smallest physical semantic algebra: Unit, Commitment, Relationship,
  Evidence, Scope.

Vocabulary
  Named kinds, modalities, relationship types, operations, and statuses.

Profile
  A validated arrangement of kernel records that represents a recurring concept.

Envelope
  A profile specialized to define a boundary and its operating conditions.

Event
  An immutable change to canonical state.

Projection
  A task-specific human or agent view derived from canonical state.

Plane
  A conceptual subsystem grouped by responsibility; not a stored record.

Runtime
  The implemented machinery that resolves, executes, observes, evaluates,
  and responds.
```

### Plane map

```text
Semantic plane
  Preserves meaning, relationships, evidence, scope, and history.

Control plane
  Resolves applicability, context, authority, proof obligations, and responses.

Execution and observation plane
  Performs bounded actions and emits observations and attestations.

Evaluation plane
  Compares observed reality against commitments and qualifies the result.
```

The control plane authorizes; the execution plane acts; the evaluation plane judges; the semantic plane preserves what all three rely on.

## 3. Definition Of Design Completion

A design problem is complete only when it has all seven artifacts:

1. **Normative semantics:** what the concept means and does not mean.
2. **Kernel realization:** exact mapping to Unit, Commitment, Relationship, Evidence, and Scope.
3. **Schema:** required roles, field types, cardinalities, and constraints.
4. **Lifecycle:** valid states and transitions.
5. **Operations:** create, revise, supersede, invalidate, query, and delete behavior.
6. **Projection:** how people and agents inspect and manipulate it.
7. **Conformance tests:** valid, invalid, conflict, partial-write, and migration fixtures.

Examples are not specifications. A profile is not complete because one YAML example looks plausible.

## 4. Work Order

```text
1 Profile metamodel
      ↓
2 Identity and atomicity
      ↓
3 Typed dependency and invalidation
      ↓
4 Evaluation lifecycle
      ↓
5 Response-policy resolution
      ↓
6 Meaning-compilation lifecycle
      ↓
7 Closed-loop conformance proof
```

Later work depends on earlier semantics. This order prevents the adversarial prototype from hard-coding concepts the format cannot represent consistently.

## 5. Problem One: Profile Realization Metamodel

### Question

How does every standardized profile map exactly onto the five kernel records?

### Required design

```text
ProfileDefinition
  profile_id
  version
  root_record_type
  root_kind
  required_roles
  optional_roles
  role_record_types
  field_types
  cardinalities
  relationship_constraints
  lifecycle
  validation_rules
  projection_rules
  migration_rules
```

### Example

```yaml
profile: decision/v1
root: unit
root_kind: decision

roles:
  question:
    record: commitment
    cardinality: 1
  chosen_alternative:
    relationship: chooses
    target_kind: alternative
    cardinality: 1
  rejected_alternative:
    relationship: rejects
    target_kind: alternative
    cardinality: many
  rationale:
    record: evidence
    cardinality: 1..many
  owner:
    relationship: owned_by
    target_kind: actor
    cardinality: 1
```

### Deliverables

- `ProfileDefinition` metamodel.
- Kernel mappings for the profiles required by Phase 0.
- Profile validator rules.
- Canonical query paths for each role.

### Acceptance test

Two independent implementations encode the same conceptual profile and produce equivalent canonical queries and diffs.

## 6. Problem Two: Profile Identity And Atomicity

### Question

How do several kernel records behave as one coherent profile instance?

### Required decisions

```text
Profile identity
  The root Unit ID identifies the profile instance.

Atomic mutation
  One event transaction contains all operations required to move a profile
  from one valid state to another.

Visibility
  Projections expose either the previous valid profile or the next valid profile,
  never a partial bundle.

Synchronization
  A transaction is accepted only when all frames are present and valid.

Supersession
  Superseding the root preserves all constituent history and provenance.
```

### Deliverables

- Transaction envelope semantics.
- Profile-level revision and diff semantics.
- Partial synchronization behavior.
- Tombstone and supersession behavior.
- Crash-recovery fixtures.

### Acceptance test

Interrupt a multi-record decision update at every write boundary. Readers always observe a structurally valid old or new profile, never a half-decision.

## 7. Problem Three: Typed Dependency And Invalidation

### Question

What kind of dependency exists, and exactly what becomes invalid when its input changes?

### Dependency types

```text
epistemic_dependency
  Evidence or evaluation depends on a source observation.

applicability_dependency
  Meaning applies while a scope or environmental condition holds.

rationale_dependency
  A decision remains justified while an assumption holds.

authorization_dependency
  Approval remains valid while authority and policy remain valid.

realization_dependency
  An implementation currently realizes a commitment.

selector_dependency
  A derived unit set, path set, or subgraph depends on graph membership.

operationalization_dependency
  An evaluator or proxy claims to operationalize higher-level meaning.
```

### Invalidation effects

```text
mark_stale
set_evaluation_unknown
expire_approval
recompute_selector
rebuild_context
pause_episode
require_reevaluation
require_authorization
```

Source code changes normally invalidate conformance evaluations, not the builder's accepted normative commitment.

### Deliverables

- Typed dependency schema.
- Event-to-invalidation matrix.
- Propagation algorithm and cycle behavior.
- Active-episode interruption policy.
- Explanation projection: “why is this stale?”

### Acceptance test

Changing implementation invalidates its evaluation and context packet while preserving the approved architecture commitment. Changing a decision assumption invalidates rationale and requests decision review.

## 8. Problem Four: Complete Evaluation Lifecycle

### Question

How does Kraddle distinguish violation, missing knowledge, insufficient evidence, and evaluator failure?

### Result algebra

```text
satisfied
violated
unknown
not_applicable
indeterminate
evaluation_failed
```

### Evaluation state machine

```text
required → scheduled → running → completed
                      ↘ failed

completed → current → stale → expired
```

### Required fields

```text
target commitment
subject selector
scope and revision
evaluator identity and version
inputs
operating conditions
coverage
blind spots
result
evidence
uncertainty
freshness
invalidation dependencies
```

### Deliverables

- Result semantics and state machine.
- Coverage model.
- Evaluator-failure attestation.
- Aggregation rules for hybrid evaluators.
- Projection distinguishing “failed check” from “checker failed.”

### Acceptance test

An analyzer parse error yields `evaluation_failed`, never `satisfied` or `violated`. Partial runtime sampling with insufficient state coverage yields `indeterminate`.

## 9. Problem Five: Response-Policy Resolution

### Question

Given evaluation and control state, what must happen next?

### Trigger dimensions

```text
on_satisfied
on_violation
on_unknown
on_indeterminate
on_evaluator_failure
on_stale
on_conflict
on_unauthorized
on_context_incomplete
```

### Responses

```text
record
continue
warn
request_evidence
retry
repair
replan
reduce_scope
block
rollback
degrade
quarantine
request_exception
escalate
accept_residual_risk
abort
close
```

### Resolution order

```text
explicit episode policy
  → commitment control binding
  → profile default
  → scope policy
  → system-safe default
```

The strongest applicable response wins unless an authorized policy explicitly defines another composition rule.

### Deliverables

- Response vocabulary.
- Policy precedence and conflict resolution.
- Authority required for each response.
- Idempotency and retry semantics.
- Closure rules.

### Acceptance test

The same violation blocks a release episode, warns during exploration, and escalates when the evaluator cannot establish coverage, according to explicit resolved policy rather than agent discretion.

## 10. Problem Six: Meaning-Compilation Lifecycle

### Question

How does accepted meaning become an active evaluator or guardrail without replacing the original meaning with a lossy proxy?

### Compilation chain

```text
source commitment
  → operationalization claim
  → selected compiler/evaluator adapter
  → generated or linked artifact
  → validation
  → activation
  → evidence production
  → invalidation and recompilation
```

### Artifact types

```text
type or schema
architecture rule
static-analysis rule
property or scenario test
protocol or model-checking property
performance test or SLO
runtime assertion or monitor
resource or sandbox limit
tool-capability restriction
human review rubric
escalation condition
```

### Required protections

- The original commitment remains canonical.
- Operationalization is a separate, evidence-backed interpretation.
- Determinism never implies soundness or coverage.
- Generated artifacts record source meaning, compiler version, and digest.
- Active episodes cannot rewrite governing compiled controls without authority.
- Proxy validity is itself reevaluated to limit Goodhart effects.

### Deliverables

- Compiler adapter interface.
- Artifact provenance profile.
- Activation and deactivation semantics.
- Recompilation triggers.
- Proxy-review lifecycle.

### Acceptance test

Changing an architecture commitment regenerates its dependency rule, invalidates the previous evaluation, and records the complete provenance chain without deleting the original human statement.

## 11. Problem Seven: Closed-Loop Conformance Suite

### Question

Does the architecture preserve control through a deliberately adversarial change?

### Fixture commitments

```text
Behavioral requirement
  Reopening a question restores prior context.

Architectural prohibition
  Research-domain code never depends on UI code.

Temporal invariant
  Retry never duplicates mutation; failed work is compensated before retry.

Quantitative envelope
  Restore journey remains below its p99 latency budget under declared load.

Rejected alternative
  Do not reintroduce a cache rejected under still-current assumptions.

Experience commitment
  A human rubric establishes whether restored context feels legible and calm.
```

### Adversarial failures

1. Local behavior succeeds but architecture fails.
2. Static structure succeeds but temporal behavior fails.
3. Functional behavior succeeds but the resource budget fails.
4. The agent reintroduces a rejected alternative.
5. The agent attempts to weaken its governing commitment.
6. A required evaluator cannot establish coverage.

### Required Kraddle behavior

```text
resolve applicable meaning
declare context completeness and blind spots
resolve delegated authority
open one execution episode
perform or simulate the change
distinguish each result correctly
apply the resolved response
preserve rationale, provenance, and evidence
propagate invalidation
reevaluate after correction
close only when proof obligations pass or risk is explicitly accepted
```

### Acceptance test

No adversarial condition is silently omitted, passed, waived, or resolved by the acting agent changing its own governing rules.

## 12. Minimal Phase-Zero Profiles

Only these profiles must be specified before running the adversarial proof:

```text
Commitment profile
SubjectSelector
ControlBinding
ProtocolProfile
EnvelopeProfile
NegativeKnowledgeProfile
EvaluationProfile
ContextEnvelope
AuthorityGrant
ExecutionEpisode
ResponsePolicy
ExceptionProfile
```

DecisionProfile and broader interaction profiles may use provisional mappings unless the fixture requires them.

## 13. Profile Maturity Matrix

Every profile appears in the encyclopedia with:

```text
conceptual
specified
implemented
verified
```

At the time of this checkpoint:

| Area | Maturity |
| --- | --- |
| Five-record kernel | Conceptual, approaching specified |
| Orthogonal state | Conceptual |
| ContextEnvelope | Conceptual |
| ExecutionEpisode | Conceptual |
| AuthorityGrant | Conceptual |
| EvaluationProfile | Conceptual |
| ControlBinding | Conceptual |
| KRD/KRI encoding | Conceptual |
| Runtime and CLI | Not implemented |
| Closed-loop behavior | Not verified |

## 14. Review Instructions For Another Agent

Review the repository against this checkpoint and `semantic_control_plane_2026-09-01.md`.

Prioritize findings about:

1. A semantic distinction that changes authorization, evaluation, response, or invalidation but cannot be represented.
2. A profile whose kernel realization is ambiguous.
3. A state transition that can silently lose meaning, evidence, conflict, or authority.
4. A control result that can be mistaken for success.
5. A way an actor can alter or bypass its governing constraints.
6. A context completeness claim that cannot expose a known blind spot.
7. A scenario where stale information continues authorizing execution.

Do not recommend a new primitive merely because a concept has a name. First show why the concept cannot be represented as a validated profile over the five-record kernel.

## 15. Next Action

Specify Problem One, `ProfileDefinition`, using three profiles:

```text
ControlBinding
EvaluationProfile
ExecutionEpisode
```

These three exercise semantic binding, evidence, authority, lifecycle, multi-record identity, and transactionality. Their mappings will reveal whether the five-record kernel is actually sufficient.
