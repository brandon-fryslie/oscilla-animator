# Sprint 4 Plan: Lens Parameter Binding Resolution
**Generated**: 2026-01-01-082134
**Source**: STATUS-2026-01-01-sprint34.md
**Topic**: bus-block-unification
**Sprint**: 4 of 4
**Depends on**: Sprint 3 complete

---

## Executive Summary

**Sprint Goal**: Resolve the TODO at `pass8-link-resolution.ts:469-470` - implement full lens parameter binding support for wire, default, and bus sources.

**Current State**: Only `literal` lens param bindings are implemented. Wire/default/bus bindings are TODO.

**Blockers**: Sprint 3 must complete FIRST because bus bindings require BusBlock infrastructure from Pass 7.

**Scope**: Complete lens parameter binding implementation so lenses can read from any value source (wire, bus, default, literal).

---

## Background: Lens Parameter Bindings

### What Are Lens Parameters?
Lenses are composable transforms that can be parameterized. For example, a "scale" lens might have a `factor` parameter. That parameter can be bound to:
- **Literal**: A constant value (e.g., `2.0`)
- **Wire**: An output from another block (e.g., `oscillator.out`)
- **Bus**: The combined value from a bus (e.g., `speedBus`)
- **Default**: A default source definition (e.g., `defaultScale`)

### Current State (Sprint 3 End)
**Location**: `src/editor/compiler/passes/pass8-link-resolution.ts:464-472`

```typescript
// Convert lens params to ValueRefPacked
const paramsMap: Record<string, ValueRefPacked> = {};
for (const [paramId, binding] of Object.entries(lensInstance.params)) {
  if (binding.kind === 'literal') {
    // Convert literal values to scalar constants
    const constId = builder.allocConstId(binding.value);
    paramsMap[paramId] = { k: 'scalarConst', constId };
  }
  // TODO: Handle other binding kinds (bus, wire, default) in future sprints
  // For now, only literal bindings are supported in IR mode
}
```

**Problem**: Wire, bus, and default bindings are not handled. Lenses with these bindings fail to compile.

### LensParamBinding Type
**Source**: `src/editor/types.ts:230-234`

```typescript
export type LensParamBinding =
  | { kind: 'default'; defaultSourceId: string }
  | { kind: 'wire'; from: PortRef; adapterChain?: AdapterStep[]; lensStack?: LensInstance[] }
  | { kind: 'bus'; busId: string; adapterChain?: AdapterStep[]; lensStack?: LensInstance[] }
  | { kind: 'literal'; value: unknown };
```

**Note**: `adapterChain` and `lensStack` are DEPRECATED fields (Track A.5 removed these). Implementation should ignore them.

---

## Scope

### In Scope (This Sprint)
1. **P0**: Wire bindings - lens params connected to block outputs
2. **P1**: Default bindings - lens params using default sources
3. **P2**: Bus bindings - lens params reading from buses (BLOCKED by Sprint 3)
4. **P3**: Remove TODO comment and update documentation

### Explicitly Out of Scope
- Adapter chain handling (deprecated, Track A.5)
- Lens stack handling (deprecated, Track A.5)
- New lens types or lens composition features
- Performance optimization of lens param resolution

---

## Work Items

### P0: Wire Bindings

**Status**: Not Started
**Effort**: Medium (2-3 hours)
**Dependencies**: Sprint 3 complete (for stable test suite)
**Spec Reference**: CLAUDE.md § "Lenses are composable" • **Status Reference**: STATUS-2026-01-01-sprint34.md § "Sprint 4 Scope"

#### Description
Implement wire binding resolution for lens parameters. When a lens param is bound to a block output port, resolve that output to a `ValueRefPacked` and use it as the param value.

#### Acceptance Criteria
- [ ] Wire binding case added to lens param loop (pass8-link-resolution.ts)
- [ ] Block output resolved via `blockOutputs.get()` lookup
- [ ] Output converted to `ValueRefPacked` via `artifactToValueRef()`
- [ ] Deprecated fields (`adapterChain`, `lensStack`) ignored with comment
- [ ] TypeScript compilation succeeds
- [ ] Test added: lens param bound to oscillator output
- [ ] Test passes: lens receives correct value from wire
- [ ] Manual verification: wire-bound lens param works in dev server
- [ ] Commit references Sprint 4 P0

