# Kraddle Checkpoint: Compositional Meaning and Extraction From Code

Date: August 26, 2026
Status: Active theory development, not a final specification

## 1. User Insight Being Preserved

The latest discussion introduced a central possibility:

> The truth behind a product does not apply only to the whole product. Every concrete sub-component may have a particular truth it needs to stay true to. A function, class, UI component, feature, and product may each have one or more meanings. The product may be composed from these smaller meanings.

The user also identified the main technical question:

> How can Kraddle extract meaning from existing code, ideally without requiring an LLM?

And a possible value proposition:

> Kraddle allows a builder to remain in direct contact with the meaning of a product, rather than leaving that meaning scattered across code, specs, documents, conversations, and tacit organizational knowledge.

This checkpoint develops those ideas.

## 2. The New Central Distinction

The word “meaning” currently combines two different things. They must be separated.

### A. Computational meaning

Computational meaning is what a piece of software actually does according to its implementation.

For a function, this includes:

- Inputs it accepts.
- Outputs it returns.
- State it reads or changes.
- Other functions it calls.
- Conditions and branches it evaluates.
- Errors it may produce.
- Effects it performs.
- Callers that depend on it.
- Tests and runtime traces that exercise it.

Much of this can be extracted without an LLM using parsers, compilers, language servers, static analysis, tests, and runtime instrumentation.

### B. Intended meaning

Intended meaning is why that piece exists and what commitment it is meant to fulfill.

For a function, this may include:

- The product behavior it helps realize.
- The user outcome it serves.
- The business or domain rule it preserves.
- Why this responsibility belongs here.
- Why this implementation was chosen over alternatives.
- What must remain true when it changes.

This information is often not present in executable code. It may exist in names, comments, tests, commit history, documents, conversations, or a person’s memory. Any tool that reconstructs it from code alone is making an inference.

### C. Observed meaning

Observed meaning is what happens when the system actually runs.

It includes:

- UI states shown to users.
- Network requests made.
- Database changes.
- Performance behavior.
- Logs and traces.
- Actual outcomes for given inputs.

Observed meaning may disagree with both intended meaning and the apparent meaning of static code.

### D. Experienced meaning

Experienced meaning is how a person interprets and experiences the resulting product.

Examples:

- “This feels like a bookmark manager.”
- “Questions do not feel primary.”
- “I do not trust this interaction.”
- “The system feels calm.”

This is real product meaning, but it cannot usually be proven through static analysis. It requires human judgment, user evidence, or carefully designed proxies.

## 3. A More Precise Definition Of Software Meaning

Working definition:

> Software meaning is the connected set of commitments, computations, observations, and human interpretations that explain why software exists, what each part is responsible for, what it actually does, and what must remain true as it changes.

This definition has four aspects:

```text
Commitment      What should be true and why
Computation     What the implementation does
Observation     What happens when it runs
Interpretation  What the result means to people
```

Kraddle’s task is not to collapse these into one apparent truth. Its task is to connect and compare them.

## 4. Meaning Is Compositional

The product is not one intent with code underneath it. It is composed from nested and interacting units.

```text
Product
  -> capability
      -> feature
          -> user behavior
              -> UI component
              -> service
                  -> class
                      -> function
```

Each unit may carry a local commitment.

Example:

```text
Product commitment:
  Help people preserve the context of their research.

Feature commitment:
  Reopening a question restores the prior research state.

UI component commitment:
  Show the open question before supporting sources.

Service commitment:
  Reconstruct a question’s research context reliably.

Function commitment:
  Given a question ID, return its sources, notes, and unresolved thoughts
  without mutating stored research state.
```

The lower-level commitments should contribute to higher-level commitments. This is the compositional theory:

> A product’s meaning is partly realized by the coordinated meanings of its parts.

But composition is not simple addition. A collection of locally correct functions can still produce a globally wrong product. Therefore Kraddle must represent both:

- Local commitments attached to individual parts.
- Higher-order commitments about how parts interact.

## 5. The “Truth” Of A Function

A function does not necessarily have exactly one meaning. It can participate in several layers of truth.

### Executable contract

```text
Given these valid inputs,
produce this output,
cause only these effects,
and preserve these invariants.
```

This resembles traditional preconditions, postconditions, types, effects, and invariants.

### Structural responsibility

```text
This function belongs to this module because it performs this responsibility.
```

### Product contribution

```text
This function contributes to this user-visible behavior or product capability.
```

### Change boundary

```text
When this commitment changes, this function may need to change.
When unrelated commitments change, this function should remain unaffected.
```

