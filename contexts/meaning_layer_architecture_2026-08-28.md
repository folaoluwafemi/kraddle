# Kraddle Meaning Layer: Product and Technical Architecture

Date: August 28, 2026
Status: Proposed architecture for the first standalone Kraddle layer

## 1. Goal

Build the meaning layer as a complete local-first product before building the wider agent-development environment.

The meaning layer turns uneven human ideas and existing software evidence into a structured, editable model answering:

```text
What does the software do?
What is it for?
What must it preserve?
What does it become in use?
How do all its parts relate across and within abstraction levels?
How do we know each statement is accurate?
```

The model must be usable locally, optionally synchronized through the cloud, inspectable by people, queryable by agents, and connected to source code and runtime evidence.

## 2. Product Boundary

This layer includes:

- Idea capture and clarification.
- Structured meaning records.
- Horizontal and vertical relationships.
- Code and document extraction.
- Evidence and uncertainty.
- Revision history and meaning diffs.
- Local storage and offline operation.
- Optional cloud backup and multi-device synchronization.
- Human and agent APIs for reading and editing meaning.
- Views that make the model understandable without exposing encoding mechanics.

This layer does not initially include:

- Code generation or autonomous execution.
- Team workflows and permissions beyond one owner.
- Marketplace or extension distribution.
- Universal support for every programming language.
- Automatic recovery of true intent from code.
- A general-purpose graph storage product.

## 3. Core Product Loop

```text
Capture
  User dumps an idea, imports documents, or opens a repository.

Extract
  Kraddle deterministically extracts code structure and explicit evidence.

Clarify
  Kraddle identifies important missing, uneven, or contradictory meaning.

Compose
  The user and agents create a connected meaning model.

Inspect
  The user views purpose, behavior, constraints, structure, and evidence.

Revise
  Changes produce explicit meaning diffs rather than overwriting history.

Reconcile
  Intended meaning is compared with extracted implementation reality.

Sync
  Local changes are durable immediately and optionally replicated to cloud.
```

## 4. The Core Model

The model has five essential records.

### 4.1 Meaning unit

A meaning unit is any identifiable thing Kraddle needs to discuss.

Examples:

- Product purpose
- Feature
- Behavior
- Constraint
- Domain concept
- UI component
- Service
- Class
- Function
- Test
- Runtime journey

Minimum fields:

```text
id
workspace_id
scope_id
kind
title
description
abstraction_level
origin
status
created_at
updated_at
```

`kind` begins with a small vocabulary:

```text
purpose
experience
capability
behavior
concept
constraint
software_element
evidence
open_question
```

The vocabulary can grow without changing the storage kernel.

### 4.2 Relationship

A relationship connects two meaning units and explains the connection.

Minimum fields:

```text
id
workspace_id
from_unit_id
type
to_unit_id
direction
origin
status
confidence
```

Initial vertical relationship types:

```text
realized_by
implemented_by
decomposed_into
constrained_by
verified_by
```

Initial horizontal relationship types:

```text
depends_on
collaborates_with
shares_state_with
precedes
alternative_to
conflicts_with
```

### 4.3 Commitment

A commitment records what a unit is accountable to.

Rather than making `does`, `is_for`, and `must_preserve` special fixed fields, store them as typed commitments so each unit can have several of each.

```text
id
unit_id
type: does | is_for | must_preserve | becomes_in_use
statement
origin
status
confidence
```

Example:

```text
Unit: restoreContext()

does:
  Given a question ID, returns its sources, notes, and open thoughts.

is_for:
  Allows a person to resume an investigation.

must_preserve:
  Reading context must not mutate research data.
```

### 4.4 Evidence

Evidence supports, challenges, or explains a unit, commitment, or relationship.

```text
id
workspace_id
kind
source_uri
content_or_digest
captured_at
extractor
extraction_version
```

Evidence links record:

```text
evidence_id
target_type
target_id
effect: supports | challenges | derived_from
strength
```

Evidence kinds include:

```text
user_statement
document_excerpt
code_structure
test_result
runtime_trace
screenshot
git_history
human_approval
agent_interpretation
```

### 4.5 Scope

A scope says where meaning applies.

