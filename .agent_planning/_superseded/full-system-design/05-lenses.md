# Lenses

Lenses = per-port "perception stacks" that shape how a port reads from (or publishes to) a bus.
They are the primary mechanism for making a small set of buses produce rich, non-samey behavior—without duplicating buses or proliferating specialized blocks.

---

## Purpose

A Lens answers:
> "This port is bound to that bus. How should this port perceive that bus?"

It provides:
- local interpretation (consumer-specific shaping)
- unit/range mapping
- temporal feel (slew, lag, sample/hold, quantize)
- domain-specific transforms (phase warp, trigger shaping, color mapping)
- safety (clamping, NaN guards, deadzones)
- debuggability (you can inspect what changed where)

---

## Non-Goals

- Lenses are not a general subgraph editor
- Lenses do not create hidden state (any stateful lens is explicit and visible)
- Lenses do not mutate buses
- Lenses do not replace blocks for complex logic (they cover 80% "modulation feel" cases)

---

## Conceptual Model

### Lens as a Pipeline

For a port bound to a bus:
```
busValue → lensStack → portValue
```

Where lensStack is an ordered list of steps; each step is pure unless it explicitly declares memory.

### Two Categories of Steps

1. **Casts** (type-level adapters)
   - Ensure compatibility: world/domain/semantics
   - Examples: signal:number → signal:phase (wrap), signal:number → field:number (broadcast)
   - Usually auto-inserted / suggested

2. **Shapers** (feel-level transforms)
   - Artistic intent: range, easing, gating, quantizing, slew, wavefold
   - User-authored

The UI presents both as "Lens steps," but internally they're distinct so the compiler can treat them differently.

---

## Where Lenses Exist


Every bus subscription may have a lens stack.

This is the default and most important use:
> "Everything listens to phaseA, but each parameter hears it differently."


- useful for gain staging, clamping, normalization, smoothing before summing


---

## Type Rules and Compatibility

### TypeDesc Integration

Each port and bus has a TypeDesc:
- `world`: signal | field | scalar | special
- `domain`: number | phase | color | trigger | vec2 | ...
- optional semantics, unit

A lens step has:
- `from`: TypeDesc pattern
- `to`: TypeDesc
- `cost` + `stateful` flag

### Invariants

- A binding is valid if there exists a lens chain from bus type to port type
- Lens steps are ordered and deterministic
- Lens steps cannot change world unless the step is explicitly a "lift" (broadcast/reduce) and marked as such in UI

### World-Changing Steps are "Heavy"

Examples:
- Signal → Field (broadcast)
- Field → Signal (reduce)

These must:
- be explicit
- show a warning badge ("Heavy")
- require confirmation or an "Advanced" toggle

---

## Lens Step Library (Canonical Set)

### Universal Numeric Steps (signal:number or field:number)

1. **Map Range** (pure) - inMin/inMax → outMin/outMax, with optional clamp
2. **Clamp** (pure)
3. **Deadzone** (pure)
4. **Ease** (pure) - curve: linear, smoothstep, expo, etc.
5. **Quantize** (pure) - steps, optional jitter via deterministic hash
6. **Slew / Lag** (stateful) - attack/release, or tau
7. **Softclip / Tanh** (pure)
8. **Wavefold** (pure)

### Phase-Specific (signal:phase)

1. **Offset Phase** (pure)
2. **Scale Phase** (tempo) (pure)
3. **Wrap / Fold** (pure)
4. **Phase Window Gate** (pure) - active in [a,b), outputs 0 otherwise
5. **Phase Warp** (pure) - nonlinear remap: ease, power curve, skew
6. **Phase Quantize** (pure) - steps per cycle
7. **Wrap Trigger** (pure, changes domain to trigger) - emits trigger on wrap

### Trigger/Event Shaping (signal:trigger)

1. **Debounce** (stateful)
2. **Pulse Stretch** (stateful)
3. **Edge Detect** (stateful if derived from boolean)
4. **To Envelope** (stateful) - converts trigger to attack/decay envelope

### Color (signal:color / field:color)

1. **Mix With** (pure)
2. **Hue Shift** (pure)
3. **Palette Lookup** (pure; may reference palette bus)
4. **Saturation/Value scale** (pure)

### Vec2 (signal:vec2 / field:vec2)

1. **Scale** (pure)
2. **Rotate** (pure)
3. **Clamp Length** (pure)
4. **Noise-free wobble** (stateful only if using integrators; otherwise pure trig)

