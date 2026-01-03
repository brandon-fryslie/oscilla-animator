# Sprint Plan: Bus-Block Unification - Cleanup & Store Unification
**Generated**: 2026-01-01
**Topic**: bus-block-unification
**Sprint**: 3 of 3
**Depends on**: Sprint 2 complete

## Sprint Goal

Remove all legacy bus infrastructure (BusStore, Bus type, Endpoint union, Publisher/Listener types) and update UI components to work with BusBlocks.

---

## Scope

**In scope (this sprint):**
1. BusStore removal - buses stored as blocks in PatchStore
2. Type cleanup - remove deprecated Bus/Publisher/Listener/Endpoint types
3. UI adaptation - BusBoard, BusInspector work with BusBlocks

**Explicitly out of scope:**
- None - this completes the unification

---

## Work Items

### P0: BusStore Removal

Eliminate BusStore, manage buses as blocks in PatchStore.

**Acceptance Criteria:**
- [ ] BusStore class deleted (`src/editor/stores/BusStore.ts`)
- [ ] RootStore no longer has `busStore` property
- [ ] PatchStore has `getBusBlocks(): Block[]` computed getter
- [ ] PatchStore has `getBusById(id): Block | undefined` method
- [ ] PatchStore has `addBus(params): Block` method (creates BusBlock)
- [ ] PatchStore has `removeBus(id)` method (removes BusBlock)
- [ ] PatchStore has `updateBus(id, changes)` method
- [ ] All bus mutations use PatchStore methods
- [ ] MobX reactivity preserved for bus list changes
- [ ] TypeScript compilation succeeds
- [ ] All store tests pass

**Technical Notes:**
```typescript
// PatchStore additions
@computed get busBlocks(): Block[] {
  return this.blocks.filter(b => b.type === 'BusBlock');
}

getBusById(busId: string): Block | undefined {
  return this.blocks.find(b =>
    b.type === 'BusBlock' && b.params.busId === busId
  );
}

addBus(params: { name: string; type: TypeDesc; combine: CombinePolicy }): Block {
  const busBlock = createBusBlock(this.generateId('bus'), params);
  this.addBlock(busBlock);
  return busBlock;
}
```

**Files to modify:**
- DELETE: `src/editor/stores/BusStore.ts` (~300 lines)
- MODIFY: `src/editor/stores/RootStore.ts` (remove busStore)
- MODIFY: `src/editor/stores/PatchStore.ts` (add bus methods)

---

### P1: Type Definition Cleanup

Remove deprecated types now that buses are blocks.

**Acceptance Criteria:**
- [ ] `Endpoint` type simplified to just `PortRef` (no `kind` discrimination)
- [ ] `Bus` interface removed from types.ts
- [ ] `Publisher` interface removed from types.ts
- [ ] `Listener` interface removed from types.ts
- [ ] `Patch.buses` array removed
- [ ] `Patch.publishers` array removed
- [ ] `Patch.listeners` array removed
- [ ] Edge.from and Edge.to are typed as `PortRef` (not `Endpoint`)
- [ ] All compile errors fixed (will be many)
- [ ] TypeScript compilation succeeds
- [ ] All tests pass

**Technical Notes:**

Before:
```typescript
type Endpoint =
  | { kind: 'port'; blockId: string; slotId: string }
  | { kind: 'bus'; busId: string };

interface Edge {
  from: Endpoint;
  to: Endpoint;
}
```

After:
```typescript
interface PortRef {
  blockId: string;
  slotId: string;
}

interface Edge {
  from: PortRef;
  to: PortRef;
}
```

**Files to modify:**
- MODIFY: `src/editor/types.ts` (remove ~100 lines)
- MODIFY: Multiple files that reference deleted types

**Expected compile errors**: 50-100 (all fixable by removing dead code)

---

### P2: UI Component Adaptation

Update bus-related UI to work with BusBlocks.

