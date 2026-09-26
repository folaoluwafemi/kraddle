A conversation I had with claude

```
[Date: July 30]
I want to build a product I call kraddle...it's quite like an ide...rather an ADE (agent development environment).

I believe the future of software engineering is where humans don't read code, just like we don't read byte code, obviously that's what lots of people have been saying for a very long time, but there's still the problem of code (low level or high level) is deterministic but llms are not.

that problem is what context engineering exists to solve, yes. we've gone from prompts to instructions to skills to harness engineering and now we're at graph engineering (which tbh I don't really get)...but back to the drawing board there's a SDLC and inorder to allow team work (or perhaps agent to agent work) we need to respect it. I would love to explore how this will play out, but let's just keep this paragraph as a note for later.

Initially I wanted to build kraddle because most agent based ides don't allow inline commenting on plans to iterate on it, only antigravity has that, and it's really useful, which opened up the can of worms of planning and actually building a workflow for spec engineering in your ide, along side a harness that you can customise in your own ide to your will, allowing more than agent skills to engineers.
e
but a series of things has inspired me to reach for more, much much more.
- Vorflux (look it up) and their launch (look it up too); I thought it was absolutely incredible
- A tweet `https://x.com/steida/status/2081300648713142408` check it out.
- another tweet `https://x.com/unclebobmartin/status/2081334541667410312?s=20` Uncle bob talking about how he rigourously writes tests and doesn't interact with code anymore.
- Recent spurt of orchestrator models that perform better than SOTA coding models at a percentage of their costs.
- Figma post-trained some models so it can output in nodes more seamlessly for generating great UI. (I would love to play around with a open ui agent that generates incredible stuff, but idk how this comes in at all, certainly not now, I think,maybe??? idk)

