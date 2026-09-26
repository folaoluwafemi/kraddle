# Kraddle Checkpoint: Software Meaning and the Missing Middle

Date: August 10, 2026
Status: Ideation checkpoint, before product validation

This document records the current conceptual state of Kraddle after the conversations stored in this repository. It is intentionally explanatory rather than definitive. Terms marked as provisional are working language, not settled product decisions.

## 1. The Originating Problem

Kraddle began as an integrated thought clarifier.

The user starts with an intention such as:

> I want this to exist in the world.

The intention may be vague, incomplete, emotional, visual, or contradictory. Existing AI development tools usually move directly from that intention to code or to a finished product. They are excellent at producing an output, but they do not provide a sufficiently rich and editable place in between for the user to shape what the software is supposed to mean.

The painful gap is:

```text
Vague desire -> generated product
                         ^
                         |
              too much hidden interpretation
```

When the output is wrong, the available corrections are usually:

- Try another prompt.
- Accept another generated result.
- Enter a visual editor with limited controls.
- Edit code, which is often much too detailed.

Kraddle is exploring a better middle: a persistent, editable representation of the intended software that can be made more precise or more concrete as needed.

## 2. Current Thesis

Working thesis:

> Kraddle is a medium for shaping what software means, at whatever level of abstraction the user can currently express, while agents progressively make it executable.

The important addition is bidirectionality:

```text
Intent <-> meaning model <-> behavior <-> implementation <-> running system
```

Kraddle should be able to move downward:

```text
Intent -> clearer meaning -> behavior -> structure -> implementation
```

And upward:

```text
Implementation -> observed behavior -> inferred structure -> inferred meaning
```

The downward direction proposes and generates. The upward direction observes and infers. They are not equally certain. Code can reveal what a system does, but it cannot always reveal why it was created.

## 3. The Core Loop

The current product loop is:

```text
1. Start with an idea.
2. Clarify and structure it.
3. Generate a product.
4. Observe the generated product and implementation.
5. Infer what the system currently means.
6. Compare that against the user's intended meaning.
7. Let the user edit the discrepancy at the highest useful level.
8. Reconcile the lower levels.
```

“Highest useful level” means the least detailed representation that can express the correction accurately.

Examples:

- “The button is too low” is probably a visual correction.
- “New users do not understand the value” is probably a behavior or experience correction.
- “This module owns the wrong responsibility” is a structural correction.
- “This product is solving the wrong problem” is an intent correction.

The user should not have to translate every correction into code.

## 4. The Map At A Glance

Kraddle is not one tree. It is several related trees and dimensions.

The most important tree is the **meaning-to-execution tree**:

```text
Intent
  |
  +-- Outcomes and principles
        |
        +-- Capabilities
              |
              +-- Behaviors and user situations
                    |
                    +-- States, data, and interfaces
                          |
                          +-- Architecture and constraints
                                |
                                +-- Implementation
                                      |
                                      +-- Running system
                                            |
                                            +-- Evidence
```

This is not a required linear workflow. A user can enter at any level. Kraddle can then help generate upward or downward representations around that entry point.

There are also other dimensions:

```text
Meaning tree       What the system is supposed to mean
Reality tree       What the system currently does
Alternative tree   Other possible ways the system could be
Time               How any of the above changes across revisions
Scope              Which part of the system or idea is being discussed
Evidence           What supports or contradicts each understanding
Views              How a person or agent looks at and edits the model
```

The trees are not separate piles of documents. They are connected views over related information.

## 5. Plain-Language Definitions

### Intent

Intent is the desired direction or outcome behind creating something.

It answers:

> Why do we want this to exist, and what change in the world are we hoping it creates?

Example:

```text
Help people revisit research without losing the question that motivated it.
```

Intent is not necessarily a complete requirement. It may begin as a feeling, aspiration, or rough statement.

### Meaning

Meaning is the accumulated answer to what the software is for, what it should do, what it must preserve, and how its parts fit together.

Intent is one source of meaning. Behavior, constraints, architecture, user experience, and observed usage also contribute to the evolving understanding of the system.

