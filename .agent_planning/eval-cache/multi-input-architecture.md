# Multi-Input Architecture

**Cached**: 2026-01-01
**Source**: project-evaluator multi-input cleanup evaluation
**Confidence**: HIGH

## Overview

Multi-input blocks support multiple simultaneous writers to input ports through a unified architecture.

## Key Components

### 1. Type System

**CombinePolicy** (Slot-level configuration):
```typescript
export type CombinePolicy =
  | { when: 'multi'; mode: CombineMode }
  | { when: 'always'; mode: CombineMode }
  | { when: 'multi'; mode: 'error' };
```

**CombineMode** (extends BusCombineMode):
```typescript
export type CombineMode =
  | BusCombineMode      // 'sum' | 'average' | 'max' | 'min' | 'last' | 'layer'
  | 'first'             // Take first writer
  | 'error'             // Compile error on multi-input
  | { kind: 'custom'; id: string };  // Future: custom combines
```

**Field Locations**:
- `Slot.combine?: CombinePolicy` - Input port multi-input policy
- `Bus.combineMode: BusCombineMode` - Bus publisher combination (DIFFERENT PURPOSE)

### 2. Writer Resolution

**Module**: `src/editor/compiler/passes/resolveWriters.ts`

**Writer Types**:
```typescript
export type Writer =
  | { kind: 'wire'; from: { blockId: string; slotId: string }; connId: string }
  | { kind: 'bus'; listenerId: string; busId: string }
  | { kind: 'default'; defaultId: string; type: TypeDesc };
```

**Resolution Process**:
1. Enumerate all writers to input endpoint (wires, bus listeners, defaults)
2. Sort deterministically by `writerSortKey()` for stable order-dependent combines
3. Resolve combine policy (from `Slot.combine` or default)
4. Return `ResolvedInputSpec`

**Default Policy**: `{ when: 'multi', mode: 'last' }`

### 3. Combine Node Creation

**Module**: `src/editor/compiler/passes/combine-utils.ts`

**Shared Function**: `createCombineNode()`
- Used by Pass 6 (block lowering) for input ports
- Used by Pass 7 (bus lowering) for bus publishers
- Creates IR combine nodes based on CombineMode
- Future: Will support custom combine registry

### 4. Integration Points

**Pass 6 (Block Lowering)**:
- Calls `resolveBlockInputs()` to get all input writers
- Creates combine nodes via `createCombineNode()` for N > 1 writers
- Wires combine output to block input

**Pass 7 (Bus Lowering)**:
- Enumerates bus publishers via `getPublishersFromEdges()`
- Creates combine nodes for N > 1 publishers
- Uses `Bus.combineMode` (not Slot.combine)

**PatchStore/BusStore**:
- No single-input enforcement
- Allow multiple connections to same input port
- Removed `disconnectExisting()` logic

## Design Invariants

1. **No single-input enforcement** - Multiple writers allowed by default
2. **Deterministic writer order** - Order-dependent modes ('first', 'last', 'layer') are stable
3. **Shared combine utilities** - No duplicate implementations
4. **Clean type names** - No "multi" prefix (e.g., `Slot.combine` not `Slot.multiInputCombine`)
5. **No feature flags** - Multi-input always enabled

## Future Work

- Custom combine modes (`{ kind: 'custom'; id: string }`)
- Custom combine registry lookup in `combine-utils.ts`
- See TODOs at `combine-utils.ts:73, 189`
