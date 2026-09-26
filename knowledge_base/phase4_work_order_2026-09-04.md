# Kraddle Phase 4 Work Order: The Second Engineer

Date: September 4, 2026
Status: Executable work order.
Prerequisite: Phase 2.5 complete (88 pass / 6 todo / 0 fail).
Audience: An implementing agent with write access to `src/`, `test/`,
`README.md`, and `package.json` (this phase explicitly unlocks docs —
Steps 5-6 only).

---

## 0. Purpose and the Bet

Everything so far was proven by tests the project wrote about itself.
Phase 4 makes the artifact usable by someone who has never read
`src/kernel.js`, then hands it to real engineers.

```text
The question: can a second engineer declare a rule, launch an agent
through the bounded surface, and watch the agent get denied with the
rule named — without reading the kernel source?
```

Falsification criteria, stated before the work (Section 6):

```text
F1  Bootstrap requires kernel knowledge      -> surface not done; iterate UX
F2  Denials never fire on real tasks         -> rules don't map to real work
F3  The named-commitment denial does not
    register as valuable to the engineer     -> thesis unvalidated
F4  Agents bypass trivially and engineers
    shrug                                    -> the problem is not felt
```

---

## 1. Guardrails

G1-G17 remain in force. One addition:

```text
G18 The CLI is the HUMAN channel — the trust root that transacts
    bindings, evidence, episodes, and authority. It must never be
    exposed as an MCP tool, and the server must never invoke it.
    No new dependencies: argv parsing is hand-rolled. The CLI does
    not read stdin interactively in this phase (flags only).
```

---

## 2. Scope

```text
IN:   a hand-rolled CLI (init, rule add, episode start, status,
      episode abort), human-readable denial text wired into the
      server, README quickstart, bin entry, one journey e2e test.

OUT:  publishing to npm (hand-delivered clone only), interactive
      prompts, config files, multiple simultaneous episodes,
      new DENIAL codes, any new kernel capability.
```

---

## 3. Steps

### Step 1 — CLI skeleton and `init`

```text
FILES      src/cli.js (new), test/cli.test.js (new),
           package.json (add "bin": { "kraddle": "src/cli.js" };
           src/cli.js starts with #!/usr/bin/env node)

API        export async function runCli(argv, { cwd } = {})
             Returns { code, output } — pure enough to test in
             process. main() wraps it with console.log/process.exit.
             main guard: the pathToFileURL(process.argv[1]) comparison
             (the Windows-correct pattern from server.js).

           Commands (hand-rolled parsing, no deps):
             kraddle init [--repo <dir>]        default --repo is cwd
             kraddle rule add ...               Step 2
             kraddle episode start ...          Step 3
             kraddle status [--repo <dir>]      Step 4
             kraddle episode abort <id>         Step 4
             kraddle help                       usage text
           Unknown command / missing flags -> { code: 1, output }
           with usage. NEVER a stack trace.

IMPLEMENT  init: workspace at <repo>/.kraddle via Workspace.init()
           (already refuses to overwrite — A5). Output states the
           workspace path and the repo it governs.

TEST       Two tests:
             1. init on a temp repo -> .kraddle/manifest.krd exists,
                output mentions the path, code 0
             2. init twice -> code 1, WORKSPACE_EXISTS in output
           Invoke runCli in process; no spawn needed here.

VERIFY     npm test -> 90 pass / 6 todo / 0 fail.
```

### Step 2 — `rule add`: the human declares a rule

```text
FILES      src/cli.js, test/cli.test.js

COMMAND    kraddle rule add
             --repo <dir>              default cwd
             --source <prefix>         e.g. src/domain
             --forbid <prefix>         e.g. src/ui        (repeatable)
             --text "<commitment>"     the human sentence

IMPLEMENT  Validation, in order, each failure -> code 1 with a
           plain-language message (not a code dump):
             - text required, non-empty
             - source required; normalized to trailing "/" form
             - at least one forbid prefix; normalized
             - source must not start with any forbid prefix
               (unsatisfiable rule)
           Then, ONE human-actor transaction (profileIds [binding]):
             - readRepoFiles + extractDependencies + gitStateRef:
               stateRef pinned to HEAD sha + current source digest
             - Evidence record: origin "extractor",
               epistemic_basis "observed", approval_state "accepted",
               edges filtered to the source prefix,
               extractionScope { fromPrefixes: [<source>] }
             - scope, evaluator unit
               (evaluatorType "architecture_rule",
                params { sourcePrefix, forbiddenPrefixes }),
               governed commitment (value = --text,
               forbiddenPathPrefixes = forbid list),
               selector commitment
               { type: "path_prefix", value: <source> },
               modality commitment "prohibition",
               binding unit, four role relationships.
           Output: the binding id, the pinned revision, and the
           evidence id.

TEST       Three tests against a temp git repo with fixture files:
             1. full rule add -> reload workspace;
                validateProfile passes on the binding; evidence is
                pinned to the repo's HEAD sha and scoped
             2. --source src --forbid src -> code 1, message names
                the unsatisfiable-rule problem
             3. missing --text -> code 1, usage message

VERIFY     npm test -> 93 pass / 6 todo / 0 fail.
```

