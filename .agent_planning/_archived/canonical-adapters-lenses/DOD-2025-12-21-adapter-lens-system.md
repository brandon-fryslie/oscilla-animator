# Definition of Done: Canonical Adapter and Lens System

**Generated**: 2025-12-21
**Status**: Draft

## Overview

This document defines concrete, testable acceptance criteria for the canonical adapter and lens system implementation. Each criterion is specific, measurable, and verifiable.

## Core Acceptance Criteria

### 1. Type System Separation ✅

**DOD**: The system cleanly separates adapters (type compatibility) from lenses (type-preserving expression).

**Verification Tests**:
```typescript
// Test 1.1: Adapters can change TypeDesc
expect(adapterRegistry.get('ReduceFieldToSignal')?.inputType.world).toBe('field');
expect(adapterRegistry.get('ReduceFieldToSignal')?.outputType.world).toBe('signal');

// Test 1.2: Lenses preserve TypeDesc
lensRegistry.getAll().forEach(lens => {
  expect(lens.inputType.world).toBe(lens.outputType.world);
  expect(lens.inputType.domain).toBe(lens.outputType.domain);
});

// Test 1.3: Publisher can have both adapterChain and lensStack
const publisher: Publisher = {
  id: 'test',
  busId: 'energy',
  from: { blockId: 'a', slotId: 'out', dir: 'output' },
  adapterChain: [{ adapterId: 'ConstToSignal', policy: 'AUTO', cost: 'cheap' }],
  lensStack: [{ lensId: 'gain', params: {}, enabled: true }],
  enabled: true,
  sortKey: 0
};
expect(publisher.adapterChain).toBeDefined();
expect(publisher.lensStack).toBeDefined();
```

### 2. Auto-Adapter Selection Algorithm ✅

**DOD**: System automatically finds adapter paths with correct policy enforcement.

**Verification Tests**:
```typescript
// Test 2.1: Direct compatibility returns empty path
const path1 = adapterRegistry.findPath(
  { world: 'signal', domain: 'number', category: 'core', busEligible: true },
  { world: 'signal', domain: 'number', category: 'core', busEligible: true },
  { edgeKind: 'wire', allowHeavy: false, allowExplicit: false }
);
expect(path1?.steps).toEqual([]);

// Test 2.2: AUTO adapters are automatically selected
const path2 = adapterRegistry.findPath(
  { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
  { world: 'signal', domain: 'number', category: 'core', busEligible: true },
  { edgeKind: 'wire', allowHeavy: false, allowExplicit: false }
);
expect(path2?.steps[0].adapterId).toBe('ConstToSignal');
expect(path2?.steps[0].policy).toBe('AUTO');

// Test 2.3: SUGGEST adapters are not auto-selected
const path3 = adapterRegistry.findPath(
  { world: 'signal', domain: 'number', category: 'core', busEligible: true },
  { world: 'signal', domain: 'phase', category: 'core', busEligible: true },
  { edgeKind: 'wire', allowHeavy: false, allowExplicit: false }
);
expect(path3).toBeNull(); // Should not auto-suggest

// Test 2.4: Path length limited to 2 steps
const allPaths = findAllPathsUpToLength2(mockTypes.from, mockTypes.to);
allPaths.forEach(path => {
  expect(path.steps.length).toBeLessThanOrEqual(2);
});
```

### 3. Lens Parameter Default Sources ✅

**DOD**: All lens parameters are animatable bindings, not constants.

