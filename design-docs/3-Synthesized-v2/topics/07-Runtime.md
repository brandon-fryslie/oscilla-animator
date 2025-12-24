# Runtime

## Source: 06-Runtime.md

# Runtime & Hot Swap

## Runtime Model

The runtime evaluates compiled programs frame by frame, maintaining deterministic state.

### Evaluation Loop
```
while running:
    t += dt * speed
    ctx = { t, seed, dt, runState }
    output = program.run(ctx)
    render(output)
```

Key properties:
- `t` is monotonic and unbounded
- No wrapping or clamping of player time
- Phase wrapping happens inside phase generators
- State is preserved across frames

## Hot Swap Architecture

Hot swap is **never "replace the world immediately."** It is a deterministic two-step process.

### Two-Phase Commit

**Phase 1: Compile in background**
- Old program continues rendering continuously
- New program compiles on the side

**Phase 2: Swap at deterministic boundary**
- Swap occurs only at a Swap Boundary
- Swap is atomic on a frame boundary
- There is always exactly one program driving the preview

## Change Classification

Every edit is classified before compilation:

### Class A: Param-Only
No structural changes.

**Examples:**
- Changing a scalar value
- Tweaking a lens mapping
- Modifying a bus combine mode
- Changing color constants

**Guarantee:**
- No state reset
- Apply immediately (next frame after compile)
- No warning UI

### Class B: Structural but State-Preserving

**Examples:**
- Adding/removing a stateless block
- Rewiring stateless parts of graph
- Adding a PhaseClock (secondary)
- Changing bus subscriptions (non-critical)

**Guarantee:**
- Preserve all eligible state
- Swap occurs at safe boundary
- UI shows "Scheduled change" indicator

### Class C: Topology / Identity / State-Resetting

**Examples:**
- Changing TimeRoot kind
- Changing CycleTimeRoot period discontinuously
- Changing Domain count or element identity
- Editing memory blocks in feedback loops
- Changes that modify SCC structure

**Guarantee:**
- Explicit user acknowledgement required
- Swap is gated and can be scheduled
- State reset may be unavoidable
- UI presents choices and consequences

**No silent resets. Ever.**

## Swap Boundaries

### Frame Boundary
Always available. Swap at the next rendered frame.
- Use for Class A changes
- Also allowed for Class B if safe

### Pulse Boundary
Preferred for cyclic patches. Swap when the pulse bus fires.
- Available only if pulse bus exists in BusStore
- Used for changes that would cause phase discontinuity

### User Boundary (Freeze-Required)
Swap only when the user freezes.
- Used when Class C and cannot be made continuous

## State Preservation

### Stateful Nodes
Nodes with persistent internal memory:
- DelayLine
- Integrate
- SampleHold
- Explicit State blocks
- Renderers with per-instance caches

### StateKey
```typescript
StateKey = { blockId: string, internalKey?: string }
```

For composites: internal nodes derive stable IDs from composite instance + internalStableKey.

### State Migration
At swap time:
1. New program requests state entries by StateKey
2. Runtime copies old state if keys and types match
3. Missing or type-mismatched keys initialize to default

### Partial State Loss
If Class B change results in partial state loss:
- Surface to user: "Some state will reinitialize (2 nodes)"
- Provide inspection list for debugging

## TimeRoot-Specific No-Jank Behavior

### Changing Parameters Within Same Kind

**FiniteTimeRoot.duration:**
- If RUNNING: swap at frame boundary only if mapping can stay continuous
- Keep current progress constant, recompute localT mapping

**CycleTimeRoot.period:**
- If RUNNING: schedule swap on pulse boundary
- If no pulse bus: require freeze
- Reason: changing period mid-cycle causes phase discontinuity

**InfiniteTimeRoot.window:**
- Always safe - frame-boundary swap, no state reset

### Changing TimeRoot Kind
This is **always Class C**.

UI requires explicit choice:
- Apply now (resets topology + view transforms)
- Apply on boundary (if going to Cycle and pulse exists)
- Apply when frozen (always available)

## Domain Identity (Element-Level No-Jank)

Domain changes are Class C unless identity is preserved.

Changing:
- Element count
- Sampling strategy
- Ordering

...is a topology/identity change.

### Allowed State-Preserving Domain Edits
- Old elements keep their IDs
- New elements get new IDs deterministically
- Removed elements disappear deterministically

If you cannot guarantee this, treat as Class C.

## Definition of "Jank"

A swap is "no-jank" if:
- No blank frame
- No flicker due to renderer clearing
- Phase continuity maintained when claimed
- State continuity maintained when claimed
- No hard reset unless explicitly confirmed

## Player & Runtime APIs

### Swap Scheduling
```typescript
player.scheduleProgramSwap(newProgram, {
  boundary: 'frame' | 'pulse' | 'freeze',
  preserveState: boolean,
})
```

### Pulse Boundary Detection
- Evaluate pulse signal each frame
- Detect rising edges
- Trigger swap when edge occurs
- If pulse not present, boundary option unavailable

## Determinism of Swap Timing

Swap boundary timing is deterministic given:
- Patch
- Seed
- Edit sequence
- User choices

Rules:
- Frame boundary = next rendered frame after compile completion
- Pulse boundary = next pulse edge after compile completion
- Freeze boundary = when user freezes after compile completion

No race conditions.
