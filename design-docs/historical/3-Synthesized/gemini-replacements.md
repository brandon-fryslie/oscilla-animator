<Time_Architecture_Replacement>
# Time Architecture

## Fundamental Principle

**There is exactly ONE time system. The patch defines time topology. The player controls transport.**

The player:
- Hosts the runtime
- Observes `TimeModel`
- Controls rate (speed)
- Controls run/freeze
- Controls **View Looping** (for Finite patches only)

The patch (via TimeRoot):
- Declares the `TimeModel` (Finite vs Infinite)
- Defines the fundamental flow of `t`

---

## TimeRoot

Every patch must contain exactly one **TimeRoot** block.

### TimeRoot Types

| Type | Description | Use Case |
| :--- | :--- | :--- |
| `FiniteTimeRoot` | Finite performance with known duration | Logo stingers, intro/outro animations |
| `InfiniteTimeRoot` | Runs unbounded, generative time | Installations, VJ loops, screensavers |



### Constraints
- Exactly one TimeRoot per patch (compile error if 0 or >1)
- TimeRoot cannot have upstream dependencies
- **Hard Reset:** Changing the TimeRoot (or its core definition) is a "Class C" change. It requires re-initializing the runtime, resetting `t` to 0.

---

## TimeModel

The compiler outputs a `TimeModel` describing the patch’s topology.

```typescript
type TimeModel =
  | { kind: 'finite'; durationMs: number }
  | { kind: 'infinite' };
```

### TimeCtx (Runtime input)
`TimeCtx` is what flows into the program every frame.

```ts
interface TimeCtx {
  t: number;        // Unbounded, monotonically increasing time in ms
  dt: number;       // Delta time
  seed: number;     // Deterministic seed
}
```

**Rules:**
- `t` never wraps
- `t` never resets when looping playback (View Only)
- `t` is never clamped by TimeModel

---

## Player Playback Policy

The Player adapts its transport controls based on the `TimeModel`.

| TimeModel | Player Behavior | Loop Controls |
| :--- | :--- | :--- |
| **Finite** | Timeline View (0..Duration). Scrubbing sets absolute `t`. | **Enabled** (`Once`, `Loop`, `PingPong`). These affect the *View Time* mapping. |
| **Infinite** | Sliding Window View. Scrubbing offsets the view window. | **Disabled**. Infinite time cannot be looped by the player. |

---

## Derived Time & Cycles

Cycles are **derived signals**, created by explicit operators layered on top of the unbounded `TimeCtx.t`.

### PhaseFromTime (The Engine of Cycles)
The core operator for cyclic time is `PhaseFromTime`. It converts unbounded milliseconds into a normalized phase (0..1).

**Semantics:**
```
raw = (t * rate) / period
loop:     phase = frac(raw + offset)
pingpong: phase = triangle(raw + offset)
```

**Phase Continuity (No-Jank):**
To prevent visual jumps when parameters change during playback:
- The operator maintains a stateful `offset`.
- When `period` or `rate` changes at time `t_now`, a new `offset` is calculated such that `phase(t_now)` remains constant across the change.
- `newOffset = oldPhase - (t_now / newPeriod)`

---

# Time Console & Modulation Rack

## 1. Purpose

The Time Console is the **authoring surface for time**. It replaces any cycle or loop UI previously attached to the Player.

Time authoring is split into two layers:
1.  **TimeRoot** (Topology): Finite or Infinite.
2.  **Modulation Rack** (Global Rails): Derived modulation lanes (Phase A/B, Pulse, Energy, Palette).

## 2. Modulation Rack (Global Rails)

The Modulation Rack is a system-level component that generates essential signals so patches animate immediately without wiring. It outputs to **Global Rails**.

### The Canonical Rails
A **Rail** is a specialized signal endpoint that exists outside the standard block graph.

| Rail | Type | Default Source | Description |
| :--- | :--- | :--- | :--- |
| **`phaseA`** | `Signal<phase>` | Rack Cycle A | Primary motion driver (0..1). |
| **`phaseB`** | `Signal<phase>` | Rack Cycle B | Secondary motion driver (e.g., long evolutions). |
| **`pulse`** | `Event` | Rack Cycle A | Cycle wrap event. (Subdivisions reserved for future V2). |
| **`energy`** | `Signal<number>` | Rack Energy | Global intensity envelope. |
| **`palette`** | `Signal<color>` | Rack Palette | Global color theme. |

