# Block Registry

## Block Categories

### 1. Time/Topology Primitives
Define the fundamental time structure of the patch.

### 2. Signal Primitives
Process and generate time-indexed values.

### 3. Domain/Field Primitives
Handle element identity and per-element computation.

### 4. Render Primitives
Produce visual output from fields and signals.

### 5. Composites
Pre-built combinations of primitives for common patterns.

---

## Time/Topology Primitives

### FiniteTimeRoot
**Role:** TimeRoot

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| duration | Scalar<duration> | Total duration (default 5000ms) |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| systemTime | Signal<time> | Monotonic time in ms |
| progress | Signal<unit> | 0..1 clamped progress |
| phase | Signal<phase> | Same as progress (0..1 clamped) *(provisional)* |
| end | Event | Fires once when progress reaches 1 *(provisional)* |
| energy | Signal<number> | 1.0 while animating, 0 when complete *(provisional)* |

**Auto-publishes:** `progress` -> `progress`, `phase` -> `phaseA` *(provisional)*, `end` -> `pulse` *(provisional)*, `energy` -> `energy` *(provisional)*

### InfiniteTimeRoot
**Role:** TimeRoot

Ambient, unbounded time with an optional repeating cycle for bus publications.

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| periodMs | Scalar<duration> | Ambient cycle period (default 10000ms) *(provisional)* |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| systemTime | Signal<time> | Monotonic time in ms |
| phase | Signal<phase> | Ambient 0..1 cycle based on periodMs *(provisional)* |
| pulse | Event | Fires on ambient cycle boundary *(provisional)* |
| energy | Signal<number> | Constant 1.0 *(provisional)* |

**Auto-publishes:** `phase` -> `phaseA` *(provisional)*, `pulse` -> `pulse` *(provisional)*, `energy` -> `energy` *(provisional)*

> *Provisional outputs added for API consistency. Original spec only required `systemTime` - phase/pulse should come from explicit PhaseClock blocks in generative patches. The `periodMs` input provides convenience but may encourage over-reliance on the ambient cycle.*

### InfiniteTimeRoot (Gemini, v2, Supercedes previous definition)

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

### End TimeRoot v2

---

## Signal Primitives

### PhaseClock
Secondary clock (derived, not topology).

**Inputs (one required):**
| Port | Type | Description |
|------|------|-------------|
| tIn | Signal<time> | Time input |
| phaseIn | Signal<phase> | OR phase input |
| period | Scalar<duration> | Clock period |
| mode | Scalar<enum> | loop/pingpong/once |
| rate | Signal<number> | Speed multiplier |
| phaseOffset | Signal<phase> | Phase offset |
| reset | Event | Reset trigger |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| phase | Signal<phase> | Output phase |
| u | Signal<unit> | Clamped [0,1] |
| wrap | Event | Wrap event |
| cycleIndex | Signal<number> | Cycle count |

### Oscillator

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| phase | Signal<phase> | Phase input |
| shape | Scalar<enum> | sine/cosine/triangle/saw |
| amplitude | Signal<number> | Amplitude |
| bias | Signal<number> | DC offset |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| out | Signal<number> | Oscillator output |

### Shaper

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| in | Signal<number> | Input signal |
| kind | Scalar<enum> | tanh/softclip/sigmoid/smoothstep/pow |
| amount | Scalar<number> | Shaping amount |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| out | Signal<number> | Shaped output |

### EnvelopeAD

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| trigger | Event | Trigger event |
| attack | Scalar<duration> | Attack time |
| decay | Scalar<duration> | Decay time |
| peak | Scalar<number> | Peak value |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| env | Signal<number> | Envelope output |

### PulseDivider

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| phase | Signal<phase> | Phase input |
| divisions | Scalar<number> | Number of divisions |
| mode | Scalar<enum> | rising/wrap |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| tick | Event | Subdivision tick |

