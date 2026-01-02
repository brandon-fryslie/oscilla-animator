# Sprint 4 Plan: Lens Param Binding Kinds in IR Mode

**Generated:** 2026-01-01
**Source TODO:** pass8-link-resolution.ts:470-471
**User Request:** Resolve lens param binding kinds (bus, wire, default) and ensure no separate code paths for 'bus'

---

## Skipped Tests (Sprint 3)

The following tests are skipped because they use the `scale` lens which exists in legacy
`src/editor/lenses/index.ts` but is NOT registered in the new `TRANSFORM_REGISTRY`.

Error: `{ code: 'NotImplemented', message: 'Unknown lens: scale' }`

1. `composite.expansion.test.ts` - B1: listener to composite boundary input remaps to internal primitive port
2. `composite.expansion.test.ts` - B5: lens transformation preserved after rewrite
3. `composite.expansion.test.ts` - D1: same patch compiled twice produces identical results
4. `composite.expansion.test.ts` - D2: adding unrelated block does not change composite expansion IDs
5. `composite-library.test.ts` - DotsRenderer composite with bus-driven radius compiles

All use `type: 'scale'` lens with `{ scale: 12, offset: 8 }` params.

**Resolution options:**
- Register scale lens in TRANSFORM_REGISTRY, OR
- Migrate tests to use transforms already in the registry

---

## Problem Statement

Currently, pass8-link-resolution.ts only supports `literal` lens param bindings:

```typescript
// Line 465-471
if (binding.kind === 'literal') {
  const constId = builder.allocConstId(binding.value);
  paramsMap[paramId] = { k: 'scalarConst', constId };
}
// TODO: Handle other binding kinds (bus, wire, default) in future sprints
// For now, only literal bindings are supported in IR mode
```

The `LensParamBinding` type has 4 kinds:
1. `literal` - Static value (currently supported)
2. `default` - References a DefaultSourceState value
3. `wire` - References a port output with optional transforms
4. `bus` - References a bus value with optional transforms

---

## Implementation Plan

### P0: Handle `default` Binding Kind

The simplest binding kind - just looks up a DefaultSourceState value and treats it as a literal.

**Location:** pass8-link-resolution.ts, `applyLensStep()` function

**Implementation:**
```typescript
case 'default': {
  const source = defaultSources.get(binding.defaultSourceId);
  if (source == null) {
    errors.push({
      code: 'MissingDefaultSource',
      message: `Lens param references unknown default source: ${binding.defaultSourceId}`,
    });
    continue; // Skip this param
  }
  const constId = builder.allocConstId(source.value);
  paramsMap[paramId] = { k: 'scalarConst', constId };
  break;
}
```

**Required Changes:**
1. Pass `defaultSources: Map<string, DefaultSourceState>` to `applyLensStep()`
2. Add case for `binding.kind === 'default'`

**Testing:**
- Test lens with default source param compiles
- Test missing default source produces clear error

---

### P1: Handle `bus` Binding Kind

A lens param bound to a bus receives the combined bus value at runtime.

**Location:** pass8-link-resolution.ts, `applyLensStep()` function

**Implementation:**
```typescript
case 'bus': {
  const busIdx = busIdToIndex.get(binding.busId);
  if (busIdx === undefined) {
    errors.push({
      code: 'UnknownBus',
      message: `Lens param references unknown bus: ${binding.busId}`,
    });
    continue;
  }
  const busRef = busRoots.get(busIdx);
  if (busRef === undefined) {
    errors.push({
      code: 'BusNotCompiled',
      message: `Bus ${binding.busId} not yet compiled`,
    });
    continue;
  }

  // Apply any transforms on the bus binding
  let paramRef = busRef;
  if (binding.adapterChain || binding.lensStack) {
    const transforms = convertLegacyTransforms(binding.lensStack, binding.adapterChain);
    paramRef = applyTransforms(paramRef, transforms, builder, errors,
      `bus binding for lens param ${paramId}`);
  }

  paramsMap[paramId] = paramRef;
  break;
}
```