```text
id
workspace_id
kind
name
parent_scope_id
external_ref
```

Scope kinds include:

```text
product
feature
journey
repository
branch
worktree
revision
module
alternative
```

Scopes can nest. They do not replace relationships between meaning units.

## 5. Storage Kernel

The kernel is the stable machinery beneath the vocabulary.

It guarantees:

```text
Stable identity
Typed records
Typed relationships
Provenance
Uncertainty and approval state
Scopes
Evidence
Immutable history
Querying
Synchronization
```

The kernel does not decide what every product concept means. It only guarantees that meanings can be represented, connected, traced, revised, and synchronized.

## 6. Local Storage

### Recommendation

Use a project-native `.kraddle/` workspace as the canonical format. The meaning layer should travel with the project in the same spirit as `.git/`, `.idea/`, and `.vscode/`.

Example location:

```text
project/
  .kraddle/
    workspace.krd
    schema.krd
    events/
    objects/
    indexes/
    config.krd
```

`workspace.krd` stores workspace identity, roots, and current pointers.

`schema.krd` describes the vocabulary and relationship types used by the workspace.

`events/` stores the append-only history of meaning changes and extraction observations.

`objects/` stores larger evidence such as screenshots, traces, extracted documents, and snapshots by content hash.

`indexes/` stores disposable local indexes for fast lookup. They can always be deleted and rebuilt from the canonical files.

`config.krd` contains portable workspace configuration, never secrets.

### Why A Native Workspace Format

- Meaning is visibly part of the project.
- The workspace is portable, copyable, versionable, and independently back-up-able.
- Multiple files can separate stable metadata, history, evidence, and indexes.
- The format can be compact and optimized for connected records.
- The format can support incremental reading rather than parsing one giant document.
- Kraddle can rebuild derived indexes at any time.
- The project remains understandable without requiring a hosted service.

### Core local file roles

```text
workspace.krd       Workspace identity and current heads
schema.krd          Vocabulary and relationship definitions
events/*.krd        Immutable changes and observations
objects/*           Large evidence, content-addressed
indexes/*           Rebuildable lookup and traversal indexes
config.krd          Portable non-secret configuration
```

The canonical format is a set of typed records and immutable events. Index files are an implementation detail and are not authoritative.

## 6.1. Compact Encoding

The `.krd` extension is a proposed Kraddle file format, not a final name.

The format should have two representations:

```text
Readable form
  Used for debugging, export, review, and interoperability.

Compact form
  Used for normal storage and sync.
```

The compact form can use stable integer identifiers for repeated strings, typed fields, binary IDs and timestamps, content-addressed evidence, and segment compression.

Do not invent compression and cryptography simultaneously. First define the semantic format and canonical serialization. Then benchmark a standard binary encoding such as MessagePack or CBOR against a custom encoding. Use a standard compressor such as zstd if compression is needed.

The format should be documented and exportable. Being difficult for other tools to parse is not a meaningful security boundary. Privacy should come from access control and optional encryption, not obscurity.

## 6.2. Canonical Data Versus Indexes

```text
Canonical files
  The actual meaning and history. Must be preserved and synced.

Indexes
  Derived accelerators for search, graph traversal, and UI loading. Can be deleted
  and rebuilt from canonical files.
```

Kraddle uses purpose-built file-native indexes. No SQL engine, embedded database, or database service is part of canonical or derived storage. The portable source of truth remains `.kraddle/`.

## 7. Change History

Every accepted edit is recorded as an immutable event before updating the current local projection.

Example events:

```text
MeaningUnitCreated
MeaningUnitUpdated
CommitmentProposed
CommitmentAccepted
CommitmentRejected
RelationshipAdded
EvidenceAttached
ScopeCreated
ObservationRecorded
ConflictResolved
```

Each event contains:

```text
event_id: globally unique UUID
workspace_id
actor_id
device_id
event_type
payload
timestamp
logical_clock
causal_parents
schema_version
```

The event log provides:

- Auditability.
- Undo and redo.
- Meaning diffs.
- Historical reconstruction.
- Synchronization.
- Branching later.

The local projection is derived current state for fast queries. The event log is the durable history of how that state came to be.

## 8. Local And Cloud Synchronization