### ColorLFO

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| phase | Signal<phase> | Phase input |
| base | Scalar<color> | Base color |
| hueSpan | Scalar<number> | Hue rotation range |
| sat | Scalar<number> | Saturation |
| light | Scalar<number> | Lightness |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| color | Signal<color> | Output color |

### Math Signal Blocks
- **AddSignal** - Signal + Signal -> Signal
- **MulSignal** - Signal * Signal -> Signal
- **MinSignal** / **MaxSignal** - Component-wise min/max
- **ClampSignal** - Clamp to range

---

## Domain/Field Primitives

### GridDomain

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| rows | Scalar<number> | Row count |
| cols | Scalar<number> | Column count |
| spacing | Scalar<number> | Grid spacing |
| origin | Scalar<vec2> | Grid origin |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| domain | Domain | Element identity |
| pos0 | Field<vec2> | Base positions |

**Domain contract:** stable element IDs (row/col), deterministic ordering.

### StableIdHash

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| domain | Domain | Domain input |
| salt | Scalar<number/string> | Hash salt |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| u01 | Field<number> | Per-element [0,1) |

### FieldFromSignalBroadcast

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| domain | Domain | Domain for count |
| signal | Signal<T> | Signal to broadcast |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| field | Field<T> | Broadcasted field |

### FieldMapUnary

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| a | Field<A> | Input field |
| fn | Scalar<enum/functionId> | Map function |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| b | Field<B> | Mapped field |

### FieldZipBinary

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| a | Field<A> | First field |
| b | Field<B> | Second field |
| fn | Scalar<enum/functionId> | Combine function |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| c | Field<C> | Combined field |

### FieldZipSignal

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| field | Field<A> | Field input |
| signal | Signal<B> | Signal input |
| fn | Scalar<enum/functionId> | Combine function |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| out | Field<C> | Combined field |

### JitterFieldVec2

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| idRand | Field<number> | Per-element random |
| phase | Signal<phase> | Phase for animation |
| amount | Scalar<number> | Drift amount (pixels) |
| frequency | Scalar<number> | Cycles per phrase |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| drift | Field<vec2> | Per-element drift |

### FieldAddVec2 / FieldColorize / FieldOpacity
Standard per-element operations for position, color, and opacity.

---

## Render Primitives

### RenderInstances2D

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| domain | Domain | Element source |
| position | Field<vec2> | Positions |
| radius | Field<number> | Radii |
| fill | Field<color> | Fill colors |
| opacity | Field<number> | Opacities |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| renderTree | RenderTree | Render output |

**Implementation requirements:**
- Materialize fields efficiently into typed buffers
- Preserve element ordering consistent with Domain
- Minimal per-frame allocation
- Tolerate lazy FieldExpr chains

### ViewportInfo

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| size | Scalar<vec2> | Viewport size |
| center | Scalar<vec2> | Viewport center |

---

## Composite Library

### AmbientLoopRoot
Wraps CycleTimeRoot with bus publishing.

**Exposes:** period, mode

### BreathEnergy
Oscillator + Shaper publishing to energy bus.

**Exposes:** amount, bias, curve

### PulseAccentEnergy
PulseDivider + EnvelopeAD publishing to energy bus.

**Exposes:** divisions, decay, amount

### SlowPaletteDrift
PhaseClock (32s) + ColorLFO publishing to palette bus.

**Exposes:** phrasePeriod, hueSpan, base color

### BreathingDotsRenderer
Complete rendering composite: GridDomain + StableIdHash + phase spread + radius + jitter + RenderInstances2D.

**Exposes:** rows/cols/spacing, radius min/max, drift amount, palette variance

---

## Block Implementation Properties

### Non-Negotiable Properties
1. **Domain identity contract** - stable element IDs, deterministic ordering
2. **Lazy Field evaluation** - FieldExpr graph, evaluation only at render sinks
3. **Bus determinism** - stable publisher ordering, reserved bus type enforcement
4. **No-jank program swap** - schedule swaps at pulse boundary, preserve state keys
5. **Export by phase** - cyclic export must be phase-sampled for closure
