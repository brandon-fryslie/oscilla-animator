# Macro Integration Plan for New Lenses

**Date:** 2025-12-20
**Purpose:** Use each new lens type (clamp, offset, deadzone, mapRange) in at least 1 macro

## Summary

Each new lens should appear in at least one macro to demonstrate real-world usage:

| Lens | Target Macro | Purpose |
|------|--------------|---------|
| `clamp` | `macro:rhythmicPulse` | Safety bound on envelope output |
| `offset` | `macro:phaseSpread` | Shift oscillation baseline |
| `deadzone` | `macro:driftingDots` | Suppress sub-pixel jitter |
| `mapRange` | `macro:breathingDots` | Replace scale with explicit range |

## Implementation Details

### 1. clamp → macro:rhythmicPulse

**File:** `src/editor/macros.ts`

**Current State:** Uses `scale` lens for energy → radius

**Change:** Add clamp to envelope output before energy bus:
```typescript
listeners: [
  {
    busName: 'energy',
    toRef: 'render',
    toSlot: 'radius',
    lens: { type: 'clamp', params: { min: 0.1, max: 1.0 } },
  },
],
```

**Rationale:** Prevents envelope overshoots from creating jarring animations

---

### 2. offset → macro:phaseSpread

**File:** `src/editor/macros.ts`

**Current State:** No listeners with lenses

**Change:** Add listener from phaseA to a render parameter with offset:
```typescript
listeners: [
  {
    busName: 'phaseA',
    toRef: 'render',
    toSlot: 'opacity',
    lens: { type: 'offset', params: { amount: 0.3 } },
  },
],
```

**Rationale:** Lifts minimum opacity so elements never fully disappear

---

### 3. deadzone → macro:driftingDots

**File:** `src/editor/macros.ts`

**Current State:** JitterFieldVec2 creates continuous micro-movements

**Change:** Add deadzone to position drift:
```typescript
listeners: [
  {
    busName: 'energy',
    toRef: 'jitter',
    toSlot: 'amplitude',
    lens: { type: 'deadzone', params: { threshold: 0.15 } },
  },
],
```

**Rationale:** Creates visual "rest zones" where elements don't move until energy exceeds threshold

---

### 4. mapRange → macro:breathingDots

**File:** `src/editor/macros.ts`

**Current State:** Uses `scale: { scale: 12, offset: 3 }`

**Change:** Replace with explicit mapRange:
```typescript
listeners: [
  {
    busName: 'phaseA',
    toRef: 'render',
    toSlot: 'radius',
    lens: { type: 'mapRange', params: { inMin: 0, inMax: 1, outMin: 3, outMax: 15 } },
  },
],
```

**Rationale:** More explicit: "Map 0-1 to 3-15px" vs "Scale by 12, offset 3"

---

## Bonus: Add Missing Preset

Add offset preset for completeness:

**File:** `src/editor/lens-presets.ts`

```typescript
export const LENS_PRESET_OFFSET_HALF: LensPreset = {
  id: 'offset-half',
  label: 'Offset +0.5',
  category: 'shaping',
  description: 'Shift values up by 0.5 (center around 0.5)',
  lens: { type: 'offset', params: { amount: 0.5 } },
};
```

---

## Files to Modify

1. `src/editor/macros.ts` - Add lenses to 4 macro templates
2. `src/editor/lens-presets.ts` - Add offset preset

## Acceptance Criteria

- [ ] macro:rhythmicPulse uses clamp lens
- [ ] macro:phaseSpread uses offset lens
- [ ] macro:driftingDots uses deadzone lens
- [ ] macro:breathingDots uses mapRange lens (replaces scale)
- [ ] Tests still pass after changes
- [ ] Dev server runs without errors
