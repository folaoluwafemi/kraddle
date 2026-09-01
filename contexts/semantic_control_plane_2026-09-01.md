# Kraddle Checkpoint: From Meaning Layer to Semantic Control Plane

Date: September 1, 2026
Status: Architectural synthesis. Expanded and operationalized by `architecture_completion_plan_2026-09-01.md`.

## 1. Verdict On The Critique

The critique is substantially correct.

Kraddle has developed a strong **semantic substrate**: a way to express what software means, what each part does, what it is for, what it must preserve, how parts relate, and what evidence supports that understanding.

That substrate is not yet a complete **control system**. It does not yet guarantee that meaning governs agent action from task preparation through execution, evaluation, failure, escalation, and closure.

The missing promise is:

> Meaning must not merely remain inspectable. It must continue governing what actors may do, what they must establish, and what happens when reality diverges.

The critique should therefore expand Kraddle without replacing the existing five-record kernel.

## 2. The Essential Boundary

Kraddle consists of four conceptual planes built on one foundation.

```text
Semantic plane
  Preserves meaning, relationships, evidence, scope, and history

Control plane
  Resolves applicability, context, authority, proof obligations, and responses

Execution and observation plane
  Performs bounded actions and emits observations and attestations

Evaluation plane
  Compares observed reality against commitments and qualifies the result
```

### Semantic plane

Uses the existing kernel:

```text
Unit
Commitment
Relationship
Evidence
Scope
```

### Control plane

Adds standardized semantic profiles constructed from kernel records:

```text
DecisionProfile
InteractionProfile
ProtocolProfile
EnvelopeProfile
NegativeKnowledgeProfile
ControlBinding
EvaluationProfile
AuthorityGrant
ExceptionProfile
ContextEnvelope
ExecutionEpisode
```

These are not new storage primitives. They are canonical, validated shapes composed from the five kernel records.

### Execution, observation, and evaluation

Operates the loop:

```text
select applicable meaning
  -> establish context boundary
  -> check authority
  -> authorize or stop
  -> execute bounded work
  -> collect attestations and evidence
  -> evaluate commitments
  -> close, retry, replan, escalate, or waive
  -> propagate invalidation
```

This division keeps the meaning model sparse while making it operational. A plane is a conceptual responsibility boundary, not a kernel record or profile.

## 3. Updated Kraddle Definition

> Kraddle is a local-first semantic control plane that turns human intent into scoped, versioned, evidence-backed commitments; binds selected commitments to evaluation, authority, and response; gives actors the smallest context complete for their declared purpose; and continuously reconciles resulting reality without silently discarding uncertainty, conflict, or rationale.

Shorter product statement:

> Kraddle turns what you mean into constraints agents can safely act under, then checks that reality still agrees.

## 4. Three Kinds Of Completeness

Kraddle must keep these separate.

### Representational completeness

Can the meaning model express the relevant distinction?

The extensible five-record kernel is close to sufficient.

### Operational completeness

Can Kraddle determine what should happen next?

This requires applicability, evaluators, required evidence, ownership, and response semantics.

### Control completeness

Can Kraddle authorize, interrupt, or escalate action when applicable meaning cannot be established or preserved?

This requires context envelopes, authority grants, execution episodes, failure responses, and reevaluation.

The goal is not a universal ontology. The goal is control completeness relative to a declared task and known system boundary.

## 5. Commitments And Control Bindings

Not every commitment is automatically enforceable.

A commitment remains the semantic statement:

```text
The product should feel calm.
Domain modules must not import UI modules.
Opening context must not mutate research data.
```

A **ControlBinding** optionally gives a commitment operational teeth.

```text
ControlBinding
  commitment
  modality
  applicability
  priority
  evaluator
  proof_obligations
  freshness_policy
  owner
  authority_policy
  failure_response
  exception_policy
```

### Modalities

```text
objective      A desired outcome to optimize toward
requirement    A condition required for completion
invariant      A condition that must remain true continuously
prohibition    An action or state that is forbidden
preference     A lower-priority choice used when stronger rules allow it
hypothesis     A belief awaiting validation
```

### Evaluation modes