“Software meaning” is currently the broadest phrase for the thing Kraddle is trying to make editable and traceable.

### Artifact

Artifact means any durable thing that expresses, implements, observes, or supports meaning.

Examples:

- Intent statement
- User journey
- Behavior description
- Architecture rule
- Source file
- Test
- Screenshot
- Runtime trace
- Generated explanation

Artifact is useful as a broad storage term. It is not yet the central user-facing concept.

### Claim

A claim is a statement that may be true, false, proposed, inferred, accepted, rejected, or unknown.

Examples:

```text
The product should work offline.
Reopening a source should show its related notes.
The Notes module should not depend on the UI module.
The current implementation stores notes in SQLite.
This test verifies offline reopening.
```

The word “claim” is useful because it prevents Kraddle from treating every generated sentence as truth. It forces the system to ask:

- Who or what said this?
- Is it intended, observed, inferred, or proposed?
- What supports it?
- What does it affect?
- Is it still current?

Claim is an internal precision term. It does not need to be exposed as the main product language.

### Relationship

A relationship explains how two pieces of meaning are connected.

Examples:

```text
Intent supports Capability.
Capability is realized by Behavior.
Behavior is implemented by Module.
Behavior is verified by Test.
Constraint applies to Module.
Observed behavior contradicts Intended behavior.
Feature intent refines Product intent.
Worktree implements Feature intent.
```

The relationship is as important as the things it connects. “A is related to B” is usually too vague to be useful.

### Graph

A graph is a collection of things and meaningful connections between them.

In Kraddle, the graph is a possible internal representation of software meaning. It is not necessarily the user interface, and it is not necessarily one graph per project.

A graph can represent:

- One feature.
- A product-level intent.
- An existing repository.
- An implementation alternative.
- A worktree.
- A bug investigation.
- A verification run.

The graph may be shown in 2D, but the underlying information also has time, scope, alternatives, evidence, and provenance. A 2D graph is one projection of a richer structure.

### Domain

Domain means the subject area being discussed, not a special Kraddle mechanism.

Examples:

- Payments
- Research
- Scheduling
- Healthcare intake
- A particular product

If the word is unnecessary, say “subject area” instead. In Kraddle, a domain may group related concepts, behaviors, and constraints, but it should not be assumed to have a universal formal definition yet.

### Scope

Scope means the boundary of what a statement is about.

Examples:

- The entire product.
- One feature.
- One user journey.
- One module.
- One git revision.
- One worktree.
- One proposed alternative.

Scope matters because a project is rarely one intent in its entirety. A product can contain multiple feature intents, user intents, experiments, and historical intents.

Scope answers:

> Where does this statement apply?

### Worktree

A worktree is a particular implementation state or branch of the software.

For Kraddle, it can also be treated as a candidate system state being explored.

```text
Worktree A -> implementation of one feature approach
Worktree B -> implementation of an alternative approach
```

The filesystem stores the worktree, but the semantic model should know what that worktree is intended to explore or implement.

### Vocabulary

Vocabulary means the names Kraddle uses for meaningful things and relationships.

For example:

```text
Things: Intent, Capability, Behavior, Constraint, Module, Test
Connections: supports, realizes, implements, constrains, verifies
```

Vocabulary is not the underlying structure. It is the language used to describe things in the structure.

### Kernel

Kernel means the smallest stable foundation needed to store, connect, version, and inspect meaning.

The kernel should know about general operations such as:

- Identity
- Version
- Scope
- Source
- Status
- Evidence
- Connection

The kernel should not need to know every software concept. It is comparable to the basic rules of a database or version-control system, not to the full vocabulary of a product.

### Evidence

Evidence is something that supports or challenges a claim.

Examples:

- User statement
- Source document
- Existing code
- Dependency analysis
- Screenshot
- Test result
- Runtime observation
- Human approval

Evidence does not automatically make a claim true. It gives the claim a basis that can be inspected.

### Uncertainty

Uncertainty is the system's honest representation of how firmly a statement is established.

