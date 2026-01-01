# Sprint 1: Unify Connections → Edge Type

**Generated**: 2025-12-31-170000
**Status Source**: STATUS-2025-12-31.md
**Spec Reference**: compiler-final/ARCHITECTURE-RECOMMENDATIONS.md Part 1
**Priority**: P0 (Critical - Foundation)
**Estimated Effort**: 2-3 days

---

## Sprint Goal

Replace three separate connection types (Connection, Publisher, Listener) with a single unified Edge type using discriminated union Endpoints, simplifying all compiler passes.

---

## In-Scope Deliverables

1. **Edge Type Definition** - New unified type with Endpoint discriminated union
2. **Migration Helpers** - Conversion functions between old and new types
3. **Compiler Pass Updates** - Update passes 2, 6, 7, 8 to use unified Edge type

---

## Out-of-Scope

- Transform unification (Sprint 4)
- UI component updates (deferred to follow-up)
- Complete removal of deprecated types (maintain facades during migration)
- Serialization format version bump (note in docs only)

---

## Work Items

### 1. Define Edge Type and Migration Helpers

**Status**: Not Started
**Effort**: Small (4-6 hours)
**Dependencies**: None
**Spec Reference**: ARCHITECTURE-RECOMMENDATIONS.md lines 74-96

#### Description

Create the unified Edge type with Endpoint discriminated union in `src/editor/types.ts`. Implement bidirectional conversion helpers for backward compatibility.

#### Acceptance Criteria

- [ ] `Endpoint` type defined as discriminated union: `{ kind: 'port'; blockId: string; slotId: string } | { kind: 'bus'; busId: string }`
- [ ] `Edge` interface includes: id, from/to Endpoints, transforms (optional), enabled, weight (optional), sortKey (optional)
- [ ] Migration helpers implemented: `connectionToEdge()`, `publisherToEdge()`, `listenerToEdge()`
- [ ] Reverse helpers implemented: `edgeToConnection()`, `edgeToPublisher()`, `edgeToListener()` returning `T | null`
- [ ] Validation logic prevents invalid bus→bus edges
- [ ] All helpers have unit tests with 100% branch coverage

#### Technical Notes

```typescript
// Core types
type Endpoint =
  | { kind: 'port'; blockId: string; slotId: string }
  | { kind: 'bus'; busId: string };

interface Edge {
  readonly id: string;
  readonly from: Endpoint;
  readonly to: Endpoint;
  readonly transforms?: TransformStep[];  // Keep existing transform types
  readonly enabled: boolean;
  readonly weight?: number;      // For bus publishers
  readonly sortKey?: number;     // For deterministic ordering
}

// Validation rule: bus→bus is compile error
function validateEdge(edge: Edge): void {
  if (edge.from.kind === 'bus' && edge.to.kind === 'bus') {
    throw new Error('Invalid edge: bus→bus connections not allowed');
  }
}
```

---

### 2. Update PatchStore to Use Edges

**Status**: Not Started
**Effort**: Medium (8-12 hours)
**Dependencies**: Work Item 1
**Spec Reference**: ARCHITECTURE-RECOMMENDATIONS.md lines 117-126

#### Description

Replace the three separate arrays (connections, publishers, listeners) in PatchStore with a single `edges: Edge[]` array. Update all MobX actions and computeds.

#### Acceptance Criteria

- [ ] `PatchStore.edges: Edge[]` replaces connections/publishers/listeners arrays
- [ ] All edge creation methods use unified `addEdge()` action
- [ ] Edge deletion uses unified `removeEdge()` action
- [ ] Computed getters for filtering: `wireEdges`, `publisherEdges`, `listenerEdges`
- [ ] All existing PatchStore tests pass with updated implementation
- [ ] No regression in edge manipulation performance

#### Technical Notes

```typescript
// PatchStore.ts
class PatchStore {
  @observable edges: Edge[] = [];

  @computed get wireEdges(): Edge[] {
    return this.edges.filter(e =>
      e.from.kind === 'port' && e.to.kind === 'port'
    );
  }

  @computed get publisherEdges(): Edge[] {
    return this.edges.filter(e =>
      e.from.kind === 'port' && e.to.kind === 'bus'
    );
  }

  @computed get listenerEdges(): Edge[] {
    return this.edges.filter(e =>
      e.from.kind === 'bus' && e.to.kind === 'port'
    );
  }

  @action addEdge(edge: Edge): void {
    validateEdge(edge);
    this.edges.push(edge);
  }
}
```

---

### 3. Update Pass 2 (Type Graph) for Unified Edges

**Status**: Not Started
**Effort**: Small (4-6 hours)
**Dependencies**: Work Item 2
**Spec Reference**: STATUS-2025-12-31.md lines 68-70

