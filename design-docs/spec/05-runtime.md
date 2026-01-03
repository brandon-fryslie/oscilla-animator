# Runtime & Hot Swap

## Evaluation Loop

```
while running:
    t += dt * speed
    ctx = { t, seed, dt, runState }
    output = program.run(ctx)
    render(output)
```

**Properties:**
- `t` is monotonic and unbounded
- No wrapping or clamping
- Phase wrapping happens inside phase generators
- State preserved across frames

## Hot Swap

Hot swap is a deterministic two-phase process:

### Phase 1: Compile in Background
- Old program continues rendering
- New program compiles on the side

### Phase 2: Swap at Boundary
- Swap at a deterministic Swap Boundary
- Atomic on frame boundary
- Exactly one program drives preview

## Change Classification

### Class A: Param-Only
Examples: scalar value, color constant, lens mapping

**Guarantee:**
- No state reset
- Apply immediately (next frame)
- No UI warning

### Class B: Structural but State-Preserving
Examples: add/remove stateless block, rewire, add Time Console lane

**Guarantee:**
- Preserve eligible state
- Swap at safe boundary
- UI shows "Scheduled change"

### Class C: Topology / Identity / State-Resetting
Examples: change TimeRoot kind, change domain count, modify SCC structure

**Guarantee:**
- Explicit user acknowledgement
- Swap is gated
- State reset may be unavoidable
- UI presents choices

**No silent resets. Ever.**

## Swap Boundaries

| Boundary | Availability | Use |
|----------|--------------|-----|
| Frame | Always | Class A, safe Class B |
| Pulse | If pulse rail exists | Phase-sensitive changes |
| Freeze | Always | Class C, user-gated |

## State Preservation

### Stateful Nodes
- DelayLine, Integrate, SampleHold
- Explicit State blocks
- Renderers with per-instance caches

### StateKey
```typescript
StateKey = { blockId: string, internalKey?: string }
```

### Migration Rules
1. New program requests state by StateKey
2. Copy if keys and types match
3. Missing/mismatched keys → initialize to default

## No-Jank Definition

A swap is "no-jank" if:
- No blank frame
- No flicker
- Phase continuity when claimed
- State continuity when claimed
- No hard reset unless confirmed
