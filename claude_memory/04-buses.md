# Buses & Rails — Quick Reference

**Note:** This is quick reference. Authoritative spec: `design-docs/final-Synthesized-v2/topics/04-Buses.md`

---

## Overview

Buses are **named shared channels** that replace explicit wiring for common signals.

### Architecture
- **Publishers**: Blocks that output to a bus
- **Listeners**: Blocks that receive from a bus
- **Combine Mode**: How multiple publishers are combined

---

## Global Rails (Reserved Buses)

Rails are reserved buses with locked constraints (`origin: 'built-in'`):

| Rail | Type | Range | Description |
|------|------|-------|-------------|
| `time` | Signal<time> | monotonic | Reserved, published only by TimeRoot |
| `phaseA` | Signal<number> | [0,1) | Primary phase modulation |
| `phaseB` | Signal<number> | [0,1) | Secondary phase modulation |
| `pulse` | Event<trigger> | - | Discrete time boundary events |
| `energy` | Signal<number> | [0,1] | Intensity/activity level |
| `palette` | Signal<number> | [0,1] | Palette position |

Rails:
- Cannot be deleted
- Have locked TypeDesc
- Are driven by the Time Console (Modulation Rack) by default

---

## Combine Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `sum` | Values are summed | energy |
| `average` | Values are averaged | blended signals |
| `max` | Maximum value wins | intensity peaks |
| `min` | Minimum value wins | constraints |
| `last` | Last publisher wins (by sortKey) | phaseA, palette |
| `layer` | Layered composition | visual stacking |

**Note:** `or` and `mix` are NOT valid combine modes.

---

## TimeRoot Publishing

TimeRoot blocks publish ONLY the reserved `time` bus:

- **FiniteTimeRoot**: `time` <- TimeRoot.systemTime
- **InfiniteTimeRoot**: `time` <- TimeRoot.systemTime

Phase/pulse/energy/palette are produced by the **Time Console** (Modulation Rack), not by TimeRoot.

---

## Rail Drive Policy

Set in the Time Console:

| Policy | Behavior |
|--------|----------|
| Normalled | Modulation Rack drives the rail (default) |
| Patched | Modulation Rack disconnected; only user publishers |
| Mixed | Both rack and user publishers; combine rule applies |

No hidden precedence. Publishing into a Normalled rail MUST surface a policy decision in UI.

---

## Rail Semantics

- **Frame-latched**: Reads see previous frame values
- **Deterministic**: Same inputs → identical outputs
- **Acyclic graph**: Rails are not graph nodes; resolved in dedicated schedule phase