```text
deterministic  Compiler, analyzer, test, formal rule, or script
agent          Structured interpretation with declared evidence and uncertainty
human          Named review or judgment protocol
hybrid         Several evaluators with an aggregation rule
none           Meaning remains descriptive or advisory
```

The absence of a binding must be explicit. Kraddle should not pretend every qualitative commitment is mechanically enforceable.

### Example

```yaml
commitment: Domain modules must not import UI modules
modality: invariant

applies_to:
  scope: main-product
  paths:
    domain: src/domain/**
    ui: src/ui/**

evaluation:
  mode: deterministic
  adapter: architecture-rule
  coverage: all_source_files
  unresolved_imports: fail

freshness:
  rerun_on: [source_change, tsconfig_change, dependency_change]

authority:
  owner: architecture-owner
  may_change: [architecture-owner]
  may_waive: [technical-lead]

on_failure:
  response: block
  escalation: architecture-owner

exception:
  rationale_required: true
  expires_after: 14d
```

## 6. Orthogonal State

The old single `status` field mixed independent questions. It must be split.

```text
epistemic_basis
  observed | derived | interpreted | asserted

approval_state
  proposed | accepted | rejected | superseded

evaluation_state
  satisfied | violated | unknown | not_applicable | indeterminate |
  evaluation_failed

freshness_state
  current | stale | expired

confidence
  explicit numeric or ordinal estimate
```

A commitment can therefore be:

```text
asserted by a human
accepted by an authorized owner
currently violated
evaluated using stale evidence
```

“Accepted” never means “true,” “implemented,” “satisfied,” or “fresh.”

## 7. Evaluation

An evaluation establishes the state of one commitment under one declared boundary.

```text
EvaluationProfile
  target_commitment
  scope
  revision
  evaluator
  evaluator_version
  inputs
  coverage
  result
  evidence
  freshness
  blind_spots
```

An evaluation must answer:

```text
What was evaluated?
Where and at which revision?
Using what mechanism and inputs?
How much of the declared scope was covered?
What was not evaluated?
What evidence supports the result?
What changes make the result stale?
```

Evaluation is distinct from approval. An authorized human approves desired meaning; an evaluator establishes whether current reality satisfies it.

## 8. Context Envelope

A focused context slice is unsafe unless its boundary is explicit.

```text
ContextEnvelope
  task
  target_scope
  target_revision
  included_units
  applicable_commitments
  required_evidence
  relevant_decisions
  permitted_effects
  forbidden_effects
  unresolved_conflicts
  traversal_policy
  source_inventory
  omitted_categories
  unavailable_sources
  stale_inputs
  truncation
  completeness_claim
```

### Relative completeness

Kraddle cannot prove that it captured every relevant fact in the universe. It can establish completeness relative to:

```text
a declared task
a target scope and revision
a known source inventory
supported relationship types
extractor capabilities
an explicit traversal policy
recorded omissions and blind spots
```

Example:

```yaml
complete_for:
  - direct and transitive code dependencies
  - accepted architecture constraints applying to src/research/**
  - change impact through product capability

not_complete_for:
  - production runtime behavior
  - third-party service internals
  - user-experience evidence after 2026-07-01

unresolved:
  - two ambiguous code-anchor remaps
  - one unavailable external API contract
```

The actor can then decide whether the known boundary is sufficient or must trigger escalation.

## 9. Execution Episode

An **ExecutionEpisode** is one bounded attempt to change reality.

```text
ExecutionEpisode
  purpose
  intended_delta
  target_scope
  base_revision
  context_envelope
  applicable_commitments
  delegated_authority
  allowed_effects
  forbidden_effects
  required_evaluations
  escalation_conditions
  completion_evidence
  resulting_revision
  outcome
```

Example:

```yaml
purpose: Add research-context restoration

allowed:
  - modify src/research/**
  - add tests in tests/research/**

forbidden:
  - change persistence schema
  - mutate existing research records
  - introduce UI-to-domain dependencies

must_preserve:
  - offline reopening
  - read operations are side-effect free

must_evaluate:
  - non-mutation property
  - architecture conformance
  - existing restore-context behavior

escalate_if:
  - schema migration appears necessary
  - code-anchor remap becomes ambiguous
  - accepted commitments conflict
```