#### Technical Notes
**Implementation**:
```typescript
if (binding.kind === 'wire') {
  // Resolve the wire source to a ValueRefPacked
  const sourceBlockIdx = blockIdToIndex.get(binding.from.blockId);
  if (sourceBlockIdx === undefined) {
    // Block not found - emit error diagnostic
    addError(`Lens param wire binding references unknown block: ${binding.from.blockId}`);
    continue;
  }

  const sourceArtifact = blockOutputs.get(sourceBlockIdx)?.get(binding.from.slotId);
  if (!sourceArtifact) {
    // Output not found - emit error diagnostic
    addError(`Lens param wire binding references unknown output: ${binding.from.slotId}`);
    continue;
  }

  // Convert artifact to ValueRefPacked
  let valueRef = artifactToValueRef(
    sourceArtifact,
    builder,
    binding.from.blockId,
    binding.from.slotId
  );

  // DEPRECATED: adapterChain and lensStack are ignored (Track A.5 removed these)
  // binding.adapterChain - not implemented
  // binding.lensStack - not implemented

  paramsMap[paramId] = valueRef;
}
```

**Error Handling**: If wire source is invalid, emit compile error diagnostic and skip the binding. Lens will fail to compile.

**Testing Strategy**:
1. Create golden patch with lens using wire-bound param
2. Verify IR compilation produces correct ValueRefPacked reference
3. Verify runtime receives correct value from wire

**Risk**: Wire might not be resolved yet if there's a circular dependency. Mitigation: Pass 8 runs after all blocks lowered, so outputs should exist.

---

### P1: Default Bindings

**Status**: Not Started
**Effort**: Medium (2-3 hours)
**Dependencies**: Sprint 3 complete
**Spec Reference**: CLAUDE.md § "Default sources" • **Status Reference**: STATUS-2026-01-01-sprint34.md § "Sprint 4 Scope"

#### Description
Implement default binding resolution for lens parameters. When a lens param uses a default source, look up the default source definition and create an appropriate `ValueRefPacked`.

#### Acceptance Criteria
- [ ] Default binding case added to lens param loop
- [ ] Default source definition looked up from patch
- [ ] Default value converted to `ValueRefPacked` (scalar const or expression)
- [ ] TypeScript compilation succeeds
- [ ] Test added: lens param using default source
- [ ] Test passes: lens receives correct default value
- [ ] Manual verification: default-bound lens param works in dev server
- [ ] Commit references Sprint 4 P1

#### Technical Notes
**Implementation**:
```typescript
if (binding.kind === 'default') {
  // Look up default source definition
  const defaultSource = patch.defaultSources?.find(ds => ds.id === binding.defaultSourceId);
  if (!defaultSource) {
    addError(`Lens param default binding references unknown source: ${binding.defaultSourceId}`);
    continue;
  }

  // Create ValueRefPacked from default source
  // This is similar to how default sources work for block inputs
  const valueRef = createDefaultValueRef(defaultSource, builder);

  paramsMap[paramId] = valueRef;
}
```

**Helper Function Needed**: `createDefaultValueRef(defaultSource, builder)` might not exist. Check if default source handling already exists in compiler. If not, implement:
```typescript
function createDefaultValueRef(
  defaultSource: DefaultSource,
  builder: IRBuilder
): ValueRefPacked {
  // If default source is a constant
  if (defaultSource.kind === 'const') {
    const constId = builder.allocConstId(defaultSource.value);
    return { k: 'scalarConst', constId };
  }

  // If default source is an expression (future extension)
  // Handle other default source kinds as needed

  throw new Error(`Unsupported default source kind: ${defaultSource.kind}`);
}
```

**Unknown**: Check if `DefaultSource` type exists and how it's structured. May need to reference existing default source handling code in the compiler.

**Testing Strategy**:
1. Create golden patch with lens using default-bound param
2. Verify IR compilation creates correct constant
3. Verify runtime uses default value

---

### P2: Bus Bindings (BLOCKED by Sprint 3)

**Status**: Not Started
**Effort**: Medium (2-4 hours)
**Dependencies**: Sprint 3 complete (requires busRoots map from Pass 7)
**Spec Reference**: CLAUDE.md § "Buses are BusBlocks" • **Status Reference**: STATUS-2026-01-01-sprint34.md § "Sprint 4 Scope"

#### Description
Implement bus binding resolution for lens parameters. When a lens param reads from a bus, look up the bus combine result from Pass 7's `busRoots` map and use it as the param value.

