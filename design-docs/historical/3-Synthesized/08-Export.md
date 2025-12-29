# Export

## Core Principle

**Export is a lowering pipeline, not a playback feature.**

Export does not use the player transport. Export is a compiler-driven evaluation pipeline:

```
Patch -> CompiledProgram(program, timeModel) -> ExportPlan -> Artifact(s)
```

Export is deterministic and reproducible:
- Given patch JSON + seed + export settings
- Output bytes are stable

## Export Planning

Export begins by deriving an ExportTimePlan from timeModel:

```typescript
type ExportTimePlan =
  | { kind: 'finite'; durationMs: number; sample: SamplePlan }
  | { kind: 'cyclic'; periodMs: number; loops: number; sample: SamplePlan }
  | { kind: 'infinite'; windowMs: number; durationMs: number; sample: SamplePlan }
```

**Key decision:** Even infinite exports become finite in exported media. Export chooses a finite capture duration by policy, not by hack.

## Sampling

Export is defined by an explicit sampling plan:

```typescript
interface SamplePlan {
  fps: number               // for video
  steps?: number            // for SVG keyframe sampling
  shutter?: number          // optional motion blur accumulation
}
```

Export evaluates the program at a set of times:
- Video: `t_i = i * (1000/fps)` for `i = 0..N-1`
- SVG: `t_i = i * (periodMs/steps)` for `i = 0..steps`



There is no "wrap maxTime."

## Export by TimeModel

### FiniteTimeRoot Export

**Video:**
- Export duration is exactly `durationMs`
- Frame count `N = ceil(durationMs * fps / 1000)`
- Last frame at `t = durationMs`

**SVG/CSS:**
- Keyframes sampled across [0, duration]
- CSS animation-duration = durationMs
- iteration-count = 1

No looping implied.



**Core rule: loop closure must be exact.**

For loop mode:
- Exported animation must satisfy: frame 0 == frame N (modulo tolerance)
- Sampling must align exactly to the cycle

**Video Export - Strategy A (exact-cycle frame count):**
- Choose integer N such that N/fps == periodMs/1000 exactly
- If period isn't representable: adjust fps or period to fit

**Video Export - Strategy B (phase-driven sampling - required long-term):**
- Sample phase directly: phase_i = i / N
- Evaluate program with CycleRoot.phase = phase_i
- Decouples loop closure from fps
- Guarantees loop closure across arbitrary cycle lengths

**Pingpong:**
- Export loops as pingpong (forward then backward) seamlessly
- Sample across [0..1..0] phase shape

**SVG/CSS:**
- CSS animation-iteration-count: infinite
- CSS animation-timing-function: linear
- Keyframes sampled across phase for exact closure:
  - k_i = phase_i
  - offset = i/N

### InfiniteTimeRoot Export

Infinite patches cannot be exported as "infinite." They must be captured.

**Video:**
- User chooses capture duration (default: 30s)
- Standard sampling

**SVG/CSS - Option A "Looping excerpt":**
- User chooses a cycle lens or capture-to-cycle process
- Phase-lock a chosen phase bus, OR
- Bake a segment and crossfade endpoints
- Explicitly labeled as approximation

**SVG/CSS - Option B "Finite excerpt":**
- CSS iteration-count = 1
- A "recording" of a window, not a loop

UI must not pretend infinite SVG is the same as cyclic SVG.

## Export UI

### Finite Export UI
- Duration locked to TimeRoot.duration
- Choose: fps, resolution, format

### Cycle Export UI
- Period locked to TimeRoot.period
- Controls:
  - "Export loopable clip"
  - "Frames per cycle" (explicit integer)
  - "Export by phase (exact closure)" toggle (should be default)
  - Number of loops for video (optional)
- **Loop Integrity indicator:**
  - Green when closure exact
  - Amber when approximation

### Infinite Export UI
- Capture duration slider (required)
- "Export as excerpt" (finite)
- Optional: "Attempt loopable excerpt" (marked as approximation)

## Technical Requirements

### Export Must Run Without Interactive Player
Export cannot depend on:
- Player loop mode
- Player UI
- Tick logic

Export must use:
- Compiled program + timeModel
- Deterministic evaluation context

### Phase-Driven Evaluation (Required for Cycle Export)
To guarantee closure independent of fps:
- Supply CycleRoot with phaseOverride


This is not a hack; it is the correct abstraction.

## Determinism Guarantees

Exports must:
- Embed seed in metadata (or export manifest)
- Embed export plan (fps, frames-per-cycle, capture duration)
- Produce identical output given same inputs

No hidden randomness, no wall-clock dependence.

## Export Failure Modes

Export must fail with clear errors if:
- TimeRoot missing/invalid

- Phase-driven evaluation not possible due to illegal feedback
- Non-exportable renderer feature used (SVG limitations)

When features can be approximated:
- Emit warnings and label artifact as "approximate"