**Verification Tests**:
```typescript
// Test 3.1: Lens params always use bindings
const gainLens: LensInstance = {
  lensId: 'gain',
  params: {
    gain: { kind: 'default', defaultSourceId: 'ds:listener:0:gain' },
    bias: { kind: 'bus', busId: 'energy' }
  },
  enabled: true
};

// Test 3.2: Default sources are created automatically
const listener = busStore.addListener(...);
expect(defaultSourceStore.get(`ds:${listener.id}:0:gain`)).toBeDefined();

// Test 3.3: Default sources can be updated
defaultSourceStore.update('ds:test:0:gain', 2.0);
expect(defaultSourceStore.get('ds:test:0:gain')?.value).toBe(2.0);

// Test 3.4: Wire bindings resolve correctly
const wireBinding: LensParamBinding = {
  kind: 'wire',
  from: { blockId: 'osc', slotId: 'freq', dir: 'output' }
};
const artifact = await bindingResolver.resolveLensParam(wireBinding, mockContext);
expect(artifact.kind).not.toBe('Error');
```

### 4. Evaluation Order ✅

**DOD**: Evaluation follows strict order: output → publisher adapter → publisher lens → bus combine → listener adapter → listener lens

**Verification Test**:
```typescript
// Create publisher with adapter and lens
const pubWithStack = createPublisher({
  output: { value: 5, type: 'Const:number' },
  adapterChain: [{ adapterId: 'ConstToSignal', params: {} }],
  lensStack: [{ lensId: 'gain', params: { gain: 2 } }]
});

// Create listener with adapter and lens
const listenerWithStack = createListener({
  adapterChain: [],
  lensStack: [{ lensId: 'offset', params: { amount: 10 } }]
});

// Compile and verify order
const result = await compileFullPath(pubWithStack, listenerWithStack);
// Expected: 5 → Signal → gain(5*2=10) → bus → offset(10+10=20)
expect(result.value).toBe(20);
```

### 5. Canonical Adapter Registry ✅

**DOD**: All adapters from design doc 19 are implemented and catalogued.

**Verification Checklist**:
- [ ] `ConstToSignal` (AUTO, cheap) - scalar → signal
- [ ] `BroadcastScalarToField` (AUTO, medium) - scalar → field
- [ ] `BroadcastSignalToField` (AUTO, medium) - signal → field
- [ ] `ReduceFieldToSignal` (EXPLICIT, heavy) - field → signal
- [ ] `NormalizeToPhase` (SUGGEST, cheap) - number → phase
- [ ] `PhaseToNumber` (AUTO, cheap) - phase → number
- [ ] `NumberToDurationMs` (SUGGEST, cheap) - number → duration
- [ ] `DurationToNumberMs` (AUTO, cheap) - duration → number

```typescript
// Test each adapter exists with correct metadata
const requiredAdapters = [
  { id: 'ConstToSignal', policy: 'AUTO', cost: 'cheap' },
  { id: 'BroadcastSignalToField', policy: 'AUTO', cost: 'medium' },
  { id: 'ReduceFieldToSignal', policy: 'EXPLICIT', cost: 'heavy' },
  // ... others
];

requiredAdapters.forEach(({ id, policy, cost }) => {
  const adapter = adapterRegistry.get(id);
  expect(adapter).toBeDefined();
  expect(adapter?.policy).toBe(policy);
  expect(adapter?.cost).toBe(cost);
});
```

### 6. Domain-Specific Lens Catalogs ✅

**DOD**: Lenses are organized by domain with publisher/listener restrictions.

**Verification Tests**:
```typescript
// Test 6.1: Number domain lenses
const numberLenses = lensRegistry.getLensesForDomain('number', 'listener');
expect(numberLenses.some(l => l.id === 'ease')).toBe(true);
expect(numberLenses.some(l => l.id === 'mapRange')).toBe(true);

// Test 6.2: Publisher vs listener restrictions
const publisherLenses = lensRegistry.getLensesForDomain('number', 'publisher');
const listenerLenses = lensRegistry.getLensesForDomain('number', 'listener');

// ease should be listener-only
expect(publisherLenses.some(l => l.id === 'ease')).toBe(false);
expect(listenerLenses.some(l => l.id === 'ease')).toBe(true);

// gain should be both
expect(publisherLenses.some(l => l.id === 'gain')).toBe(true);
expect(listenerLenses.some(l => l.id === 'gain')).toBe(true);

// Test 6.3: Phase domain lenses
const phaseLenses = lensRegistry.getLensesForDomain('phase', 'publisher');
expect(phaseLenses.some(l => l.id === 'phaseOffset')).toBe(true);
expect(phaseLenses.some(l => l.id === 'pingPong')).toBe(true);
```

