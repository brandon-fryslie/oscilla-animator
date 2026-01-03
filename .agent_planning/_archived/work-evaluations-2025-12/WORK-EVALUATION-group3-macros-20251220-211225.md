# Work Evaluation - Slice Demo Macros (Group 3)
Scope: work/macro-validation-group3
Confidence: FRESH
Timestamp: 2025-12-20 21:11:00

## Goals Under Evaluation
From task request:
1. Validate macro:breathingDots - Grid with breathing animation
2. Validate macro:breathingWave - Oscillator + Shaper for smooth breathing
3. Validate macro:rhythmicPulse - PulseDivider + EnvelopeAD for rhythmic accents
4. Validate macro:colorDrift - ColorLFO for slow hue cycling
5. Validate macro:stableGrid - GridDomain + StableIdHash for determinism

## Previous Evaluation Reference
None - first evaluation of Group 3 macros

## Persistent Check Results
| Check | Status | Output Summary |
|-------|--------|----------------|
| `just test` | FAIL | 1 failed test in macro-validation.test.ts |
| Specific failure | FAIL | macro:breathingDots references non-existent "PhaseClockLegacy" block |

## Code Review Testing

### What I Checked
1. Macro block definitions in `src/editor/blocks/macros.ts`
2. Macro expansion registry in `src/editor/macros.ts`
3. Block registry imports in `src/editor/blocks/registry.ts`
4. Test suite execution

### What Actually Happened

**Macro Block Definitions (src/editor/blocks/macros.ts):**
- ✅ MacroBreathingDots (line 214): Defined, type 'macro:breathingDots'
- ✅ MacroBreathingWave (line 133): Defined, type 'macro:breathingWave'
- ✅ MacroRhythmicPulse (line 142): Defined, type 'macro:rhythmicPulse'
- ✅ MacroColorDrift (line 151): Defined, type 'macro:colorDrift'
- ✅ MacroStableGrid (line 160): Defined, type 'macro:stableGrid'

**Macro Expansion Registry (src/editor/macros.ts):**
- ✅ 'macro:breathingDots' (line 375): Expansion defined
- ✅ 'macro:breathingWave' (line 418): Expansion defined
- ✅ 'macro:rhythmicPulse' (line 457): Expansion defined
- ✅ 'macro:colorDrift' (line 489): Expansion defined
- ✅ 'macro:stableGrid' (line 514): Expansion defined

**Block Registry:**
- ✅ Macros imported via `import * as MacroBlocks from './macros'`
- ✅ Included in ALL_INDIVIDUAL_BLOCKS array

## Assessment

### ❌ Not Working

**1. macro:breathingDots - BROKEN**
- **Issue**: References non-existent block type "PhaseClockLegacy"
- **Location**: `src/editor/macros.ts:386`
- **Error**: `AssertionError: Block type "PhaseClockLegacy" not found for macro "macro:breathingDots"`
- **Evidence**: Test failure in macro-validation.test.ts:140
- **Root cause**: Legacy block reference that no longer exists

**Available time blocks:**
```typescript
// From src/editor/blocks/time-root.ts
export const FiniteTimeRoot
export const CycleTimeRoot
export const InfiniteTimeRoot
```

**PhaseClockLegacy does not exist** - the macro needs to be updated to use CycleTimeRoot instead.

### ✅ Potentially Working (pending fix)

**2. macro:breathingWave - LIKELY OK**
- Uses: CycleTimeRoot (exists), Oscillator, Shaper, DomainN, PositionMapGrid, RenderInstances2D
- Test passed block type validation

**3. macro:rhythmicPulse - LIKELY OK**
- Uses: CycleTimeRoot (exists), PulseDivider, EnvelopeAD, DomainN, PositionMapGrid, RenderInstances2D
- Test passed block type validation

**4. macro:colorDrift - LIKELY OK**
- Uses: CycleTimeRoot (exists), ColorLFO, DomainN, PositionMapCircle, RenderInstances2D
- Test passed block type validation