An episode is the bridge between the meaning layer and Kraddle's agent execution environment.

## 10. Authority

Provenance records who acted. Authority records whether the actor was allowed to act.

```text
AuthorityGrant
  principal
  operations
  target_scopes
  governed_profiles
  constraints
  issuer
  valid_from
  expires_at
  delegation_policy
  revocation
```

Kraddle distinguishes:

```text
authorship
responsibility
approval authority
execution authority
waiver authority
risk-acceptance authority
```

An actor cannot alter the commitment, evaluator, or authority policy governing its own episode unless that power was explicitly delegated.

## 11. Exceptions And Waivers

An exception never deletes or rewrites the commitment it relaxes.

```text
ExceptionProfile
  target_commitment
  target_scope
  rationale
  authorizing_actor
  authority_evidence
  compensating_controls
  valid_from
  expires_at
  reevaluation_trigger
  status
```

Expired exceptions cause reevaluation. Permanent exceptions must be represented as a scoped change to the commitment rather than an endless waiver.

## 12. Decisions

Decision remains a profile, not a sixth kernel primitive.

```text
DecisionProfile
  question
  chosen_alternative
  rejected_alternatives
  rationale
  assumptions
  tradeoffs
  affected_units
  owner
  reevaluation_triggers
  supersession
```

This shape is standardized because future actors must query alternatives and rationale reliably. Arbitrary prose is insufficient.

## 13. Higher-Order Meaning

Binary relationships cannot fully represent interactions among several participants.

Kraddle reifies those interactions as units with an **InteractionProfile**:

```text
InteractionProfile
  participants
  participant_roles
  ordering
  preconditions
  postconditions
  invariants
  scenarios
  failure_modes
  recovery
```

This supports:

```text
A and B realize C only when D is true.
A follows B except in scenario E.
At least one of A, B, or C remains available.
Only one actor may hold a capability at a time.
A journey is acceptable only when all states satisfy its experience commitment.
```

Interactions are essential because system-level decay often happens between individually correct components.

## 14. Invalidation

Every derived, inferred, evaluated, or approved record declares its dependencies and invalidation conditions.

```text
source changes
  -> dependent observations become stale
  -> derived statements become stale
  -> evaluations become unknown or stale
  -> accepted normative meaning normally remains accepted
  -> active episodes pause or request revalidation
  -> context envelopes are regenerated
```

An invalidation edge records:

```text
dependent_record
input_record_or_source
invalidation_events
stale_behavior
execution_impact
```

Dependencies are typed. Implementation evidence normally has an `epistemic_dependency`; changing it invalidates conformance knowledge, not the normative commitment. Approval expires only through an applicable `authorization_dependency`, `applicability_dependency`, explicit expiration, supersession, or declared reevaluation trigger.

No stale evaluation may satisfy a proof obligation whose freshness policy has been breached.

## 15. Control Responses

Evaluation does not close the loop until it drives a response.

```text
continue     Proceed because obligations are satisfied.
close        Mark the episode complete with sufficient evidence.
retry        Repeat an action or evaluator under the same plan.
repair       Start a bounded corrective episode.
replan       Replace the intended delta or execution strategy.
escalate     Transfer judgment to an authorized actor.
block        Prevent a governed transition.
waive        Accept scoped, authorized, expiring risk.
abort        End the episode without accepting the resulting state.
```

Every intervention is followed by reevaluation or explicit authorized risk acceptance.

## 16. Meta-Control

Meta-control checks whether the controller itself can be trusted for the current purpose.

It evaluates:

```text
context completeness claims
extractor coverage and failures
evaluator freshness
authority validity
unresolved semantic conflicts
unknown required sources
control-binding coverage
active exceptions
controller and schema version compatibility
```

Meta-control does not claim universal certainty. It reports whether declared control requirements have been met and where control remains incomplete.

## 17. Semantic Hygiene

The meaning store can itself accumulate slop.

Required hygiene operations:

```text
duplicate detection
canonicalization
merge with provenance preservation
supersession
archival
staleness propagation
vocabulary deprecation
orphan detection
confidence recalibration
evidence retention
agent-output quality checks
```

### Meaning budget