### 7. Validation Rules ✅

**DOD**: System validates type preservation and adapter policies.

**Verification Tests**:
```typescript
// Test 7.1: Type preservation validation
const invalidLens = createFakeLens({
  inputType: { world: 'signal', domain: 'number' },
  outputType: { world: 'signal', domain: 'phase' } // Different domain!
});
expect(lensRegistry.validateTypePreservation(invalidLens)).toBe(false);

// Test 7.2: Adapter policy validation
const chainWithForbidden = [
  { adapterId: 'SomeForbiddenAdapter', policy: 'FORBIDDEN' }
];
const validation = adapterRegistry.validateChain(chainWithForbidden);
expect(validation.isValid).toBe(false);
expect(validation.errors).toContain('Adapter SomeForbiddenAdapter is forbidden');

// Test 7.3: Heavy adapter warnings
const chainWithHeavy = [
  { adapterId: 'ReduceFieldToSignal', policy: 'EXPLICIT', cost: 'heavy' }
];
const heavyValidation = adapterRegistry.validateChain(chainWithHeavy);
expect(heavyValidation.warnings).toContain('Heavy adapter may impact performance');
```

### 8. Migration Compatibility ✅

**DOD**: Legacy `LensDefinition` data migrates to new `LensInstance` format.

**Verification Tests**:
```typescript
// Test 8.1: Legacy lens migration
const legacyLens: LensDefinition = {
  type: 'gain',
  params: { gain: 1.5, bias: 0.5 }
};

const migrated = migrateLensDefinition(legacyLens, 'listener123', defaultSourceStore);
expect(migrated.lensId).toBe('gain');
expect(migrated.params.gain.kind).toBe('default');
expect(migrated.params.bias.kind).toBe('default');

// Test 8.2: Listener migration
const legacyListener: Listener = {
  id: 'l1',
  busId: 'energy',
  to: { blockId: 'b1', slotId: 'in', dir: 'input' },
  lens: { type: 'scale', params: { scale: 2 } },
  enabled: true
};

const migratedListener = migrateListener(legacyListener, defaultSourceStore);
expect(migratedListener.lens).toBeUndefined();
expect(migratedListener.lensStack).toHaveLength(1);
expect(migratedListener.lensStack[0].lensId).toBe('scale');

// Test 8.3: No data loss
expect(migratedListener.id).toBe(legacyListener.id);
expect(migratedListener.busId).toBe(legacyListener.busId);
expect(migratedListener.enabled).toBe(legacyListener.enabled);
```

### 9. Performance Requirements ✅

**DOD**: System meets performance targets with minimal overhead.

**Verification Benchmarks**:
```typescript
// Test 9.1: Adapter selection performance
const start = performance.now();
for (let i = 0; i < 1000; i++) {
  adapterRegistry.findPath(mockFromType, mockToType, mockContext);
}
const duration = performance.now() - start;
expect(duration).toBeLessThan(50); // Should be < 50ms for 1000 lookups

// Test 9.2: Lens evaluation performance
const artifact = createMockSignal();
const lensStack = createLensStack(5); // 5 lenses deep
const start = performance.now();
for (let i = 0; i < 1000; i++) {
  applyLensStack(artifact, lensStack);
}
const duration = performance.now() - start;
expect(duration).toBeLessThan(100); // Should be < 100ms for 1000 evaluations

// Test 9.3: Memory usage
const initialMemory = process.memoryUsage().heapUsed;
// Create 1000 lenses with default sources
for (let i = 0; i < 1000; i++) {
  createListenerWithLenses();
}
const finalMemory = process.memoryUsage().heapUsed;
const memoryIncrease = finalMemory - initialMemory;
expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // < 10MB increase
```