This last layer is especially important for Kraddle. Meaning is not only explanatory; it can define the intended blast radius of a change.

## 6. What Can Be Extracted Without An LLM

Deterministic tooling can build a substantial lower-level model.

### Syntax and declarations

Using parsers or compiler APIs:

- Files
- Modules
- Functions
- Classes
- Methods
- Variables
- Types
- Parameters
- Return types
- Decorators and annotations
- Imports and exports

Tree-sitter can provide concrete syntax trees across many languages. Native compiler APIs generally provide richer semantic information for their own languages.

### Symbol relationships

Using compiler indexes or language servers:

- Definition locations
- References
- Callers and callees
- Implementations of interfaces
- Type hierarchies
- Import and dependency relationships

The Language Server Protocol standardizes access to several of these capabilities, although support varies by language server.

### Control and data flow

Using static analysis:

- Control-flow paths
- Values flowing through variables
- Data dependencies
- Taint paths
- Potential side effects
- Reachability
- Possible error paths

These analyses have limitations. Dynamic dispatch, reflection, generated code, aliasing, and runtime configuration can make exact results impossible or expensive. Tools such as Semgrep explicitly acknowledge possible false positives and false negatives.

### Explicit contracts

Using language constructs and annotations:

- Type contracts
- Nullability
- Preconditions
- Postconditions
- Invariants
- Effect declarations
- Schema constraints
- Access controls
- Architecture rules

These provide stronger meaning because a human or tool has already encoded the commitment in a machine-readable form.

### Test-derived behavior

From tests:

- Example inputs and expected outputs
- Expected exceptions
- Behavioral scenarios
- Property invariants
- Integration boundaries
- UI journeys

Tests express intended behavior more directly than implementation code, but they still may be incomplete, outdated, or accidentally coupled to implementation details.

### Runtime evidence

Using instrumentation:

- Actual call paths
- Inputs and outputs observed
- State changes
- Logs
- Traces
- Network and database interactions
- UI state transitions
- Performance measurements

Runtime observations are concrete but only cover scenarios that were actually executed.

### Repository history

Using git and issue metadata:

- When an element appeared
- Which changes usually occur together
- Which commit or pull request introduced it
- Historical names and locations
- Related issue or review discussion
- Ownership patterns

History supplies provenance and hints about intent, but intent reconstructed from commit text is still not guaranteed truth.

## 7. What Cannot Reliably Be Extracted Without Interpretation

Code alone generally cannot establish:

- Why the product should exist.
- Why a user values a behavior.
- Whether an architecture is intentional or accidental.
- Why one trade-off was chosen.
- Whether a class has too many responsibilities in the product sense.
- Whether a UI feels calm, trustworthy, playful, or confusing.
- Whether existing behavior is correct or merely present.
- Whether names accurately describe responsibilities.
- The original author’s unstated intent.

An LLM can propose answers by interpreting evidence, but it does not turn these into observed facts.

Therefore the upward pipeline should be:

```text
Deterministic extraction
        -> observed structural model
        -> optional interpretation
        -> proposed higher meaning
        -> human confirmation or correction
```

Not:

```text
Code -> “recovered true intent”
```

## 8. A Three-Level Extraction Strategy

Kraddle can separate extraction by epistemic strength.

### Level 1: Facts

Produced deterministically.

```text
Function restoreContext exists.
It receives questionId.
It calls sourceRepository and noteRepository.
It returns ResearchContext.
Three tests call it.
```

### Level 2: Derived properties

Computed from facts using explicit rules.

```text
restoreContext depends on persistence.
It has no direct UI dependency.
It is reachable from the reopen-question workflow.
It mutates no stored state in observed tests.
```

These are still mechanically explainable, but may inherit limitations from the analysis.

### Level 3: Interpretations

Generated by an LLM or human reasoning.

```text
restoreContext appears responsible for reconstructing research context.
It likely serves the capability “resume an investigation.”
Its placement suggests context reconstruction belongs to the research domain.
```

Interpretations must retain evidence and uncertainty until accepted.

## 9. The Possible Core Product

Kraddle may become the place where every meaningful software unit has an inspectable “meaning surface.”

When a user selects a function, class, component, feature, or product, Kraddle could show:

```text
What it is
  Name, type, location, structure

What it does
  Inputs, outputs, effects, dependencies, runtime behavior

What it is for
  Accepted or inferred commitments it serves

What it must preserve
  Contracts, constraints, invariants, experience requirements

What supports this understanding
  Code, tests, runtime evidence, documents, user approvals

What depends on it
  Higher-level behaviors and lower-level artifacts

What is uncertain
  Missing intent, contradictory evidence, stale commitments
```

