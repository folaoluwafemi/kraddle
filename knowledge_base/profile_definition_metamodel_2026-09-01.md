# Kraddle Profile Definition Metamodel

Date: September 1, 2026
Status: Proposed normative design for Phase 0

## 1. Purpose

Profiles give recurring concepts a standard shape without adding new physical storage primitives.

The five kernel records remain:

```text
Unit
Commitment
Relationship
Evidence
Scope
```

A profile is a validated arrangement of these records.

## 2. Profile Rule

Every profile instance has exactly one root `Unit`.

```text
Profile instance
  = root Unit
  + role-bearing Commitments
  + role-bearing Relationships
  + supporting Evidence
  + one or more Scopes
```

The root unit provides identity. Its ID is the profile ID:

```text
profile_id = root_unit_id
```

The root unit's `kind` identifies the profile. Examples:

```text
kind: control_binding
kind: evaluation
kind: execution_episode
```

The root unit may be temporarily incomplete only inside an uncommitted transaction. Canonical projections expose only complete profile states.

## 3. Profile Definition

`ProfileDefinition` is itself a schema definition, not a profile instance.

```text
ProfileDefinition
  profile_id
  version
  root_kind
  required_roles
  optional_roles
  role_definitions
  allowed_relationships
  cardinalities
  field_types
  lifecycle
  validation_rules
  projection_rules
  migration_rules
```

### Role definition

```text
RoleDefinition
  name
  storage_kind: unit | commitment | relationship | evidence | scope
  relationship_type, if applicable
  target_kind, if applicable
  cardinality
  required
  ownership: profile | referenced | shared
  status_requirements
```

### Cardinality

```text
0       none
1       exactly one
0..1    optional single
1..n    one or more
0..n    any number
```

## 4. Profile Ownership

Profile records have explicit ownership behavior:

```text
owned
  Created for and deleted with the profile. History remains preserved.

referenced
  Existing record linked by relationship. The profile does not delete it.

shared
  One record may participate in multiple profiles. Each use is scoped.
```

Default rules:

- The root Unit is owned by the profile.
- Role relationships are owned by the profile.
- Role Commitments are owned by the profile unless explicitly shared.
- Evidence is referenced, never owned destructively.
- Scopes are referenced unless created specifically for the profile.

## 5. Profile Validity

A profile is valid when:

```text
The root unit exists and has the expected kind.
Every required role has the required cardinality.
Every role has the declared storage type.
Every relationship uses an allowed type and direction.
Every target has the declared kind or profile type.
Every referenced scope exists.
Every status transition is allowed.
Every required role satisfies its status requirements.
No owned role is attached to another incompatible root.
```

Invalid profile state may exist in an uncommitted proposal transaction. It cannot become the current canonical projection.

## 6. Kernel Mapping: ControlBinding

### Purpose

Connect a Commitment to applicability, evaluation, authority, proof obligations, response, freshness, and exceptions.

### Definition

```yaml
profile: control_binding/v1
root_kind: control_binding

roles:
  governed_commitment:
    storage: relationship
    relationship: governs
    target_kind: commitment
    cardinality: 1
    ownership: referenced

  subject_selector:
    storage: commitment
    commitment_type: applies_to
    cardinality: 1
    ownership: owned

  modality:
    storage: commitment
    commitment_type: has_modality
    cardinality: 1
    ownership: owned

  evaluator:
    storage: relationship
    relationship: evaluated_by
    target_kind: evaluator
    cardinality: 0..n
    ownership: referenced

  proof_obligation:
    storage: relationship
    relationship: requires_evidence
    target_kind: commitment
    cardinality: 0..n
    ownership: referenced

  authority_policy:
    storage: relationship
    relationship: governed_by_authority
    target_kind: authority_policy
    cardinality: 0..1
    ownership: referenced

  response_policy:
    storage: relationship
    relationship: responds_with
    target_kind: response_policy
    cardinality: 0..1
    ownership: referenced

  exception_policy:
    storage: relationship
    relationship: permits_exception
    target_kind: exception_policy
    cardinality: 0..1
    ownership: referenced

  freshness_policy:
    storage: commitment
    commitment_type: freshness
    cardinality: 0..1
    ownership: owned
```