### 10. Error Handling ✅

**DOD**: Graceful error handling with clear diagnostics.

**Verification Tests**:
```typescript
// Test 10.1: Invalid lens ID
const invalidLens: LensInstance = {
  lensId: 'NonExistentLens',
  params: {},
  enabled: true
};
const result1 = applyLens(mockArtifact, invalidLens);
expect(result1.kind).toBe('Error');
expect(result1.message).toContain('Unknown lens');

// Test 10.2: Cyclic dependency detection
const cyclicBinding: LensParamBinding = {
  kind: 'wire',
  from: { blockId: 'self', slotId: 'out', dir: 'output' }
};
const result2 = await bindingResolver.resolveLensParam(
  cyclicBinding,
  { currentBinding: 'self', nestingDepth: 0 }
);
expect(result2.kind).toBe('Error');
expect(result2.message).toContain('Cyclic dependency');

// Test 10.3: Type mismatch in adapters
const invalidAdapter = {
  inputType: { world: 'signal', domain: 'number' },
  outputType: { world: 'field', domain: 'color' } // Invalid conversion
};
const result3 = applyAdapter(mockSignal, invalidAdapter);
expect(result3.kind).toBe('Error');
```

## Integration Tests

### IT-1: End-to-End Publisher → Bus → Listener Flow

```typescript
describe('Full publisher to listener flow', () => {
  it('should apply adapters and lenses in correct order', async () => {
    // Setup: Publisher with Const→Signal adapter + gain lens
    const publisher = createPublisher({
      blockOutput: { kind: 'Const:number', value: 2 },
      adapterChain: [{ adapterId: 'ConstToSignal' }],
      lensStack: [{ lensId: 'gain', params: { gain: { kind: 'default', defaultSourceId: 'ds:gain' } } }]
    });
    defaultSourceStore.create({ id: 'ds:gain', value: 3 });

    // Setup: Listener with mapRange lens
    const listener = createListener({
      adapterChain: [],
      lensStack: [{
        lensId: 'mapRange',
        params: {
          inMin: { kind: 'default', defaultSourceId: 'ds:min' },
          inMax: { kind: 'default', defaultSourceId: 'ds:max' },
          outMin: { kind: 'default', defaultSourceId: 'ds:outMin' },
          outMax: { kind: 'default', defaultSourceId: 'ds:outMax' }
        }
      }]
    });
    defaultSourceStore.create({ id: 'ds:min', value: 0 });
    defaultSourceStore.create({ id: 'ds:max', value: 10 });
    defaultSourceStore.create({ id: 'ds:outMin', value: 100 });
    defaultSourceStore.create({ id: 'ds:outMax', value: 200 });

    // Execute: Compile full path
    const result = await compileBindingPath(publisher, listener);

    // Verify: 2 → Signal → gain(2*3=6) → mapRange(6 from [0,10] to [100,200] = 160)
    expect(result.kind).toBe('Signal:number');
    const value = result.value(0, mockRuntimeCtx);
    expect(value).toBe(160);
  });
});
```

### IT-2: Multiple Publishers with Bus Combine

```typescript
describe('Multiple publishers with bus combine', () => {
  it('should apply publisher lenses before combining', async () => {
    // Publisher 1: value 10 with gain 2
    const pub1 = createPublisher({
      blockOutput: { kind: 'Signal:number', value: () => 10 },
      lensStack: [{ lensId: 'gain', params: { gain: 2 } }]
    });

    // Publisher 2: value 5 with polarity invert
    const pub2 = createPublisher({
      blockOutput: { kind: 'Signal:number', value: () => 5 },
      lensStack: [{ lensId: 'polarity', params: { invert: true } }]
    });

    // Bus combines with 'sum' mode
    const bus = createBus({ combineMode: 'sum' });

    // Result: (10*2) + (-5) = 15
    const result = await compileBusWithPublishers(bus, [pub1, pub2]);
    expect(result.value(0, mockRuntimeCtx)).toBe(15);
  });
});
```