### Principle

Local state is primary for interaction. Cloud state is an optional durable replica, multi-device relay, and future collaboration coordinator.

The application must open, read, and write without network access. Synchronization must never block local use.

### Cloud components

```text
Cloud event store
  Stores workspace metadata, immutable events, ownership, and sync cursors.

Cloud query projections
  Optional derived views for account-level search and fast remote access.

Object storage
  Stores large evidence blobs by content hash.

Sync service
  Accepts local events, validates ownership and schema, returns missing events,
  and streams new events when connected.
```

### Sync protocol

```text
1. Local edit appends an event and updates the local projection in one transaction.
2. Client sends unsynced events to cloud when online.
3. Server deduplicates by event ID and validates authorization.
4. Server appends accepted events and advances its workspace cursor.
5. Client requests events after its last cloud cursor.
6. Client applies remote events to its local projection.
7. A live stream announces new cloud events while connected.
```

### Conflict policy

Do not silently merge semantic disagreements.

Safe structural changes can merge automatically:

- Two different units are added.
- Evidence is attached independently.
- Different relationships are added.

Potential meaning conflicts should be surfaced:

- Two devices edit the same accepted commitment differently.
- One device rejects a commitment another accepts.
- One relationship supersedes another concurrently.

Conflicts become first-class records with both alternatives and their evidence. The user chooses, combines, or keeps them as explicit alternatives.

### CRDT decision

Do not make the whole meaning model one CRDT document initially.

CRDTs such as Automerge and Yjs are excellent for concurrent text and document editing. They can be added later for rich-text fields or live collaborative canvases. They cannot decide whether two conflicting product commitments are semantically compatible.

For the first product, use `.kraddle` event synchronization plus explicit semantic conflict handling.

## 9. Code And Artifact Extraction

Extraction never writes accepted meaning directly. It produces observations and evidence.

### Extraction pipeline

```text
Source discovery
  Identify languages, build systems, tests, docs, and repository metadata.

Parsing
  Build syntax trees and declarations.

Semantic indexing
  Resolve symbols, references, types, callers, implementations, and imports.

Analysis
  Derive call, dependency, control-flow, data-flow, state, and test links.

Anchoring
  Assign durable identities to code elements across revisions.

Observation
  Store deterministic facts with extractor version and source revision.

Interpretation
  Optionally propose responsibilities and higher-level meaning.

Confirmation
  Human accepts, edits, or rejects proposed meaning.
```

### Language adapter interface

Each language adapter should emit one normalized intermediate format:

```text
SoftwareElement
  stable_anchor
  language
  kind
  qualified_name
  location
  signature
  inputs
  outputs
  effects

SoftwareRelation
  from_anchor
  type
  to_anchor

CodeEvidence
  source_revision
  analyzer
  confidence
```

Start with TypeScript using the TypeScript Compiler API for semantic facts and Tree-sitter only where it adds tolerant or incremental syntax support.

### Stable code anchors

Paths and line numbers are not stable enough.

An anchor should combine:

```text
repository identity
language
symbol kind
qualified name
signature fingerprint
structural fingerprint
source revision
```

On each scan, Kraddle remaps old anchors to new symbols and records confidence. Ambiguous remaps require confirmation rather than silently transferring commitments to the wrong code.

## 10. Idea And Document Extraction

Input can be:

- Free-form conversation.
- Voice transcript.
- Markdown or product documents.
- Screenshots and design references.
- Existing requirements and tests.
- Imported repository.

These sources enter an inbox before becoming accepted meaning.

```text
Raw source
  -> candidate meaning units
  -> candidate commitments and relationships
  -> questions and contradictions
  -> user review
  -> accepted model
```

Every generated candidate retains a link to the exact source excerpt that produced it.

## 11. User Experience

Users should not interact with encoded records or a giant graph by default.

### 11.1 Inbox

The user dumps ideas and imports sources.

Kraddle returns:

```text
What I understand
What appears important
What is missing
What conflicts
What I am only guessing
```

### 11.2 Meaning outline

A readable structured view:

```text
Purpose
Experience
Capabilities
Behaviors
Concepts
Constraints
Open questions
```

Every item can be edited, accepted, rejected, or traced to its source.

