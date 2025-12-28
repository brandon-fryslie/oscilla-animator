# Vision

## Source: 00-Vision.md

## TimeRoot, TimeModel, and TimeCtx

A patch declares exactly one **TimeRoot**. TimeRoot does not generate time — it declares the *time contract* of the patch.

### TimeModel (Compile‑time contract)

`TimeModel` is a static declaration produced by the compiler. It describes what kind of time the program is authored against.

```ts
type TimeModel =
  | { kind: 'finite'; durationMs: number }
  | { kind: 'infinite' };
```

Meaning:

- `finite(durationMs)`  
  The patch has a meaningful authored duration.  
  Exporters, cue systems, and timeline UIs may reference this duration.  
  Playback may still loop or window the view, but the program itself is finite.

- `infinite()`  
  The patch has no end.  
  There is no canonical duration.  
  Playback UI presents a movable *time window* for viewing or recording.

**TimeModel is immutable during execution.**  
Changing it recompiles the patch.

---

### TimeCtx (Runtime input)

`TimeCtx` is what actually flows into the program every frame.

```ts
interface TimeCtx {
  t: number;        // Unbounded, monotonically increasing time in ms
  dt: number;       // Delta time
  seed: number;    // Deterministic seed
}
```

Rules:

- `t` never wraps
- `t` never resets when looping playback
- `t` is never clamped by TimeModel

TimeModel constrains **how time is interpreted**, not how time flows.

---

### Cycles are derived, not roots

Cycles are created by **CycleSpecs** layered on top of `TimeCtx.t`.

A CycleSpec produces:

- phase signals (0..1)
- pulse events
- energy envelopes

Example:

```ts
CycleSpec {
  periodMs: 4000
  phaseBus: "phaseA"
  pulseBus: "pulse"
  energyBus: "energy"
}
```

Multiple CycleSpecs may coexist.  
They all read from the same unbounded `t`.

---

### Player responsibility

The Player never alters `t`.

It may:
- loop the *view*
- ping‑pong the *view*
- window the *view*
- record a window

But the program always sees the same absolute time axis.

This is what makes:
- nested cycles
- seamless exports
- no‑jank hot‑swap
- deterministic replay  
possible.

Do not confuse:
- **TimeModel** → what kind of time this patch is
- **TimeCtx** → the actual time flowing through the system
- **Cycles** → derived oscillators layered on top

TimeRoot selects TimeModel.  
Player selects how TimeCtx is presented.  
Nothing ever wraps time.