### World-Changing Steps (Advanced)

1. **Broadcast** (signal:T → field:T) (pure but heavy)
   - requires a Domain input
   - returns uniform value for all elements

2. **Reduce** (field:T → signal:T) (pure but heavy)
   - reducer: mean/max/min/sum
   - must specify reducer explicitly

---

## Lens Stack UI

### Visual Placement

After binding a port to a bus, a lens icon appears next to the port.
Clicking opens the Lens Panel.

### Lens Icon States

- Hidden: no binding
- Hollow lens: bound, identity lens only
- Solid lens: custom steps present
- Warning lens: heavy step, type mismatch, NaN guard triggered
- "Memory dot": stateful step in stack

### Lens Panel Layout

**Header:**
- Port name + block name
- Bound bus chip (click to change)
- Result type (port type)
- "Reset to Identity" button
- "Save as Preset..." button

**Stack:**
- Vertical list of steps (chips/rows)
- Each row shows: step name, domain icon, enable toggle, drag handle, quick settings, warning badges

**Add Step:**
- Plus button opens searchable menu
- Filtered by current type at that point in stack

**Footer (optional):**
- Live preview: bus value (input), post-lens value (output)

### Progressive Disclosure

**Basic steps shown prominently:**
- Map Range, Ease, Quantize, Slew, Gate Window, Clamp, Deadzone

**Advanced steps behind "More...":**
- Wavefolder, Softclip, Hysteresis, SampleHold, Peak Detect, Reduce/Broadcast

---

## Lens Compilation

### Compilation Model

A lens stack compiles into:
- a Signal evaluator transform pipeline
- a FieldExpr pipeline (preferred, lazy)
- or a mixed pipeline if heavy steps are present (discouraged)

### Fusion Rules

- Consecutive pure shapers should fuse
- MapRange + Clamp + Ease should fuse into a single kernel
- Multiple quantizes can collapse
- Disabled steps are removed
- Identity lens compiles to a no-op (zero overhead)

### Stateful Lens Steps

Stateful steps must:
- declare scrub policy: reconstructable from TimeCtx? (rare) / performance-only? (common)
- show "Memory dot" badge in UI
- participate in cycle legality if they feed back (usually they won't)

---

## Performance Contract

A lens stack must be cheap enough that users can put them everywhere.

Targets:
- Identity lens: ~zero overhead (optimized away)
- Typical signal lens: a handful of ops per frame
- Typical field lens: fused into sink loops (no intermediate buffers)
- Heavy steps: explicitly marked and discouraged for mass use

---

## Presets and Reusability

### Lens Presets

Users can save a lens stack as a preset:
- name
- domain tags (phase/number/color)
- input/output TypeDesc patterns
- thumbnail preview (optional)

### Starter Preset Set (Ship with Product)

Examples:
- "Phase → Ease In Out"
- "Phase → 8-step sequencer"
- "Phase → Stutter gate"
- "Energy → Slow attack / fast release"
- "Trigger → Decay envelope"
- "Palette → Slow drift"

---

## Data Model


- `busId`
- `lens`: LensStack

### LensStack

- `steps`: LensStepInstance[]
- optional `uiCollapsed`: boolean
- optional `presetId`: string (if derived)

### LensStepInstance

- `type`: LensStepTypeId
- `params`: Record<string, JSONValue>
- `isEnabled`: boolean
- optional `uiExpanded`: boolean

### LensStepType (Registry)

- `id`
- `label`
- `from`: TypePattern
- `to`: TypeDesc
- `category`: cast | shape | heavy | stateful
- `costHint`: none | light | heavy
- `stateful`: boolean
- `compile(planNode, params) → planNode`

Keep it registry-driven like blocks. It becomes an ecosystem.

---

## UX Policies

1. Identity lens is default and visible
2. Auto-suggest lens steps when binding mismatched semantics
3. Heavy steps require intent (not auto-inserted silently)
4. Stateful steps are always marked
5. Lens stacks are short by design—provide "macro steps" (compound lens steps) like "Envelope" or "Stutter Gate"

---

## Why Lenses are the Right Abstraction

Without lenses:
- you need many buses to avoid sameness
- you need many small utility blocks
- patches get wide and hard to read

With lenses:
- a few global buses can drive deep variety
- interpretation is local and visible
- causality stays legible
- you get the "modular synth" feeling without the spaghetti
