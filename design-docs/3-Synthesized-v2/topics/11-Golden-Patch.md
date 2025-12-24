# Golden Patch

## Source: 10-Golden-Patch.md

# Golden Patch: "Breathing Constellation"

## Purpose

This patch serves as the canonical reference for:
- TimeRoot / TimeModel correctness
- Bus-first authoring (no wires required)
- Lazy Field evaluation
- No-jank live edits
- Musically-legible ambient loop
- Export sanity (cycle-accurate, phase-driven sampling)

It's deliberately small enough to implement now, but rich enough to stay relevant as the system grows.

## Description

A loopable ambient system: a grid of dots that "breathes" (radius), slowly drifts (position jitter), color-cycles on a long phrase, and has occasional "spark" accents synced to pulse subdivisions.

## Patch Contract

### Time Topology
- **TimeRoot:** CycleTimeRoot(period = 8.0s, mode = loop)
- **Compiled TimeModel:** `{ kind: 'cyclic', periodMs: 8000 }`
- **Required UI buses present:** phaseA, pulse, energy, palette

### Canonical Buses

| Bus | Type | Combine | Silent Value |
|-----|------|---------|--------------|
| phaseA | Signal<phase> | last | 0 |
| pulse | Event | or | never fires |
| energy | Signal<number> | sum | 0 |
| palette | Signal<color> | last | #0b1020 |
| phaseB | Signal<phase> | last | 0 |

---

## Block Graph

### A) Time Topology Block

**CycleTimeRoot**
- Params: period = 8s, mode = loop
- Publishes:
  - `phaseA` <- phase (primary)
  - `pulse` <- wrap

### B) Domain + Arrangement

**GridDomain**
- Params: rows = 20, cols = 20, spacing = 22, center = viewport center
- Outputs:
  - domain (element identity + count)
  - pos0: Field<vec2> (base positions)

### C) Global Rhythmic Structure

**PhaseClock** (secondary phrase)
- Inputs: tIn <- TimeRoot.t
- Params: period = 32s, mode = loop
- Publishes: phaseB <- its phase

This gives multi-scale looping (8s loop + 32s phrase).

### D) Energy Generation

**WaveShaper** ("breath")
- Subscribes: phaseA
- Computes: breath = 0.5 - 0.5*cos(2π*phaseA)
- Publishes: energy += breath * 0.35

**PulseDivider**
- Subscribes: phaseA
- Params: divisions = 8
- Publishes: pulse OR= subPulse

**AccentEnvelope**
- Subscribes: pulse
- Params: attack = 0, decay = 0.18s
- Publishes: energy += accent * 0.65

Result: meaningful "intensity" signal with smooth breathing and rhythmic accents.

### E) Palette

**PaletteLFO**
- Subscribes: phaseB (slow phrase)
- Computes: hue rotate slowly across 32s
- Publishes: palette = color

---

## Field Shaping

### A) Per-Element Phase Offset

**StableIdHash**
- Input: domain
- Output: idRand: Field<number> in [0,1)

**FieldMap** ("SpreadPhase")
- Inputs: phaseA (Signal), idRand (Field)
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
- Inputs: idRand (Field), phaseB (Signal)
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
- Must show CYCLE badge
- Must show Phase Ring bound to phaseA
- Must show pulse indicator ticking (wrap + subdivisions)

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
| CycleTimeRoot period | C | Offers apply on next pulse |

---

## Export Expectations

If exported as a loopable clip:
- Phase-driven sampling must produce exact loop closure
- Frame 0 and Frame N should match visually (within tolerance)

This patch is the canary for cycle export correctness.

---

## Acceptance Tests

### 1. Time Correctness
- Changing player loop mode should not exist / do nothing
- `t` never wraps; only phase does

### 2. UI Correctness
- Cycle UI appears only because TimeModel is cyclic
- Infinite UI never appears for this patch

### 3. No-Jank
- Param tweak on breath amplitude changes visuals with no flicker
- Period change can be scheduled at next pulse and swaps cleanly

### 4. Determinism
- Same seed -> identical motion every reload
- Different seed -> different but stable per-element offsets

### 5. Performance Sanity
- ~400 dots (20x20): smooth
- ~2500 dots (50x50): degrade gracefully but not collapse (lazy-field stress test)

---

## Why This Is The Golden Patch

It exercises exactly what has been hard:
- Single authoritative CycleTimeRoot
- PhaseClock used correctly as secondary
- Buses as glue (phaseA, pulse, energy, palette)
- Lazy Fields that must not explode performance
- Stable element identity (domain + StableIdHash)
- Renderer consuming many fields and one domain
- Testable no-jank swap boundaries
