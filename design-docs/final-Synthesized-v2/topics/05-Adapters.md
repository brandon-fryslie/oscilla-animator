# Adapters

## Source: 04-Adapters.md

# Adapters

## Overview

Adapters (also called Lenses) are type conversion operations that transform values between compatible types. They are attached to listener bindings, not to buses themselves.

## Core Principle

**Adapters are unary-only and attached to listener bindings.**

They are:
- Pure and stateless
- Applied at read time
- Part of the perception stack

Stateful transforms are blocks, not adapters.

## Adapter Categories

### 1. Cast Adapters
Convert between related types without loss.

| From | To | Adapter |
|------|-----|---------|
| `Signal<phase>` | `Signal<number>` | `phaseToNumber` |
| `Signal<unit>` | `Signal<number>` | `unitToNumber` |
| `number` | `phase` | `numberToPhase` (with wrap) |

### 2. Lift Adapters
Promote from one world to another.

| From | To | Adapter |
|------|-----|---------|
| `Scalar<T>` | `Signal<T>` | `constSignal` |
| `Signal<T>` | `Field<T>` | `broadcast` |
| `Scalar<T>` | `Field<T>` | `constField` |

### 3. Reduce Adapters
Collapse from many to one.

| From | To | Adapter |
|------|-----|---------|
| `Field<number>` | `Signal<number>` | `fieldSum` |
| `Field<number>` | `Signal<number>` | `fieldMean` |
| `Field<number>` | `Signal<number>` | `fieldMax` |

### 4. Lens Adapters
Shape values without changing type.

| Type | Adapter | Description |
|------|---------|-------------|
| `Signal<number>` | `scale(factor)` | Multiply by constant |
| `Signal<number>` | `offset(amount)` | Add constant |
| `Signal<number>` | `clamp(min, max)` | Clamp to range |
| `Signal<number>` | `smooth(rate)` | Exponential smoothing |
| `Signal<phase>` | `warp(curve)` | Phase warping |

## Perception Stack

A listener can have multiple adapters chained:

```
bus.energy -> [scale(0.5)] -> [smooth(0.1)] -> [clamp(0,1)] -> block.input
```

This is the "perception stack" - how this particular listener perceives the bus.

## Adapter Declaration

Adapters are declared per-binding:

```typescript
interface BusBinding {
  busId: BusId
  portRef: PortRef
  adapters: AdapterId[]  // Applied in order
}
```

## Required Adapters for Golden Patch

1. `Signal<T>` -> `Field<T>` (broadcast)
2. `Field<phase>` wrapping semantics (wrap/pingpong)
3. `Event` merge (or) - bus combine
4. `Signal<number>` shaping/clamp

## UI for Adapters

Binding UI shows:
- Source bus
- Adapter chain (editable)
- Type before/after each adapter
- Preview of transformed value

## Constraints

- Adapters must be type-safe (compiler verifies)
- Adapters cannot introduce state
- Adapters cannot change domain identity
- Adapters are deterministic