### Step 3 — `episode start`: the launch pad

```text
FILES      src/cli.js, test/cli.test.js

COMMAND    kraddle episode start
             --repo <dir> --task "<purpose>"
             --write-prefix <prefix>    required; authority bounds
             [--read-only]              authority = ["read"] only

IMPLEMENT  1. Fresh extraction: readRepoFiles, gitStateRef,
              extractDependencies. stateRef = base state.
           2. REAL applicability check — do not hardcode
              complete: true:
                resolver = resolveApplicableContext(state, {
                  targetPaths: all source files,
                  revision: <HEAD sha>,
                  declaredApplicable: all accepted binding ids,
                  dependencyEvidenceId: <a fresh evidence record
                  transacted in the same command, scoped to src/> })
              resolver.complete === false -> code 1, print the
              incompleteReasons with plain-language explanations.
              The human channel refuses to launch on an incomplete
              context, same bar as preflight.
           3. One transaction (profileIds [episode]): purpose
              commitment (--task), base revision commitment, outcome
              commitment ("completed under governing commitments"),
              context envelope carrying the resolver's ACTUAL
              complete flag and incompleteReasons, authority grant
              (operations ["read","write"] or ["read"];
               targetPrefix write-prefix; allowRecordIds []),
              delta unit, episode unit (lifecycle "authorized",
              baseStateRef AND resultingStateRef = base stateRef,
              noOp: true — a launched episode has produced nothing
              yet; the server's first admitted write... see NOTE),
              six role relationships.
           4. Output, ready to paste:
                KRADDLE_REPO=<repo>
                KRADDLE_WORKSPACE_DIR=<repo>/.kraddle
                KRADDLE_EPISODE_ID=<id>
                KRADDLE_BASE_EVIDENCE_ID=<id>

NOTE       noOp at start, then the server persists admittedEffects
           on writes (Phase 2.5). Closure requires effects to match
           resulting state; the server sets resultingStateRef at
           close. Verify the launch -> write -> close journey works
           end to end in Step 5's journey test; if noOp interacts
           badly with the persisted ledger, fix by having the server
           clear noOp on the first persisted admission (a
           policy-closure unit.update), and document it here.

TEST       Two tests:
             1. after rule add + episode start on a fixture repo,
                createKraddleServer boots successfully against the
                printed values (THE acceptance test: CLI output must
                be server-consumable)
             2. missing --write-prefix -> code 1 with usage

VERIFY     npm test -> 95 pass / 6 todo / 0 fail.
```

### Step 4 — `status`, `abort`, and human-readable denials

```text
FILES      src/cli.js, src/denials-text.js (new), src/server.js,
           test/cli.test.js, test/denials-text.test.js (new)

API        export function describeDenial(code, detail) -> string
             Format: "<CODE> — <plain language>"
             The CODE prefix stays first (existing tests grep for it).
             Coverage, minimum:
               PREFLIGHT_VIOLATED    includes the commitment text:
                 "This write would violate the rule '<text>' that
                 governs this episode."
               PREFLIGHT_UNKNOWN     "could not be verified — the
                 check did not run or could not decide; writes are
                 denied when checks cannot run"
               TARGET_OUTSIDE_AUTHORITY  names prefix and target
               UNCONTROLLED_EFFECT   lists paths; "changes outside
                 the admitted surface were found in the working tree"
               AUTHORITY_REVOKED / EXPIRED / MISSING_OPERATIONS
               SELF_AMENDMENT_DENIED "the rule that governs this
                 episode cannot be changed from inside it"
               PROFILE_GRAFT_DENIED
               CONTEXT_INCOMPLETE    lists reasons
               EPISODE_ALREADY_ACTIVE
               EVIDENCE_PIN_MISMATCH / EVIDENCE_SCOPE_MISMATCH
             Unknown code -> "<CODE> — (no description yet)".
             Never throws. Pure function.

SERVER     asToolResult's catch: ControlDenial ->
           describeDenial(e.code, e.detail). Other errors unchanged.

COMMANDS   status: workspace load -> print trust status (trusted /
             quarantined count), each binding (id, first 60 chars of
             text), each episode (id, episodeStatus, admitted count).
           episode abort <id>: transact lifecycle "aborted" as
             human actor; refuses unknown id with code 1.

TEST       Four tests:
             1. describeDenial(PREFLIGHT_VIOLATED, { commitment:
                "domain must not import ui" }) contains both the
                code and the commitment text
             2. describeDenial on an unknown code -> contains the
                code, no throw
             3. status on a workspace with one rule + one episode
                -> output names both, code 0
             4. abort sets lifecycle (reload workspace and assert)
           Existing server/e2e tests must pass unmodified — the
           CODE-first format preserves their greppability.

VERIFY     npm test -> 99 pass / 6 todo / 0 fail.
```

