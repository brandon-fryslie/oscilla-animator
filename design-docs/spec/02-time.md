# Time Architecture

## Core Principle

**Time is monotonic and unbounded. Cycles are derived, not roots.**

The player observes time; it does not control topology.

## TimeRoot

A patch declares exactly one TimeRoot. It declares the *time contract*, not time itself.

### TimeRoot Types

| Type | TimeModel | Use Case |
|------|-----------|----------|
| **FiniteTimeRoot** | `{ kind: 'finite', durationMs }` | One-shot animations |
| **InfiniteTimeRoot** | `{ kind: 'infinite' }` | Generative, endless |

**Note:** There is NO CycleTimeRoot. Cycles are produced by the Time Console.

### TimeRoot Outputs

**FiniteTimeRoot:**
- `time` — monotonic system time (publishes to `time` bus)
- `progress` — 0→1 over duration (publishes to `progress` bus)

**InfiniteTimeRoot:**
- `time` — monotonic system time (publishes to `time` bus)

## TimeModel

Compile-time declaration of what kind of time the patch uses:

```typescript
type TimeModel =
  | { kind: 'finite'; durationMs: number }
  | { kind: 'infinite' }
```

**Properties:**
- Immutable during execution
- Changing TimeModel recompiles the patch
- Derived from TimeRoot at compile time

## TimeCtx

Runtime input flowing into the program every frame:

```typescript
interface TimeCtx {
  t: number      // Unbounded, monotonic (ms)
  dt: number     // Delta time (ms)
  seed: number   // Deterministic seed
}
```

**Rules:**
- `t` never wraps
- `t` never resets when looping playback
- `t` is never clamped by TimeModel

## Time Console (Modulation Rack)

The Time Console produces Global Rails via its Modulation Rack lanes:

### Cycle Lanes
- **Cycle A** — period, mode (loop/pingpong), phase offset → `phaseA`, `pulse`
- **Cycle B** — period, mode, phase offset → `phaseB`

### Other Lanes
- **Energy** — envelope generator → `energy` rail
- **Palette** — palette modulator → `palette` rail

### Rail Drive Policy
For each rail:
- **Internal** — Modulation Rack drives the rail (default)
- **Bus** — External bus drives the rail
- **Both** — Combined with rail combine rule

## Global Rails

Reserved buses with system semantics:

| Rail | Type | Combine | Source |
|------|------|---------|--------|
| `time` | Signal<time> | last | TimeRoot |
| `phaseA` | Signal<phase> | last | Time Console Cycle A |
| `phaseB` | Signal<phase> | last | Time Console Cycle B |
| `pulse` | Event | last | Time Console wrap events |
| `energy` | Signal<number> | sum | Time Console + blocks |
| `palette` | Signal<color> | last | Time Console |
| `progress` | Signal<unit> | last | FiniteTimeRoot only |

**Properties:**
- Frame-latched reads (see previous frame values)
- Origin: `built-in` (system-managed)

## Player Responsibility

The Player never alters `t`. It may:
- Loop the *view* (for finite patches)
- Ping-pong the *view*
- Window the *view*
- Scale dt (speed control)
- Freeze (pause evaluation)

The program always sees the same absolute time axis.

## Scrubbing

**Scrubbing is REQUIRED (not deferred).**

Scrubbing changes view transforms only:
- Finite: local time mapping
- Infinite: time offset mapping

Scrubbing never:
- Resets system time
- Reinitializes state

## View Playback Modes (Finite Only)

For finite patches, transport supports:
- **Once** — play from 0 to duration
- **Loop** — repeat playback continuously
- **Ping-pong** — play forward then backward

These affect view-time mapping only, never underlying monotonic time.

## Phase Derivation

Phase is derived from unbounded `t`:

```typescript
// In Time Console Cycle lane
phase = ((t / periodMs) + phaseOffset) % 1.0
// Pingpong mode: triangle wave instead of sawtooth
```

Phase wrapping happens in the Time Console, NOT in the player.