**Acceptance Criteria:**
- [ ] BusBoard reads from `patchStore.busBlocks` not `busStore.buses`
- [ ] BusInspector works with BusBlock (not Bus entity)
- [ ] BusCreationDialog creates BusBlock via `patchStore.addBus()`
- [ ] BusPicker queries BusBlocks
- [ ] BusChannel renders BusBlock info
- [ ] Connection inspector handles BusBlock ports
- [ ] No UI references to deprecated BusStore
- [ ] All UI tests pass
- [ ] Manual verification: create/edit/delete bus works in dev server

**Technical Notes:**

All UI components that currently do:
```typescript
const buses = rootStore.busStore.buses;
```

Will change to:
```typescript
const buses = rootStore.patchStore.busBlocks;
```

Properties accessed via `bus.name`, `bus.type`, etc. become `busBlock.params.busName`, `busBlock.params.busType`, etc.

**Files to modify:**
- MODIFY: `src/editor/BusBoard.tsx`
- MODIFY: `src/editor/BusInspector.tsx`
- MODIFY: `src/editor/BusCreationDialog.tsx`
- MODIFY: `src/editor/BusPicker.tsx`
- MODIFY: `src/editor/BusChannel.tsx`
- MODIFY: `src/editor/ConnectionInspector.tsx`

---

## Dependencies

1. **Sprint 2 complete**: Compiler must already use BusBlocks
2. **All patches migrated**: No legacy buses in any loaded patch

---

## Risks

### Risk 1: Many Compile Errors
**Description**: Removing types will cause widespread compile errors
**Mitigation**: TypeScript guides us to all usages; fix systematically

### Risk 2: UI Regression
**Description**: Bus UI might break in subtle ways
**Mitigation**: Manual testing of all bus operations

### Risk 3: MobX Reactivity
**Description**: Switching from BusStore observables to PatchStore might break reactivity
**Mitigation**: Verify computed getters trigger updates correctly

---

## Success Metrics

- [ ] ~800-1000 lines of code deleted
- [ ] No `BusStore` class
- [ ] No `Bus`, `Publisher`, `Listener` types
- [ ] No `Endpoint` discriminated union
- [ ] All tests pass
- [ ] All UI functionality works
- [ ] Clean, unified architecture

---

## Final State

After Sprint 3, the architecture will be:

```
BEFORE (complex):
┌─────────────────────────────────────────────────────────┐
│  Patch                                                  │
│  ├── blocks: Block[]                                    │
│  ├── buses: Bus[]           ← SEPARATE ENTITY          │
│  ├── edges: Edge[]                                      │
│  │   ├── from: Endpoint     ← DISCRIMINATED UNION      │
│  │   └── to: Endpoint       ← (port | bus)             │
│  ├── publishers: Publisher[] ← DEPRECATED              │
│  └── listeners: Listener[]   ← DEPRECATED              │
│                                                         │
│  Stores                                                 │
│  ├── PatchStore (blocks, edges)                         │
│  └── BusStore (buses)       ← SEPARATE STORE           │
│                                                         │
│  Compiler                                               │
│  ├── Pass 7: bus-specific lowering                      │
│  └── Pass 8: edge-kind discrimination                   │
└─────────────────────────────────────────────────────────┘

AFTER (simple):
┌─────────────────────────────────────────────────────────┐
│  Patch                                                  │
│  ├── blocks: Block[]        ← INCLUDES BUSBLOCKS       │
│  └── edges: Edge[]                                      │
│      ├── from: PortRef      ← UNIFORM                  │
│      └── to: PortRef        ← (always port)            │
│                                                         │
│  Stores                                                 │
│  └── PatchStore (blocks, edges)  ← UNIFIED             │
│                                                         │
│  Compiler                                               │
│  └── Unified lowering (no bus-specific paths)           │
└─────────────────────────────────────────────────────────┘
```

**Code reduction**: ~1000 lines
**Concept reduction**: 3 entity types → 1 (Block)
**Edge simplification**: Endpoint union → PortRef