### Step 5 — README quickstart and the journey test

```text
FILES      README.md (new Quickstart section, placed right after
           Current Status), test/journey.test.js (new)

README     "Quickstart (local, hand-installed)" — the exact
           second-engineer path, nothing more:
             1. clone + npm install (dev deps none; just node >= 20)
             2. node src/cli.js init
             3. node src/cli.js rule add --source src/domain \
                  --forbid src/ui --text "domain must not import ui"
             4. node src/cli.js episode start --task "..." \
                  --write-prefix src/domain
             5. paste the four env vars; run the MCP server
                (npm start); point any MCP client at it
             6. what you should see: the agent reads and writes
                through three tools; a violating write is denied
                with the rule named; closing with unadmitted
                changes is refused
           One paragraph on what Kraddle is NOT doing here
           (advisory perimeter, no sandbox — link the maturity
           table). No marketing language.

JOURNEY    test/journey.test.js — ONE test, the full second-
           engineer path with zero kernel imports for setup:
             1. temp git repo, fixture files
             2. runCli init -> rule add -> episode start
                (assert each code 0)
             3. spawn the server (process.execPath, fixed argv,
                env from parsing the episode-start output)
             4. over the protocol: initialize, tools/list (exactly
                three), read, violating write -> isError with the
                RULE TEXT in the message, clean write -> success,
                close -> success
             5. assert the violation file is not on disk
           This is the Phase 4 acceptance test as code.

VERIFY     npm test -> 100 pass / 6 todo / 0 fail.
```

---

## 4. Definition Of Done

```text
npm test: 100 pass / 6 todo / 0 fail. Exact tally reported.
The journey test passes: init -> rule -> episode -> server ->
  denied-with-rule-named -> clean write -> close, driving only
  the CLI and the protocol, never importing kernel internals
  for setup.
Denial text a human can act on, CODE-first for greppability.
README quickstart matches the journey test step for step.
CLI failures print usage and messages, never stack traces.
The CLI never appears in tools/list (G18).
Five commits, one per step, "step N: <what>".
```

---

## 5. Report Back

```text
Final tally:            __ pass / __ todo / __ fail
Steps completed:        __ of 5
Journey test:           passed | failed (where)
Server boots from CLI output unaided: yes | no
Guardrails violated:    none | list
Deviations from plan:   none | list with reason
Blocked on:             nothing | describe
Files changed:          list
```

---

## 6. The Validation Protocol — For The Owner, Not The Executor

Code ends at Step 5. The phase finishes with people. This section is
executed by the repository owner by hand.

```text
RECRUIT    3-5 engineers, each with a real repo they own and an
           agent they already use (Claude Code, Cursor, any MCP
           client). Not teammates who will be polite.

SESSION    30-45 minutes each, them driving:
             1. hand them the clone URL / folder. Say only:
                "make it so your agent can't break one rule in
                this repo." Do not coach. Take notes.
             2. once the rule is declared and the episode started,
                let them run a real small task with their agent.
             3. debrief with four questions (write answers down
                verbatim):
                  - What did you expect when the write was denied?
                  - What did the denial text make you do next?
                  - If the agent had tried to edit the rule to get
                    past it — how would you feel about that being
                    refused?
                  - Would you install this again? (1-5)

MEASURE    (a) unaided bootstrap completion — did they reach a
           running server without you explaining the kernel?
           (b) rule in their own words — did --text carry THEIR
           sentence, or something they copied from you?
           (c) agent routing — writes through the surface, or
           bypass + confusion at closure?
           (d) the moment of the named denial — visible reaction?
           (e) would-install score.

READ THE RESULTS AGAINST F1-F4 (Section 0). F3 or F4 is a product
kill signal, not a bug report. F1 or F2 is an iteration signal.

Do NOT fix anything mid-session. Record, then decide.
```

---

## 7. Standing Instruction

The CLI exists to hand the artifact to someone who has never read
this repository. Every bell and whistle added beyond the journey
test is scope creep. Ship the five steps, then go find the engineers.
