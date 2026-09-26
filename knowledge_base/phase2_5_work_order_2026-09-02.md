# Kraddle Phase 2.5 Work Order: Closure Honesty Repairs

Date: September 2, 2026
Status: Executable work order.
Prerequisite: Phase 2 complete (80 pass / 6 todo / 0 fail).
Audience: An implementing agent with write access to `src/` and `test/` only.

---

## 0. Purpose

The Phase 2 audit found four defects. Three are code; one is semantics.
This phase closes all four. No new capability.

```text
B1  Closure writes evidence whose edges VIOLATE its own declared
    extractionScope (all repo edges stored, scope says src/), and
    closure never checks resolver completeness while preflight does.
    Fail-open asymmetry in the agent-reachable path.

B2  Bypass detection is blind to non-source files. readRepoFiles
    filters by extension, so package.json is invisible to the
    working-tree diff. Editing the test script or adding a
    dependency — the classic agent-weakening move — is undetectable.

B3  admitEffect runs BEFORE preflight. A denied write leaves an
    orphan "admitted" ledger entry for an effect that never happened.

B4  Server restart mid-episode silently loses admittedWrites; every
    prior admitted write then reads as uncontrolled at closure.
    Must refuse to start rather than silently fork episode state.
```

New DENIAL codes added by this plan:

```text
EPISODE_ALREADY_ACTIVE
```

Guardrails: Phase 0 G1-G10, Phase 1 G11-G14, Phase 2 G15-G17 all
remain in force.

---

## 1. Steps

### Step 1 — Full-worktree observation  (repairs B2)

```text
GOAL       Bypass detection sees every file in the working tree,
           not only source extensions.

FILES      src/repo.js, test/repo.test.js

API        export async function readWorktreeFiles(rootDir, {
             maxFiles = 20000, maxBytes = 5_000_000,
           } = {})
             Walks with the SAME ignore rules as readRepoFiles
             (IGNORED_DIRS, dotfiles) but NO extension filter —
             every regular file is included. Same maxFiles throw
             and skipped/too_large reporting. Returns { files,
             skipped }.

TEST       Two tests in repo.test.js:
             1. a tree with src/a.ts, package.json, README.md,
                .gitignore, node_modules/x -> exactly src/a.ts,
                package.json, README.md
             2. readRepoFiles and readWorktreeFiles on the same
                tree: the source-filtered map is a strict subset
                of the worktree map

VERIFY     npm test -> 82 pass / 6 todo / 0 fail.
```

### Step 2 — Full-tree base snapshot and honest diff  (repairs B2)

```text
GOAL       Server startup and closure both observe the FULL tree;
           any unadmitted delta anywhere — including package.json —
           is caught.

FILES      src/server.js, test/server.test.js

IMPLEMENT  createKraddleServer startup:
             - keep readRepoFiles for baseFiles (source map:
               preflight and evaluators need source content)
             - ADD worktreeBase = readWorktreeFiles(repoDir) at
               startup; snapshot it immutably
             - startup digest check: computeFileMapDigest of the
               SOURCE map must equal baseStateRef.contentDigest
               (unchanged, backward compatible)
           kraddle_close_episode diff:
             - current = readWorktreeFiles(repoDir)
             - expected = { ...worktreeBase, ...admittedWrites }
             - diff over ALL paths (content mismatch, new, deleted)
           Preflight path unchanged — it evaluates source rules
           over source files.

TEST       Two tests in server.test.js:
             1. admitted clean source write + DIRECT node:fs edit
                of package.json -> close -> isError,
                code UNCONTROLLED_EFFECT, detail paths include
                "package.json"
             2. admitted clean write + direct DELETION of a base
                file -> close -> isError, UNCONTROLLED_EFFECT,
                detail names the deleted path
           Existing rogue.ts bypass test must still pass unmodified.

VERIFY     npm test -> 84 pass / 6 todo / 0 fail.
```

### Step 3 — Closure scope honesty  (repairs B1)