This would make meaning directly inspectable next to implementation rather than forcing it to remain distributed across an organization.

## 10. Meaning Coverage

A useful emerging concept is **meaning coverage**.

Traditional coverage asks:

```text
Was this code executed by tests?
```

Meaning coverage might ask:

```text
Does this implementation element have a known responsibility?
Does that responsibility contribute to a known behavior?
Does that behavior serve an accepted product commitment?
Is there evidence that the implementation fulfills it?
```

Potential gaps:

```text
Orphan implementation
  Code exists but no accepted purpose is known.

Unrealized commitment
  Desired behavior exists but no implementation is linked.

Unverified commitment
  Implementation exists but no evidence establishes the behavior.

Contradictory implementation
  Observed behavior conflicts with accepted meaning.

Overloaded unit
  One implementation unit serves unrelated commitments.

Fragmented commitment
  One responsibility is scattered across many unexpected units.
```

These are hypotheses for useful diagnostics, not yet settled metrics.

## 11. Why This May Be Foundational

Software engineering already has partial languages for meaning:

- Requirements describe obligations.
- Product documents describe goals.
- Domain models describe concepts.
- Types describe valid shapes.
- Contracts describe local behavior.
- Tests describe examples and properties.
- Architecture documents describe boundaries.
- Code implements computation.
- Traces describe runtime reality.

The problem is not complete absence. The problem is fragmentation, weak linkage, staleness, and high maintenance cost.

Kraddle’s opportunity may be:

> Provide one living structure that connects these existing forms of meaning at every scale, keeps them tied to implementation and evidence, and allows humans and agents to move between them.

This is not a radical rejection of standard software engineering. It is an attempt to make its implicit foundation explicit, navigable, and executable in an agent-driven environment.

## 12. A Minimal Meaning Record For A Code Element

The first useful structure does not need to encode all theory.

For any selected software element:

```text
SoftwareElement
  identity
  kind
  location

ObservedContract
  inputs
  outputs
  effects
  dependencies

Commitments
  serves
  must_preserve

Evidence
  source
  tests
  runtime observations

Confidence
  observed
  inferred
  accepted
```

Example:

```yaml
element: restoreContext
kind: function
location: src/research/context.ts

observed:
  input: questionId
  output: ResearchContext
  calls:
    - sourceRepository.findByQuestion
    - noteRepository.findByQuestion
  effects: none detected

commitments:
  serves:
    - Resume an investigation without losing context
  must_preserve:
    - Reading context does not mutate research data

evidence:
  - static analysis
  - restore-context tests
  - user approval

status:
  observed_contract: derived
  product_commitment: accepted
```

## 13. The Most Important Design Principle So Far

> Extract facts deterministically. Infer interpretations explicitly. Ask humans to establish commitments. Connect all three without confusing them.

This gives Kraddle a defensible path that does not depend on pretending an LLM can recover truth from code.

## 14. Immediate Research Questions

1. What is the smallest useful definition of a commitment?
2. Can commitments compose reliably from function to feature to product?
3. How should Kraddle represent one unit serving several commitments?
4. How should a commitment attach to code that changes identity during refactoring?
5. Which deterministic analyses provide enough cross-language information for a first prototype?
6. Can tests be translated into behavior commitments without losing important detail?
7. What should happen when implementation evidence contradicts an accepted commitment?
8. How much meaning should be authored manually versus inferred and confirmed?

## 15. Immediate Prototype Direction

The smallest theory-testing prototype could be a repository meaning inspector for one language, likely TypeScript.

It would:

```text
1. Parse a repository.
2. Extract files, functions, classes, imports, calls, and tests.
3. Let the user select any code element.
4. Show its deterministic computational profile.
5. Let the user state or approve the commitment it serves.
6. Connect the commitment to higher-level behavior and product purpose.
7. Flag code elements with no known commitment and commitments with no implementation.
```

This would test the core proposition directly:

> Does making the connection between software elements and their commitments explicit help a builder understand, control, and safely change the product?

It does not require solving general code generation, a universal ontology, or perfect intent reconstruction first.

## 16. Clarified First Purpose

The latest clarification is important enough to state directly:

> Kraddle is first a place where a person can dump ideas, ideate, and be guided toward a clear, concrete, technically sophisticated representation of the software they want to exist.

This representation is not merely a specification. It should be:

- Clear enough for the user to recognize as what they mean.
- Concrete enough to remove consequential ambiguity.
- Structured enough to expose what the software does, is for, must preserve, and becomes in use.
- Connected enough to show how every part relates to other parts.
- Constrained enough for agents to execute with minimal guessing.
- Decomposable enough to delegate to multiple sub-agents.

The user may naturally arrive thinking primarily in terms of behavior, purpose, experience, or constraints. Kraddle's role is to help produce an even enough representation across all of them without forcing the user to already think like a systems engineer.

The first product is therefore closer to a **meaning compiler and execution preparation environment** than a spec editor. “Compiler” is an analogy: Kraddle does not simply translate text into code. It helps turn uneven human understanding into a structured software model, then makes that model executable.

## 17. Relationships Within And Across Levels

The meaning model must show both kinds of structure.

### Vertical relationships

These connect different abstraction levels:

```text
Product purpose
  -> feature purpose
      -> behavior
          -> UI component or service
              -> class
                  -> function
                      -> expression or operation
```

Typical vertical relationships include:

```text
realized_by       A lower-level thing realizes a higher-level thing.
implemented_by    A software element implements a behavior or commitment.
decomposed_into   A larger thing is made up of smaller things.
verified_by       Evidence checks whether a thing is fulfilled.
constrained_by    A rule limits how a thing may be realized.
```

Example:

```text
Product purpose
  -> is realized by: Research workspace
      -> is realized by: Resume investigation
          -> is implemented by: QuestionScreen
              -> calls: restoreContext()
```

### Horizontal relationships

These connect things at the same level:

```text
QuestionScreen      collaborates_with       SourceList
AuthService         depends_on              UserRepository
Article             relates_to              ResearchQuestion
CheckoutStep        precedes                PaymentConfirmation
NotesPanel          shares_state_with       QuestionHeader
```

Typical horizontal relationships include:

```text
depends_on         One element requires another.
collaborates_with  Two elements work together.
shares             Two elements use a common state or concept.
precedes           One behavior or step comes before another.
alternative_to     Two elements represent competing approaches.
conflicts_with     Two elements cannot both be accepted together.
```

Vertical relationships explain **how meaning is realized across scale**. Horizontal relationships explain **how peers cooperate or interfere**. Kraddle needs both to understand architecture, behavior, and change impact.

## 18. Does The Existing Structure Suffice?

Yes, as a starting point. The earlier structure was not wrong or insufficient. It already provided the necessary ingredients:

```text
Software element
  - identity
  - kind
  - location

Observed contract
  - inputs
  - outputs
  - effects
  - dependencies

Commitments
  - serves
  - must preserve

Evidence
  - source
  - tests
  - runtime observations

Confidence
  - observed
  - inferred
  - accepted
```

The missing part was not another database field. It was making the relationships explicit and complete enough to cover:

```text
element -> peer element
element -> higher-level meaning
meaning -> lower-level realization
meaning -> evidence
```

The previous question, “What is the smallest formal description of a software element’s responsibility?”, was therefore too narrow and somewhat repetitive. We had already reached a sufficient first answer.

The better question is:

> **What does each software element mean, what does it relate to, and what must remain true across changes?**

## 19. Revised Minimal Record

```text
Software meaning record
  identity
  kind
  abstraction level
  scope

  does
    inputs
    outputs
    effects
    dependencies

  is_for
    commitments served
    higher-level behaviors served

  must_preserve
    contracts
    constraints
    invariants

  relates_to
    peer elements
    parent meaning
    child elements
    alternatives

  evidence
    source
    tests
    runtime observations
    human confirmation

  status
    observed
    inferred
    proposed
    accepted
    contradicted
    stale
```

This is currently enough to guide the theory. It does not need to become a giant universal schema immediately.

## 20. Revised Kraddle Product Loop

```text
1. User dumps an idea.
2. Kraddle asks only the questions that remove important ambiguity.
3. Kraddle builds a structured meaning model.
4. The user reviews and reshapes that model.
5. Kraddle decomposes it into connected software elements.
6. Agents execute those elements in parallel where possible.
7. Kraddle extracts what the implementation actually does.
8. Kraddle maps horizontal and vertical relationships.
9. Kraddle compares implementation reality with intended meaning.
10. The user changes meaning at the highest useful level.
11. Kraddle reconciles affected lower-level elements.
12. Evidence checks what became true.
```

The first three steps are the original thought-clarifier idea. The later steps are what make the clarified result durable, executable, and safe to evolve.