#### Description

Simplify type-checking logic in pass2-types.ts to handle all edges uniformly instead of three separate code paths.

#### Acceptance Criteria

- [ ] Single edge iteration loop replaces separate wire/publisher/listener iterations
- [ ] Type checking logic unified: extract source type, apply transforms, check target compatibility
- [ ] Bus endpoint type resolution uses `BusStore.getBus(busId).type`
- [ ] All existing type error detection preserved (no regressions)
- [ ] Pass 2 tests updated and passing
- [ ] Compile time for golden patch unchanged (±5%)

#### Technical Notes

```typescript
// Unified type checking
for (const edge of patch.edges) {
  const sourceType = getSourceType(edge.from);
  const targetType = getTargetType(edge.to);

  // Apply transform chain
  let currentType = sourceType;
  for (const transform of edge.transforms ?? []) {
    currentType = applyTransformType(currentType, transform);
  }

  // Validate compatibility
  if (!isCompatible(currentType, targetType)) {
    errors.push(typeError(edge, currentType, targetType));
  }
}

function getSourceType(endpoint: Endpoint): TypeDesc {
  if (endpoint.kind === 'port') {
    return getBlockOutputType(endpoint.blockId, endpoint.slotId);
  } else {
    return getBusType(endpoint.busId);
  }
}
```

---

### 4. Update Pass 6 (Block Lowering) for Unified Input Resolution

**Status**: Not Started
**Effort**: Medium (8-12 hours)
**Dependencies**: Work Item 3
**Spec Reference**: STATUS-2025-12-31.md lines 72-75

#### Description

Simplify input resolution to use single edge lookup instead of three-way logic (wire > listener > default).

#### Acceptance Criteria

- [ ] `resolveInput()` finds edge with `to: { kind: 'port', blockId, slotId }`
- [ ] Priority handled by edge filtering: wires before bus listeners
- [ ] Transform chain application unified for all edge types
- [ ] Default source handling preserved (will be replaced in Sprint 2)
- [ ] All existing block lowering tests pass
- [ ] No new compilation errors on golden patch

#### Technical Notes

```typescript
function resolveInput(blockId: string, slotId: string, edges: Edge[]): Artifact | null {
  // Find edge to this input (wires take priority over listeners)
  const edge = edges.find(e =>
    e.to.kind === 'port' &&
    e.to.blockId === blockId &&
    e.to.slotId === slotId &&
    e.enabled
  );

  if (!edge) return null;

  // Resolve source
  let artifact = resolveSource(edge.from);

  // Apply transforms
  for (const transform of edge.transforms ?? []) {
    artifact = applyTransform(artifact, transform);
  }

  return artifact;
}
```

---

### 5. Update Pass 7 (Bus Lowering) for Unified Bus Handling

**Status**: Not Started
**Effort**: Medium (6-8 hours)
**Dependencies**: Work Item 4
**Spec Reference**: STATUS-2025-12-31.md lines 77-79

#### Description

Simplify bus lowering to filter edges by endpoint kind instead of managing separate publisher/listener arrays.

#### Acceptance Criteria

- [ ] Publishers identified by `edge.to.kind === 'bus'`
- [ ] Listeners identified by `edge.from.kind === 'bus'`
- [ ] Publisher sorting by weight and sortKey preserved
- [ ] Bus combine node creation logic unchanged
- [ ] All bus lowering tests pass
- [ ] Multi-bus patches compile correctly

#### Technical Notes

```typescript
function lowerBus(busId: string, edges: Edge[]): BusIR {
  // Get all publishers to this bus
  const publishers = edges
    .filter(e => e.to.kind === 'bus' && e.to.busId === busId && e.enabled)
    .sort((a, b) => {
      // Sort by weight, then sortKey
      if (a.weight !== b.weight) return (b.weight ?? 0) - (a.weight ?? 0);
      return (a.sortKey ?? 0) - (b.sortKey ?? 0);
    });

  // Create combine node
  const inputs = publishers.map(p => resolveSource(p.from));
  return createBusCombineNode(busId, inputs);
}
```

---

### 6. Update Pass 8 (Link Resolution) for Unified Wiring

**Status**: Not Started
**Effort**: Small (4-6 hours)
**Dependencies**: Work Item 5
**Spec Reference**: STATUS-2025-12-31.md lines 81-83

#### Description

Unify edge wiring logic to connect IR fragments using single edge traversal.

#### Acceptance Criteria

- [ ] Single edge iteration replaces separate connection/publisher/listener loops
- [ ] Fragment linking works for all edge types (port→port, port→bus, bus→port)
- [ ] Transform application preserved in linking
- [ ] All link resolution tests pass
- [ ] No broken connections in compiled IR

