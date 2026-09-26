```markdown
# Kraddle Engineering Log & Synthesis

**Session Date:** Thursday, July 30, 2026  
**Context:** First-principles exploration of software engineering primitives, AI-native SDLC, and the core operational foundation of Kraddle.

---

## 1. Comparing Perspectives: Claude vs. First-Principles Vision

| Perspective | Core Question | Focus Area | Output Artifacts | Primary Value |
| :--- | :--- | :--- | :--- | :--- |
| **Claude's Approach** *(Product / Wedge)* | *"Where is the highest-leverage place humans still add value?"* | High-leverage human leverage points | Plans, Review, Approval, Orchestration, Harnesses | Immediate, actionable product path; tells you what to build next month. |
| **Vision Approach** *(Research / Compass)* | *"What does software engineering become if code stops being the primary artifact?"* | Fundamental long-term system state | Knowledge Graphs, Evidence, Capabilities, Enduring Truths | Strategic compass; establishes direction for 5–10 years out. |

### Core Insight
* **Human Leverage Point:** Human judgment is irreplaceable at the plan level. Humans shouldn't review raw code line-by-line; they should review *decisions*. Plans are executable collections of decisions.
* **The Layer Before Autopilot:** Positioning Kraddle before execution—directing and constraining agents *before* they generate code—is the high-leverage wedge.

---

## 2. Pushing Beyond the "Plan" Primitive

Treating a plan as the primary primitive creates a critical durability flaw: **Plans expire downstream.**


```

Feature ──► Initial Plan ──► Human Comments ──► Agent Revises ──► Approved ──► Implementation
│
Two weeks later...
│
Requirement Changes
│
▼
[Stale Plan Artifacts]

```

When a requirement shifts, two plans, three reviews, and multiple implementations emerge, leaving the original plan obsolete.

### The True Primitive: The Decision
Plans are temporary arrangements of decisions. Decisions, however, survive technology shifts and rewrites.

```yaml
Decision: Support annual billing
Reason: Enterprise customer retention requirement
Alternatives: Monthly only (rejected due to enterprise churn)
Impacted Artifacts:
  - Spec
  - Tests
  - Implementation
  - Documentation

```

### Expanding the Pipeline Architecture

Traditional linear assumptions compress too much distinct context into single documents:

$$\text{Spec} \longrightarrow \text{Plan} \longrightarrow \text{Implementation}$$

A more robust architectural pipeline separates *intent* from *execution*:

$$\text{Intent (Why)} \longrightarrow \text{Spec (What)} \longrightarrow \text{Plan (How)} \longrightarrow \text{Execution (Do)}$$

---

## 3. Human Involvement: Exception Handling & The Harness Model

Human judgment isn't a one-time gate during planning—it operates as a continuous exception handler.

* **Autopilot Analogy:** In modern aviation, the autopilot manages routine operations; human pilots intervene when exceptions, anomalies, or low-confidence states occur.
* **Execution Policy:** Agents run continuously within automated harnesses. When confidence drops below a defined threshold, control escalates to a human operator.

```
Agent Execution ──► Confidence Threshold Check ──┬── [ High ] ──► Automated Pipeline
                                                │
                                                └── [ Low ]  ──► Escalate to Human

```

---

## 4. Product Positioning: The Operating System of Engineering

Kraddle is not an IDE, markdown editor, or code assistant. It functions as the **Operating System of an Engineering Organization**.

```
   ┌─────────────────────────────────────────────────────────┐
   │             Kraddle: Engineering OS                     │
   ├───────────────┬─────────────────┬───────────────────────┤
   │ Orchestration │ Verification    │ Execution Policy      │
   │ (Vorflux)     │ (Uncle Bob/TDD) │ (Harnesses)           │
   ├───────────────┼─────────────────┼───────────────────────┤
   │ Planning      │ Workflow        │ Delegation            │
   │ (Antigravity) │ (SDLC Engine)   │ (Agent-to-Agent)      │
   └───────────────┴─────────────────┴───────────────────────┘

