# Sprint 4: Unify Lenses and Adapters (OPTIONAL)

**Generated**: 2025-12-31-170000
**Status Source**: STATUS-2025-12-31.md
**Spec Reference**: compiler-final/ARCHITECTURE-RECOMMENDATIONS.md Part 3
**Priority**: P2 (Medium - Nice Cleanup, Not Blocking)
**Estimated Effort**: 2-3 days

---

## Sprint Goal

Merge separate Lens and Adapter registries into unified TransformRegistry, simplifying edge transform handling and reducing code duplication.

---

## In-Scope Deliverables

1. **TransformStep Type** - Unified type for all edge transforms
2. **TransformRegistry** - Single registry replacing LensRegistry and AdapterRegistry
3. **Compiler Integration** - Update passes to use unified transforms

---

## Out-of-Scope

- Removing old registries (maintain as facades during migration)
- UI updates for transform configuration
- New transform types (keep existing lenses/adapters)
- Auto-adapter insertion optimization

---

## Work Items

### 1. Define TransformStep and TransformDef Types

**Status**: Not Started
**Effort**: Small (3-4 hours)
**Dependencies**: Sprint 1 (uses TransformStep in Edge type)
**Spec Reference**: ARCHITECTURE-RECOMMENDATIONS.md lines 322-350

#### Description

Create unified transform abstractions in `src/editor/types.ts` that can represent both lenses (type-preserving, parameterized) and adapters (type-converting, automatic).

#### Acceptance Criteria

- [ ] `TransformStep` interface defined: `{ id: string; kind: 'lens' | 'adapter'; params?: Record<string, unknown> }`
- [ ] `TransformDef` interface includes: id, label, kind, inputType, outputType
- [ ] Lens-specific fields: `params?: Record<string, ParamSpec>`
- [ ] Adapter-specific fields: `policy?: 'auto' | 'suggest' | 'explicit'; cost?: number`
- [ ] Shared fields: `apply?: (value, params, ctx) => value; compileToIR?: (input, params, ctx) => ValueRefPacked`
- [ ] Type guards: `isLensTransform()`, `isAdapterTransform()`
- [ ] Unit tests verify type safety

#### Technical Notes

```typescript
// src/editor/types.ts
interface TransformStep {
  readonly id: string;
  readonly kind: 'lens' | 'adapter';
  readonly params?: Record<string, unknown>;  // Only for lenses
}

interface TransformDef {
  readonly id: string;
  readonly label: string;
  readonly kind: 'lens' | 'adapter';

  // Type info
  readonly inputType: TypeDesc | 'same';   // 'same' = type-preserving
  readonly outputType: TypeDesc | 'same';

  // Lens-specific
  readonly params?: Record<string, ParamSpec>;
  readonly domain?: CoreDomain;  // For domain-specific lenses

  // Adapter-specific
  readonly policy?: 'auto' | 'suggest' | 'explicit';
  readonly cost?: number;  // For adapter pathfinding

  // Shared implementation
  readonly apply?: (value: unknown, params: Record<string, unknown>, ctx: RuntimeContext) => unknown;
  readonly compileToIR?: (input: ValueRefPacked, params: Record<string, unknown>, ctx: CompileCtx) => ValueRefPacked;
}

// Type guards
function isLensTransform(def: TransformDef): def is TransformDef & { kind: 'lens' } {
  return def.kind === 'lens';
}

function isAdapterTransform(def: TransformDef): def is TransformDef & { kind: 'adapter' } {
  return def.kind === 'adapter';
}
```

---

### 2. Create Unified TransformRegistry

**Status**: Not Started
**Effort**: Medium (8-10 hours)
**Dependencies**: Work Item 1
**Spec Reference**: ARCHITECTURE-RECOMMENDATIONS.md lines 355-371

#### Description

Build new registry class that stores both lenses and adapters with unified lookup methods, replacing separate registries.

#### Acceptance Criteria