> Do not create a unit, commitment, relationship, or interpretation unless it changes a query, evaluation, decision, context boundary, or action.

Observed code elements are exempt from semantic narration: an extractor may index them, but they do not all require hand-authored meaning records. Meaning is promoted when it becomes relevant to control, explanation, or change.

## 18. Expanded Kernel Invariants

1. No inference becomes accepted silently.
2. Every derived or interpreted statement identifies its dependencies.
3. Every evaluation identifies scope, revision, evaluator, inputs, coverage, and blind spots.
4. Approval, evaluation, freshness, epistemic basis, and confidence are independent dimensions.
5. Every consequential commitment has an owner or explicitly declares no owner.
6. Every controlled execution occurs inside an execution episode.
7. Every execution episode declares scope, base revision, effects, and delegated authority.
8. Every context envelope reports its completeness boundary, omissions, stale inputs, and unavailable sources.
9. An actor cannot alter its governing commitments or authority without delegated permission.
10. Stale inputs invalidate dependent evaluations and context envelopes.
11. Unresolved blocking conflicts prevent controlled execution.
12. Exceptions preserve rationale, authority, scope, compensating controls, and expiration.
13. Completion requires evidence for every declared proof obligation.
14. Every intervention is followed by reevaluation or explicit risk acceptance.
15. Interactions preserve participant roles, conditions, and system-level invariants.
16. Hygiene operations preserve provenance and history.
17. Canonical and derived storage remain database-free and project-native.

## 19. Revised Product Sequence

Reconciliation and control move into the first proof. File format optimization and cloud synchronization remain important but follow validation of the control hypothesis.

### Phase 0: Closed-loop proof

Model one real feature with three commitments:

```text
Behavior
  Reopening a question restores prior context.

Constraint
  Restoring context does not mutate research data.

Architecture
  Research-domain code does not depend on UI code.
```

For each:

```text
record commitment
bind evaluator
extract current reality
evaluate satisfied / violated / unknown
create context envelope
create bounded execution episode
simulate or perform change
reevaluate
close, escalate, waive, or replan
```

Exit condition:

> Kraddle preserves and governs these commitments through a nontrivial change without relying on the agent to remember unstated constraints.

### Phase 1: Meaning composition workspace

Idea dump, guided clarification, commitments, decisions, interactions, scopes, and relationships.

### Phase 2: Repository observatory

Deterministic extraction, stable anchors, current computation, runtime observations, and invalidation.

### Phase 3: Control runtime

Context assembly, episodes, authority, evaluator adapters, responses, exceptions, and meta-control.

### Phase 4: Agent execution environment

Sub-agent delegation, scoped tools, sandboxing, live evidence, escalation, and reconciliation UI.

### Phase 5: Synchronization and broader language support

Multi-device event synchronization, additional language analyzers, and optional team authority models.

## 20. Documentation Corrections Required

The format documentation must distinguish maturity explicitly:

```text
conceptual      A theory or semantic proposal
specified       A documented normative contract
implemented     Working software exists
verified        Conformance tests establish behavior
```

Specific corrections:

- Mark CLI examples as illustrative until a CLI exists.
- Mark KRD byte layout as proposed, not implemented.
- Publish the complete current invariant set.
- Include `alternative_to` and profile semantics consistently.
- Resolve naming differences in `.kraddle/` layout.
- Remove `evidence` as a meaning-unit kind because Evidence is already a kernel record.
- Represent conflict as a standardized profile/event over kernel records, not an unexplained sixth primitive.
- Ensure common envelope fields and specialized record schemas align.
- Clarify that observing a user statement establishes that it was said, not that its content is true.

Kraddle's own specification should model the lifecycle it demands from software.

## 21. Complete Control Loop

```text
Human intent
  -> semantic model
  -> accepted commitments
  -> control bindings
  -> applicable authority
  -> context envelope
  -> execution episode
  -> action
  -> observation and attestation
  -> evaluation
  -> response
  -> invalidation and reevaluation
  -> reconciled meaning and reality
```

This is the synergy between the original thought clarifier, meaning layer, code observatory, verification panel, and agent development environment. They are not separate products accidentally gathered together. They are surfaces around one closed semantic control loop.