### Required semantics

```text
Exactly one accepted or proposed governed commitment.
Exactly one applicability commitment.
Exactly one modality.
Zero evaluators is valid only when modality is descriptive, preference, or hypothesis.
Blocking response requires an evaluator or explicit human evaluator.
Every evaluator declares coverage and failure behavior.
```

## 7. Kernel Mapping: EvaluationProfile

### Purpose

Record one qualified evaluation of one commitment against one subject selection, revision, and evidence frame.

### Definition

```yaml
profile: evaluation/v1
root_kind: evaluation

roles:
  target_commitment:
    storage: relationship
    relationship: evaluates
    target_kind: commitment
    cardinality: 1
    ownership: referenced

  target_selector:
    storage: relationship
    relationship: evaluates_subjects
    target_kind: subject_selector
    cardinality: 1
    ownership: referenced

  source_scope:
    storage: relationship
    relationship: evaluated_in
    target_kind: scope
    cardinality: 1
    ownership: referenced

  evaluator:
    storage: relationship
    relationship: performed_by
    target_kind: evaluator
    cardinality: 1
    ownership: referenced

  result:
    storage: commitment
    commitment_type: evaluation_result
    cardinality: 1
    ownership: owned

  coverage:
    storage: commitment
    commitment_type: coverage
    cardinality: 1
    ownership: owned

  blind_spot:
    storage: commitment
    commitment_type: blind_spot
    cardinality: 0..n
    ownership: owned

  evidence:
    storage: relationship
    relationship: supported_by
    target_kind: evidence
    cardinality: 0..n
    ownership: referenced

  invalidation_dependency:
    storage: relationship
    relationship: invalidated_by
    target_kind: unit
    cardinality: 0..n
    ownership: referenced
```

### Required semantics

```text
Exactly one target commitment, selector, scope, evaluator, result, and coverage.
The evaluated revision is part of the source scope or evaluation properties.
The result cannot be satisfied when the evaluator failed.
The result cannot be satisfied when required coverage is unknown or insufficient.
Every result has at least one evidence link unless the evaluator explicitly emits a failure.
```

Results:

```text
satisfied
violated
unknown
not_applicable
indeterminate
evaluation_failed
```

## 8. Kernel Mapping: ExecutionEpisode

### Purpose

Represent one bounded attempt by an actor to change reality.

### Definition

```yaml
profile: execution_episode/v1
root_kind: execution_episode

roles:
  purpose:
    storage: commitment
    commitment_type: purpose
    cardinality: 1
    ownership: owned

  intended_delta:
    storage: relationship
    relationship: intends_change
    target_kind: unit
    cardinality: 1..n
    ownership: referenced

  target_scope:
    storage: relationship
    relationship: acts_in
    target_kind: scope
    cardinality: 1
    ownership: referenced

  base_revision:
    storage: commitment
    commitment_type: base_revision
    cardinality: 1
    ownership: owned

  context_envelope:
    storage: relationship
    relationship: uses_context
    target_kind: context_envelope
    cardinality: 1
    ownership: referenced

  authority_grant:
    storage: relationship
    relationship: authorized_by
    target_kind: authority_grant
    cardinality: 1
    ownership: referenced

  applicable_commitment:
    storage: relationship
    relationship: governed_by
    target_kind: commitment
    cardinality: 0..n
    ownership: referenced

  allowed_effect:
    storage: commitment
    commitment_type: allowed_effect
    cardinality: 0..n
    ownership: owned

  forbidden_effect:
    storage: commitment
    commitment_type: forbidden_effect
    cardinality: 0..n
    ownership: owned

  proof_obligation:
    storage: relationship
    relationship: requires_evaluation
    target_kind: control_binding
    cardinality: 0..n
    ownership: referenced

  escalation_condition:
    storage: commitment
    commitment_type: escalate_if
    cardinality: 0..n
    ownership: owned

  observation:
    storage: relationship
    relationship: produced_observation
    target_kind: evidence
    cardinality: 0..n
    ownership: referenced

  outcome:
    storage: commitment
    commitment_type: outcome
    cardinality: 0..1
    ownership: owned

  resulting_revision:
    storage: commitment
    commitment_type: resulting_revision
    cardinality: 0..1
    ownership: owned
```

