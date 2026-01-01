# Sprint Plan: Bus-Block Unification - Foundation
**Generated**: 2026-01-01
**Topic**: bus-block-unification
**Sprint**: 1 of 3

## Sprint Goal

Establish BusBlock as a hidden pass-through block and create migration utilities to convert existing buses and edges to the unified model.

---

## Scope

**In scope (this sprint):**
1. BusBlock definition (hidden pass-through block type)
2. Bus→BusBlock conversion utility
3. Edge migration: Endpoint union → PortRef only

**Explicitly out of scope (future sprints):**
- Compiler pass unification (Sprint 2)
- BusStore removal (Sprint 3)
- UI component updates (Sprint 3)
- Deprecated type removal (Sprint 3)

---

## Work Items

### P0: BusBlock Definition

Create a hidden pass-through block that represents a bus.

**Acceptance Criteria:**
- [ ] `BusBlock` block definition exists in `src/editor/blocks/bus-block.ts`
- [ ] BusBlock has single multi-input port with combine policy from bus
- [ ] BusBlock has single output port
- [ ] BusBlock has `tags: { hidden: true, bus: true }`
- [ ] BusBlock has `busName` and `busId` metadata properties
- [ ] BusBlock registered in block registry
- [ ] BusBlock filtered from BlockLibrary (not shown in palette)
- [ ] TypeScript compilation succeeds

**Technical Notes:**
```typescript
// Conceptual structure
const BusBlock: BlockDefinition = {
  type: 'BusBlock',
  label: (ctx) => ctx.params.busName,
  tags: { hidden: true, bus: true, role: 'bus' },
  inputs: [{
    id: 'in',
    multi: true,
    combine: (ctx) => ctx.params.combine,
  }],
  outputs: [{
    id: 'out',
    type: (ctx) => ctx.params.busType,
  }],
  params: {
    busId: { type: 'string' },
    busName: { type: 'string' },
    busType: { type: 'typeDesc' },
    combine: { type: 'combinePolicy' },
    defaultValue: { type: 'unknown' },
  },
};
```

**Files to create/modify:**
- NEW: `src/editor/blocks/bus-block.ts`
- MODIFY: `src/editor/blocks/index.ts` (export)
- MODIFY: `src/editor/blocks/registry.ts` (register)
- MODIFY: `src/editor/BlockLibrary.tsx` (filter hidden)

---

### P1: Bus→BusBlock Conversion Utility

Create functions to convert legacy Bus entities to BusBlock instances.

**Acceptance Criteria:**
- [ ] Function `convertBusToBlock(bus: Bus): Block` exists
- [ ] Function `convertBlockToBus(block: Block): Bus` exists (for backward compat)
- [ ] Conversion preserves: id, name, type, combine, defaultValue, sortKey, origin
- [ ] BusBlock.id matches original Bus.id (stable references)
- [ ] Roundtrip conversion: Bus→Block→Bus produces equivalent bus
- [ ] Unit tests verify all conversions (8+ tests)
- [ ] TypeScript compilation succeeds

**Technical Notes:**
```typescript
function convertBusToBlock(bus: Bus): Block {
  return {
    id: bus.id,  // CRITICAL: same ID for stable references
    type: 'BusBlock',
    position: { x: 0, y: 0 },  // Hidden, position doesn't matter
    params: {
      busId: bus.id,
      busName: bus.name,
      busType: bus.type,
      combine: bus.combine,
      defaultValue: bus.defaultValue,
      sortKey: bus.sortKey,
      origin: bus.origin,
    },
  };
}
```

**Files to create/modify:**
- NEW: `src/editor/bus-block/conversion.ts`
- NEW: `src/editor/bus-block/__tests__/conversion.test.ts`

---

### P2: Edge Migration - Remove Endpoint Union

Convert all edges to use PortRef only (no Endpoint.kind='bus').

**Acceptance Criteria:**
- [ ] Function `migrateEdgesToPortOnly(patch): Patch` exists
- [ ] Publisher edges (port→bus) become port→BusBlock.in
- [ ] Listener edges (bus→port) become BusBlock.out→port
- [ ] Wire edges (port→port) unchanged
- [ ] Edge.from and Edge.to are always `{ blockId, slotId }` after migration
- [ ] No edges reference bus endpoints after migration
- [ ] Roundtrip: old patch → migrate → compile succeeds
- [ ] Unit tests verify edge conversions (10+ tests)
- [ ] TypeScript compilation succeeds

**Technical Notes:**
```typescript
function migrateEndpoint(endpoint: Endpoint, busBlocks: Map<string, Block>): PortRef {
  if (endpoint.kind === 'port') {
    return { blockId: endpoint.blockId, slotId: endpoint.slotId };
  }
  // endpoint.kind === 'bus'
  const busBlock = busBlocks.get(endpoint.busId);
  // For publishers: connect to BusBlock input
  // For listeners: connect from BusBlock output
  // Caller determines which based on from/to position
}

function migrateEdgesToPortOnly(patch: Patch): Patch {
  // 1. Convert all buses to BusBlocks
  const busBlocks = new Map(patch.buses.map(b => [b.id, convertBusToBlock(b)]));

  // 2. Add BusBlocks to blocks array
  const blocks = [...patch.blocks, ...busBlocks.values()];

  // 3. Migrate edges
  const edges = patch.edges.map(edge => ({
    ...edge,
    from: migrateEndpoint(edge.from, busBlocks, 'from'),
    to: migrateEndpoint(edge.to, busBlocks, 'to'),
  }));

  return { ...patch, blocks, edges, buses: [] };
}
```

**Files to create/modify:**
- NEW: `src/editor/bus-block/migration.ts`
- NEW: `src/editor/bus-block/__tests__/migration.test.ts`
- MODIFY: `src/editor/kernel/migration.ts` (call on load)

---

## Dependencies

1. **Hidden block filtering must work** - BlockLibrary needs to filter `tags.hidden`
2. **Multi-input combine must work** - Already verified (see eval-cache)
3. **TypeScript must compile** - Some pre-existing errors need fixing

---

## Risks

### Risk 1: ID Collision
**Description**: BusBlock IDs must match original Bus IDs for stable references
**Mitigation**: Explicitly copy `bus.id` to `block.id`

### Risk 2: Edge Direction Ambiguity
**Description**: When migrating bus endpoint, need to know if it's source or destination
**Mitigation**: Check edge.from vs edge.to position to determine direction

### Risk 3: Backward Compatibility
**Description**: Old patches have buses array, new patches have BusBlocks
**Mitigation**: Migration-on-load in kernel/migration.ts

---

## Success Metrics

- [ ] All new tests pass (18+ new tests)
- [ ] TypeScript compiles without errors
- [ ] Existing tests still pass
- [ ] Manual verification: create bus, publish, listen, compile succeeds