So that tweet reminds me of the incredibly great insights android studio (jetbrains ide in general) gives of a codebase, provided we could create sorts of similar level of insight of your tests more than just lcov coverage report, more interactive, (for instance where you can just highlight some stuff and say write tests for these or something - or maybe even that's too low level, but atleast you can supervise on a more higher order of level).
That's the idea I'm at rn.

but I think we can't just ideate, we need to have that northstar clear and then ideate how we can build towards that northstar (I think this where that earlier paragraph comes in) with today's tools and DX
```

Fair enough — let me just think out loud across all four, because they actually collapse into one shape once you look at them together.

**Start with the unit of trust.** Every approach we looked at picks a different place to anchor trust:
- Today's default: the diff. A human reads it.
- Vorflux: the verified run. Adversarial planner/reviewer agents, then a video of the app actually working, attached to the PR.
- Uncle Bob: the gauntlet score. Unit tests, gherkin, mutation testing, coverage, cyclomatic complexity — a dashboard of proxies he trusts instead of reading.
- Antigravity (and your original instinct): the plan. You comment on it inline before any code exists.

Verification-based trust (Vorflux, Uncle Bob) answers "did we build it right." Nobody in that list is seriously answering "did we decide to build the right thing" — and that's a different failure mode entirely. A plan that's wrong produces code that passes every test in the gauntlet and still solves the wrong problem. That gap doesn't show up in coverage or mutation scores. It only shows up if a human (or a better agent) looked at the plan before execution started.

That's your actual white space. Not "less code reading" in general — that's crowded and well-funded (Cognition, Factory, Cursor, now Vorflux with real money). Specifically: **the plan is the highest-leverage place left where human judgment is irreplaceable, and almost nobody is building a product whose entire center of gravity is that layer.** Antigravity has a feature that gestures at it. You'd be making it the whole point.

So a tighter north star than what I said last time: *kraddle keeps humans expensive at exactly one place — deciding whether a plan is correct — and pushes everything downstream of that decision (implementation, verification, the code-reading question) into a harness the human configured but doesn't have to babysit.*

**That reframes the wedge, and I want to flag this honestly rather than just agree with where you'd already landed:** the test/quality insight panel is a *good* feature, but it's downstream trust — it's the "did we build it right" instrument, same category as Uncle Bob's gauntlet and Vorflux's video proof. If the north star is real, your wedge is the plan-commenting/spec-engineering loop, not the test panel. The test panel becomes the second act — the thing that makes "trust the harness once the plan is approved" credible. Building the panel first is defensible as a technically interesting, demoable artifact, but it doesn't differentiate you from Vorflux's pitch. Building the plan-review loop first is what actually stakes the claim nobody else is making.

**Positioning, given that:** you're not competing with Vorflux (cloud, team-scale, full autopilot, enterprise GTM, $15M) and you're not competing with Cursor/Devin (general-purpose AI coding). You're closer to being the thing that sits *before* those tools even engage — the layer where a spec becomes a plan becomes something worth letting an autopilot loose on. That's a much smaller, more IDE-native, more solo-founder-shaped surface. You could plausibly build it as a local-first extension or lightweight app rather than needing cloud infra day one, which matters a lot for a one-person build.

**And that's exactly where your parked SDLC/agent-to-agent note stops being a "note for later" and becomes the actual product spec.** If the plan is the unit of trust, SDLC-for-agents just means: plans need to be first-class, versioned, stage-gated artifacts — draft → commented → revised → approved → implementable — the same way a PR has a lifecycle, but one level up. The "harness" you wanted to be customizable isn't just "how should the agent write code," it's "what stages must a plan pass through, and who (human or agent) has sign-off at each stage." That's the thing that lets human-to-agent *and* agent-to-agent handoffs both be governed by the same mechanism. It's not a separate feature — it's the spine everything else in kraddle attaches to.

So the shape I'd put back to you: north star = judgment moves up to plans. Positioning = the layer before autopilot, not another autopilot. Wedge = the plan lifecycle + inline commenting, not the test panel, though the panel is a strong fast-follow. SDLC note = literally the data model for the plan lifecycle.

Where does that land for you — does the reordering (plan loop before test panel) feel right, or is there a reason you were reaching for the test panel first that I'm not weighing?


```
yes, this hits the spot right, where it's missing for me is that I think the idea of having a test panel and other ways of guaranteeing quality in a supervised way just makes it more and more likely that I can bequeath myself of the anxiety that ai will get something wrong, without actually looking at code, I'm not scared ai will get a function or syntax wrong, it's more of the systems, design systems, architecture...etc, those don't directly affect the output, but it affects other things because having a bespoke plan, and having a bespoke output, but with spaghetti in between is very very much undesirable.

anyways, I gave that same prompt to chatgpt, and well we talked a bit, I'll paste an excerpt o fit's last response.

```
Whatever it is, it should slot into Cursor, VS Code, Claude Code, or Windsurf without asking engineers to abandon their existing workflow.

Over time, if that artifact becomes the place they naturally start every feature, you've earned the right to expand. Eventually, the "spec" grows into a richer engineering object. Then architecture. Then constraints. Then verification. One day, you realize the code editor has become just another panel inside Kraddle, not the center of it.

That's how platform shifts usually happen. Git didn't replace editors first; it replaced version history. Figma didn't replace Photoshop by promising "the future of design"; it solved collaboration so well that people gradually moved their entire workflow.

So I wouldn't ask, "How do we build the IDE of the future?"

I'd ask:

What's the smallest engineering artifact that deserves to become a first-class, living object today—and is important enough that engineers will open Kraddle before they open Cursor?

I have a suspicion that the answer isn't code, and it isn't even plans.

It's something one level above both. Finding that object is, in my view, the core product problem.
```

And when I gave it your response it gave this:
```
I actually think Claude did something really well here.

It found **the wedge**.

I was trying to find **the paradigm**.

Those are different jobs.

---

Here's how I'd compare them.

### My answer

I was asking:

> "What does software engineering become if code stops being the primary artifact?"

That's almost a research question.

It leads to ideas like engineering knowledge graphs, evidence, capabilities, etc.

It's useful because it gives you a compass.

It's not useful because it doesn't tell you what to build next month.

---

### Claude's answer

Claude asked:

> "Where is the highest-leverage place humans still add value?"

That's a product question.

It leads directly to:

* plans
* review
* approval
* orchestration
* harnesses

Much closer to shipping.

---

## The thing I especially like

This sentence:

> **the plan is the highest-leverage place left where human judgment is irreplaceable**

I think that's almost exactly right.

Notice how different this is from saying

> humans should review code

No.

Humans should review **decisions.**

Plans are just executable decisions.

That distinction is subtle but incredibly important.

---

## But I think Claude is still missing something.

This is where I think we can push the idea one level further.

It says

> the plan becomes the unit of trust.

I don't think that's quite true.

Imagine this.

---

Feature

↓

Initial plan

↓

Human comments

↓

Agent revises

↓

Approved

↓

Implementation

---

Two weeks later...

The product manager says

> Actually this should support enterprise billing.

The plan changes.

Now what?

If the plan is the unit...

...everything downstream becomes stale.

You now have two plans.

Three reviews.

Four implementations.

Tests.

Architecture.

---

The real unit isn't the plan.

It's the **decision.**

Plans are collections of decisions.

For example

```text
Decision

Support annual billing.

Reason

Enterprise customers requested it.

Alternatives

Monthly only.

Rejected because...

Impacted artifacts

Spec

Tests

Implementation

Docs

```

Now imagine changing that decision.

Everything updates.

That's much more durable than a markdown plan.

This starts looking suspiciously like the engineering graph I mentioned earlier.

Not because graphs are cool.

Because decisions naturally form graphs.

---

## Another thing I noticed

Claude implicitly assumes

```text
Spec

↓

Plan

↓

Implementation
```

I don't think that's enough.

I think there's a missing artifact.

Maybe

```text
Intent

↓

Spec

↓

Plan

↓

Execution
```

Intent answers

> Why are we doing this?

Spec answers

> What should exist?

Plan answers

> How do we build it?

Those are different.

Today they all get shoved into one markdown file.

---

## Where I think Claude really nailed it

This.

> you're the layer before autopilot

I think that's excellent positioning.

Because everyone else is racing to automate execution.

You're saying

> Hold on.

Before we unleash ten agents...

...how do we know they're working on the right thing?

That's a very different conversation.

---

## One thing I would change

This sentence:

> humans expensive at exactly one place

I wouldn't commit to that.

Because I don't think humans disappear after planning.

I think they move to **exception handling.**

Imagine a harness.

Everything proceeds automatically...

Until confidence drops below some threshold.

Then the harness asks the human.

So humans aren't involved once.

They're involved whenever judgment is required.

That's a much more scalable mental model.

It's how airplanes work.

The autopilot flies.

Pilots handle anomalies.

---

## Something neither of us has talked about

I think you're still framing this as

> IDE for agents.

I increasingly don't think that's what Kraddle is.

Hear me out.

Cursor is an editor.

Figma is an editor.

Linear is an issue tracker.

GitHub is source control.

Claude is an assistant.

Kraddle seems to be trying to become something different.

It's trying to become the **operating system of an engineering organization.**

That's a huge statement, but look at your own inspirations:

* Vorflux → orchestration
* Uncle Bob → verification
* Antigravity → planning
* Harnesses → execution policy
* SDLC → workflow
* Agent-to-agent → delegation

None of those are about editing text.

They're about **running an engineering process.**

That's a different category.

---

## The synthesis I'd take

I don't actually think these two perspectives conflict.

I think they stack:

* **Vision (10 years):** Software engineering shifts from code-centric to decision-centric. Code becomes a compiled artifact.
* **Strategy (3 years):** Humans supervise decisions while agents execute and verify. Engineering becomes orchestrated through explicit workflows.
* **Wedge (today):** Make plans first-class, reviewable, versioned, and executable. Inline commenting isn't a feature—it's the mechanism by which humans inject judgment before expensive automation begins.

To me, that's a much stronger narrative than either response alone.

But I'll leave you with the question that now seems most important:

> **Why is a "plan" the right primitive?**

Not because Claude said so, but because the answer determines whether Kraddle becomes a feature or a platform.

If plans are merely convenient documents, competitors can copy them in a quarter.

If plans are manifestations of a deeper primitive—decisions, intent, capabilities, constraints, trade-offs, or something else—then you've identified a layer of the stack that others aren't building yet. That's the distinction I'd spend the most time exploring before writing a single line of code.
```
```


That anxiety framing is the most useful sentence in this whole thread, honestly — more useful than anything either model produced. It reframes what "verification" even needs to mean. Let me work through the ChatGPT exchange against it, because I think it resolves most of the open tension.

**Where I think ChatGPT's second response is right:** plan-as-unit-of-trust does have the staleness problem it describes. A markdown plan is a snapshot; reality mutates. Decomposing a plan into discrete decisions (context, choice, alternatives rejected, impacted artifacts) is more durable, because you can revise one decision and propagate instead of invalidating the whole document. I'd flag, though — this isn't a new research idea, it's Architecture Decision Records (ADRs), a pattern that's existed for over a decade. That's good news for you, not bad: it means you're not inventing a primitive from scratch, you're asking "what does an ADR look like when it's alive, agent-authored, and wired to the artifacts it affects instead of a dead markdown file in a `/docs/adr` folder nobody opens." That's a much more concrete, buildable question than "engineering knowledge graph."

**Where I'd push back on it:** building the full decision-graph-with-propagation on day one is a second-system trap. It's the "vision" payload, not the wedge. The move that gets you both without a rewrite later: design the plan artifact from the start as a structured sequence of decision blocks (each with reason, alternatives, impacted-artifact links) rather than free text — so the *document* is your MVP surface, but its internal schema is already decision-shaped. Migrating from "ordered decisions rendered as a plan" to "decisions as a real graph with independent revision" is an evolution, not a rewrite. Plan is the right unit of *interaction*; decision is the right unit of *data model*. You don't have to choose.

**Where your "spaghetti in between" point cuts through the whole debate:** it tells you *which* decisions matter enough to be first-class. Not every decision — that's the failure mode ChatGPT's own critique of itself gestures at (everything becomes a decision, the graph becomes unusable). Specifically the architecturally load-bearing ones: module boundaries, dependency direction, layering, coupling. And it tells you what your "instrument panel" should actually check — not generic quality metrics (Uncle Bob's gauntlet is good but generic), but **architecture conformance**: does the dependency graph the agents actually produced match the boundaries and directions recorded in the approved decisions? That's a well-trodden static-analysis problem (dependency-cruiser, madge, ArchUnit-style rules) — buildable now, not a research bet. And it directly answers your anxiety, which functional tests structurally cannot: a function can be 100% correct and covered while still being wired into the wrong layer, creating exactly the coherence rot you're worried about.

That gives you a wedge that's tighter than either of your first drafts: **plans are decomposed into architecturally-significant decisions at approval time; execution is checked against those decisions via dependency/boundary conformance, not just test coverage.** Inline commenting is how a human edits a decision before it's locked. The panel isn't "quality," it's "did the build stay honest to the decisions we approved."

On "humans move to exception handling, not one gate" — I don't think that contradicts what I said, it refines it. The plan-approval gate and the confidence-threshold interrupt during execution are the same mechanism at two points in time: a human is pulled in whenever a decision is being made (upfront) or a decision boundary is at risk of being silently violated (mid-flight). Same primitive, two trigger points.

On "Kraddle is the OS of an engineering org, not an IDE" — I'd resist that framing for now, not because it's wrong as a ten-year story, but because it's the kind of ambition that quietly licenses you to start integrating Linear, GitHub, CI, and Slack before you've proven the core loop with one plan and one repo. ChatGPT's *own* first answer — slot into Cursor/VS Code/Claude Code, don't ask anyone to leave their workflow — is in direct tension with "become the OS," and I think the first one is the correct discipline for a solo build right now. "Editor becomes a panel inside Kraddle" is a fine sentence for year three. It's a dangerous sentence for month one.

So where this nets out for me: the plan is still the surface, decisions are the underlying schema, and the conformance check is architecture-boundary adherence rather than generic test metrics — which is the one thing that speaks directly to the actual fear you named. That feels like the sharpest version of the idea so far. Does that land, or does the ADR framing feel like it's forcing your intuition into an existing box it doesn't quite fit?


```
I mean I don't think `decision` is exhaustive enough to be the underlying schema...
So I asked google ai this ` is it exhaustively correct to say a plan is a only a list of decisions, if it isn't what else is there such that the `structural-ish` definition of a plan is exhaustive` 

And it said this:
No, it is not exhaustively correct to say a plan is only a list of decisions. While decisions form the core choices of a plan, a complete structural definition requires several other interconnected components to turn those choices into an actionable framework.
Structurally, a decision is static, but a plan is dynamic and relational.
The Exhaustive Structural Anatomy of a Plan
To define a plan exhaustively from a structural standpoint, it must contain these six distinct elements:

* Objectives (The Target): The defined end-states or goals that the decisions are meant to achieve. Without an objective, a decision has no direction. [[1](https://perth.wa.gov.au/-/media/Project/COP/COP/COP/Documents-and-Forms/Develop/Documents/Planning-Framework/Planning-Schemes/CPS2-Planning-Policy-Manual/Area_40_Plain-Street.pdf)]
* Decisions (The Choices): The selected course of action from a set of alternatives. This is the "what" and "how" of the plan. [[1](https://egyankosh.ac.in/bitstream/123456789/115985/1/Unit-11.pdf)]
* Sequencing & Dependencies (The Logic): The structural order of operations. It dictates that Decision B cannot happen until Decision A is complete.
* Resources (The Means): The allocation of inputs required to execute the decisions. This includes time, money, labor, and tools. [[1](https://supplychaintrend.com/2023/01/22/sorry-planners-your-plan-is-not-necessarily-a-quality-decision/)]
* Triggers & Contingencies (The Adaptability): The conditional logic (if/then parameters) that dictates when a decision is activated or altered based on environmental changes. [[1](https://www.scribd.com/presentation/715785869/Planning)]
* Accountability Map (The Agents): The assignment of specific decisions and actions to specific actors or systems responsible for execution.
```


Useful, but I'd hold it a little more loosely than the phrasing suggests — that's a generic planning-theory checklist (the citations are literally urban planning and supply-chain PM docs), answering "what is a plan in general," not "what is a plan structurally correct for a software-engineering decision graph built and executed by agents." Some of it transfers cleanly, some is a category error when you try to make it a schema, and one item is scope creep you should actively resist.

Walking through the six against what you've actually got:

**Objectives** — this is Intent, which ChatGPT already named. Not a new element, just confirmation that Intent needs to be a real field, not folded into the plan doc.

**Decisions** — your core node type, unchanged.

**Sequencing & Dependencies** — this is *not* a fourth thing sitting alongside decisions. This is the mistake to catch before you start building: Google's answer is a flat checklist, and flat checklists conflate nodes with edges. Sequencing isn't a sibling of Decisions, it's the *relationship between* Decisions — it's graph structure, not a graph element. If you model it as a separate top-level thing you'll end up with two competing representations of the same information and they'll drift.

**Resources** — I'd cut this from v1 entirely, and be a little suspicious of why it showed up on the list at all. Time/money/labor allocation is what Linear and Jira already do, and it's exactly the kind of "OS of the engineering org" scope creep we already flagged as dangerous for a solo build. If a decision needs a resource constraint later, that's a field on the decision, not a subsystem.

**Triggers & Contingencies** — this one's real, and it's not new either, it's the formal version of the "humans move to exception handling" point from last time. This is where that idea gets a concrete home: a trigger is literally the re-evaluation condition attached to a decision — the thing that says "if the confidence-threshold/conformance-check fails here, wake a human up." Without this field, your architecture-conformance panel has nowhere to plug in — it needs a target to interrupt.

**Accountability Map** — also real, and it's the missing piece for your parked SDLC/agent-to-agent note. Every decision needs an owner (human or agent) and that's what lets a handoff be well-defined instead of implicit.

So collapsing the six into something you could actually build a schema around, a decision node looks roughly like:

```
Decision {
  serves: Intent            // why — traceability up
  choice, alternatives, reasoning
  depends_on: [Decision]     // sequencing as edges, not a separate object
  impacted_artifacts: [Spec, Test, Module]  // what it touches
  owner: Human | Agent       // accountability
  trigger: condition          // when this decision needs re-evaluation / human pull-in
}
```

Objectives sit above the graph as context, Resources stay out of v1 and live in whatever PM tool the team already uses, Sequencing is edges not a field, and Triggers is what turns your architecture-conformance panel from a passive dashboard into something that actually re-opens a decision when the dependency graph drifts from what was approved.

That's a genuinely buildable data model now — decisions, edges, impacted artifacts, owner, trigger — small enough to prototype, and every field traces back to something concrete you or one of the other models already said, rather than an abstract "engineering graph." Want to pressure-test this schema against a real example next — walk one actual feature through it and see where it holds up or breaks?