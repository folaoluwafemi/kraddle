# Kraddle Phase 1 Work Order: The Demo on a Real Repository

Date: September 2, 2026
Status: Executable work order.
Prerequisite: Phase 0/0.5 complete (44 pass / 6 todo / 0 fail).
Audience: An implementing agent with write access to `src/` and `test/` only.

---

## 0. Purpose and the Bet Being Tested

Phase 0.5 proved the control loop on a fixture file map. Phase 1 runs it against
a real repository read from disk. The single question this phase answers:

```text
Does the honest-extraction design survive contact with real code,
or does real code collapse it into permanent incompleteness?
```

Falsification criterion, stated before the work: if a real repository's
dependency graph is dominated by `unresolved` and `ambiguous` edges such that
contexts can never be `complete`, the decidable subset was too narrow and the
architecture needs redesign before any further build. Measure, do not guess.

The repository under test is the kraddle repository itself — dogfooding is the
cheapest honest test and the first time the project's own rules govern the
project's own code.

---

## 1. Guardrails

Phase 0 guardrails G1-G10 remain in force. Additions:

```text
G11 Read-only outside .kraddle/ and test fixtures. The extractor NEVER
    writes to the repository it reads. No git mutation, no file edits,
    no hooks installed.

G12 No new dependencies. git is invoked via node:child_process with
    explicitly fixed argument arrays (no shell interpolation, no
    user-controlled strings in argv).

G13 Every externally-observed value (git SHA, file content) enters state
    as an Evidence record with origin "extractor" and
    epistemic_basis "observed", never as asserted truth.

G14 Failing honesty is SUCCESS in this phase. A high unresolved-edge
    count on the real repo is the finding, not a bug to fix by loosening
    classification rules. Do not tune the extractor to make numbers look
    better.
```

---

## 2. Scope

```text
IN:   directory walking, git revision capture, repo-file extraction,
      kraddle-dogfood rule evaluation, an honest extraction report.

OUT:  still out (unchanged from Phase 0 section 9): KRD binary, KRI,
      causal clocks, sync, exceptions, invalidation, parser extractor
      (tree-sitter/LSP), CLI, MCP/agent surface, sandbox, UI.
```

---

## 3. Steps

### Step 1 — Repository source discovery

```text
GOAL       Read a real directory tree into a file map, deterministically.

FILES      src/repo.js (new), test/repo.test.js (new)

API        export const IGNORED_DIRS = ["node_modules", ".git", ".kraddle",
             "dist", "build", "coverage"];

           export async function readRepoFiles(rootDir, {
             extensions = SOURCE_EXTENSIONS,   // import from extract.js
             maxFiles = 5000,
             maxBytes = 1_000_000,
           } = {})
             Walks rootDir recursively, skipping IGNORED_DIRS and dotfiles.
             Includes only files with a matching extension, each under
             maxBytes, stopping with a thrown Error if maxFiles would be
             exceeded (an explicit truncation signal, never a silent cut).
             Returns files: { [repoRelativePosixPath]: content }.
             Paths use forward slashes regardless of platform.

TEST       Four tests, using fixture directories created under a temp dir:
             1. a tree with src/domain/a.ts, src/ui/b.tsx,
                node_modules/x.js, .git/config, dist/out.js
                -> exactly the two source files, POSIX keys
             2. maxFiles 1 against a 2-file tree -> throws
             3. a file exceeding maxBytes is skipped and reported in
                the return value as skipped: [{ path, reason: "too_large" }]
                (make the skipped list part of the return shape)
             4. empty directory -> empty map, no throw

VERIFY     npm test -> 48 pass / 6 todo / 0 fail.
```

### Step 2 — Git state capture

```text
GOAL       Pin extraction to a real revision.

FILES      src/repo.js, test/repo.test.js

API        export async function gitStateRef(repoDir)
             Runs, via node:child_process execFile with a FIXED argv
             array and a git binary assumed on PATH:
               git -C <repoDir> rev-parse HEAD
               git -C <repoDir> rev-parse --show-toplevel
             Any failure (not a repo, no commits, git missing) throws
             ControlDenial(ENVELOPE_INVALID, { reason: "git_unavailable" }).
             Returns { repository: <toplevel basename>,
                       revision: <HEAD sha>,
                       contentDigest: computeFileMapDigest(files) }
             where contentDigest is computed by the CALLER over the file
             map and merged in — gitStateRef returns repository and
             revision only; merge at the call site into a full
             StateReference. (Keeps one digest authority: extract.js.)

TEST       Three tests, each creating a temp git repo via execFile with
           fixed argv (init, config user, commit):
             1. one commit -> repository and revision match
                `git rev-parse HEAD` output exactly
             2. no git repo (plain temp dir) -> throws
                e.code === ENVELOPE_INVALID, reason "git_unavailable"
             3. dirty working tree AFTER a commit still pins HEAD's sha
                (working-tree content is pinned separately by the file
                digest — assert the revision is the committed sha while
                contentDigest reflects the edited file map)

VERIFY     npm test -> 51 pass / 6 todo / 0 fail.
```

### Step 3 — Dogfood the rule on this repository

