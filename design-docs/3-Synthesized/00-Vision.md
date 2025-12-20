# Vision: What This System Is

## Core Identity

This system is **not**:
- A timeline editor with looping bolted on
- A node graph that happens to animate things
- A generative toy with randomization

This system **is**:

> **A deterministic, continuously-running visual instrument where time is explicit, topology is declared, and behavior emerges from signal flow rather than playback tricks.**

## The Organizing Principle

**Animations are not timelines. They are living systems that happen to be observed over time.**

Everything in this architecture aligns with that statement:
- Buses replace wires for shared energy, phase, and intent
- Lazy Fields enable scalable per-element computation without jank
- Composites remain opaque for abstraction without flattening
- TimeRoot provides explicit declaration of "what time means here"

The looping system is not a feature. It is the organizing principle of the entire runtime.

## Why This Matters

Before TimeRoot, the system had implicit time:
- The player wrapped `t`
- PhaseClock wrapped `t` again
- Blocks quietly transformed time
- UI pretended everything had a "duration"

This led to:
- Accidental loops
- Broken scrubbing
- Cut-off animations
- No way to reason globally about behavior

**Time topology is now declared, not inferred.**

Finite / Cycle / Infinite are not modes - they are contracts.

## The Three Pillars

### 1. Buses
- Establish shared intent
- Remove brittle wiring
- Allow many-to-many influence
- Mirror audio sends/returns

### 2. Lazy Fields
- Allow per-element identity
- Make large systems feasible
- Enable hot swaps without recompute storms
- Preserve determinism

### 3. TimeRoot
- Stabilizes evaluation order
- Defines loop closure rules
- Enables no-jank edits
- Makes export sane

Together they produce something rare: **a system where complexity scales horizontally without collapsing into unpredictability.**

This is the difference between "generative chaos" and structured emergence.

## Design Consequences

### No-Jank Live Editing
Because time topology is stable, fields are lazy, identities are preserved, and evaluation sinks are explicit, you get for free:
- Hot swapping blocks
- Changing loop duration without resets
- Inserting feedback without visual tearing
- Editing while running

No hacks. No fallbacks. The system is always live.

### Export Is Not a Compromise
Export used to be "record whatever the player is doing." Now it is a formal evaluation of the program under a declared time model. That's why:
- Cycle exports can be truly seamless
- SVG exports can be honest about approximation
- Infinite systems can be sampled meaningfully
- Determinism is guaranteed

Export becomes **another view of the same program, not a special case.**

## Success Criteria

You know this architecture worked if:
- Users let patches run for hours
- People share systems, not clips
- Edits feel playful, not risky
- Complexity grows without collapse
- You don't need to redesign time again