### 11.3 Element inspector

Selecting any product or code element shows:

```text
Does
Is for
Must preserve
Becomes in use
Horizontal relationships
Vertical relationships
Evidence
Uncertainty
History
```

### 11.4 Relationship map

A focused graph projection, never the entire universe at once.

Filters:

- Up one abstraction level.
- Down one abstraction level.
- Peers and dependencies.
- Evidence.
- Contradictions.
- Affected meaning for a proposed change.

### 11.5 Meaning diff

Before accepting a change:

```diff
- Articles are the primary organizational unit.
+ Questions are the primary organizational unit.

Affected meaning:
  Home behavior
  Navigation hierarchy
  Article relationship
  Existing implementation anchors
```

### 11.6 Coverage view

Show gaps rather than a vanity score:

```text
Commitments without implementation
Implementation without known purpose
Constraints without evidence
Stale code observations
Contradictions between intent and reality
Ambiguous code-anchor remaps
```

## 12. Agent Interface

Agents need a compact query and mutation API, not a dump of the whole model.

Read operations:

```text
get_workspace_summary
get_unit
get_neighbors
get_ancestors
get_descendants
get_commitments
get_evidence
get_open_questions
get_contradictions
get_change_impact
```

Write operations:

```text
propose_unit
propose_commitment
propose_relationship
attach_evidence
record_observation
mark_stale
```

Agents propose changes by default. User-approved policies may later allow deterministic extractors or trusted agents to write specific record types directly.

## 13. Required Invariants

The meaning layer itself must preserve:

1. No inferred statement becomes accepted without an explicit actor or policy.
2. Every observation names its source revision and extractor version.
3. Every relationship has a defined type and direction.
4. Every edit is recoverable from history.
5. Local writes succeed without cloud availability.
6. Synchronization is idempotent.
7. Conflicting accepted meaning is never silently discarded.
8. Deleting a unit does not destroy its history or evidence.
9. Code-anchor uncertainty is visible.
10. Large evidence blobs are content-addressed and integrity checked.
11. Secrets and raw credentials are never stored in the meaning model.
12. Users can export their complete workspace without the cloud service.

## 14. Security And Privacy

- Local workspaces are private by default.
- Cloud sync is opt-in per workspace.
- Encrypt all network traffic.
- Encrypt cloud storage at rest.
- Keep provider credentials in the operating-system secret store.
- Apply workspace ownership checks to every sync event and object request.
- Use content hashes for blob integrity, not for access control.
- Support complete local export and cloud deletion.
- Record agent and extractor identity on every generated record.
- Treat imported repository content as sensitive data.

End-to-end encryption can be added later, but the event and blob formats should reserve key/version metadata so it does not require redesigning identities.

## 15. Query Requirements

The first implementation must answer efficiently:

```text
What does this unit do?
What is it for?
What must it preserve?
What are its peers?
What higher-level meaning does it serve?
What lower-level elements realize it?
What evidence supports it?
What is inferred or stale?
What changed between two revisions?
What would be affected if this commitment changed?
Which commitments lack implementation or evidence?
```

File-native adjacency, ID, anchor, and text indexes provide the initial query layer. Indexes are immutable sorted runs that can be memory-mapped and compacted without becoming canonical state.

## 16. Phased Execution Plan

### Phase 0: Schema laboratory

Build a command-line prototype directly on the `.kraddle` event and record format.

- Create units, commitments, relationships, scopes, and evidence.
- Import and export a workspace as human-readable JSON.
- Query vertical and horizontal relationships.
- Produce a meaning diff.
- Test schema migrations and event replay.

Exit condition:

One manually modeled product can be represented without losing the distinctions developed in the theory.

### Phase 1: TypeScript repository inspector

- Discover a TypeScript repository.
- Extract files, symbols, imports, calls, types, and tests.
- Persist observations and artifact anchors.
- Rescan incrementally.
- Show deterministic `does` information for selected elements.
- Let the user add `is_for` and `must_preserve` commitments.

Exit condition:

A user can trace a function upward to a feature purpose and sideways to its dependencies.

### Phase 2: Meaning workspace UI