**Required Changes:**
1. Pass `busIdToIndex` and `busRoots` to `applyLensStep()`
2. Add case for `binding.kind === 'bus'`
3. Handle nested transforms on bus binding

**Testing:**
- Test lens with bus-bound param receives bus value
- Test bus binding with transforms
- Test unknown bus produces clear error

---

### P2: Handle `wire` Binding Kind

A lens param bound to a wire receives a block output value.

**Location:** pass8-link-resolution.ts, `applyLensStep()` function

**Implementation:**
```typescript
case 'wire': {
  // Look up the output value from the referenced port
  const sourceBlock = blockMap.get(binding.from.blockId);
  if (sourceBlock === undefined) {
    errors.push({
      code: 'UnknownBlock',
      message: `Lens param wire references unknown block: ${binding.from.blockId}`,
    });
    continue;
  }

  const outputRef = outputValues.get(`${binding.from.blockId}:${binding.from.slotId}`);
  if (outputRef === undefined) {
    errors.push({
      code: 'OutputNotCompiled',
      message: `Block ${binding.from.blockId} output ${binding.from.slotId} not yet compiled`,
    });
    continue;
  }

  // Apply any transforms on the wire binding
  let paramRef = outputRef;
  if (binding.adapterChain || binding.lensStack) {
    const transforms = convertLegacyTransforms(binding.lensStack, binding.adapterChain);
    paramRef = applyTransforms(paramRef, transforms, builder, errors,
      `wire binding for lens param ${paramId}`);
  }

  paramsMap[paramId] = paramRef;
  break;
}
```

**Required Changes:**
1. Pass `outputValues: Map<string, ValueRefPacked>` to `applyLensStep()`
2. Add case for `binding.kind === 'wire'`
3. Handle nested transforms on wire binding

**Testing:**
- Test lens with wire-bound param receives block output
- Test wire binding with transforms
- Test unknown block/port produces clear error

---

## Code Path Audit: Bus-Specific Paths

The user requested: "Ensure there are no separate code paths in the compiler for 'bus'"

**Current Bus-Specific Code Paths:**

1. **pass7-bus-lowering.ts** - REQUIRED
   - Lowers BusBlocks to combine nodes
   - This is necessary bus functionality, not legacy code

2. **pass8-link-resolution.ts:577-584** - REQUIRED
   - Creates busIdToIndex map for listeners
   - Necessary for bus→port connections

3. **pass8-link-resolution.ts:730-741** - REQUIRED
   - Resolves bus references for listeners
   - Necessary for bus→port connections

4. **LensParamBinding.kind === 'bus'** - NEW (this sprint)
   - Adding proper support for bus bindings on lens params

**Conclusion:** There are no *unnecessary* separate bus code paths. The bus-related code in pass7 and pass8 implements legitimate bus functionality (combining, subscription). Sprint 4 adds proper bus binding support to eliminate the TODO.

---

## Implementation Order

1. **Week 1:** P0 (default bindings) + P1 (bus bindings)
   - These are simpler as they reference existing values

2. **Week 2:** P2 (wire bindings) + Testing
   - Wire bindings require topological ordering consideration
   - May need to ensure referenced blocks are compiled first

---

## Success Criteria

- [ ] All 4 LensParamBinding kinds handled in IR mode
- [ ] TODO at pass8:470-471 removed
- [ ] Tests: lens with default param compiles
- [ ] Tests: lens with bus param receives bus value
- [ ] Tests: lens with wire param receives block output
- [ ] Tests: proper error messages for missing refs
- [ ] No regressions in existing tests
- [ ] No unnecessary duplicate bus code paths

---

## Dependencies

- Sprint 3 (transforms migration) must be complete ✓
- `convertLegacyTransforms()` available for nested transforms
- `applyTransforms()` available for applying nested transforms

---

**Generated by:** planning session
**Status:** Ready for review
