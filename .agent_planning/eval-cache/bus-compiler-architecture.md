# Bus-Aware Compiler Architecture (Cached Knowledge)

**Last Updated**: 2025-12-21 13:35
**Source**: project-evaluator (WP2 evaluation)
**Confidence**: HIGH (reviewed implementation + tests)

---

## Core Architecture

**Three-Module System**:
1. `compileBusAware.ts` - Main compilation pipeline
2. `busSemantics.ts` - Canonical ordering/combination logic
3. `lenses.ts` - Value transformation library

---

## Compilation Pipeline (compileBusAware.ts)

### Multi-Pass Compilation Flow

```
1. Validate combine modes (Signal vs Field buses)
2. Validate port existence (publishers/listeners)
3. Build wire connection index
4. Topological sort (wires AND bus dependencies)
5. Compile blocks in topo order:
   - Resolve inputs from wires OR buses
   - Apply lens stacks to bus values
   - Compile block → produce artifacts
6. Resolve final output port
7. Infer TimeModel from TimeRoot block
```

### Key Functions

**getBusValue()** (line 571):
- Collects artifacts from all publishers
- Uses `getSortedPublishers()` for determinism
- Combines using `combineSignalArtifacts()` or `combineFieldArtifacts()`
- Returns combined bus artifact

**topoSortBlocksWithBuses()** (line 99):
- Kahn's algorithm with wire AND bus edges
- Publisher blocks compile before listener blocks
- Cycle detection with helpful errors

### Lens Stack Application (lines 386-395)

```typescript
const lensStack = busListener.lensStack || (busListener.lens ? [busListener.lens] : undefined);
if (lensStack && lensStack.length > 0) {
  for (const lens of lensStack) {
    busArtifact = applyLens(busArtifact, lens);
  }
}
```

**Backward compatible**: Supports both legacy `lens` field and new `lensStack`

---

## Bus Semantics Module (busSemantics.ts)

**Purpose**: Single source of truth - prevents UI/compiler ordering divergence

### Publisher Sorting (Deterministic)

```typescript
function getSortedPublishers(busId, allPublishers, includeDisabled = false): Publisher[] {
  return [...filtered].sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;  // Primary
    return a.id.localeCompare(b.id);                            // Tie-breaker
  });
}
```

**Why This Matters**:
- BusStore and compiler previously had DIFFERENT sorting
- Same sortKey could result in different runtime order
- Non-deterministic for `last` combine mode

### Combine Modes

**Signal Buses** (`combineSignalArtifacts`):
- `last`: Highest sortKey wins (artifacts[length-1])
- `sum`: Runtime summation `(t, ctx) => sum(signals[i](t, ctx))`
- Default value for zero publishers

**Field Buses** (`combineFieldArtifacts`):
- `last`, `sum`, `average`, `max`, `min`
- Per-element combination on bulk arrays
- Handles empty publisher lists gracefully

---

## Lens System (lenses.ts)

### Available Lens Types

**Shaping Lenses** (no world change):
- `scale` - Linear transform (scale * x + offset)
- `offset` - Add constant
- `clamp` - Bound to [min, max]
- `deadzone` - Zero below threshold
- `mapRange` - Linear range mapping

**Easing Lenses** (preserve [0,1] range):
- `ease` - 12 easing functions (sine, quad, cubic, expo, elastic, bounce)
- `quantize` - Snap to discrete steps
- `warp` - Power-based phase warping

**Stateful Lenses**:
- `slew` - Rate-limited smoothing (handles scrubbing)

**World-Changing Lenses**:
- `broadcast` - Signal → Field (constant broadcast)
- `perElementOffset` - Signal → Field (with hash-based offsets)

### Lens Application Pattern

```typescript
function applyLens(artifact: Artifact, lens: LensDefinition): Artifact {
  // 1. Type guard - validate artifact.kind matches lens expectations
  // 2. Extract params with defaults
  // 3. Return new artifact with transformed value function
  // 4. Return Error artifact on type mismatch
}
```

**Type Safety**: All lenses validate input kind, return Error on mismatch

---

## Type System Integration

### TypeDesc Contract

```typescript
interface TypeDesc {
  world: 'signal' | 'field';     // World
  domain: Domain;                 // number | phase | vec2 | color | etc.
  category: 'core' | 'internal';  // User-facing vs engine
  busEligible: boolean;           // Can be used for buses
  semantics?: string;             // Optional precision ('primary', 'energy', etc.)
}
```

**Used For**:
- Port type checking
- Bus type validation
- Lens compatibility checking

### Combine Mode Validation

**Signal Buses**: Only `last`, `sum` allowed (line 52)
**Field Buses**: `last`, `sum`, `average`, `max`, `min` allowed (line 57)

Enforced at compile time with helpful error messages.

---

## Test Coverage

**Bus Compilation**: 8 tests (src/editor/__tests__/bus-compilation.test.ts)
- Multiple publishers on single bus
- Publisher ordering determinism
- Combine mode behavior
- Backward compatibility (wire-only patches)

**Lens System**: 55 tests (src/editor/__tests__/lenses.test.ts)
- Individual lens behavior
- Lens stack chaining
- Preset application
- Edge cases (boundaries, thresholds)

**Field Buses**: 8 tests (src/editor/__tests__/field-bus-compilation.test.ts)
- Per-element combination
- Field-specific combine modes

---

## Common Patterns

### Adding a New Lens

1. Add type to `LensType` union (types.ts)
2. Implement `apply<Name>Lens()` function (lenses.ts)
3. Add case to `applyLens()` switch
4. Add tests for new lens
5. Add presets if useful (lens-presets.ts)

### Adding a New Combine Mode

1. Add to SIGNAL_COMBINE_MODES or FIELD_COMBINE_MODES (compileBusAware.ts)
2. Implement in `combineSignalArtifacts()` or `combineFieldArtifacts()` (busSemantics.ts)
3. Add tests for new mode
4. Update spec docs

---

## Known Limitations

**Not Implemented** (expected, WP0/WP1 scope):
- Reserved bus name enforcement (phaseA, pulse, energy, etc.)
- TimeRoot auto-publication to canonical buses
- TypeDesc validation at compile time
- Exactly-one-TimeRoot enforcement (flag exists but disabled)

**Design Ambiguities**:
- "UiSignalBindings" mentioned in spec but not implemented (unclear if needed)
- "Adapter" vs "Lens" terminology inconsistency (spec vs code)

---

## Dependencies

**Depends On**:
- `src/editor/types.ts` - TypeDesc, Bus, Publisher, Listener
- `src/editor/compiler/types.ts` - Artifact, CompileCtx, RuntimeCtx
- `src/editor/blocks/` - Block definitions and compilers

**Used By**:
- `src/editor/compiler/compile.ts` - Main compile entry point
- `src/editor/stores/BusStore.ts` - UI uses getSortedPublishers
- UI components (Bus Board, scopes, meters)

---

## Stability Notes

**Stable** (safe to reuse):
- Bus-aware compilation pipeline architecture
- Lens system API and implementation
- busSemantics module contracts
- Publisher sorting algorithm
- Combine mode semantics

**In Flux**:
- UiSignalBindings concept (may need to implement)
- Reserved bus validation (WP0 work)
- Adapter vs Lens terminology (needs spec update)

**Reuse Confidence**: HIGH for stable parts, MEDIUM for in-flux concepts