- Inbox for ideas and imports.
- Meaning outline.
- Element inspector.
- Relationship map.
- Evidence drawer.
- Meaning diff and history.
- Coverage gaps.

Exit condition:

A user can compose and revise a meaningful software model without reading raw encoded records.

### Phase 3: Guided composition

- Turn free-form ideas into proposed units, commitments, and relationships.
- Show source-backed proposals and uncertainty.
- Ask only questions that resolve important gaps or conflicts.
- Support review, acceptance, and rejection.

Exit condition:

A vague idea can become a model the user recognizes as concrete and sufficiently constrained.

### Phase 4: Local-cloud sync

- Authentication and device identity.
- Append/pull event sync.
- Object upload and download.
- Offline recovery.
- Conflict records and resolution UI.
- Export, import, and cloud deletion.

Exit condition:

The same workspace can be edited offline on two devices, synchronized, and reconciled without silent data loss.

### Phase 5: Reconciliation API

- Compare accepted commitments with extracted observations.
- Detect stale evidence and missing implementation links.
- Compute affected units for a proposed meaning change.
- Expose compact agent tools.

Exit condition:

An agent can receive a focused, evidence-backed slice of meaning rather than an unstructured project dump.

## 17. Recommended Initial Technology Direction

This is provisional and should be validated with Phase 0.

```text
Desktop shell:       Tauri
UI:                  React + TypeScript
Local canonical:     `.kraddle` KRD files
Local indexes:       File-native KRI sorted runs
Local large objects: Content-addressed files
Code analysis v1:    TypeScript Compiler API
Tolerant syntax:     Tree-sitter where necessary
Cloud event storage: Immutable KRD segments and manifests
Cloud objects:       S3-compatible storage
Sync transport:      HTTP push/pull plus server-sent events or WebSocket notices
Schema validation:   TypeScript schema library plus format validators
```

Do not introduce SQL, an embedded database, a graph database, or a database service. The model is logically a graph, but storage and derived indexes remain purpose-built files locally and in the cloud.

Avoid committing the canonical model to Markdown files. Human-readable export is required, but files are a projection and interchange format, not sufficient storage for identities, relationships, provenance, concurrent revisions, and evidence.

## 18. Main Risks

### Ontology overdesign

Mitigation: keep the kernel small, use extensible `kind` values, and prove every new first-class concept through a real modeled project.

### Meaning maintenance becomes paperwork

Mitigation: extract deterministic facts automatically, ask only consequential questions, show gaps, and make approval faster than writing documents.

### False confidence from AI interpretation

Mitigation: preserve source, confidence, and status; never present inference as observation.

### Code identities break during refactors

Mitigation: composite anchors, remap confidence, git-aware history, and explicit ambiguous-remap review.

### Sync complexity consumes the project

Mitigation: build local-only first; use an append-only protocol; defer rich-text CRDT and real-time team collaboration.

### The graph becomes visually overwhelming

Mitigation: task-specific projections, bounded neighborhoods, abstraction filters, and outline-first navigation.

## 19. Definition Of Success For The Meaning Layer

The layer is successful when a user can:

1. Begin with an uneven idea or existing repository.
2. Produce a structured model they recognize as what the software means.
3. Inspect any level from product purpose to function behavior.
4. Move vertically across abstraction and horizontally across peers.
5. Distinguish intended meaning from extracted reality and interpretation.
6. See evidence, uncertainty, contradictions, and history.
7. Change meaning without losing its relationship to implementation.
8. Work fully offline and optionally sync across devices.
9. Give agents a precise, scoped model with substantially less guessing.

## 20. Architectural Summary

```text
Human ideas + documents + repositories + runtime evidence
                         |
                         v
                 Extraction inbox
                         |
                         v
       Units + commitments + relationships + evidence
                         |
                  local event log
                         |
                  local derived views
                         |
          +--------------+--------------+
          |                             |
     Human projections              Agent API
          |                             |
          +--------------+--------------+
                         |
                  optional sync
                         |
             cloud event and object store
```

The essential architectural decision is:

> Kraddle stores meaning locally as versioned, connected records; treats deterministic extraction as evidence rather than truth; lets humans establish commitments; and synchronizes immutable changes rather than making the cloud the only place the model exists.
