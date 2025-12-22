# Buses

Buses are the send/return model for visuals: shared causes, many interpretations.
This document covers bus architecture, compilation, and the default bus system.

---

## What Buses Are

The patch is fundamentally:
- blocks that **publish** into named buses
- blocks/params that **consume** buses through explicit interpretation boundaries

Buses are not "wires." They are named influence fields.

---

## Buses Create a Shared "Influence Ecology"

Buses create:
- shared causes
- many interpretations

This is the visual analog of audio sends and returns.

---

## Bus Types

### Signal Buses

Compile to: Signal evaluator
Evaluation: Once per frame
Use for: phase, energy, pulse, palette, tension

### Field Buses

Compile to: FieldExpr node
Evaluation: Lazy, at sinks
Use for: shared per-element attributes (advanced)

Note: Field buses are optional for v1. Most variation happens through listener lenses.

---

## Bus Compilation Contract

For each bus:
1. Collect publishers
2. Sort by sortKey, then stable ID
3. Apply adapter chains
4. Combine using domain-specific reducer
5. Produce a single evaluator

This process is deterministic and repeatable.

---

## Buses as First-Class Compilation Nodes

A bus compiles to:
- Signal bus → Signal evaluator
- Field bus → FieldExpr node

Architecturally, buses are:
- shared reduction points
- ordering boundaries
- semantic anchors

---

## Bus Definitions

A bus definition includes:
- **World**: Signal or Field
- **Domain**: phase, number, color, trigger, etc.
- **Combine mode**: how multiple publishers merge
- **Silent value**: default when no publishers active

---

## Combine Modes

### Signal Combine Modes
- `last`: final publisher wins (sorted order)
- `sum`: add all values
- `max`: maximum value
- `min`: minimum value
- `mean`: average
- `or`: for triggers, any fires

### Field Combine Modes
- Combination is per element
- All publishers must share the same Domain
- Combine functions are lifted pointwise

Example:
- Field sum: `value(e) = A(e) + B(e)`
- Field max: `value(e) = max(A(e), B(e))`

---

## Publisher Ordering

Publishers are ordered by:
1. `sortKey` (explicit ordering control)
2. Stable block ID (deterministic tiebreaker)

This ensures deterministic evaluation across sessions.

---

## Silent Values

When no publishers are active, the bus returns its silent value:
- phase: 0
- number: 0
- color: transparent/black
- trigger: false/none

Silent values are editable for core domains.

---

## Buses as Stability Anchors

Because buses are **named, persistent structures**:
- bindings survive block rearrangements
- changing a producer doesn't invalidate consumers
- many edits don't affect output at all

This is a huge stability win over wire-based graphs.

---

## Default Buses

Auto-create a small default bus set on new patch init. You want a patch to "do something" immediately.

### Recommended v1 Default Buses (Signal world only):

| Bus | Type | Combine | Silent |
|-----|------|---------|--------|
| `phaseA` | signal:phase | last | 0 |
| `phaseB` | signal:phase | last | 0 |
| `energy` | signal:number | sum | 0 |
| `pulse` | signal:trigger | or | false |
| `palette` | signal:color | layer/mix | black |

### Policy Details

- Defaults should only be created for new patches (or when a patch has no buses)
- Never silently inject them into existing patches unless the user accepts an "Add defaults" action
- Mark them as `origin: built-in` so users can delete/rename but UI can treat them specially (pin at top, etc.)

---

## Determinism and Ordering

- Bus ordering is deterministic
- Publisher ordering is controlled by sortKey
- Listener lenses apply after bus combine
- Publisher-side lenses (if present) apply before bus combine for that publisher only

All deterministic:
- stable compilation
- stable evaluation order
- no hidden randomness

---

## Why This System Works

Without buses:
- you need many point-to-point wires
- everything breaks when you rearrange
- causality becomes illegible

With buses:
- a few global channels can drive deep variety
- interpretation is local and visible
- causality stays legible
- you get the "modular synth" feeling without the spaghetti