Useful statuses include:

```text
Observed       Directly seen in code, runtime, or user input
Inferred       Best explanation derived from evidence
Proposed       Suggested future direction
Accepted       Explicitly approved by the user or responsible person
Rejected       Explicitly declined
Unknown        Not enough information
Contradicted   Conflicts with another accepted or observed statement
Stale          Was once supported but may no longer describe reality
```

This distinction is essential for upward generation. Code can support an inference about behavior, but usually cannot prove the original intent.

### Projection

A projection is a view of the same underlying meaning, optimized for a particular task.

Examples:

- Thought clarification view
- Product capability map
- User journey view
- UI canvas
- Architecture view
- Dependency view
- Evidence view
- Code view

Projection is a better term than “representation” when emphasizing that the view is one angle on a larger model.

## 6. The Foundational Structure

The current hypothesis is not that Kraddle needs no structure. It needs a general structure that can support many kinds of software meaning without prematurely fixing the complete vocabulary.

The working formula is:

```text
Stable structural kernel
+ Extensible vocabulary
+ Meaningful relationships
+ Explicit uncertainty
+ Multiple projections
```

In plain English:

```text
Keep the storage and connection rules stable.
Let the concepts grow over time.
Make every important connection explicit.
Do not hide guesses as facts.
Show the same meaning through different useful views.
```

This is a design direction, not a finalized schema.

## 7. What Connects The Different Trees

The filesystem is storage, not meaning.

A directory can tell us that two files are nearby. It cannot reliably tell us:

- Whether one file refines another.
- Whether one worktree implements a particular intent.
- Whether a test verifies a behavior.
- Whether a module violates an architectural constraint.
- Whether a newer claim supersedes an older one.

Kraddle therefore needs semantic connections.

The current working connection types are:

```text
supports          One thing helps achieve another.
refines           One intent or idea makes another more specific.
realizes          A behavior expresses a capability or intent.
implements        An artifact or worktree builds a behavior or capability.
constrains        A rule limits what another thing may do.
depends_on        One thing requires another.
verified_by       Evidence or a test checks a claim.
observed_as       Reality presents itself in a particular way.
contradicts       Two statements cannot both be accepted as true.
derived_from      A statement was produced from a source.
supersedes        A newer statement replaces an older one.
explores          A worktree or alternative investigates a possibility.
```

These names are provisional. Their purpose is to show the kind of connection required, not to settle the final terminology.

## 8. The Trees And Their Relationships

### A. Intended Meaning

```text
Intent
  -> outcomes and principles
  -> capabilities
  -> desired behaviors
  -> desired states and experiences
  -> constraints
```

This answers: “What do we want to be true?”

### B. Realized System

```text
Implementation
  -> executable behavior
  -> interfaces and data
  -> architecture and dependencies
  -> runtime behavior
```

This answers: “What is actually there and what does it do?”

### C. Alternatives

```text
Intent
  -> Approach A
  -> Approach B
  -> Approach C
```

Each approach may have its own implementation, worktree, trade-offs, and evidence. Alternatives should remain comparable rather than being immediately overwritten by the latest generated result.

### D. Evidence

```text
Claim
  -> source
  -> code evidence
  -> test evidence
  -> runtime evidence
  -> human judgment
```

This answers: “Why should we believe this?”

### E. Time

Every tree changes. A claim may be true at one revision and stale at another.

```text
Revision 1 -> Revision 2 -> Revision 3
```

Kraddle should preserve how meaning changes, not just the final current state.

### F. Views

The same connected information can be seen as:

```text
Conversation
Map
Canvas
Checklist
Architecture diagram
Diff
Running preview
Evidence report
```

These are interaction surfaces, not necessarily separate underlying artifacts.

## 9. The Central Reconciliation Operation

The central operation is not generation alone. It is reconciliation.

```text
Intended meaning
        vs.
Current meaning inferred from reality
        |
        v
Discrepancy
        |
        v
User chooses the level of correction
        |
        v
Lower levels are regenerated or adapted
        |
        v
Evidence checks the result
```