**5. macro:stableGrid - LIKELY OK**
- Uses: GridDomain, StableIdHash, FieldConstNumber, RenderInstances2D
- Test passed block type validation
- No time source (static grid)

## Evidence

**Test Output:**
```
FAIL  src/editor/__tests__/macro-validation.test.ts > Macro Registry Validation > Slice Demo Macros > macro:breathingDots > should reference only existing block types
AssertionError: Block type "PhaseClockLegacy" not found for macro "macro:breathingDots": expected undefined to be defined
❯ src/editor/__tests__/macro-validation.test.ts:140:89
```

**Macro Definition (macros.ts:375-415):**
```typescript
'macro:breathingDots': {
  blocks: [
    { ref: 'domain', type: 'DomainN', ... },
    { ref: 'grid', type: 'PositionMapGrid', ... },
    { ref: 'clock', type: 'PhaseClockLegacy', ... }, // ❌ BROKEN - doesn't exist
    { ref: 'render', type: 'RenderInstances2D', ... },
  ],
  // ...
}
```

## Verdict: INCOMPLETE

**Critical blocker:** macro:breathingDots cannot be used because it references a non-existent block type.

## What Needs to Change

### 1. Fix macro:breathingDots expansion (CRITICAL)

**File:** `src/editor/macros.ts:386`

**Problem:** References non-existent "PhaseClockLegacy" block

**Solution:** Replace with CycleTimeRoot (which auto-publishes phase to phaseA bus)

**Before:**
```typescript
{ ref: 'clock', type: 'PhaseClockLegacy', laneKind: 'Phase', label: 'Breathing Clock',
  params: { duration: 2, mode: 'pingpong', offset: 0 } },
```

**After:**
```typescript
{ ref: 'clock', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Breathing Clock',
  params: { periodMs: 2000, mode: 'loop' } },
```

**Note:** CycleTimeRoot auto-publishes `phase` → `phaseA` bus, so the existing publisher may need review.

### 2. Verify bus publication (REVIEW NEEDED)

**Current publishers (macros.ts:401-404):**
```typescript
publishers: [
  { fromRef: 'clock', fromSlot: 'phase', busName: 'phaseA' },
],
```

**Question:** Does CycleTimeRoot already auto-publish to phaseA? If so, this publisher may be redundant or cause conflicts.

**Action:** Check if manual publication is still needed or should be removed.

## Runtime Validation Skipped

**Reason:** Cannot perform runtime validation with Chrome DevTools MCP (not available in current environment).

**Alternative approach taken:** Code review + test execution verification.

**Limitation:** Without runtime validation, cannot confirm:
- Actual visual output
- Animation smoothness
- Bus routing behavior
- User interaction (clicking macro in UI)

## Missing Checks (implementer should create)

1. **Runtime smoke test** (`tests/e2e/macro-expansion.test.ts`)
   - Load each macro by clicking in UI
   - Verify no console errors
   - Capture screenshot of animation
   - Should complete in <30 seconds per macro

2. **Bus integration test** (`tests/unit/macro-bus-routing.test.ts`)
   - Verify CycleTimeRoot auto-publication to phaseA
   - Check for duplicate publishers (manual vs auto)
   - Confirm lens transformations apply correctly

## Questions Needing Answers

1. **CycleTimeRoot bus behavior:** Does CycleTimeRoot auto-publish to phaseA bus? If so, should manual publishers in macro definitions be removed?

2. **Legacy block migration:** Are there other macros using legacy block types that need migration?

3. **Parameter mapping:** PhaseClockLegacy used `duration`, `mode: 'pingpong'`, `offset`. CycleTimeRoot uses `periodMs`, `mode: 'loop'`. Is this mapping correct for the "breathing" effect?
   - Original: 2 second pingpong (4s total cycle?)
   - Replacement: 2 second loop
   - Should periodMs be 4000 to match original behavior?