#### Acceptance Criteria
- [ ] Bus binding case added to lens param loop
- [ ] BusBlock looked up by busId
- [ ] Bus combine result retrieved from `busRoots` map
- [ ] TypeScript compilation succeeds
- [ ] Test added: lens param bound to bus
- [ ] Test passes: lens receives correct bus combine value
- [ ] Manual verification: bus-bound lens param works in dev server
- [ ] Commit references Sprint 4 P2

#### Technical Notes
**Implementation**:
```typescript
if (binding.kind === 'bus') {
  // After Sprint 3, buses are BusBlocks
  // Look up the bus block
  const busBlock = patch.blocks.find(b =>
    b.type === 'BusBlock' && b.params.busId === binding.busId
  );

  if (!busBlock) {
    addError(`Lens param bus binding references unknown bus: ${binding.busId}`);
    continue;
  }

  // Get the bus combine result from busRoots (populated by Pass 7)
  const busBlockIdx = blockIdToIndex.get(busBlock.id);
  if (busBlockIdx === undefined) {
    addError(`Bus block not indexed: ${busBlock.id}`);
    continue;
  }

  const busValueRef = busRoots.get(busBlockIdx);
  if (!busValueRef) {
    addError(`Bus combine result not found for: ${binding.busId}`);
    continue;
  }

  // DEPRECATED: adapterChain and lensStack are ignored (Track A.5 removed these)

  paramsMap[paramId] = busValueRef;
}
```

**Critical Dependency**: This requires `busRoots` map from Pass 7. Pass 7 must run BEFORE Pass 8, which it already does. Sprint 3 ensures Pass 7 creates `busRoots` map correctly.

**Verify**: Check that Pass 7 (`pass7-bus-lowering.ts`) populates `busRoots` map with combine results for all BusBlocks.

**Testing Strategy**:
1. Create golden patch with lens reading from bus
2. Bus has multiple publishers (test combine modes)
3. Verify lens receives combined bus value
4. Test with latest, merge, and array combine modes

---

### P3: Documentation & Cleanup

**Status**: Not Started
**Effort**: Small (30 minutes)
**Dependencies**: P0, P1, P2 complete
**Spec Reference**: N/A • **Status Reference**: STATUS-2026-01-01-sprint34.md § "Sprint 4 Scope"

#### Description
Remove the TODO comment and update documentation to reflect full lens param binding support.

#### Acceptance Criteria
- [ ] TODO comment removed (pass8-link-resolution.ts:469-470)
- [ ] Comment added explaining all binding kinds are supported
- [ ] Comment explains deprecated fields (adapterChain, lensStack) are ignored
- [ ] No other TODOs related to lens params remain
- [ ] Commit references Sprint 4 P3

#### Technical Notes
**Before**:
```typescript
// TODO: Handle other binding kinds (bus, wire, default) in future sprints
// For now, only literal bindings are supported in IR mode
```

**After**:
```typescript
// All lens param binding kinds are supported:
// - literal: Compile-time constant
// - wire: Output from another block
// - default: Default source definition
// - bus: Combined value from a bus (BusBlock.out)
//
// Note: adapterChain and lensStack fields are deprecated (Track A.5)
// and are ignored by this implementation.
```

---

## Dependencies & Execution Order

```
Sprint 3 (complete) ✅
         ↓
P0: Wire bindings
         ↓
P1: Default bindings
         ↓
P2: Bus bindings (requires Sprint 3 busRoots)
         ↓
P3: Documentation cleanup
```

**Critical Path**: Sprint 3 → P0 → P1 → P2 → P3

**Parallelization**: P0 and P1 can be done in parallel (independent). P2 must wait for Sprint 3. P3 must wait for all others.

**Why Sequential**: Each binding kind builds on understanding from previous. Start simple (wire), then default, then bus (most complex).

---

## Risks & Mitigation

