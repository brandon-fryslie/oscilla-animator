# WP0 Validation Rules Knowledge
**Cached**: 2025-12-21 13:35
**Source**: project-evaluator
**Confidence**: FRESH

## Current Validation Infrastructure

### Semantic Validator Location
`src/editor/semantic/validator.ts`

**Entry Point**: `Validator.validateAll(patch: PatchDocument)`

**Implemented Rules**:
1. Exactly one TimeRoot (✅ COMPLETE)
2. No multiple writers (✅ COMPLETE)
3. Type compatibility on connections (✅ COMPLETE)
4. No cycles (✅ COMPLETE)
5. All endpoints exist (✅ COMPLETE)
6. Empty bus warnings (✅ COMPLETE)

**Missing Rules**:
- TypeDesc enforcement
- Reserved bus validation
- TimeRoot upstream dependency check
- Composite TimeRoot constraint

### Diagnostic System
- Uses structured Diagnostic type from `src/editor/diagnostics/types.ts`
- Diagnostic codes: E_TIME_ROOT_MISSING, E_TIME_ROOT_MULTIPLE, E_INVALID_CONNECTION, E_TYPE_MISMATCH, E_CYCLE_DETECTED
- Returns `ValidationResult` with errors and warnings

### Integration Points
- `compilePatchWireOnly()` calls validator (warn-only mode)
- Should be called from `compileBusAwarePatch()` (enforcement mode)

## Reserved Bus Specifications

From `design-docs/3-Synthesized/03-Buses.md`:

| Bus | TypeDesc | Combine | Required For |
|-----|----------|---------|--------------|
| phaseA | Signal<phase>, semantics='primary' | last | CycleTimeRoot |
| phaseB | Signal<phase>, semantics='secondary' | last | - |
| pulse | Event, semantics='pulse' | or | CycleTimeRoot |
| energy | Signal<number>, semantics='energy' | sum | - |
| progress | Signal<unit>, semantics='progress' | last | FiniteTimeRoot |
| palette | Signal<color> | last | - |

**Auto-Publication**:
- CycleTimeRoot auto-publishes: phase→phaseA, wrap→pulse
- FiniteTimeRoot auto-publishes: progress→progress

## TypeDesc System

### Interface
```typescript
interface TypeDesc {
  world: 'signal' | 'field'
  domain: CoreDomain | InternalDomain
  category: 'core' | 'internal'
  busEligible: boolean
  semantics?: string
  unit?: string
}
```

### Utility Functions
- `isDirectlyCompatible(a, b)` - checks world + domain match
- `isBusEligible(typeDesc)` - checks busEligible && category === 'core'
- `validateDefaultValue(typeDesc, value)` - type-checks values

## TimeRoot Constraints

From `design-docs/3-Synthesized/02-Time-Architecture.md`:

1. Exactly one TimeRoot per patch
2. TimeRoot cannot have upstream dependencies
3. TimeRoot cannot exist inside composites
4. TimeRoot types: FiniteTimeRoot, CycleTimeRoot, InfiniteTimeRoot

**Current Status**:
- Rule 1: ✅ Enforced
- Rule 2: ❌ Not implemented
- Rule 3: ❌ Not implemented

## Bus Validation (Partial)

### Combine Mode Validation
Location: `src/editor/compiler/compileBusAware.ts` (lines 231-253)

**Signal buses**: last, sum
**Field buses**: last, sum, average, max, min

### Publisher Ordering
Location: `src/editor/semantic/busSemantics.ts`

Canonical function: `getSortedPublishers(busId, allPublishers, includeDisabled)`

Sort order:
1. sortKey ascending
2. id.localeCompare (tie-breaker)