```

### The Strategic Stack

* **Vision (10 Years):** Software shifts from code-centric to decision-centric. Code becomes a temporary, compiled artifact.
* **Strategy (3 Years):** Humans supervise decisions while agents execute and verify. Engineering process is orchestrated through explicit, policy-driven workflows.
* **Wedge (Today):** Make plans first-class, reviewable, versioned, and executable. Interactive inline commenting serves as the mechanism for injecting human judgment prior to automated execution.

---

## 5. First-Principles Derivation of the Right Primitive

### Criteria for an Enduring Engineering Primitive

1. Humans naturally think in it.
2. Agents can reason over it programmatically.
3. It changes less frequently than implementation.
4. It deterministically generates downstream artifacts.
5. It survives underlying technology shifts.

### Candidate Evaluation

| Candidate | Strengths | Weaknesses |
| --- | --- | --- |
| **1. The Plan** | Familiar, executable, commentable. | Ephemeral; expires after initial execution. |
| **2. The Decision** | Highly durable across rewrites. | Too atomic for daily cognitive workflows. |
| **3. Capabilities** | Very stable; captures core user value. | Doesn't capture procedural implementation details. |
| **4. Constraints** | Easily enforced by AI agents. | Lacks context on business purpose. |
| **5. Behaviors** | Highly testable and executable. | Too close to current implementation. |
| **6. Intent** | Highest stability over time. | Too vague to execute without ambiguity. |

### The "5-Year Code Deletion" Test

> *What is the smallest object that an engineer would still care about five years after the code that implemented it has been deleted?*

* **Fails Test:** File, Function, Pull Request, Branch, Prompt, Test, Plan.
* **Passes Test:** System invariants, architectural decisions, domain capabilities (e.g., *"Payments are eventually consistent"*, *"Privacy is default-on"*).

---

## 6. The Synthesis: The "Engineering State" / "Engineering Commit"

Engineering cannot be reduced to a single static noun; it consists of an **irreducible, state-based cycle**.

Like Git commits snapshot repository history, Kraddle's core object captures a **Snapshot of Engineering Belief**.

```
                        ┌─────────────────────────┐
                        │   Engineering Commit    │
                        ├─────────────────────────┤
                        │ • Intent                │
                        │ • Delta / Changes       │
                        │ • Reasoning             │
                        │ • Affected Capabilities │
                        │ • Constraints           │
                        │ • Decision Log          │
                        │ • Evidence & Verification│
                        │ • Generated Implementation│
                        └─────────────────────────┘

```

### Git Commit vs. Engineering Commit

* **Git Commit:** Answers *"What changed in the text files?"*
* **Engineering Commit:** Answers *"What became true about the system?"*

```
       [ Git Commit ]                           [ Engineering Commit ]
    Captures Code Delta                    Captures System Truth & Rationale
          │                                          │
          ▼                                          ▼
┌──────────────────┐                     ┌───────────────────────────────┐
│  diff --git a/b  │                     │ Capability: Google Auth       │
│  + line added    │                     │ Rationale: Reduce friction    │
│  - line removed  │                     │ Constraints: OAuth2, Compliance│
└──────────────────┘                     │ Evidence: 100% Tests Passed   │
                                         └───────────────────────────────┘

```

---

## 7. Comparative Analysis Across Engineering Disciplines

```
 ┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
 │ Version Control      │   │ Requirements Eng.    │   │ ADRs                 │
 │ Primitive: Commit    │   │ Primitive: Spec      │   │ Primitive: Decision  │
 └──────────┬───────────┘   └──────────┬───────────┘   └──────────┬───────────┘
            │                          │                          │
            └───────────────────┬──────┴──────────────────────────┘
                                │
                                ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                      The Engineering Graph                             │
 │  Intent ──► Capability ──► Decision ──► Constraint ──► Evidence        │
 └────────────────────────────────────────────────────────────────────────┘
                                ▲
            ┌───────────────────┴──────┬──────────────────────────┐
            │                          │                          │
 ┌──────────┴───────────┐   ┌──────────┴───────────┐   ┌──────────┴───────────┐
 │ Domain-Driven Design │   │ Systems Eng. / MBSE  │   │ Lean Product         │
 │ Primitive: Concept   │   │ Primitive: Model     │   │ Primitive: Hypothesis│
 └──────────────────────┘   └──────────────────────┘   └──────────────────────┘

```

| Field | Durable Primitive | Target Optimization |
| --- | --- | --- |
| **Git / Version Control** | Commit | Tracking evolution of source files over time. |
| **Requirements Engineering** | Requirement | Capturing explicit user intent and system obligations. |
| **Architectural Decision Records** | Decision | Recording long-lived architectural rationale. |
| **Domain-Driven Design (DDD)** | Domain Concept | Modeling business meaning and boundary contexts. |
| **Model-Based Systems Eng. (MBSE)** | Model + Relationships | Guaranteeing end-to-end whole-system traceability. |
| **Lean Product Discovery** | Hypothesis / Experiment | Validating learning under market uncertainty. |

---

## 8. Core Question for Next Steps

> **What is the smallest unit of engineering collaboration in an AI-native software development lifecycle?**

It is not simply the smallest unit of planning or code generation, but the fundamental unit that humans and agents can jointly **create, review, approve, reject, compose, merge, and reason about**.

```

```