#### Technical Notes

```typescript
function linkFragments(edges: Edge[], fragments: Map<string, Fragment>): void {
  for (const edge of edges) {
    if (!edge.enabled) continue;

    const sourceFragment = getFragmentForEndpoint(edge.from, fragments);
    const targetFragment = getFragmentForEndpoint(edge.to, fragments);

    // Apply transforms during linking
    let linkValue = sourceFragment.output;
    for (const transform of edge.transforms ?? []) {
      linkValue = applyTransformIR(linkValue, transform);
    }

    connectFragments(sourceFragment, targetFragment, linkValue);
  }
}
```

---

## Dependencies

**Blocks This Sprint**:
- Sprint 2 (needs Edge type for default source materialization)
- Sprint 4 (uses transforms in Edge type)

**Blocked By**:
- None (foundational sprint)

---

## Risks

### MEDIUM: Serialization Format Migration

**Impact**: All saved patches need conversion
**Mitigation**:
- Keep old types as deprecated facades during transition
- Write comprehensive migration tests
- Version bump in serialization format
- Document migration path in CHANGELOG

### LOW: Compiler Pass Coordination

**Impact**: All passes must update simultaneously
**Mitigation**:
- Update passes sequentially (2 → 6 → 7 → 8)
- Run full test suite after each pass update
- Use feature flag to toggle between old/new implementation

### LOW: UI Component Dependencies

**Impact**: Canvas/Inspector components may reference old types
**Mitigation**:
- Defer UI updates to follow-up sprint
- Use computed getters to provide old interfaces
- Update UI incrementally after compiler stabilizes

---

## Test Strategy

### Unit Tests

```typescript
// tests/editor/types/Edge.test.ts
describe('Edge type conversions', () => {
  it('converts Connection to Edge (port→port)', () => {
    const conn: Connection = {
      id: 'c1',
      from: { blockId: 'a', slotId: 'out' },
      to: { blockId: 'b', slotId: 'in' },
      enabled: true
    };
    const edge = connectionToEdge(conn);
    expect(edge.from).toEqual({ kind: 'port', blockId: 'a', slotId: 'out' });
    expect(edge.to).toEqual({ kind: 'port', blockId: 'b', slotId: 'in' });
  });

  it('converts Publisher to Edge (port→bus)', () => {
    const pub: Publisher = {
      id: 'p1',
      from: { blockId: 'a', slotId: 'out' },
      busId: 'mybus',
      weight: 1.5,
      sortKey: 10,
      enabled: true
    };
    const edge = publisherToEdge(pub);
    expect(edge.to).toEqual({ kind: 'bus', busId: 'mybus' });
    expect(edge.weight).toBe(1.5);
  });

  it('rejects invalid bus→bus edges', () => {
    const invalidEdge: Edge = {
      id: 'e1',
      from: { kind: 'bus', busId: 'bus1' },
      to: { kind: 'bus', busId: 'bus2' },
      enabled: true
    };
    expect(() => validateEdge(invalidEdge)).toThrow('bus→bus');
  });
});
```

### Integration Tests

```typescript
// tests/compiler/passes/unified-edges.test.ts
describe('Compiler with unified edges', () => {
  it('compiles patch with mixed edge types', () => {
    const patch = createPatch({
      blocks: [
        { id: 'osc', type: 'Oscillator' },
        { id: 'gain', type: 'Gain' }
      ],
      buses: [{ id: 'audio', type: 'signal:float' }],
      edges: [
        // Wire: osc → gain
        { id: 'e1', from: port('osc', 'out'), to: port('gain', 'in') },
        // Publisher: gain → audio bus
        { id: 'e2', from: port('gain', 'out'), to: bus('audio') },
      ]
    });

    const result = compile(patch);
    expect(result.errors).toHaveLength(0);
    expect(result.ir).toBeDefined();
  });
});
```

### Golden Patch Tests

- [ ] Load all existing golden patches
- [ ] Convert to unified Edge format
- [ ] Compile and verify output matches expected
- [ ] Validate no regressions in audio/visual output

---

## Success Criteria

- [ ] All 302 existing tests pass with Edge type
- [ ] Golden patch compiles without errors
- [ ] Compile time unchanged (±5% tolerance)
- [ ] No memory leaks in edge management
- [ ] Migration helpers have 100% test coverage
- [ ] All compiler passes use unified Edge type
- [ ] Documentation updated with migration guide
- [ ] CHANGELOG entry written

---

## Follow-Up Work (Not in Sprint)

- Update UI components to render unified edges
- Complete removal of deprecated Connection/Publisher/Listener types
- Serialization format version bump and migration tool
- Performance profiling with large patches (1000+ edges)
