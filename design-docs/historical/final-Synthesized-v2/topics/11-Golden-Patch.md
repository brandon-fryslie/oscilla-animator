# Golden Patch

## Source: 10-Golden-Patch.md

# Golden Patch: "Breathing Constellation"

## Purpose

This patch serves as the canonical reference for:
- TimeRoot / TimeModel correctness
- Time Console Modulation Rack for cycle authoring
- Bus-first authoring (no wires required)
- Lazy Field evaluation
- No-jank live edits
- Musically-legible ambient loop
- Export sanity (phase-driven sampling via Time Console rails)

It's deliberately small enough to implement now, but rich enough to stay relevant as the system grows.

## Description

A loopable ambient system: a grid of dots that "breathes" (radius), slowly drifts (position jitter), color-cycles on a long phrase, and has occasional "spark" accents synced to pulse subdivisions.

## Patch Contract

### Time Topology
- **TimeRoot:** InfiniteTimeRoot
- **Compiled TimeModel:** `{ kind: 'infinite' }`
- **Time Console Modulation Rack:**
  - Cycle A lane: period = 8.0s, mode = loop → produces phaseA, pulse
  - Cycle B lane: period = 32s, mode = loop → produces phaseB
- **Required Global Rails:** time, phaseA, phaseB, pulse, energy, palette



### Canonical Buses (Global Rails)

| Bus | Type | Combine | Silent Value |
|-----|------|---------|--------------|
| time | Signal<time> | last | 0 |
| phaseA | Signal<phase> | last | 0 |
| phaseB | Signal<phase> | last | 0 |
| pulse | Event | last | never fires |
| energy | Signal<number> | sum | 0 |
| palette | Signal<color> | last | #0b1020 |

**Note:** `or` is NOT a valid combine mode. Events use `last`.

---

## Block Graph

### A) Time Topology Block

**InfiniteTimeRoot**
- Publishes: `time` rail only
- All other rails (phaseA, phaseB, pulse) come from Time Console

### B) Time Console Modulation Rack

**Cycle A Lane**
- Params: period = 8s, mode = loop
- Produces:
  - `phaseA` rail (primary cycle phase)
  - `pulse` rail (wrap events)

**Cycle B Lane**
- Params: period = 32s, mode = loop
- Produces:
  - `phaseB` rail (secondary/phrase phase)



### C) Domain + Arrangement

**GridDomain**
- Params: rows = 20, cols = 20, spacing = 22, center = viewport center
- Outputs:
  - domain (element identity + count)
  - pos0: Field<vec2> (base positions)

### D) Energy Generation

**WaveShaper** ("breath")
- Subscribes: phaseA
- Computes: breath = 0.5 - 0.5*cos(2π*phaseA)
- Publishes: energy += breath * 0.35

**PulseDivider**
- Subscribes: phaseA
- Params: divisions = 8
- Publishes: pulse <- subPulse (adds to rail)

**AccentEnvelope**
- Subscribes: pulse
- Params: attack = 0, decay = 0.18s
- Publishes: energy += accent * 0.65

Result: meaningful "intensity" signal with smooth breathing and rhythmic accents.

### E) Palette

**PaletteLFO**
- Subscribes: phaseB (slow phrase from Time Console)
- Computes: hue rotate slowly across 32s
- Publishes: palette = color

---

## Field Shaping

### A) Per-Element Phase Offset

**StableIdHash**
- Input: domain
- Output: idRand: Field<number> in [0,1)

**FieldMap** ("SpreadPhase")
- Inputs: phaseA (Signal from Time Console), idRand (Field)
- Output: phasePer = frac(phaseA + idRand * 0.35)

Coherent motion with per-element phase offsets.

### B) Radius Field

**RadiusFromEnergy**
- Inputs: energy (Signal), phasePer (Field)
- Compute:
  - base radius = 2.0
  - breathe radius = 10.0 * smoothstep(phasePer)
  - accent gain = 6.0 * clamp(energy, 0, 1.5)
- Output: radius: Field<number>

This is the heart of the "breathing dots."

### C) Position Drift

**JitterField**
- Inputs: idRand (Field), phaseB (Signal from Time Console)
- Output: drift: Field<vec2> (±2 px)

**AddFieldVec2**
- Inputs: pos0, drift
- Output: pos: Field<vec2>

---

## Renderer Block

**RenderInstances2D**
- Inputs:
  - domain
  - position: Field<vec2> <- pos
  - radius: Field<number> <- radius
  - fill: Field<color> <- derived from palette + idRand
  - opacity: Field<number> <- 0.85 + 0.15 * sin(phasePer)
- Output: RenderTree

No compositors required. Should look alive immediately.

---

## UI Behavior Requirements

### Time Console
- Must show INFINITE badge (TimeModel is infinite)
- Must show Phase Ring for phaseA lane in Modulation Rack
- Must show pulse indicator ticking (from Cycle A wrap + subdivisions)
- Modulation Rack shows all active lanes

### Bus Board
- phaseA row shows phase scope/ring
- energy row shows meter oscillating
- palette row shows swatch drifting

### Live Editing (No-Jank)

While RUNNING:
| Change | Class | Behavior |
|--------|-------|----------|
| GridDomain rows/cols | C | Requires explicit apply boundary |
| Breath amplitude | A | Instant swap next frame |
| Time Console Cycle A period | C | Offers apply on next pulse |

---

## Export Expectations

If exported as a loopable clip using Time Console phase-driven export:
- Phase-driven sampling (via Time Console rails) produces exact loop closure
- Frame 0 and Frame N should match visually (within tolerance)

This patch is the canary for phase-driven export correctness.

---

## Acceptance Tests

### 1. Time Correctness
- TimeModel is `{ kind: 'infinite' }`
- Cycles come from Time Console Modulation Rack, not TimeRoot
- `t` never wraps; only phase rails do

### 2. UI Correctness
- INFINITE badge appears (TimeModel is infinite)
- Time Console Modulation Rack shows Cycle lanes for phaseA/phaseB


### 3. No-Jank
- Param tweak on breath amplitude changes visuals with no flicker
- Period change in Time Console can be scheduled at next pulse and swaps cleanly

### 4. Determinism
- Same seed -> identical motion every reload
- Different seed -> different but stable per-element offsets

### 5. Performance Sanity
- ~400 dots (20x20): smooth
- ~2500 dots (50x50): degrade gracefully but not collapse (lazy-field stress test)

---

## Why This Is The Golden Patch

It exercises exactly what has been hard:
- InfiniteTimeRoot with Time Console Modulation Rack for cycles
- Multi-scale phasing (8s + 32s) via Time Console lanes
- Buses as glue (phaseA, phaseB, pulse, energy, palette)
- Lazy Fields that must not explode performance
- Stable element identity (domain + StableIdHash)
- Renderer consuming many fields and one domain
- Testable no-jank swap boundaries