```text
GOAL       Closure evidence obeys its declared scope, and closure
           holds itself to the same completeness bar as preflight.

FILES      src/server.js, test/server.test.js

IMPLEMENT  In kraddle_close_episode:
             1. Filter closure evidence edges to the declared
                extractionScope:
                edges: currentEdges.filter((edge) =>
                  edge.from.startsWith("src/"))
                so the record's contents always match its
                extractionScope declaration.
             2. After resolveApplicableContext at closure: if
                resolver.complete === false, throw
                ControlDenial(CONTEXT_INCOMPLETE,
                  { episodeId, reasons: resolver.incompleteReasons })
                BEFORE transacting evidence or evaluations. Closure
                and preflight now share one fail-closed standard.

TEST       Two tests in server.test.js:
             1. closure evidence record on a repo whose test files
                contain unresolved fixture imports: reload the
                workspace, read the persisted evidence record,
                assert EVERY stored edge's from starts with "src/"
                (the record is true to its own declaration)
             2. construct a state where the closure resolver
                returns complete false (e.g. base evidence missing
                extractionScope) -> close -> isError,
                code CONTEXT_INCOMPLETE

VERIFY     npm test -> 86 pass / 6 todo / 0 fail.
```

### Step 4 — Preflight before admission  (repairs B3)

```text
GOAL       An admission ledger entry exists only for effects that
           passed every check.

FILES      src/server.js, test/server.test.js

IMPLEMENT  In kraddle_write_file, reorder:
             validateToolPath -> preflight -> admitEffect ->
             write to disk -> recordObservedEffect
           A PREFLIGHT_VIOLATED / PREFLIGHT_UNKNOWN denial now
           leaves no admission in the episode ledger.

TEST       One test in server.test.js:
             write that violates preflight -> isError
             -> then inspect the episode unit: admittedEffects is
                EMPTY (no orphan admission)
             -> a subsequent clean write still admits normally

VERIFY     npm test -> 87 pass / 6 todo / 0 fail.
```

### Step 5 — Restart refusal  (repairs B4)

```text
GOAL       A server process never silently forks episode state.

FILES      src/kernel.js, src/server.js, test/server.test.js

API        Add DENIAL.EPISODE_ALREADY_ACTIVE.

IMPLEMENT  In createKraddleServer startup validation, after the
           episode checks:
             if episode.admittedEffects?.length > 0
               throw ControlDenial(EPISODE_ALREADY_ACTIVE,
                 { episodeId, admittedCount })
           Rationale: the in-memory admittedWrites map is the
           admission ledger for this server run; a restart cannot
           recover it, so a started episode must not be re-entered.
           Document in the denial detail. (A future phase may
           persist admissions; until then, refusing is the only
           honest behavior.)

TEST       One test in server.test.js:
             bootstrap server, one clean admitted write via the
             write tool, close NOT called; then attempt
             createKraddleServer again on the same workspace and
             episode -> throws e.code === EPISODE_ALREADY_ACTIVE
           Existing tests unaffected: their bootstraps start from
           episodes with no admitted effects.

VERIFY     npm test -> 88 pass / 6 todo / 0 fail.
```

---

## 2. Definition Of Done

```text
npm test: 88 pass / 6 todo / 0 fail. Exact tally reported.
A package.json edit between admission and closure is caught.
A deleted base file is caught.
Closure evidence edges obey the record's declared extractionScope.
Closure denies on resolver incompleteness, same as preflight.
A denied write leaves no admission ledger entry.
A restarted server refuses an already-active episode.
No assertion weakened; no new dependencies; no new tools.
Five commits, one per step, "step N: <what>".
```

---

## 3. Report Back

```text
Final tally:            __ pass / __ todo / __ fail
Steps completed:        __ of 5
Bypass matrix:          source edit | package.json edit | deletion |
                        all caught at closure? (one line each)
Guardrails violated:    none | list
Deviations from plan:   none | list with reason
Blocked on:             nothing | describe
Files changed:          list
```

---

## 4. Standing Instruction

This phase removes dishonesty, not adds capability. If a repair
suggests a new feature, flag it — do not build it.