This works in both directions:

```text
Idea -> intended model -> implementation
Implementation -> observed model -> clarified meaning
```

The model must preserve the distinction between these two directions:

```text
Desired:  The user wants this.
Observed: The current system does this.
Inferred: The agent thinks this explains the system.
Proposed: The agent recommends this change.
```

## 10. What Is Foundational And What Is Still Vague

Strong current beliefs:

- Kraddle is about shaping software meaning, not primarily editing code.
- Users should be able to enter from vague intent or existing implementation.
- Kraddle must work upward and downward through levels of abstraction.
- The user needs a middle surface that is more precise than conversation and less fine-grained than code.
- Meaning must remain connected across product intent, behavior, structure, implementation, and evidence.
- Generated understanding must distinguish observation from inference.
- A project is not one intent; it contains nested, overlapping, alternative, and historical intents.

Open questions:

- What should the middle surface feel like in use?
- Which concepts deserve first-class status?
- How much of the model should be visible at once?
- How should users approve, revise, or reject inferred meaning?
- How should alternatives and worktrees be compared?
- What should be generated automatically, and what requires confirmation?
- What is the smallest useful implementation of the core loop?

## 11. Current Product Boundary

The long-term vision may extend beyond software, because the general pattern is:

```text
Intent -> editable meaning -> generated artifact
```

However, software is the best initial domain because it provides unusually strong feedback:

- It can run.
- It can be inspected.
- It can be tested.
- It can be regenerated.
- It can produce structured evidence.
- Its implementation can be compared with its intended meaning.

The current discipline is therefore:

```text
General principle: make generated artifacts meaningfully editable.
Initial domain: software.
```

## 12. Recommended Next Experiment

Do not begin by finalizing the complete ontology or building the full graph platform.

Use one small existing application or repository and manually create three connected views:

```text
1. What the system is intended to be.
2. What the system currently appears to be.
3. What the user wants to change.
```

Then test one correction at three possible levels:

```text
Experience: It does not feel calm.
Behavior: Reopening a source loses its context.
Structure: The context logic belongs in the wrong module.
```

For each correction, record:

- What the user meant.
- What Kraddle would need to ask.
- What existing evidence supports the interpretation.
- Which lower-level artifacts are affected.
- What remains uncertain.
- What evidence would establish that the correction worked.

The purpose is not to prove the final schema. It is to discover which interactions make this model feel like leverage rather than paperwork.

## 13. Conversation Record

The discussion leading to this checkpoint evolved through these stages:

### Initial HUD and agent orchestration

Kraddle was first described as a local-first agent development environment: a desktop workspace for orchestrating CLI coding agents, managing terminals, planning steps, viewing diffs, and customizing skills.

### Plan review and quality supervision

The first deeper wedge was the human review of plans before agents execute, combined with stronger quality signals than ordinary code review or line coverage. The key anxiety was not syntax or individual function correctness, but systems, architecture, design systems, and “spaghetti in between.”

### Beyond plans and decisions

The conversation explored plans, decisions, intent, capabilities, constraints, evidence, and engineering commits. The conclusion was that no single one of these is exhaustive. Plans are useful interaction surfaces; decisions may be important data; intent is more durable; evidence establishes what can be believed.

### Software meaning and bidirectionality

The concept then expanded into a medium for shaping software meaning. Kraddle should not only generate downward from intent. It should also generate upward from code and running systems into behavior, structure, and tentative intent.

### The missing middle

The current focus is the gap between natural language and code or finished output. The desired system gives the user an editable layer where consequential interpretations are visible and where the user can choose the level of control needed.

### Current synthesis

Kraddle is currently best understood as a possible bidirectional, multi-representational medium for software meaning. Its internal foundation may use connected, typed, versioned statements with provenance and uncertainty, but the final terms and schema remain open.

## 14. One-Sentence Checkpoint

> Kraddle is exploring a bidirectional medium where people clarify and shape what software means, agents make that meaning executable, and the system continuously relates intended meaning to observed reality across levels of abstraction, alternatives, revisions, and evidence.
