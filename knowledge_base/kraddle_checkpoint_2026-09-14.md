# Kraddle checkpoint 2026-09-14: decisions, and the three-layer stack

Status: definition snapshot. Where it conflicts with older docs (especially the
"human declares rules via CLI" framing), this document wins. Code lags
definition by design — before judging any code, check which checkpoint it was
built against.

## 1. Kraddle is a decision system

The product is a decision tree that can be referred to: every consequential
choice recorded, relationships between decisions visible, divergences visible,
corrections traceable. When two decisions conflict, the tree shows where they
fork and what each stands on.

Continuity, not a restart: `DecisionProfile`, rejected alternatives
(`NegativeKnowledgeProfile`), and evidence pins already exist in the kernel
vocabulary. The tree has roots. What changes is making decisions the center
instead of rules and sessions.

## 2. The definition evolves, and that is fine

The definition of Kraddle moves. Each checkpoint is dated and supersedes the
last on the points it covers. The rift between the current definition and the
current codebase is expected lag, not failure — but it must be named, or every
new agent (and every returning human) re-derives "what does this do?" from
stale code.

## 3. The three-layer stack

Previous approach: build the semantic structure, then test it standalone.
Correction recorded here: that cannot validate Kraddle. All three layers must
exist, or the work is foundation without a building.

1. Foundation — the semantic structure: kernel, records, envelopes, profiles.
   BUILT (`rust/`).
2. Daemon — constantly indexes the codebase (tree-sitter CST, language
   output, git history, runtime observation) and pumps the semantic layer full
   of useful records, with small cheap inference where determinism runs out.
   NOT BUILT. This is where we are.
3. Harness — a full IDE/harness on top of the foundation that uses the
   semantic layer in a structured way, so agent work gets more trustable, more
   precise, and as deterministic as possible. NOT BUILT.

Layer-1 tests (CLI toy loops, `kraddle try`) prove the foundation holds. They
do not prove the product. No more mistaking one for the other.

## 4. Consequences

- Current work is the daemon, starting with the tree-sitter CST adapter and
  deletion of the regex extractor. Indexing candidates noted 2026-09-14:
  tree-sitter CST, SCIP (precomputed, headless, low-RAM — no heavy LSP),
  aider-style repo maps (relevance-ranked context).
- The agent is the only channel that matters. Nobody sits down and types
  rules; commitments enter from conversation (via a Kraddle agent skill, at a
  threshold still to be defined) and from daemon facts. The CLI human-rule
  flow is scaffolding, kept for bootstrap and debug until it earns deletion.
- Docs get rewritten to agent-first and decisions-first to match this
  checkpoint.

## 5. Open questions (carried, not resolved here)

1. Threshold: what promotes a conversation point to a committed decision?
2. Surfacing line: which commitments land with notice, which block for
   explicit confirm?
3. Daemon inference: local small model, deterministic heuristics, or both —
   and L1 facts only?
4. CLI fate: keep `rule add` as scaffolding or delete it outright?