### Risk 1: Sprint 3 Incomplete (HIGH)
**Description**: Bus bindings cannot be implemented until Sprint 3 completes
**Impact**: P2 blocked, sprint cannot fully complete
**Mitigation**:
- Sprint 3 is a hard dependency - do not start Sprint 4 until Sprint 3 DOD satisfied
- P0 and P1 can proceed independently (wire/default don't need busRoots)
- If Sprint 3 is delayed, implement P0/P1 first

---

### Risk 2: Default Source Infrastructure Missing (MEDIUM)
**Description**: Default source handling might not exist in compiler yet
**Impact**: P1 requires additional infrastructure work
**Mitigation**:
- Search codebase for existing default source handling
- If missing, implement minimal `createDefaultValueRef()` helper
- Start with simple const-only default sources
- Extend as needed

---

### Risk 3: Circular Dependencies in Wire Bindings (LOW)
**Description**: Wire source might not be resolved yet if there's a cycle
**Impact**: Wire binding fails to resolve
**Mitigation**:
- Pass 8 runs after all blocks lowered, so outputs should exist
- Emit clear error diagnostic if wire source not found
- Compiler will detect and report circular dependencies elsewhere

---

### Risk 4: Adapter Chain / Lens Stack Handling (LOW)
**Description**: Some patches might have deprecated adapterChain/lensStack fields
**Impact**: Unexpected behavior if these fields are populated
**Mitigation**:
- Add comment explaining these are deprecated and ignored
- Track A.5 already removed these fields from UI
- Existing patches should not have these fields populated
- If they do, they're silently ignored (safe default)

---

## Success Metrics

- [ ] All lens param binding kinds supported (literal, wire, default, bus)
- [ ] TODO comment removed from pass8-link-resolution.ts
- [ ] Tests exist for all three new binding kinds
- [ ] Golden patch with lens params compiles successfully
- [ ] IR compilation produces correct ValueRefPacked for all bindings
- [ ] ~80-120 lines of implementation code added
- [ ] ~150 lines of test code added
- [ ] Zero TypeScript errors
- [ ] All tests pass

---

## Code Addition Estimate

### Additions:
- Wire binding handling: ~30 lines
- Default binding handling: ~30 lines
- Bus binding handling: ~40 lines
- Documentation: ~10 lines
- Tests (wire): ~50 lines
- Tests (default): ~50 lines
- Tests (bus): ~50 lines

**Total**: ~260 lines added

**Net Change**: +260 lines (feature addition, no deletions expected)

---

## Testing Strategy

### Unit Tests
Create test file: `src/editor/compiler/__tests__/lens-param-bindings.test.ts`

**Test Cases**:
1. Literal binding (baseline - already works)
2. Wire binding to oscillator output
3. Wire binding to transform output
4. Default binding to scalar constant
5. Bus binding to latest-mode bus
6. Bus binding to merge-mode bus
7. Bus binding to array-mode bus
8. Error: wire to non-existent block
9. Error: wire to non-existent output
10. Error: default source not found
11. Error: bus not found

### Integration Tests
**Golden Patch**: Create patch with lens using all binding kinds
- Lens param 1: literal (2.0)
- Lens param 2: wire (from oscillator.out)
- Lens param 3: default (from defaultScale)
- Lens param 4: bus (from speedBus)

**Verify**:
- Patch compiles without errors
- IR contains correct ValueRefPacked references
- Runtime evaluation produces correct values

### Manual Testing (in `just dev`)
- [ ] Create lens with wire-bound param
- [ ] Connect wire to oscillator output
- [ ] Verify lens receives oscillator value
- [ ] Create lens with default-bound param
- [ ] Verify lens uses default value
- [ ] Create lens with bus-bound param
- [ ] Verify lens receives bus combine value
- [ ] Scrub timeline - lens params update correctly

---

## Final State After Sprint 4

**Lens Params**: Full binding support for literal, wire, default, and bus sources.

**Compiler**: No TODOs related to lens param bindings.

**Testing**: Comprehensive test coverage for all binding kinds.

**Documentation**: Clear comments explaining all binding kinds and deprecated fields.

**Architecture**: Lenses are fully composable with any value source.

---

## Relationship to Track A (Adapter Removal)

**Context**: Track A.5 removed adapter chains and lens stacks from the UI. These fields are deprecated in the type system but might still exist in old patches.

**Implementation Strategy**:
- Ignore `adapterChain` field if present
- Ignore `lensStack` field if present
- Add comment explaining deprecation
- Do NOT throw error if these fields exist (graceful degradation)

**Future Cleanup**: After all patches migrated to new format, these fields can be removed from `LensParamBinding` type entirely (separate sprint).

---

## Recommended Implementation Order

1. **Start with P0 (wire bindings)**: Most common case, easiest to test
2. **Then P1 (default bindings)**: Requires investigating default source infrastructure
3. **Then P2 (bus bindings)**: Most complex, requires Sprint 3 complete
4. **Finally P3 (documentation)**: Quick cleanup after all working

**Checkpoint After Each**: Commit and run full test suite after each P-item completes.

---

**Files Generated**: PLAN-2026-01-01-sprint4-lens-bindings.md, DOD-2026-01-01-sprint4-lens-bindings.md
