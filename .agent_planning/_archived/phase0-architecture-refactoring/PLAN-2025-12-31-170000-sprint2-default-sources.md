# Sprint 2: Unify Default Sources with Blocks

**Generated**: 2025-12-31-170000
**Status Source**: STATUS-2025-12-31.md
**Spec Reference**: compiler-final/ARCHITECTURE-RECOMMENDATIONS.md Part 2
**Priority**: P0 (Critical - Foundation)
**Estimated Effort**: 2-3 days

---

## Sprint Goal

Replace separate default source metadata with hidden provider blocks, making every input backed by an edge and eliminating special-case input resolution.

---

## In-Scope Deliverables

1. **Default Source Materialization** - Create hidden DSConst* blocks for unconnected inputs
2. **Compiler Integration** - Call materialization at compilation start, remove special cases
3. **Test Migration** - Update tests to handle hidden blocks

---

## Out-of-Scope

- UI updates for inline default value editors (deferred to follow-up)
- "Promote default to visible block" feature (future enhancement)
- Hidden provider blocks for advanced features (separate system, see workstream-alignment.md)
- Serialization format version bump (note in docs only)

---

## Work Items

### 1. Implement materializeDefaultSources() Function

**Status**: Not Started
**Effort**: Medium (8-10 hours)
**Dependencies**: Sprint 1 (needs Edge type)
**Spec Reference**: ARCHITECTURE-RECOMMENDATIONS.md lines 224-243

#### Description

Create the core materialization function that scans for unconnected inputs and generates hidden provider blocks with edges. This eliminates the need for separate default source arrays.

#### Acceptance Criteria

- [ ] `materializeDefaultSources(patch: Patch): Patch` implemented in new file `src/editor/compiler/passes/pass0-materialize.ts`
- [ ] Function scans all block inputs for missing edges
- [ ] Creates appropriate DSConst* block based on input world and type (signal:float → DSConstSignalFloat, etc.)
- [ ] Generated blocks have `hidden: true` and `role: 'defaultSourceProvider'` metadata
- [ ] Creates Edge from provider block output to target input
- [ ] Preserves existing edges (no duplication)
- [ ] UI hints from DefaultSource preserved as provider block params
- [ ] Returns new Patch with augmented blocks and edges arrays

#### Technical Notes

```typescript
// src/editor/compiler/passes/pass0-materialize.ts
export function materializeDefaultSources(patch: Patch): Patch {
  const newBlocks: Block[] = [];
  const newEdges: Edge[] = [];

  for (const block of patch.blocks) {
    const blockDef = getBlockDef(block.type);

    for (const inputDef of blockDef.inputs) {
      const hasEdge = patch.edges.some(e =>
        e.to.kind === 'port' &&
        e.to.blockId === block.id &&
        e.to.slotId === inputDef.name &&
        e.enabled
      );

      if (!hasEdge && inputDef.defaultSource) {
        // Create hidden provider
        const providerId = `${block.id}_default_${inputDef.name}`;
        const providerType = selectProviderType(
          inputDef.defaultSource.world,
          inputDef.defaultSource.type
        );

        const provider: Block = {
          id: providerId,
          type: providerType,
          params: { value: inputDef.defaultSource.value },
          hidden: true,
          role: 'defaultSourceProvider',
          position: block.position  // Co-locate with parent
        };

        // Create edge from provider to input
        const edge: Edge = {
          id: `${providerId}_edge`,
          from: { kind: 'port', blockId: providerId, slotId: 'out' },
          to: { kind: 'port', blockId: block.id, slotId: inputDef.name },
          enabled: true
        };

        newBlocks.push(provider);
        newEdges.push(edge);
      }
    }
  }

  return {
    ...patch,
    blocks: [...patch.blocks, ...newBlocks],
    edges: [...patch.edges, ...newEdges]
  };
}

function selectProviderType(world: SlotWorld, type: TypeDesc): string {
  // Map world + type to DSConst* block type
  const key = `${world}:${type.domain}`;
  const mapping: Record<string, string> = {
    'scalar:float': 'DSConstScalarFloat',
    'scalar:int': 'DSConstScalarInt',
    'scalar:string': 'DSConstScalarString',
    'scalar:waveform': 'DSConstScalarWaveform',
    'signal:float': 'DSConstSignalFloat',
    'signal:int': 'DSConstSignalInt',
    'signal:color': 'DSConstSignalColor',
    'signal:vec2': 'DSConstSignalPoint',
    'field:float': 'DSConstFieldFloat',
    'field:color': 'DSConstFieldColor',
    'field:vec2': 'DSConstFieldVec2',
  };
  return mapping[key] ?? 'DSConstSignalFloat';  // Fallback
}
```