### Required semantics

```text
Exactly one purpose, intended target scope, base revision, context envelope, and authority grant.
The episode cannot start if the context envelope is invalid or authority is expired.
The episode cannot close without all blocking proof obligations resolved.
The resulting revision is present only after execution produces a state transition.
An aborted episode preserves observations and rationale but does not claim successful completion.
```

## 9. Profile Lifecycle

All profiles use a shared lifecycle unless their definition overrides it:

```text
draft
  → proposed
  → accepted
  → active
  → completed | superseded | expired | invalidated | aborted
```

Not every profile uses every state.

```text
ControlBinding: draft → proposed → accepted → active → superseded
Evaluation:     draft → running → completed → stale → expired
Episode:        draft → authorized → running → completed | aborted | escalated
```

Transitions are events. A transition operation validates the complete profile before appending its event.

## 10. Atomic Profile Operations

The API operates on profiles, not arbitrary record sequences:

```text
create_profile(definition, roles)
propose_profile(profile_id)
accept_profile(profile_id, authority)
activate_profile(profile_id)
complete_profile(profile_id, evidence)
supersede_profile(profile_id, replacement)
invalidate_profile(profile_id, reason)
abort_profile(profile_id, reason)
```

Each operation creates one transaction containing all constituent kernel record operations.

Readers see:

```text
previous valid profile
or
new valid profile
```

Never a partially applied profile.

## 11. Query Contract

Every profile definition publishes canonical queries:

```text
get_root(profile_id)
get_role(profile_id, role_name)
get_all_roles(profile_id, role_name)
get_profile_status(profile_id)
get_profile_evidence(profile_id)
get_profile_dependencies(profile_id)
get_profile_history(profile_id)
validate_profile(profile_id)
```

Agents and projections must use these role names rather than guessing from arbitrary relationship text.

## 12. Conformance Fixtures

The Phase 0 profile laboratory must test:

1. A valid ControlBinding with one commitment, evaluator, authority, and response.
2. A descriptive ControlBinding with no evaluator.
3. An invalid blocking ControlBinding with no evaluator.
4. An Evaluation with `evaluation_failed` and no false pass.
5. An Episode with an expired authority grant.
6. An interrupted multi-record profile transaction.
7. A synchronized profile with missing constituent event frames.
8. A superseded profile whose evidence and history remain queryable.
9. A profile containing an unknown optional extension role.
10. Two independent implementations producing equivalent profile queries.

## 13. Current Decisions

- A profile is identified by one root Unit ID.
- Profile semantics are defined by versioned ProfileDefinitions.
- Profiles are not new physical storage primitives.
- Profile mutations are atomic event transactions.
- Invalid incomplete profiles cannot become current projections.
- Role names and cardinalities are normative.
- Evidence is referenced and never destructively owned.
- Unknown optional profile data must survive lossless rewrites.

## 14. Open Questions

- Whether profile root units should be visible in the general meaning outline or only through profile projections.
- Whether profile definitions should live in `schema.krd` or be bundled into a versioned core schema.
- Whether role relationships need explicit transaction-local ordering.
- Whether profile validation occurs after every event or only at transaction boundaries.
- How profile-level merges should represent concurrent valid alternatives.

## 15. Exit Condition

ProfileDefinition is complete for Phase 0 when:

```text
ControlBinding, EvaluationProfile, and ExecutionEpisode each have:
  exact kernel mapping
  required and optional roles
  cardinalities
  ownership rules
  validity constraints
  lifecycle transitions
  atomic operations
  canonical queries
  projection rules
  migration behavior
  conformance fixtures
```