### Cycle Lane Controls
In the Time Console, "Cycle A" and "Cycle B" lanes allow configuring the internal generators:
- Period (ms)
- Mode (Loop | PingPong | Once)
- Phase Offset (Manual)

## 3. Rail Drive Policy

Each Rail has a configurable **Drive Source** managed in the Time Console. This allows the graph to override the Rack.

| Mode | Meaning | Use Case |
| :--- | :--- | :--- |
| **Normalled** | Driven by **Modulation Rack** | Default. Internal generator drives the Rail. |
| **Patched** | Driven by **User Bus** | Internal disconnected. User Bus drives the Rail. |
| **Mixed** | Driven by **Both** | Combined via `Sum`, `Max`, or `Override`. |

## 4. Compilation & Runtime Constraints

Rails enforce strict semantics to allow bidirectional flow (Bus → Rail → Bus) without creating infinite recursion.

### Schedule & Cycle Prevention
1.  **Strict Ordering:** Rail values are resolved in a specific schedule phase (TimeRoot -> Rack -> User Graph -> Rail Resolve).
2.  **Frame Latching:** If a Rail is set to **Patched** mode, and the source Bus depends on that same Rail (algebraic loop), the compiler enforces a **Frame Latch** (read `t-1`, write `t`) to maintain DAG properties.

---

## 5. UI Integration

### Default Provisioning
When a new `InfiniteTimeRoot` patch is created:
- **Cycle A** is enabled (Period = 2.0s, Loop) feeding `phaseA` and `pulse`.
- **Cycle B** is disabled.
- **Energy** and **Palette** are enabled with defaults.

### Finite Mode Behavior
In `FiniteTimeRoot`, the Modulation Rack generators function normally, but because `t` always starts at 0, they are implicitly phase-locked to the start of the animation.
</Time_Architecture_Replacement>

<Block_Registry_Fix>
### InfiniteTimeRoot
**Role:** TimeRoot

Ambient, unbounded time. Generative cycles are handled by the Modulation Rack or Derived Operators.

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| (none) | - | Infinite roots have no inputs. Cycles are defined in the Modulation Rack. |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| systemTime | Signal<time> | Monotonic time in ms |
| energy | Signal<number> | Constant 1.0 *(provisional)* |
</Block_Registry_Fix>

<Golden_Patch_Fix>
## Patch Contract

### Time Topology
- **TimeRoot:** InfiniteTimeRoot
- **Compiled TimeModel:** `{ kind: 'infinite' }`
- **Modulation Rack:**
    - **Phase A:** Internal Generator (Period = 8.0s, Mode = Loop) -> drives `phaseA` Rail
    - **Pulse:** Derived from Phase A wrap -> drives `pulse` Rail

### Canonical Buses
| Bus | Type | Source |
|-----|------|---------|
| phaseA | Signal<phase> | Modulation Rack (Internal) |
| pulse | Event | Modulation Rack (Internal) |
| energy | Signal<number> | Modulation Rack (Internal) |
| palette | Signal<color> | Modulation Rack (Internal) |

---

## Block Graph

### A) Time Topology Block

**InfiniteTimeRoot**
- Params: none
- Publishes: `systemTime`
  </Golden_Patch_Fix>

<UI_Spec_Fix_Finite>
### Controls
- Scrub (drag playhead): sets localT
- Jump to start/end
- **Loop Controls:** [ Once | Loop | Ping-Pong ] (Affects view-time mapping only)
  </UI_Spec_Fix_Finite>

<UI_Spec_Fix_Infinite>
### Primary Controls
- **Window size editor**: `Window 10s` (click to edit)
- **View scrub**: dragging shifts timeOffset (view transform, not system time)
- **Optional "Hold View" toggle**: freezes view offset while system continues
- **Loop Controls:** Disabled / Hidden
  </UI_Spec_Fix_Infinite>