---

### 2. Integrate Materialization into Compiler Pipeline

**Status**: Not Started
**Effort**: Small (4-6 hours)
**Dependencies**: Work Item 1
**Spec Reference**: ARCHITECTURE-RECOMMENDATIONS.md lines 245-247

#### Description

Call `materializeDefaultSources()` at the start of compilation (pass 0 or beginning of pass 1) so all subsequent passes see a fully-connected patch.

#### Acceptance Criteria

- [ ] `compile()` function calls `materializeDefaultSources()` before pass 1
- [ ] Materialized patch passed to all subsequent passes
- [ ] Original patch object not mutated (functional transform)
- [ ] Compilation succeeds for patches with unconnected inputs
- [ ] Compilation output identical to previous behavior (hidden blocks transparent to runtime)
- [ ] No performance regression (materialization < 5% of compile time)

#### Technical Notes

```typescript
// src/editor/compiler/compile.ts
export function compile(patch: Patch, ctx: CompileContext): CompileResult {
  // Pass 0: Materialize default sources as hidden blocks
  const materializedPatch = materializeDefaultSources(patch);

  // Pass 1-8: Normal compilation
  const normalizedPatch = normalizeBlocks(materializedPatch);
  const typeGraph = buildTypeGraph(normalizedPatch);
  // ... continue with other passes

  return { ir, errors };
}
```

---

### 3. Remove Default Source Special Cases from Compiler

**Status**: Not Started
**Effort**: Medium (6-8 hours)
**Dependencies**: Work Item 2
**Spec Reference**: STATUS-2025-12-31.md lines 175-188

#### Description

Remove all special-case handling for default sources from passes 2, 6, 7, 8 now that all inputs are guaranteed to have edges.

#### Acceptance Criteria