- [ ] `TransformRegistry` class created in `src/editor/transforms/TransformRegistry.ts`
- [ ] Methods: `registerLens()`, `registerAdapter()`, `getTransform()`, `findAdapters()`, `getLensesForDomain()`
- [ ] Internal storage uses single `Map<string, TransformDef>`
- [ ] Adapter pathfinding preserved (Dijkstra's for auto-insertion)
- [ ] Lens domain filtering preserved
- [ ] Registration validates no ID conflicts
- [ ] Unit tests cover all registry operations

#### Technical Notes

```typescript
// src/editor/transforms/TransformRegistry.ts
export class TransformRegistry {
  private transforms = new Map<string, TransformDef>();

  registerLens(def: Omit<TransformDef, 'kind'> & { kind?: 'lens' }): void {
    const lensTransform: TransformDef = { ...def, kind: 'lens' };
    this.validateAndRegister(lensTransform);
  }

  registerAdapter(def: Omit<TransformDef, 'kind'> & { kind?: 'adapter' }): void {
    const adapterTransform: TransformDef = { ...def, kind: 'adapter' };
    this.validateAndRegister(adapterTransform);
  }

  private validateAndRegister(def: TransformDef): void {
    if (this.transforms.has(def.id)) {
      throw new Error(`Transform ID already registered: ${def.id}`);
    }
    this.transforms.set(def.id, def);
  }

  getTransform(id: string): TransformDef | undefined {
    return this.transforms.get(id);
  }

  findAdapters(from: TypeDesc, to: TypeDesc): TransformDef[] {
    // Filter to adapters that match type signature
    return Array.from(this.transforms.values())
      .filter(t => t.kind === 'adapter')
      .filter(t => this.matchesTypes(t, from, to));
  }

  getLensesForDomain(domain: CoreDomain): TransformDef[] {
    return Array.from(this.transforms.values())
      .filter(t => t.kind === 'lens')
      .filter(t => t.domain === domain || t.domain === undefined);
  }

  // Adapter pathfinding (from old AdapterRegistry)
  findAdapterPath(from: TypeDesc, to: TypeDesc): TransformStep[] | null {
    // Dijkstra's algorithm implementation
    // ... (preserve existing logic)
  }

  private matchesTypes(transform: TransformDef, from: TypeDesc, to: TypeDesc): boolean {
    // Type matching logic
    if (transform.inputType === 'same') return false;  // Lenses can't change types
    return typeEquals(transform.inputType, from) && typeEquals(transform.outputType, to);
  }
}

// Singleton instance
export const TRANSFORM_REGISTRY = new TransformRegistry();
```

---

### 3. Migrate Existing Lenses to TransformRegistry

**Status**: Not Started
**Effort**: Medium (6-8 hours)
**Dependencies**: Work Item 2
**Spec Reference**: STATUS-2025-12-31.md lines 418-427

#### Description

Port all ~30 lens definitions from LensRegistry to new TransformRegistry, preserving all functionality.

#### Acceptance Criteria

- [ ] All lenses from `src/editor/lenses/LensRegistry.ts` registered in TransformRegistry
- [ ] Lens parameters preserved in TransformDef.params
- [ ] Domain filtering preserved
- [ ] `apply()` and `compileToIR()` functions migrated
- [ ] Old LensRegistry marked deprecated but functional (facade pattern)
- [ ] All lens tests pass with new registry
- [ ] No behavioral changes

#### Technical Notes

```typescript
// Migration example
// BEFORE (LensRegistry.ts)
LENS_REGISTRY.register({
  id: 'quantize',
  label: 'Quantize',
  domain: 'float',
  params: {
    steps: { type: 'int', default: 8 }
  },
  apply: (value, params) => Math.round(value * params.steps) / params.steps,
  compileToIR: (input, params, ctx) => {
    // ... IR compilation
  }
});

// AFTER (TransformRegistry.ts)
TRANSFORM_REGISTRY.registerLens({
  id: 'quantize',
  label: 'Quantize',
  kind: 'lens',
  inputType: 'same',
  outputType: 'same',
  domain: 'float',
  params: {
    steps: { type: 'int', default: 8 }
  },
  apply: (value, params) => Math.round(value * params.steps) / params.steps,
  compileToIR: (input, params, ctx) => {
    // ... IR compilation (unchanged)
  }
});
```

---

### 4. Migrate Existing Adapters to TransformRegistry

**Status**: Not Started
**Effort**: Medium (6-8 hours)
**Dependencies**: Work Item 2
**Spec Reference**: STATUS-2025-12-31.md lines 430-442

#### Description

Port all ~20 adapter definitions from AdapterRegistry to new TransformRegistry, preserving auto-insertion policies and costs.

#### Acceptance Criteria

- [ ] All adapters from `src/editor/adapters/AdapterRegistry.ts` registered in TransformRegistry
- [ ] Adapter policies preserved (auto, suggest, explicit)
- [ ] Cost values preserved for pathfinding
- [ ] Type conversion logic migrated
- [ ] Old AdapterRegistry marked deprecated but functional (facade pattern)
- [ ] All adapter tests pass with new registry
- [ ] Auto-insertion still works correctly

#### Technical Notes

```typescript
// Migration example
// BEFORE (AdapterRegistry.ts)
ADAPTER_REGISTRY.register({
  id: 'floatToInt',
  label: 'Float → Int',
  from: { domain: 'float' },
  to: { domain: 'int' },
  policy: 'auto',
  cost: 1,
  apply: (artifact, params, ctx) => ({
    ...artifact,
    type: { domain: 'int' },
    value: Math.round(artifact.value)
  }),
  compileToIR: (input, ctx) => {
    // ... IR compilation
  }
});

// AFTER (TransformRegistry.ts)
TRANSFORM_REGISTRY.registerAdapter({
  id: 'floatToInt',
  label: 'Float → Int',
  kind: 'adapter',
  inputType: { domain: 'float' },
  outputType: { domain: 'int' },
  policy: 'auto',
  cost: 1,
  apply: (value, params, ctx) => Math.round(value),
  compileToIR: (input, ctx) => {
    // ... IR compilation (unchanged)
  }
});
```

---

### 5. Update Compiler to Use Unified Transforms

**Status**: Not Started
**Effort**: Medium (6-8 hours)
**Dependencies**: Work Items 3, 4
**Spec Reference**: ARCHITECTURE-RECOMMENDATIONS.md lines 506-513

#### Description

Update compiler passes (mainly Pass 2, 6, 8) to use TransformRegistry instead of separate lens/adapter registries.

#### Acceptance Criteria

- [ ] Pass 2: Type checking uses `TRANSFORM_REGISTRY.getTransform()`
- [ ] Pass 6: Transform application unified (no lens vs adapter branches)
- [ ] Pass 8: Link resolution uses unified transform chain
- [ ] Adapter auto-insertion uses `TRANSFORM_REGISTRY.findAdapterPath()`
- [ ] All compiler passes import from TransformRegistry only
- [ ] All 302 existing tests pass
- [ ] No behavioral changes in compilation

#### Technical Notes

```typescript
// Pass 2: Type checking (unified)
function checkEdgeTypes(edge: Edge): TypeError[] {
  let currentType = getSourceType(edge.from);

  for (const step of edge.transforms ?? []) {
    const transform = TRANSFORM_REGISTRY.getTransform(step.id);
    if (!transform) {
      return [{ kind: 'UnknownTransform', transformId: step.id }];
    }

    // Validate input type
    if (transform.inputType !== 'same' && !typeEquals(currentType, transform.inputType)) {
      return [{ kind: 'TransformInputMismatch', expected: transform.inputType, actual: currentType }];
    }

    // Update current type
    currentType = transform.outputType === 'same' ? currentType : transform.outputType;
  }

  const targetType = getTargetType(edge.to);
  if (!typeEquals(currentType, targetType)) {
    return [{ kind: 'EdgeTypeMismatch', expected: targetType, actual: currentType }];
  }

  return [];
}

// Pass 6: Apply transforms (unified)
function applyTransforms(value: Artifact, steps: TransformStep[]): Artifact {
  let current = value;

  for (const step of steps) {
    const transform = TRANSFORM_REGISTRY.getTransform(step.id);
    if (!transform || !transform.apply) {
      throw new CompileError(`Transform not found or not executable: ${step.id}`);
    }

    current = {
      ...current,
      value: transform.apply(current.value, step.params ?? {}, ctx)
    };
  }

  return current;
}
```

---

### 6. Create Facade Pattern for Old Registries

**Status**: Not Started
**Effort**: Small (3-4 hours)
**Dependencies**: Work Item 5
**Spec Reference**: New backward compatibility layer

#### Description

Implement old LensRegistry and AdapterRegistry as thin facades over TransformRegistry to maintain backward compatibility during migration.

#### Acceptance Criteria

- [ ] `LensRegistry` class wraps `TRANSFORM_REGISTRY` methods
- [ ] `AdapterRegistry` class wraps `TRANSFORM_REGISTRY` methods
- [ ] All old registration methods work correctly (delegate to TransformRegistry)
- [ ] Deprecated warnings added to old methods
- [ ] Old tests pass without modification
- [ ] Migration guide documents facade pattern
- [ ] Timeline for removing facades (Phase 6+)

#### Technical Notes

```typescript
// src/editor/lenses/LensRegistry.ts (facade)
/** @deprecated Use TRANSFORM_REGISTRY.registerLens() instead */
export class LensRegistry {
  /** @deprecated */
  register(def: LensDef): void {
    console.warn('LensRegistry.register() is deprecated. Use TRANSFORM_REGISTRY.registerLens()');
    TRANSFORM_REGISTRY.registerLens({
      ...def,
      inputType: 'same',
      outputType: 'same'
    });
  }

  /** @deprecated */
  findByDomain(domain: CoreDomain): LensDef[] {
    return TRANSFORM_REGISTRY.getLensesForDomain(domain) as LensDef[];
  }
}

export const LENS_REGISTRY = new LensRegistry();

// src/editor/adapters/AdapterRegistry.ts (facade)
/** @deprecated Use TRANSFORM_REGISTRY.registerAdapter() instead */
export class AdapterRegistry {
  /** @deprecated */
  register(def: AdapterDef): void {
    console.warn('AdapterRegistry.register() is deprecated. Use TRANSFORM_REGISTRY.registerAdapter()');
    TRANSFORM_REGISTRY.registerAdapter({
      ...def,
      inputType: def.from,
      outputType: def.to
    });
  }

  /** @deprecated */
  findAdapters(from: TypeDesc, to: TypeDesc): AdapterDef[] {
    return TRANSFORM_REGISTRY.findAdapters(from, to) as AdapterDef[];
  }
}

export const ADAPTER_REGISTRY = new AdapterRegistry();
```

---

## Dependencies

**Blocks This Sprint**:
- None (optional cleanup)

**Blocked By**:
- Sprint 1 (uses TransformStep in Edge type)

---

## Risks

### LOW: UI Components Depend on Old Registries

**Impact**: Inspector/canvas may directly reference LENS_REGISTRY or ADAPTER_REGISTRY
**Mitigation**:
- Facade pattern maintains compatibility
- Deprecation warnings guide migration
- Gradual UI updates in follow-up work

### LOW: Third-Party Code Registration

**Impact**: External code may register transforms directly with old registries
**Mitigation**:
- Facades delegate correctly
- Document migration path
- Maintain facades indefinitely if needed

### LOW: Performance Regression

**Impact**: Unified registry may have different lookup performance
**Mitigation**:
- Profile lookups (should be O(1) Map access)
- Benchmark adapter pathfinding
- Optimize hot paths if needed

---

## Test Strategy

### Unit Tests

```typescript
// tests/editor/transforms/TransformRegistry.test.ts
describe('TransformRegistry', () => {
  it('registers lenses and adapters separately', () => {
    const registry = new TransformRegistry();

    registry.registerLens({
      id: 'quantize',
      label: 'Quantize',
      inputType: 'same',
      outputType: 'same',
      domain: 'float',
      params: { steps: { type: 'int', default: 8 } }
    });

    registry.registerAdapter({
      id: 'floatToInt',
      label: 'Float → Int',
      inputType: { domain: 'float' },
      outputType: { domain: 'int' },
      policy: 'auto',
      cost: 1
    });

    expect(registry.getTransform('quantize')?.kind).toBe('lens');
    expect(registry.getTransform('floatToInt')?.kind).toBe('adapter');
  });

  it('finds adapters by type signature', () => {
    const registry = new TransformRegistry();
    // ... register adapters

    const adapters = registry.findAdapters(
      { domain: 'float' },
      { domain: 'int' }
    );

    expect(adapters).toContainEqual(
      expect.objectContaining({ id: 'floatToInt' })
    );
  });

  it('finds lenses by domain', () => {
    const registry = new TransformRegistry();
    // ... register lenses

    const lenses = registry.getLensesForDomain('float');

    expect(lenses).toContainEqual(
      expect.objectContaining({ id: 'quantize' })
    );
  });
});
```

### Integration Tests

```typescript
// tests/compiler/unified-transforms.test.ts
describe('Compiler with unified transforms', () => {
  it('applies lens transforms on edge', () => {
    const patch = createPatch({
      blocks: [
        { id: 'lfo', type: 'LFO' },
        { id: 'osc', type: 'Oscillator' }
      ],
      edges: [{
        from: port('lfo', 'out'),
        to: port('osc', 'frequency'),
        transforms: [
          { id: 'quantize', kind: 'lens', params: { steps: 12 } }
        ]
      }]
    });

    const result = compile(patch);
    expect(result.errors).toHaveLength(0);
  });

  it('auto-inserts adapter on type mismatch', () => {
    const patch = createPatch({
      blocks: [
        { id: 'floatSource', type: 'Constant', params: { value: 3.7 } },
        { id: 'intSink', type: 'IntDisplay' }
      ],
      edges: [{
        from: port('floatSource', 'out'),  // float
        to: port('intSink', 'in')           // int
        // No explicit adapter - should auto-insert
      }]
    });

    const result = compile(patch);
    expect(result.errors).toHaveLength(0);
    // Verify floatToInt adapter was inserted
  });
});
```

### Migration Tests

```typescript
// tests/editor/transforms/facades.test.ts
describe('Old registry facades', () => {
  it('LensRegistry delegates to TransformRegistry', () => {
    const spy = vi.spyOn(TRANSFORM_REGISTRY, 'registerLens');

    LENS_REGISTRY.register({
      id: 'testLens',
      label: 'Test',
      domain: 'float',
      params: {}
    });

    expect(spy).toHaveBeenCalled();
  });

  it('AdapterRegistry delegates to TransformRegistry', () => {
    const spy = vi.spyOn(TRANSFORM_REGISTRY, 'registerAdapter');

    ADAPTER_REGISTRY.register({
      id: 'testAdapter',
      label: 'Test',
      from: { domain: 'float' },
      to: { domain: 'int' },
      policy: 'auto',
      cost: 1
    });

    expect(spy).toHaveBeenCalled();
  });
});
```

---

## Success Criteria

- [ ] All 302 existing tests pass
- [ ] All lenses migrated to TransformRegistry
- [ ] All adapters migrated to TransformRegistry
- [ ] Old registries work as facades
- [ ] Compiler uses unified transform handling
- [ ] No performance regression in transform lookup
- [ ] Adapter auto-insertion works correctly
- [ ] Documentation updated
- [ ] CHANGELOG entry written

---

## Follow-Up Work (Not in Sprint)

- Update UI components to use TransformRegistry directly
- Remove deprecated LensRegistry and AdapterRegistry (Phase 6+)
- New transform types (e.g., stateful transforms, multi-input transforms)
- Performance optimization: transform caching
- Visual transform editor in UI
