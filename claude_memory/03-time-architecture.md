# Oscilla Animator - Time Architecture

**CRITICAL: Read `design-docs/3-Synthesized/02-Time-Architecture.md` before modifying time-related code.**

## The Core Rule

**There is exactly ONE time system. The patch defines time topology. The player does not.**

## TimeRoot Types

| Type | Output | Use Case |
|------|--------|----------|
| `FiniteTimeRoot` | `progress: Signal<unit>` | Logo stingers, one-shot animations |
| `CycleTimeRoot` | `phase: Signal<phase>`, `wrap: Event` | Ambient loops, music viz |
| `InfiniteTimeRoot` | `t: Signal<time>` | Generative, evolving installations |

## TimeModel (Compiler Output)

```typescript
type TimeModel =
  | { kind: 'finite'; durationMs: number }
  | { kind: 'cyclic'; periodMs: number }
  | { kind: 'infinite'; windowMs: number }
```

## Player Invariants

1. **Player time is unbounded - NEVER wraps t**
2. Player receives TimeModel from compiler
3. Player configures UI based on TimeModel (not the reverse)
4. Scrubbing sets phase offset, never resets state

## Time Invariants (Non-Negotiable)

- **Player time is unbounded** - Never wrap t
- **TimeRoot defines topology** - Player only observes
- **Scrubbing never resets state** - Only adjusts view transforms