- [ ] Pass 2: Remove default source type checking (handled via provider blocks)
- [ ] Pass 6: Remove "Check 3: Default source?" from `resolveInput()` logic
- [ ] Pass 6: `resolveInput()` returns error if no edge found (should never happen after materialization)
- [ ] Pass 7: No changes needed (buses don't use defaults)
- [ ] Pass 8: No special default source linking logic
- [ ] All removed code documented in CHANGELOG with migration notes
- [ ] All tests pass after removal

#### Technical Notes

```typescript
// BEFORE (pass6-block-lowering.ts)
function resolveInput(blockId: string, slotId: string): Artifact {
  const edge = findEdge(blockId, slotId);
  if (edge) return resolveEdge(edge);


  // REMOVE THIS:
  const ds = findDefaultSource(blockId, slotId);
  if (ds) return compileDefaultSource(ds);

  throw new Error(`Unconnected input: ${blockId}.${slotId}`);
}

// AFTER (simplified)
function resolveInput(blockId: string, slotId: string): Artifact {
  const edge = findEdge(blockId, slotId);
  if (!edge) {
    // This should never happen after materialization
    throw new Error(`Internal error: unmaterialized input ${blockId}.${slotId}`);
  }
  return resolveEdge(edge);
}
```

---

### 4. Update Patch Type Definitions

**Status**: Not Started
**Effort**: Small (2-4 hours)
**Dependencies**: Work Item 3
**Spec Reference**: ARCHITECTURE-RECOMMENDATIONS.md lines 204-232

#### Description

Remove deprecated default source types from `src/editor/types.ts` and add metadata to Block type for hidden providers.

#### Acceptance Criteria

- [ ] `DefaultSourceState` type removed (or marked deprecated)
- [ ] `DefaultSourceAttachment` type removed (or marked deprecated)
- [ ] `Patch.defaultSources` field removed from interface
- [ ] `Patch.defaultSourceAttachments` field removed from interface
- [ ] `Block.hidden?: boolean` field added
- [ ] `Block.role?: 'defaultSourceProvider' | 'internal'` field added
- [ ] All references to removed types updated or removed
- [ ] TypeScript compilation succeeds with no errors

#### Technical Notes

```typescript
// src/editor/types.ts
interface Patch {
  blocks: Block[];      // Includes hidden provider blocks
  edges: Edge[];        // ALL connections
  buses: Bus[];

  // REMOVED:
  // defaultSources: DefaultSourceState[];
  // defaultSourceAttachments: DefaultSourceAttachment[];
}

interface Block {
  readonly id: string;
  readonly type: string;
  readonly params: Record<string, unknown>;
  readonly position: Vec2;

  // NEW:
  readonly hidden?: boolean;        // Don't render on canvas
  readonly role?: 'defaultSourceProvider' | 'internal';
}
```

---

### 5. Verify Provider Block Compilers Exist

**Status**: Not Started
**Effort**: Small (2-3 hours)
**Dependencies**: None (validation only)
**Spec Reference**: STATUS-2025-12-31.md lines 193-201

#### Description

Audit all DSConst* blocks referenced by `selectProviderType()` to ensure block compilers exist and work correctly.

#### Acceptance Criteria

- [ ] All 11 DSConst* block types have compilers in `src/editor/compiler/blocks/defaultSources/`
- [ ] Each compiler implements correct output world (scalar/signal/field)
- [ ] Each compiler handles `value` param correctly
- [ ] Missing compilers identified and added (if any)
- [ ] Unit tests exist for each provider block compiler
- [ ] Integration test: patch with all provider types compiles successfully

#### Technical Notes

**Required Provider Block Types** (from glob results):
- ✓ DSConstScalarFloat
- ✓ DSConstScalarInt
- ✓ DSConstScalarString
- ✓ DSConstScalarWaveform
- ✓ DSConstSignalFloat
- ✓ DSConstSignalInt
- ✓ DSConstSignalColor
- ✓ DSConstSignalPoint (vec2)
- ✓ DSConstFieldFloat
- ✓ DSConstFieldColor
- ✓ DSConstFieldVec2

**Potential gaps**:
- Event world providers (if needed)
- Domain-specific providers (enum, bool, etc.)

---

### 6. Update Tests for Hidden Blocks

**Status**: Not Started
**Effort**: Medium (6-8 hours)
**Dependencies**: Work Item 4
**Spec Reference**: New testing infrastructure

#### Description

Update test utilities and existing tests to handle hidden provider blocks correctly.

#### Acceptance Criteria

- [ ] Test helper `createPatch()` optionally calls `materializeDefaultSources()`
- [ ] Test assertions filter hidden blocks when checking patch structure
- [ ] Existing tests pass with materialization enabled
- [ ] New tests verify materialization correctness
- [ ] Golden patch tests updated to expect hidden blocks
- [ ] Performance: materialization adds < 10ms to test suite runtime

#### Technical Notes

```typescript
// tests/utils/patchBuilder.ts
export function createTestPatch(
  spec: PatchSpec,
  options: { materialize?: boolean } = {}
): Patch {
  const patch = buildPatch(spec);

  if (options.materialize) {
    return materializeDefaultSources(patch);
  }

  return patch;
}

// In tests
describe('Block compilation', () => {
  it('compiles block with default inputs', () => {
    const patch = createTestPatch({
      blocks: [{ id: 'osc', type: 'Oscillator' }]
      // frequency input has no edge - will be materialized
    }, { materialize: true });

    expect(patch.blocks).toHaveLength(2);  // osc + hidden provider
    expect(patch.edges).toHaveLength(1);   // provider → osc.frequency

    const result = compile(patch);
    expect(result.errors).toHaveLength(0);
  });
});
```

---

## Dependencies

**Blocks This Sprint**:
- Sprint 3 (V2 adapter needs input resolution to work)

**Blocked By**:
- Sprint 1 (needs Edge type)

---

## Risks

### HIGH: Confusion with Existing Hidden Provider System

**Impact**: The codebase has 18 sprints of "hidden providers" work for a different purpose (allowlist-based providers for advanced features, per workstream-alignment.md)
**Mitigation**:
- Use distinct `role` field: `'defaultSourceProvider'` vs `'internal'`
- Document the difference clearly in code comments
- Review workstream-alignment.md to avoid conflicts
- Consider renaming one system to avoid confusion

### MEDIUM: Serialization Format Migration

**Impact**: All saved patches need conversion from defaultSources arrays to hidden blocks
**Mitigation**:
- Write migration function: `migrateV1ToV2Patch()`
- Keep old types as deprecated during transition
- Version bump in serialization format
- Document migration in CHANGELOG

### MEDIUM: UI Integration Complexity

**Impact**: Inspector panels currently edit defaultSources directly; need to edit hidden block params instead
**Mitigation**:
- Defer UI updates to follow-up sprint
- Provide computed getters for backward compatibility
- Update UI incrementally after compiler stabilizes

---

## Test Strategy

### Unit Tests

```typescript
// tests/compiler/passes/pass0-materialize.test.ts
describe('materializeDefaultSources', () => {
  it('creates hidden block for unconnected input with default', () => {
    const patch = createPatch({
      blocks: [{
        id: 'osc',
        type: 'Oscillator',
        // frequency input: default 440 Hz
      }]
    });

    const materialized = materializeDefaultSources(patch);

    expect(materialized.blocks).toHaveLength(2);
    const provider = materialized.blocks.find(b => b.hidden);
    expect(provider?.type).toBe('DSConstSignalFloat');
    expect(provider?.params.value).toBe(440);
    expect(provider?.role).toBe('defaultSourceProvider');

    expect(materialized.edges).toHaveLength(1);
    const edge = materialized.edges[0];
    expect(edge.from.blockId).toBe(provider?.id);
    expect(edge.to.blockId).toBe('osc');
  });

  it('preserves existing edges (no materialization)', () => {
    const patch = createPatch({
      blocks: [
        { id: 'lfo', type: 'LFO' },
        { id: 'osc', type: 'Oscillator' }
      ],
      edges: [
        { from: port('lfo', 'out'), to: port('osc', 'frequency') }
      ]
    });

    const materialized = materializeDefaultSources(patch);

    expect(materialized.blocks).toHaveLength(2);  // No new blocks
    expect(materialized.edges).toHaveLength(1);   // No new edges
  });

  it('handles multiple unconnected inputs', () => {
    const patch = createPatch({
      blocks: [{
        id: 'gain',
        type: 'Gain',
        // input: no edge
        // gain: no edge
      }]
    });

    const materialized = materializeDefaultSources(patch);

    expect(materialized.blocks).toHaveLength(3);  // gain + 2 providers
    expect(materialized.edges).toHaveLength(2);   // 2 edges
  });
});
```

### Integration Tests

```typescript
// tests/compiler/compile-with-defaults.test.ts
describe('Compilation with default sources', () => {
  it('compiles patch with unmaterialized defaults', () => {
    const patch = createPatch({
      blocks: [{ id: 'osc', type: 'Oscillator' }]
    });

    const result = compile(patch);  // Calls materializeDefaultSources internally

    expect(result.errors).toHaveLength(0);
    expect(result.ir).toBeDefined();

    // Verify runtime behavior
    const runtime = new Runtime(result.ir);
    const output = runtime.evaluate({ t: 0 });
    expect(output).toMatchSnapshot();
  });

  it('removes default source special cases from pass 6', () => {
    // This test verifies that resolveInput() no longer has default source fallback
    const spy = vi.spyOn(console, 'error');

    const patch = createPatch({
      blocks: [{
        id: 'osc',
        type: 'Oscillator',
        // Artificially remove default - should error
      }]
    });

    // Manually skip materialization
    const result = compileWithoutMaterialization(patch);

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('unmaterialized input'));
  });
});
```

### Golden Patch Tests

- [ ] Load all existing golden patches
- [ ] Compile with materialization enabled
- [ ] Verify output identical to previous behavior
- [ ] Validate hidden blocks created as expected
- [ ] Check runtime output matches snapshots

---

## Success Criteria

- [ ] All 302 existing tests pass with materialization
- [ ] Golden patch compiles and renders identically
- [ ] No special-case default source code in any compiler pass
- [ ] All DSConst* provider blocks compile correctly
- [ ] Compile time unchanged (±5% tolerance)
- [ ] Test suite runtime increase < 10ms
- [ ] Documentation updated with migration guide
- [ ] CHANGELOG entry written

---

## Follow-Up Work (Not in Sprint)

- Update Inspector UI to edit hidden block params
- Implement "promote default to visible block" feature
- Serialization format version bump and migration tool
- Resolve naming conflict with advanced hidden provider system
- Performance profiling with large patches (1000+ blocks)
