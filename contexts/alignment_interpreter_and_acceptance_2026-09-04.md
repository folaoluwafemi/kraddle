# Kraddle Alignment: The Interpreter Layer and Acceptance Authority

Date: September 4, 2026
Status: Canonical positioning, agreed between founder and reviewer.
Amends the "What is Kraddle" answer. No code changes authorized by
this document.

---

## 1. What Kraddle Is (corrected)

```text
Kraddle is a local-first control system between what a human means
and what agents do. It exhaustively extracts a semantic model of the
codebase, holds rules under graduated acceptance, and guarantees
that agent work happens inside boundaries the agent cannot weaken.
```

### 1b. Correction to "few rules"

An earlier framing — "few rules, actually held" — is WRONG as system
design and is retracted. The correct model:

```text
EXTRACTION   exhaustive. The system captures everything: facts from
             the tree, imports, structure, and interpreter-proposed
             rules. Coverage is the machine's job and it does not
             get tired or bored.

ACCEPTANCE   graduated by consequence. Human attention is the scarce
             resource and it goes to the consequential few. The long
             tail of low-stakes rules is accepted under delegated or
             standing authority with zero ceremony.
```

Kraddle holds the world. Humans authorize the rules that matter.

---

## 2. The Interpreter Layer (the LLM's slot)

Three layers, from the Aug 10 compositional-meaning checkpoint,
restated as build order:

```text
L1  FACTS          deterministic: tree-sitter, LSP, imports, git.
                   No LLM. Already built (Phase 1).

L2  INTERPRETATION the LLM reads facts and code, PROPOSES meaning:
                   layers, boundaries, invariants, decisions, the
                   semantic variation of the codebase. Not built.
                   This is the layer the founder always intended;
                   Phase 0 deferred it deliberately (build the
                   control skeleton before adding inference), and
                   the skeleton has since held through six phases.

L3  COMMITMENT    acceptance — human or human-delegated authority
                   only. Already enforced (ACCEPTANCE_NOT_AUTHORIZED).
```

The fence is not "no LLM." The fence is: **the LLM interprets and
proposes; it never accepts.** The envelope carries this natively
(origin: agent, epistemic_basis: interpreted, approval_state:
proposed). Layer 2 is an addition, not a redesign.

---

## 3. Acceptance Is an Authority, and Authorities Are Delegable

The invariant, stated exactly:

```text
ACCEPTANCE must be traceable to human authority.
```

NOT "a human must click." Manual clicking is one implementation —
the crudest. The roadmap, in order:

```text
A1  manual accept each       current behavior. Fine for three rules,
                             agony for three hundred.

A2  batch acceptance         one human command accepts a list; each
                             acceptance is still its own event.

A3  delegated acceptance     "agent, accept those" — the human issues
                             a scoped, expiring, revocable
                             acceptance-authority grant. Acceptances
                             record the chain: WHO accepted, UNDER
                             WHOSE authority, WHEN.

A4  standing authority by    "auto-accept observations and decisions
    consequence class        in src/domain; governing commitments
                             still show me." Graduated ceremony:
                             trivial rules cost zero attention;
                             rules with teeth (blocking, enforced,
                             R4/R5) get human eyes.
```

A3/A4 use the kernel's existing authority-grant shape — same
issuer rules, same scope-narrowing, same revocation semantics.
The event log distinguishes "human read and accepted" from "agent
accepted under delegated authority," so the audit trail gets
richer, not weaker.

### 3b. Friction is a product kill condition

If acceptance ceremony is something a user "would not ideally do on
a regular day," Kraddle loses. The gates on the LLM stay absolute;
the ceremony around them must approach zero. These are different
problems and both must be solved.

---

## 4. The Propose Channel (agent deposits reasoning)

One missing tool, post-Rust-port (do NOT add mid-translation):

```text
kraddle_propose  { kind: "decision" | "observation" | "commitment",
                   text, ... }
  creates origin: agent, epistemic_basis: interpreted,
          approval_state: proposed
  never accepts, never touches governing records
```

Safe by construction: unaccepted records are control-inert (the
resolver reads only accepted bindings; unaccepted evidence fails
the pin check, fail-closed). The agent enriches the record without
weakening the rule. This is the July 30 primitive surviving intact:
plan as unit of interaction, decision as unit of data model. In the
future harness, mid-conversation commitment capture ("at this point
I should commit this decision") routes through this channel.

---

## 5. Sequencing (locked)

```text
NOW      Rust rewrite (contexts/rust_rewrite_plan_2026-09-04.md).
         Translation only. No propose tool, no acceptance changes
         during the port. Parity is the bar.

NEXT     kraddle_propose — first post-port feature.

THEN     A2 batch acceptance (CLI: one command, list review).

THEN     L2 interpreter agent — proposes the semantic model from
         extracted facts; the propose channel is its output.

THEN     A3/A4 delegated + standing acceptance authority.

LATER    Sidex/Tauri frontend. Kraddle is editor-agnostic (MCP over
         stdio); the frontend consumes the kernel as a library and
         the agent channel as a client. Decided: no editor needed
         now.
```

---

## 6. Standing Instruction

The gates are absolute. The ceremony is negotiable and must trend
to zero. Exhaustive extraction, graduated acceptance, traceable
authority — never confuse which property belongs to which.