```text
GOAL       Evaluate a real architecture rule against kraddle's own source.

FILES      test/dogfood.test.js (new)

RULE       "kernel code must not import test or doc code":
             sourcePrefix  "src/"
             forbidden     importing anything under test/ or docs/
           This is expressible with the existing evaluator by running
           architectureRuleEvaluator twice (forbiddenPrefix "test/",
           then "docs/") and combining: any violation -> violated;
           else any unknown -> unknown; else satisfied. Implement the
           combination inline in the test; do NOT add a new exported
           combinator to src/ (G6).

TEST       One test:
             1. rootDir = the repository root (derive from import.meta.url
                relative paths — no process.cwd assumptions)
             2. files = readRepoFiles(rootDir)
             3. stateRef = { ...gitStateRef-merged-with-file-digest }
             4. expect result === "satisfied" — kraddle's src/ should not
                import its own tests or docs
             5. ALSO assert the honest-extraction invariants:
                - every edge in extractDependencies(files) with a from
                  under src/ has resolution "resolved" or "external"
                  (no unresolved/ambiguous for this repository — if this
                  fails, REPORT it; this is exactly the measurement this
                  phase exists to take)
                - subjects are non-empty
             6. negative control: append a synthetic file
                "src/probe.ts" with content importing "../test/dogfood"
                to a COPY of the file map (do not write to the repo),
                re-evaluate -> "violated"

NOTE       This test is the dogfood gate. If assertion 5 fails on real
           code, STOP and report the unresolved/ambiguous edge list.
           That failure is the phase's headline finding, not noise.

VERIFY     npm test -> 52 pass / 6 todo / 0 fail (assuming the gate holds).
```

### Step 4 — The extraction honesty report

```text
GOAL       A repeatable, persisted measurement of extraction quality on
           the real repo, so the Phase 1 bet has a number attached.

FILES      src/report.js (new), test/report.test.js (new)

API        export function extractionReport({ edges, subjects })
             Returns:
               {
                 totalEdges,
                 byResolution: { resolved, ambiguous, unresolved, external },
                 resolvedRatio,        // resolved / total, 3 decimals
                 unknownRatio,         // (ambiguous + unresolved) / total
                 fromPrefixBreakdown:  // per top-level dir: counts by
                                       // resolution, e.g.
                                       // { "src": {...}, "test": {...} }
               }
             Pure function. No IO.

TEST       Three tests with hand-built edge arrays:
             1. all-resolved edges -> resolvedRatio 1.000, unknownRatio 0
             2. mixed edges (2 resolved, 1 ambiguous, 1 unresolved,
                3 external) -> exact byResolution counts and ratios
                (0.5, 0.5 of the internal four... assert the actual
                numbers: resolvedRatio = 2/7, unknownRatio = 2/7)
             3. fromPrefixBreakdown groups "src/domain/a.ts" under
                "src" (first path segment)

TEST       One integration test (temp git repo, three files, one
           dynamic import) : run readRepoFiles + extractDependencies +
           extractionReport end to end; assert the dynamic import shows
           as unresolved in byResolution.

VERIFY     npm test -> 57 pass / 6 todo / 0 fail.
```

### Step 5 — Dogfood episode: the full loop on real state

```text
GOAL       The Phase 0.5 demo sequence, but every input is observed
           from the real repository rather than fixture-authored.

FILES      test/dogfood.test.js (extend, new test)

TEST       "the dogfood episode closes on real state":
             1. readRepoFiles + extractDependencies + gitStateRef on the
                real repo
             2. report = extractionReport; assert unknownRatio < 0.1
                for src/ edges (the standing gate; if it fails, STOP and
                report — same rule as Step 3)
             3. build a real workspace in a temp dir
             4. transact the dogfood ControlBinding (kernel-must-not-
                import-test-or-docs) as in Phase 0.5's demo, with
                subject_selector { type: "path_prefix", value: "src/" }
             5. transact the extraction Evidence: origin "extractor",
                epistemic_basis "observed", approval_state "accepted",
                the REAL stateRef, the REAL edges
             6. resolveApplicableContext with revision = the real git
                sha, dependencyEvidenceId = the evidence record
                -> complete === true
             7. authorize a real episode: baseStateRef and
                resultingStateRef both the real stateRef, outcome
                commitment "kernel sources remain layered"
             8. evaluate with the architectureRuleEvaluator over the
                REAL file map -> "satisfied"
             9. validateEpisodeClosure -> { closable: true }
           Everything pinned to the git sha. If the sha changes mid-run
           (someone commits while tests run), digest checks fail loudly
           rather than silently passing — that IS the design working.

VERIFY     npm test -> 58 pass / 6 todo / 0 fail.
```

---

## 4. Definition Of Done

```text
npm test: 58 pass / 6 todo / 0 fail. Exact tally reported.
The extraction report exists and unknownRatio for src/ is measured
  and stated in the report-back, whatever its value.
The dogfood gate either held (complete === true on real state) or
  was reported as a failure with the offending edge list.
No writes to the repository outside temp dirs and .kraddle workspaces.
git invoked only via execFile with fixed argv arrays.
One commit per completed step, "step N: <what>".
```

---

## 5. Report Back

```text
Final tally:            __ pass / __ todo / __ fail
Steps completed:        __ of 5
unknownRatio (src/):    __        <- the headline number
Gate status:            held | failed (edge list attached)
Guardrails violated:    none | list
Deviations from plan:   none | list with reason
Blocked on:             nothing | describe
Files changed:          list
```

---

## 6. Standing Instruction

This phase's deliverable is a measurement, not a feature. If real code
breaks the honesty invariants, report the breakage. Do not soften the
classifier to hide it.