## UI Acceptance Criteria

### UI-1: Publisher Lens Visibility

- [ ] Publisher lenses shown on bus channel
- [ ] Mini-strip with enable toggle
- [ ] Primary lens control visible inline
- [ ] Expandable drawer for full lens stack
- [ ] Visual indication when publisher has lenses

### UI-2: Lens Parameter Binding

- [ ] Default value controls (sliders, knobs, toggles)
- [ ] "Drive..." action per parameter
- [ ] Bus binding picker
- [ ] Wire binding selector
- [ ] Visual distinction between binding types

### UI-3: Adapter Indicators

- [ ] Auto adapters shown as "Auto conversion"
- [ ] Warning for heavy adapters
- [ ] Modal for explicit adapter confirmation
- [ ] Suggest adapters as one-click fixes

## Performance Benchmarks

### Benchmark 1: Compilation Time
- Target: < 100ms for typical patch (10 blocks, 5 buses)
- Target: < 500ms for complex patch (50 blocks, 20 buses)

### Benchmark 2: Runtime Overhead
- Target: < 5ms per frame for adapter/lens evaluation
- Target: < 10% CPU increase vs. no adapters/lenses

### Benchmark 3: Memory Usage
- Target: < 1MB per 100 lens instances
- Target: No memory leaks over 1000 compilations

## Code Quality Requirements

### CQ-1: Test Coverage
- [ ] > 90% coverage for adapter registry
- [ ] > 90% coverage for lens registry
- [ ] > 95% coverage for compilation pipeline
- [ ] > 85% coverage for UI components

### CQ-2: Documentation
- [ ] All public APIs documented with JSDoc
- [ ] Architecture decision records for major choices
- [ ] Migration guide for legacy data
- [ ] UI/UX guidelines for lens editing

### CQ-3: Type Safety
- [ ] No `any` types in core implementation
- [ ] Strict TypeScript configuration
- [ ] All runtime validations at boundaries

## Security Requirements

### S-1: Input Validation
- [ ] All user inputs validated
- [ ] Type enforcement at runtime
- [ ] Safe parameter bounds checking

### S-2: Resource Limits
- [ ] Maximum lens stack depth (configurable)
- [ ] Maximum binding recursion depth
- [ ] Memory usage monitoring

## Accessibility Requirements

### A-1: Keyboard Navigation
- [ ] All lens controls accessible via keyboard
- [ ] Tab order logical and predictable
- [ ] Screen reader announcements

### A-2: Visual Indicators
- [ ] High contrast mode support
- [ ] Clear focus indicators
- [ ] Color not sole information carrier

## Rollout Criteria

### RC-1: Feature Flag
- [ ] Feature flag for new adapter/lens system
- [ ] Graceful degradation to legacy system
- [ ] No breaking changes for existing patches

### RC-2: Migration Tool
- [ ] One-click migration for legacy patches
- [ ] Backup/restore capability
- [ ] Migration verification

### RC-3: Documentation
- [ ] User guide for adapter/lens concepts
- [ ] Tutorial video covering workflow
- [ ] FAQ for common issues

## Final Sign-off

Before marking this feature as complete:

1. [ ] All acceptance criteria verified
2. [ ] Performance benchmarks met
3. [ ] Integration tests passing
4. [ ] Code review completed
5. [ ] Documentation reviewed
6. [ ] User acceptance testing completed
7. [ ] Migration tested on production data

## Definition of Done Checklist

- [ ] Core implementation complete and tested
- [ ] All acceptance criteria verified
- [ ] Performance requirements met
- [ ] Documentation complete
- [ ] Migration path validated
- [ ] Team review and approval
- [ ] Stakeholder sign-off

---

**Note**: This DOD should be used as a living document throughout implementation. Update criteria as implementation reveals new requirements or constraints.