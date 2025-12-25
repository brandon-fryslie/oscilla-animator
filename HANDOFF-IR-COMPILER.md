# IR Compiler Migration: Complete Handoff Document

**Worktree:** `.worktrees/ir-compiler`
**Branch:** `ir-compiler-migration`
**Last Updated:** 2025-12-24

---

## Executive Summary

You are implementing a migration from Oscilla's current closure-based compiler to a **data-driven IR (Intermediate Representation) architecture**. The goal is to replace `Program<T> = { signal(t, ctx) => ... }` with pure data structures that a deterministic VM executes.

**Core insight:** The "program" becomes data, not JavaScript functions. This enables:
- Deterministic execution
- Debuggability (every step is traceable)
- Hot-swap without jank
- Future Rust/WASM runtime

**Your immediate focus:** Phase 1 - Contracts & Type Unification (4 topics).

---

## Current State of the Codebase

### Directory Structure

```
src/
  editor/
    types.ts              # TypeDesc, TypeWorld, CoreDomain, SlotType, Bus, etc.
    blocks/types.ts       # BlockDefinition, Slot, ParamSchema
    compiler/
      types.ts            # ValueKind, Artifact, CompileResult, TimeModel
      compile.ts          # Main compiler entry
      compileBusAware.ts  # Bus-aware compilation
      blocks/             # Per-block compilers (return closures today)
    adapters/
      AdapterRegistry.ts  # Adapter definitions
    lenses/
      LensRegistry.ts     # Lens definitions
    semantic/
      busContracts.ts     # Reserved bus contracts
```

### The Type Duplication Problem

**There are TWO parallel type systems that must be unified:**

1. **Editor types** (`src/editor/types.ts`):
   ```typescript
   type TypeWorld = 'signal' | 'field' | 'scalar' | 'config';
   type CoreDomain = 'number' | 'vec2' | 'color' | 'boolean' | 'time' | 'phase' | 'rate' | 'trigger';
   type InternalDomain = 'point' | 'duration' | 'hsl' | 'path' | ...;

   interface TypeDesc {
     world: TypeWorld;
     domain: Domain;
     category: TypeCategory;
     busEligible: boolean;
     semantics?: string;
     unit?: string;
   }
   ```

2. **Compiler types** (`src/editor/compiler/types.ts`):
   ```typescript
   type ValueKind =
     | 'Scalar:number' | 'Scalar:string' | 'Scalar:vec2' | ...
     | 'Field:number' | 'Field:vec2' | 'Field<Point>' | ...
     | 'Signal:number' | 'Signal:phase' | 'Signal:Time' | ...
     | 'Domain' | 'RenderTreeProgram' | 'Event' | ...;
   ```

**Problem:** `ValueKind` is a flat string union, while `TypeDesc` is a structured object. They represent the same concept but diverge in representation. The mapping `SLOT_TYPE_TO_TYPE_DESC` in `types.ts` tries to bridge them but it's incomplete and ad-hoc.

### Current Compilation Flow

```
Patch (blocks, connections, buses)
    ↓
compileBusAware()
    ↓
For each block in topo order:
    blockCompiler.compile() → { 'portName': Artifact }
    ↓
Artifacts are closures: { kind: 'Signal:number', value: (t, ctx) => number }
    ↓
Final output: Program<RenderTree> with signal/event closures
```

**Problem:** Artifacts contain closures, not data. This prevents:
- Serialization
- Structural diffing for hot-swap
- Deterministic debugging
- Rust port

---

## Target Architecture (From Spec)

### The IR Data Model

```typescript
interface CompiledProgramIR {
  irVersion: number;
  patchId: string;
  patchRevision: number;
  compileId: string;
  seed: number;

  // Time topology (authoritative)
  timeModel: TimeModelIR;

  // Tables (pure data)
  types: TypeTable;
  nodes: NodeTable;
  buses: BusTable;
  lenses: LensTable;
  adapters: AdapterTable;
  fields: FieldExprTable;

  // Execution plan
  schedule: ScheduleIR;

  // Render outputs
  outputs: OutputSpec[];

  // Debug metadata
  meta: ProgramMeta;
}
```

### Key Design Invariants

1. **Program is data.** No user-meaningful logic in closures.
2. **Determinism:** Same inputs → identical outputs.
3. **Lazy Fields:** Fields are expressions until forced by sink.
4. **Stable identity:** All nodes/buses/steps have stable IDs for diffing.
5. **Central value store:** All values in indexed ValueStore.
6. **Instrumentation is structural:** Every runtime event maps to IR step.

---

## Phase 1: Your Work

You are implementing **Phase 1: Contracts & Type Unification**. This is foundational - pure type definitions with no runtime impact. The app keeps running throughout.

### Topic 1: `type-unification`

**Goal:** Unify editor `TypeDesc` and compiler `ValueKind` into one canonical type system.

**Deliverables:**

1. **New file:** `src/editor/ir/types/TypeDesc.ts`

```typescript
// Unified type worlds
export type TypeWorld = 'signal' | 'field' | 'scalar' | 'event' | 'special';

// All domains in one union
export type TypeDomain =
  // Primitives
  | 'number' | 'boolean' | 'string'
  // Vectors
  | 'vec2' | 'vec3' | 'vec4'
  // Colors
  | 'color'
  // Time-related
  | 'timeMs' | 'phase01' | 'unit01'
  // Events
  | 'trigger'
  // Special
  | 'domain' | 'renderTree' | 'renderCmds'
  | 'path' | 'strokeStyle' | 'filterDef'
  | 'bounds'
  // Mesh/3D (future)
  | 'mesh' | 'camera' | 'mat4'
  | 'unknown';

// The canonical type descriptor
export interface TypeDesc {
  readonly world: TypeWorld;
  readonly domain: TypeDomain;
  readonly semantics?: string;  // e.g., 'point', 'hsl', 'linearRGB'
  readonly unit?: string;       // e.g., 'px', 'deg', 'ms', 'seconds'
}

// Category for UI/validation (derived, not stored)
export type TypeCategory = 'core' | 'internal';

// Helper to determine category
export function getTypeCategory(type: TypeDesc): TypeCategory {
  const internalDomains: TypeDomain[] = [
    'domain', 'renderTree', 'renderCmds', 'path',
    'strokeStyle', 'filterDef', 'mesh', 'camera', 'mat4'
  ];
  return internalDomains.includes(type.domain) ? 'internal' : 'core';
}

// Helper to determine bus eligibility
export function isBusEligible(type: TypeDesc): boolean {
  if (type.world === 'special') return false;
  return getTypeCategory(type) === 'core';
}

// Type equality (structural)
export function typeEquals(a: TypeDesc, b: TypeDesc): boolean {
  return a.world === b.world &&
         a.domain === b.domain &&
         (a.semantics ?? null) === (b.semantics ?? null);
}

// Type compatibility for connections
export function isCompatible(from: TypeDesc, to: TypeDesc): boolean {
  // Same world and domain = compatible
  if (from.world === to.world && from.domain === to.domain) return true;

  // Scalar can promote to Signal
  if (from.world === 'scalar' && to.world === 'signal' && from.domain === to.domain) return true;

  // Signal can broadcast to Field
  if (from.world === 'signal' && to.world === 'field' && from.domain === to.domain) return true;

  return false;
}
```

2. **Deprecation path for old types:**

```typescript
// In src/editor/types.ts, add deprecation markers:

/**
 * @deprecated Use TypeDesc from 'ir/types/TypeDesc' instead.
 * Kept for backward compatibility during migration.
 */
export type LegacyTypeWorld = 'signal' | 'field' | 'scalar' | 'config';
```

3. **Bridge utilities:**

```typescript
// src/editor/ir/types/typeConversion.ts

import type { TypeDesc } from './TypeDesc';
import type { ValueKind } from '../../compiler/types';
import type { SlotType } from '../../types';

// Convert legacy ValueKind to TypeDesc
export function valueKindToTypeDesc(kind: ValueKind): TypeDesc {
  const mapping: Record<string, TypeDesc> = {
    'Scalar:number': { world: 'scalar', domain: 'number' },
    'Signal:number': { world: 'signal', domain: 'number' },
    'Signal:phase': { world: 'signal', domain: 'phase01' },
    'Signal:Time': { world: 'signal', domain: 'timeMs' },
    'Field:number': { world: 'field', domain: 'number' },
    'Field:vec2': { world: 'field', domain: 'vec2' },
    'Field<Point>': { world: 'field', domain: 'vec2', semantics: 'point' },
    'Domain': { world: 'special', domain: 'domain' },
    'RenderTree': { world: 'special', domain: 'renderTree' },
    'Event': { world: 'event', domain: 'trigger' },
    // ... complete mapping
  };

  const result = mapping[kind];
  if (!result) {
    console.warn(`Unknown ValueKind: ${kind}`);
    return { world: 'special', domain: 'unknown' };
  }
  return result;
}

// Convert SlotType string to TypeDesc
export function slotTypeToTypeDesc(slot: SlotType): TypeDesc {
  // Parse the slot type string
  if (slot.startsWith('Signal<')) {
    const inner = slot.slice(7, -1);
    return { world: 'signal', domain: domainFromString(inner) };
  }
  if (slot.startsWith('Field<')) {
    const inner = slot.slice(6, -1);
    return { world: 'field', domain: domainFromString(inner) };
  }
  if (slot.startsWith('Scalar:')) {
    const inner = slot.slice(7);
    return { world: 'scalar', domain: domainFromString(inner) };
  }
  // Handle special cases
  if (slot === 'Domain') return { world: 'special', domain: 'domain' };
  if (slot === 'RenderTree' || slot === 'Render') return { world: 'special', domain: 'renderTree' };
  // ... etc

  return { world: 'special', domain: 'unknown' };
}

function domainFromString(s: string): TypeDomain {
  const map: Record<string, TypeDomain> = {
    'number': 'number',
    'vec2': 'vec2',
    'Point': 'vec2',
    'color': 'color',
    'phase': 'phase01',
    'time': 'timeMs',
    'Time': 'timeMs',
    'Unit': 'unit01',
    'boolean': 'boolean',
    'string': 'string',
    'trigger': 'trigger',
    // ... complete mapping
  };
  return map[s] ?? 'unknown';
}
```

**Test Strategy:**

```typescript
// src/editor/ir/types/__tests__/TypeDesc.test.ts

import { describe, it, expect } from 'vitest';
import { typeEquals, isCompatible, isBusEligible, getTypeCategory } from '../TypeDesc';
import { valueKindToTypeDesc, slotTypeToTypeDesc } from '../typeConversion';

describe('TypeDesc', () => {
  describe('typeEquals', () => {
    it('considers same world+domain equal', () => {
      const a = { world: 'signal', domain: 'number' } as const;
      const b = { world: 'signal', domain: 'number' } as const;
      expect(typeEquals(a, b)).toBe(true);
    });

    it('considers different semantics unequal', () => {
      const a = { world: 'field', domain: 'vec2', semantics: 'point' } as const;
      const b = { world: 'field', domain: 'vec2', semantics: 'velocity' } as const;
      expect(typeEquals(a, b)).toBe(false);
    });
  });

  describe('isCompatible', () => {
    it('allows scalar → signal promotion', () => {
      const from = { world: 'scalar', domain: 'number' } as const;
      const to = { world: 'signal', domain: 'number' } as const;
      expect(isCompatible(from, to)).toBe(true);
    });

    it('allows signal → field broadcast', () => {
      const from = { world: 'signal', domain: 'number' } as const;
      const to = { world: 'field', domain: 'number' } as const;
      expect(isCompatible(from, to)).toBe(true);
    });

    it('rejects field → signal (needs explicit reduce)', () => {
      const from = { world: 'field', domain: 'number' } as const;
      const to = { world: 'signal', domain: 'number' } as const;
      expect(isCompatible(from, to)).toBe(false);
    });
  });

  describe('isBusEligible', () => {
    it('returns true for core signal types', () => {
      expect(isBusEligible({ world: 'signal', domain: 'number' })).toBe(true);
      expect(isBusEligible({ world: 'signal', domain: 'phase01' })).toBe(true);
    });

    it('returns false for internal types', () => {
      expect(isBusEligible({ world: 'special', domain: 'renderTree' })).toBe(false);
      expect(isBusEligible({ world: 'special', domain: 'domain' })).toBe(false);
    });
  });
});

describe('Type Conversion', () => {
  describe('valueKindToTypeDesc', () => {
    it('converts Signal:number correctly', () => {
      const result = valueKindToTypeDesc('Signal:number');
      expect(result).toEqual({ world: 'signal', domain: 'number' });
    });

    it('converts Field<Point> with semantics', () => {
      const result = valueKindToTypeDesc('Field<Point>');
      expect(result).toEqual({ world: 'field', domain: 'vec2', semantics: 'point' });
    });
  });

  describe('slotTypeToTypeDesc', () => {
    it('parses Signal<phase> correctly', () => {
      const result = slotTypeToTypeDesc('Signal<phase>');
      expect(result).toEqual({ world: 'signal', domain: 'phase01' });
    });
  });
});
```

### Topic 2: `dense-id-system`

**Goal:** Introduce dense numeric indices for runtime lookups. String keys become debug-only.

**Deliverables:**

1. **New file:** `src/editor/ir/types/Indices.ts`

```typescript
// Dense index types (branded for type safety)
export type NodeIndex = number & { readonly __brand: 'NodeIndex' };
export type PortIndex = number & { readonly __brand: 'PortIndex' };
export type BusIndex = number & { readonly __brand: 'BusIndex' };
export type ValueSlot = number & { readonly __brand: 'ValueSlot' };
export type StepIndex = number & { readonly __brand: 'StepIndex' };

// Stable string IDs (for persistence, debugging, hot-swap matching)
export type NodeId = string & { readonly __brand: 'NodeId' };
export type BusId = string & { readonly __brand: 'BusId' };
export type StepId = string & { readonly __brand: 'StepId' };
export type ExprId = string & { readonly __brand: 'ExprId' };
export type StateId = string & { readonly __brand: 'StateId' };

// Create branded types (compile-time only, no runtime cost)
export function nodeIndex(n: number): NodeIndex { return n as NodeIndex; }
export function portIndex(n: number): PortIndex { return n as PortIndex; }
export function busIndex(n: number): BusIndex { return n as BusIndex; }
export function valueSlot(n: number): ValueSlot { return n as ValueSlot; }
export function stepIndex(n: number): StepIndex { return n as StepIndex; }

export function nodeId(s: string): NodeId { return s as NodeId; }
export function busId(s: string): BusId { return s as BusId; }
export function stepId(s: string): StepId { return s as StepId; }
export function exprId(s: string): ExprId { return s as ExprId; }
export function stateId(s: string): StateId { return s as StateId; }
```

2. **New file:** `src/editor/ir/types/DebugIndex.ts`

```typescript
import type { NodeIndex, NodeId, BusIndex, BusId, ValueSlot } from './Indices';

/**
 * DebugIndex maps dense numeric indices back to string IDs.
 * Built at compile time. Used for debugging, not runtime evaluation.
 */
export interface DebugIndex {
  // Compile identity
  readonly compileId: string;
  readonly patchRevision: number;

  // Node lookup
  readonly nodeIdToIndex: ReadonlyMap<NodeId, NodeIndex>;
  readonly nodeIndexToId: readonly NodeId[];

  // Bus lookup
  readonly busIdToIndex: ReadonlyMap<BusId, BusIndex>;
  readonly busIndexToId: readonly BusId[];

  // Port lookup (for debugging wire values)
  readonly portKeyToSlot: ReadonlyMap<string, ValueSlot>; // 'nodeId:portName' -> slot
  readonly slotToPortKey: readonly string[];

  // Source mapping (IR node -> editor block)
  readonly nodeIdToBlockId: ReadonlyMap<NodeId, string>;
}

/**
 * Build a DebugIndex from compilation artifacts.
 */
export class DebugIndexBuilder {
  private nodeIdToIndex = new Map<NodeId, NodeIndex>();
  private nodeIndexToId: NodeId[] = [];

  private busIdToIndex = new Map<BusId, BusIndex>();
  private busIndexToId: BusId[] = [];

  private portKeyToSlot = new Map<string, ValueSlot>();
  private slotToPortKey: string[] = [];

  private nodeIdToBlockId = new Map<NodeId, string>();

  constructor(
    private compileId: string,
    private patchRevision: number
  ) {}

  internNode(id: NodeId, blockId?: string): NodeIndex {
    let idx = this.nodeIdToIndex.get(id);
    if (idx === undefined) {
      idx = this.nodeIndexToId.length as NodeIndex;
      this.nodeIdToIndex.set(id, idx);
      this.nodeIndexToId.push(id);
      if (blockId) {
        this.nodeIdToBlockId.set(id, blockId);
      }
    }
    return idx;
  }

  internBus(id: BusId): BusIndex {
    let idx = this.busIdToIndex.get(id);
    if (idx === undefined) {
      idx = this.busIndexToId.length as BusIndex;
      this.busIdToIndex.set(id, idx);
      this.busIndexToId.push(id);
    }
    return idx;
  }

  internPort(nodeId: NodeId, portName: string): ValueSlot {
    const key = `${nodeId}:${portName}`;
    let slot = this.portKeyToSlot.get(key);
    if (slot === undefined) {
      slot = this.slotToPortKey.length as ValueSlot;
      this.portKeyToSlot.set(key, slot);
      this.slotToPortKey.push(key);
    }
    return slot;
  }

  build(): DebugIndex {
    return {
      compileId: this.compileId,
      patchRevision: this.patchRevision,
      nodeIdToIndex: this.nodeIdToIndex,
      nodeIndexToId: this.nodeIndexToId,
      busIdToIndex: this.busIdToIndex,
      busIndexToId: this.busIndexToId,
      portKeyToSlot: this.portKeyToSlot,
      slotToPortKey: this.slotToPortKey,
      nodeIdToBlockId: this.nodeIdToBlockId,
    };
  }
}
```

**Test Strategy:**

```typescript
// src/editor/ir/types/__tests__/Indices.test.ts

import { describe, it, expect } from 'vitest';
import { DebugIndexBuilder, nodeId, busId } from '../DebugIndex';
import { nodeIndex, busIndex } from '../Indices';

describe('DebugIndexBuilder', () => {
  it('assigns sequential indices to nodes', () => {
    const builder = new DebugIndexBuilder('test-compile', 1);

    const idx1 = builder.internNode(nodeId('node-a'));
    const idx2 = builder.internNode(nodeId('node-b'));
    const idx3 = builder.internNode(nodeId('node-a')); // same as idx1

    expect(idx1).toBe(0);
    expect(idx2).toBe(1);
    expect(idx3).toBe(0); // Interned, same index
  });

  it('builds a consistent debug index', () => {
    const builder = new DebugIndexBuilder('test-compile', 1);

    builder.internNode(nodeId('osc-1'), 'block-1');
    builder.internNode(nodeId('add-1'), 'block-2');
    builder.internBus(busId('phaseA'));
    builder.internPort(nodeId('osc-1'), 'out');

    const index = builder.build();

    expect(index.nodeIndexToId[0]).toBe('osc-1');
    expect(index.nodeIdToIndex.get(nodeId('osc-1'))).toBe(0);
    expect(index.busIndexToId[0]).toBe('phaseA');
    expect(index.slotToPortKey[0]).toBe('osc-1:out');
  });

  it('supports round-trip id↔index lookup', () => {
    const builder = new DebugIndexBuilder('test', 1);
    const nid = nodeId('my-node');
    const idx = builder.internNode(nid);
    const index = builder.build();

    // Index → ID
    expect(index.nodeIndexToId[idx]).toBe('my-node');
    // ID → Index
    expect(index.nodeIdToIndex.get(nid)).toBe(idx);
  });
});
```

### Topic 3: `ir-core-types`

**Goal:** Define core IR TypeScript interfaces. Pure types, no implementation.

**Deliverables:**

1. **New file:** `src/editor/ir/schema/CompiledProgramIR.ts`

```typescript
import type { NodeIndex, BusIndex, ValueSlot, NodeId, BusId, StepId, StateId } from '../types/Indices';
import type { TypeDesc } from '../types/TypeDesc';
import type { DebugIndex } from '../types/DebugIndex';

// ============================================================================
// Top-Level Program Container
// ============================================================================

export interface CompiledProgramIR {
  readonly irVersion: 1;

  // Identity
  readonly patchId: string;
  readonly patchRevision: number;
  readonly compileId: string;
  readonly seed: number;

  // Time topology
  readonly timeModel: TimeModelIR;

  // Tables
  readonly types: TypeTable;
  readonly nodes: NodeTable;
  readonly buses: BusTable;
  readonly constPool: ConstPool;
  readonly defaultSources: DefaultSourceTable;
  readonly transforms: TransformTable;

  // Schedule
  readonly schedule: ScheduleIR;

  // Outputs
  readonly outputs: readonly OutputSpec[];

  // Debug
  readonly debugIndex: DebugIndex;
  readonly meta: ProgramMeta;
}

// ============================================================================
// Time Model
// ============================================================================

export type TimeModelIR =
  | FiniteTimeModelIR
  | CyclicTimeModelIR
  | InfiniteTimeModelIR;

export interface FiniteTimeModelIR {
  readonly kind: 'finite';
  readonly durationMs: number;
  readonly cuePoints?: readonly CuePointIR[];
}

export interface CyclicTimeModelIR {
  readonly kind: 'cyclic';
  readonly periodMs: number;
  readonly mode: 'loop' | 'pingpong';
  readonly phaseDomain: '0..1';
}

export interface InfiniteTimeModelIR {
  readonly kind: 'infinite';
  readonly windowMs: number;
  readonly suggestedUIWindowMs?: number;
}

export interface CuePointIR {
  readonly id: string;
  readonly label: string;
  readonly tMs: number;
  readonly behavior?: 'snap' | 'event';
}

// ============================================================================
// Type Table
// ============================================================================

export interface TypeTable {
  readonly types: readonly TypeDesc[];
  // Future: typeIdToIndex for interning
}

// ============================================================================
// Node Table
// ============================================================================

export interface NodeTable {
  readonly nodes: readonly NodeIR[];
  readonly nodeIdToIndex: ReadonlyMap<NodeId, NodeIndex>;
}

export interface NodeIR {
  readonly id: NodeId;
  readonly index: NodeIndex;

  // Categorization for tooling
  readonly capability: NodeCapability;

  // Operation
  readonly op: OpCode;

  // Ports
  readonly inputs: readonly InputPortIR[];
  readonly outputs: readonly OutputPortIR[];

  // Constants (if any)
  readonly consts?: ConstPoolRef;

  // State bindings (if any)
  readonly state?: readonly StateBindingIR[];

  // Debug metadata
  readonly meta?: NodeMeta;
}

export type NodeCapability = 'time' | 'identity' | 'state' | 'render' | 'io' | 'pure';

export interface InputPortIR {
  readonly name: string;
  readonly type: TypeDesc;
  readonly source: InputSourceIR;
  readonly transform?: TransformChainRef;
}

export interface OutputPortIR {
  readonly name: string;
  readonly type: TypeDesc;
  readonly slot: ValueSlot;
}

// ============================================================================
// Input Sources
// ============================================================================

export type InputSourceIR =
  | { readonly kind: 'slot'; readonly slot: ValueSlot }
  | { readonly kind: 'bus'; readonly busIndex: BusIndex }
  | { readonly kind: 'const'; readonly constId: string }
  | { readonly kind: 'defaultSource'; readonly defaultId: string }
  | { readonly kind: 'rail'; readonly railId: string }
  | { readonly kind: 'external'; readonly externalId: string };

// ============================================================================
// Bus Table
// ============================================================================

export interface BusTable {
  readonly buses: readonly BusIR[];
  readonly busIdToIndex: ReadonlyMap<BusId, BusIndex>;
}

export interface BusIR {
  readonly id: BusId;
  readonly index: BusIndex;
  readonly type: TypeDesc;
  readonly combineMode: BusCombineMode;
  readonly defaultConstId?: string;
  readonly publishers: readonly PublisherIR[];
  readonly listeners: readonly ListenerIR[];
  readonly outputSlot: ValueSlot;
}

export type BusCombineMode = 'sum' | 'average' | 'max' | 'min' | 'last' | 'layer';

export interface PublisherIR {
  readonly sourceSlot: ValueSlot;
  readonly sortKey: number;
  readonly weight?: number;
  readonly enabled: boolean;
  readonly transform?: TransformChainRef;
}

export interface ListenerIR {
  readonly targetNodeIndex: NodeIndex;
  readonly targetInputIndex: number;
  readonly enabled: boolean;
  readonly transform?: TransformChainRef;
}

// ============================================================================
// Constants & Default Sources
// ============================================================================

export interface ConstPool {
  readonly entries: ReadonlyMap<string, TypedConst>;
}

export interface TypedConst {
  readonly type: TypeDesc;
  readonly value: unknown; // JSON-serializable
}

export type ConstPoolRef = string; // constId

export interface DefaultSourceTable {
  readonly sources: ReadonlyMap<string, DefaultSourceIR>;
}

export interface DefaultSourceIR {
  readonly type: TypeDesc;
  readonly value: unknown;
  readonly uiHint?: UIHintIR;
}

export interface UIHintIR {
  readonly kind: 'slider' | 'number' | 'select' | 'color' | 'boolean' | 'text';
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: readonly { readonly value: string; readonly label: string }[];
}

// ============================================================================
// Transforms (Adapters + Lenses)
// ============================================================================

export interface TransformTable {
  readonly chains: ReadonlyMap<string, TransformChainIR>;
}

export type TransformChainRef = string; // chainId

export interface TransformChainIR {
  readonly id: string;
  readonly steps: readonly TransformStepIR[];
  readonly inputType: TypeDesc;
  readonly outputType: TypeDesc;
}

export interface TransformStepIR {
  readonly kind: 'adapter' | 'lens';
  readonly implId: string;
  readonly params: ReadonlyMap<string, unknown>;
}

// ============================================================================
// State
// ============================================================================

export interface StateBindingIR {
  readonly stateId: StateId;
  readonly type: TypeDesc;
  readonly initialConstId?: string;
  readonly policy: 'frame' | 'timeMs';
}

// ============================================================================
// Schedule
// ============================================================================

export interface ScheduleIR {
  readonly steps: readonly StepIR[];
  readonly phasePartition: PhasePartitionIR;
}

export type StepIR =
  | TimeDeriveStepIR
  | NodeEvalStepIR
  | BusEvalStepIR
  | MaterializeStepIR
  | RenderAssembleStepIR
  | DebugProbeStepIR;

export interface TimeDeriveStepIR {
  readonly kind: 'timeDerive';
  readonly id: StepId;
  readonly outputSlots: readonly ValueSlot[];
}

export interface NodeEvalStepIR {
  readonly kind: 'nodeEval';
  readonly id: StepId;
  readonly nodeIndex: NodeIndex;
  readonly cacheKey?: CacheKeySpec;
}

export interface BusEvalStepIR {
  readonly kind: 'busEval';
  readonly id: StepId;
  readonly busIndex: BusIndex;
  readonly cacheKey?: CacheKeySpec;
}

export interface MaterializeStepIR {
  readonly kind: 'materialize';
  readonly id: StepId;
  readonly exprId: string;
  readonly targetBuffer: string;
  readonly domainSize: ValueSlot | number;
}

export interface RenderAssembleStepIR {
  readonly kind: 'renderAssemble';
  readonly id: StepId;
  readonly rootNodeIndices: readonly NodeIndex[];
}

export interface DebugProbeStepIR {
  readonly kind: 'debugProbe';
  readonly id: StepId;
  readonly targetSlot: ValueSlot;
  readonly probeId: string;
}

export interface PhasePartitionIR {
  readonly timeDerive: readonly StepId[];
  readonly preBus: readonly StepId[];
  readonly bus: readonly StepId[];
  readonly postBus: readonly StepId[];
  readonly materializeRender: readonly StepId[];
  readonly renderAssemble: readonly StepId[];
}

export interface CacheKeySpec {
  readonly policy: 'none' | 'perFrame' | 'untilInvalidated';
  readonly deps?: readonly ValueSlot[];
}

// ============================================================================
// Outputs
// ============================================================================

export interface OutputSpec {
  readonly kind: 'renderTree' | 'renderCommands';
  readonly sourceSlot: ValueSlot;
}

// ============================================================================
// Metadata
// ============================================================================

export interface ProgramMeta {
  readonly names: {
    readonly nodes: ReadonlyMap<NodeId, string>;
    readonly buses: ReadonlyMap<BusId, string>;
    readonly steps: ReadonlyMap<StepId, string>;
  };
  readonly warnings?: readonly CompileWarningIR[];
}

export interface CompileWarningIR {
  readonly code: string;
  readonly message: string;
  readonly where?: { readonly nodeId?: NodeId; readonly busId?: BusId };
}

export interface NodeMeta {
  readonly label?: string;
  readonly blockId?: string;
  readonly portNames?: readonly string[];
}

// ============================================================================
// OpCodes (Taxonomy)
// ============================================================================

export type OpCode =
  // Time operations
  | { readonly op: 'time.absMs' }
  | { readonly op: 'time.modelMs' }
  | { readonly op: 'time.phase01' }
  | { readonly op: 'time.wrapEvent' }

  // Identity/Domain operations
  | { readonly op: 'domain.n' }
  | { readonly op: 'domain.stableId' }
  | { readonly op: 'domain.index' }

  // Pure math (scalar)
  | { readonly op: 'math.add' }
  | { readonly op: 'math.mul' }
  | { readonly op: 'math.div' }
  | { readonly op: 'math.mod' }
  | { readonly op: 'math.sin' }
  | { readonly op: 'math.cos' }
  | { readonly op: 'math.clamp' }
  | { readonly op: 'math.lerp' }
  | { readonly op: 'math.map' }
  | { readonly op: 'math.noise' }

  // Pure math (vector)
  | { readonly op: 'vec.add' }
  | { readonly op: 'vec.sub' }
  | { readonly op: 'vec.scale' }
  | { readonly op: 'vec.dot' }
  | { readonly op: 'vec.normalize' }
  | { readonly op: 'vec.length' }

  // State operations
  | { readonly op: 'state.integrate' }
  | { readonly op: 'state.delay' }
  | { readonly op: 'state.sampleHold' }
  | { readonly op: 'state.slew' }

  // Render operations
  | { readonly op: 'render.instances2d' }
  | { readonly op: 'render.group' }
  | { readonly op: 'render.filter' }
  | { readonly op: 'render.composite' }

  // IO operations
  | { readonly op: 'io.viewport' }

  // Transform operations (applied via chains)
  | { readonly op: 'transform.scale' }
  | { readonly op: 'transform.offset' }
  | { readonly op: 'transform.clamp' }
  | { readonly op: 'transform.invert' }
  | { readonly op: 'transform.quantize' }

  // Field operations
  | { readonly op: 'field.broadcast' }
  | { readonly op: 'field.reduce' }
  | { readonly op: 'field.map' }
  | { readonly op: 'field.zip' }

  // Special
  | { readonly op: 'noop' }
  | { readonly op: 'custom'; readonly kernelId: string };
```

**Test Strategy:**

```typescript
// src/editor/ir/schema/__tests__/CompiledProgramIR.test.ts

import { describe, it, expect } from 'vitest';
import type { CompiledProgramIR, NodeIR, BusIR } from '../CompiledProgramIR';
import { nodeId, busId, nodeIndex, busIndex, valueSlot } from '../../types/Indices';

describe('CompiledProgramIR Schema', () => {
  it('can construct a minimal valid program', () => {
    const program: CompiledProgramIR = {
      irVersion: 1,
      patchId: 'test-patch',
      patchRevision: 1,
      compileId: 'compile-1',
      seed: 42,

      timeModel: {
        kind: 'cyclic',
        periodMs: 4000,
        mode: 'loop',
        phaseDomain: '0..1',
      },

      types: { types: [] },
      nodes: { nodes: [], nodeIdToIndex: new Map() },
      buses: { buses: [], busIdToIndex: new Map() },
      constPool: { entries: new Map() },
      defaultSources: { sources: new Map() },
      transforms: { chains: new Map() },

      schedule: {
        steps: [],
        phasePartition: {
          timeDerive: [],
          preBus: [],
          bus: [],
          postBus: [],
          materializeRender: [],
          renderAssemble: [],
        },
      },

      outputs: [],
      debugIndex: {
        compileId: 'compile-1',
        patchRevision: 1,
        nodeIdToIndex: new Map(),
        nodeIndexToId: [],
        busIdToIndex: new Map(),
        busIndexToId: [],
        portKeyToSlot: new Map(),
        slotToPortKey: [],
        nodeIdToBlockId: new Map(),
      },
      meta: {
        names: {
          nodes: new Map(),
          buses: new Map(),
          steps: new Map(),
        },
      },
    };

    expect(program.irVersion).toBe(1);
    expect(program.timeModel.kind).toBe('cyclic');
  });

  it('types a node correctly', () => {
    const node: NodeIR = {
      id: nodeId('osc-1'),
      index: nodeIndex(0),
      capability: 'pure',
      op: { op: 'math.sin' },
      inputs: [
        {
          name: 'phase',
          type: { world: 'signal', domain: 'phase01' },
          source: { kind: 'slot', slot: valueSlot(0) },
        },
      ],
      outputs: [
        {
          name: 'out',
          type: { world: 'signal', domain: 'number' },
          slot: valueSlot(1),
        },
      ],
    };

    expect(node.op.op).toBe('math.sin');
    expect(node.inputs[0].source.kind).toBe('slot');
  });

  it('types a bus correctly', () => {
    const bus: BusIR = {
      id: busId('phaseA'),
      index: busIndex(0),
      type: { world: 'signal', domain: 'phase01' },
      combineMode: 'last',
      publishers: [
        {
          sourceSlot: valueSlot(1),
          sortKey: 0,
          enabled: true,
        },
      ],
      listeners: [],
      outputSlot: valueSlot(100),
    };

    expect(bus.combineMode).toBe('last');
    expect(bus.publishers.length).toBe(1);
  });
});
```

### Topic 4: `timemodel-ir`

**Goal:** Define TimeModelIR with canonical time signals.

**Deliverables:**

1. **Extend** `src/editor/ir/schema/CompiledProgramIR.ts` (already includes TimeModelIR above)

2. **New file:** `src/editor/ir/time/TimeDerivation.ts`

```typescript
import type { TimeModelIR, CyclicTimeModelIR, FiniteTimeModelIR, InfiniteTimeModelIR } from '../schema/CompiledProgramIR';
import type { ValueSlot } from '../types/Indices';

/**
 * Canonical time signals produced by time derivation.
 * These are always available regardless of TimeModel kind.
 */
export interface CanonicalTimeSignals {
  /** Absolute monotonic time in milliseconds (never wraps) */
  readonly tAbsMs: ValueSlot;

  /** Model-local time in milliseconds (may wrap for cyclic) */
  readonly tModelMs: ValueSlot;

  /** Phase 0..1 (cyclic/finite only, undefined for infinite) */
  readonly phase01?: ValueSlot;

  /** Wrap event (true on frame where wrap occurred) */
  readonly wrapEvent?: ValueSlot;

  /** Progress 0..1 for finite animations */
  readonly progress?: ValueSlot;

  /** End event for finite animations */
  readonly endEvent?: ValueSlot;
}

/**
 * Derive which canonical time signals are available for a TimeModel.
 */
export function deriveTimeSignals(model: TimeModelIR): CanonicalTimeSignalSpec {
  switch (model.kind) {
    case 'cyclic':
      return {
        tAbsMs: true,
        tModelMs: true,
        phase01: true,
        wrapEvent: true,
        progress: false,
        endEvent: false,
      };

    case 'finite':
      return {
        tAbsMs: true,
        tModelMs: true,
        phase01: true, // progress is also a phase
        wrapEvent: false,
        progress: true,
        endEvent: true,
      };

    case 'infinite':
      return {
        tAbsMs: true,
        tModelMs: true,
        phase01: false,
        wrapEvent: false,
        progress: false,
        endEvent: false,
      };
  }
}

export interface CanonicalTimeSignalSpec {
  readonly tAbsMs: boolean;
  readonly tModelMs: boolean;
  readonly phase01: boolean;
  readonly wrapEvent: boolean;
  readonly progress: boolean;
  readonly endEvent: boolean;
}

/**
 * Validate a TimeModel for internal consistency.
 */
export function validateTimeModel(model: TimeModelIR): ValidationResult {
  const errors: string[] = [];

  switch (model.kind) {
    case 'cyclic':
      if (model.periodMs <= 0) {
        errors.push('Cyclic time model must have periodMs > 0');
      }
      if (model.phaseDomain !== '0..1') {
        errors.push('Cyclic time model phaseDomain must be "0..1"');
      }
      break;

    case 'finite':
      if (model.durationMs <= 0) {
        errors.push('Finite time model must have durationMs > 0');
      }
      if (model.cuePoints) {
        for (const cp of model.cuePoints) {
          if (cp.tMs < 0 || cp.tMs > model.durationMs) {
            errors.push(`Cue point "${cp.id}" at ${cp.tMs}ms is outside duration`);
          }
        }
      }
      break;

    case 'infinite':
      if (model.windowMs <= 0) {
        errors.push('Infinite time model must have windowMs > 0');
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * Calculate time-derived values for a given absolute time.
 * This is what the runtime's timeDerive step will use.
 */
export function calculateTimeDerivedValues(
  model: TimeModelIR,
  tAbsMs: number,
  prevTAbsMs: number
): TimeDerivedValues {
  switch (model.kind) {
    case 'cyclic': {
      const tModelMs = tAbsMs % model.periodMs;
      const phase01 = tModelMs / model.periodMs;
      const prevPhase = (prevTAbsMs % model.periodMs) / model.periodMs;
      const wrapEvent = phase01 < prevPhase; // Wrapped when phase decreased
      return { tAbsMs, tModelMs, phase01, wrapEvent };
    }

    case 'finite': {
      const tModelMs = Math.min(tAbsMs, model.durationMs);
      const progress = tModelMs / model.durationMs;
      const prevProgress = Math.min(prevTAbsMs, model.durationMs) / model.durationMs;
      const endEvent = progress >= 1.0 && prevProgress < 1.0;
      return { tAbsMs, tModelMs, phase01: progress, progress, endEvent };
    }

    case 'infinite': {
      return { tAbsMs, tModelMs: tAbsMs };
    }
  }
}

export interface TimeDerivedValues {
  readonly tAbsMs: number;
  readonly tModelMs: number;
  readonly phase01?: number;
  readonly wrapEvent?: boolean;
  readonly progress?: number;
  readonly endEvent?: boolean;
}
```

**Test Strategy:**

```typescript
// src/editor/ir/time/__tests__/TimeDerivation.test.ts

import { describe, it, expect } from 'vitest';
import {
  deriveTimeSignals,
  validateTimeModel,
  calculateTimeDerivedValues
} from '../TimeDerivation';
import type { CyclicTimeModelIR, FiniteTimeModelIR, InfiniteTimeModelIR } from '../../schema/CompiledProgramIR';

describe('TimeDerivation', () => {
  describe('deriveTimeSignals', () => {
    it('cyclic model has phase and wrap', () => {
      const model: CyclicTimeModelIR = {
        kind: 'cyclic',
        periodMs: 4000,
        mode: 'loop',
        phaseDomain: '0..1',
      };

      const signals = deriveTimeSignals(model);
      expect(signals.phase01).toBe(true);
      expect(signals.wrapEvent).toBe(true);
      expect(signals.progress).toBe(false);
      expect(signals.endEvent).toBe(false);
    });

    it('finite model has progress and end', () => {
      const model: FiniteTimeModelIR = {
        kind: 'finite',
        durationMs: 5000,
      };

      const signals = deriveTimeSignals(model);
      expect(signals.phase01).toBe(true);
      expect(signals.progress).toBe(true);
      expect(signals.endEvent).toBe(true);
      expect(signals.wrapEvent).toBe(false);
    });

    it('infinite model only has absolute time', () => {
      const model: InfiniteTimeModelIR = {
        kind: 'infinite',
        windowMs: 10000,
      };

      const signals = deriveTimeSignals(model);
      expect(signals.tAbsMs).toBe(true);
      expect(signals.tModelMs).toBe(true);
      expect(signals.phase01).toBe(false);
    });
  });

  describe('validateTimeModel', () => {
    it('rejects cyclic with zero period', () => {
      const model: CyclicTimeModelIR = {
        kind: 'cyclic',
        periodMs: 0,
        mode: 'loop',
        phaseDomain: '0..1',
      };

      const result = validateTimeModel(model);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cyclic time model must have periodMs > 0');
    });

    it('accepts valid finite model', () => {
      const model: FiniteTimeModelIR = {
        kind: 'finite',
        durationMs: 5000,
        cuePoints: [
          { id: 'intro', label: 'Intro', tMs: 1000 },
          { id: 'outro', label: 'Outro', tMs: 4500 },
        ],
      };

      const result = validateTimeModel(model);
      expect(result.valid).toBe(true);
    });

    it('rejects cue point outside duration', () => {
      const model: FiniteTimeModelIR = {
        kind: 'finite',
        durationMs: 5000,
        cuePoints: [
          { id: 'bad', label: 'Bad', tMs: 6000 },
        ],
      };

      const result = validateTimeModel(model);
      expect(result.valid).toBe(false);
    });
  });

  describe('calculateTimeDerivedValues', () => {
    it('calculates cyclic phase correctly', () => {
      const model: CyclicTimeModelIR = {
        kind: 'cyclic',
        periodMs: 4000,
        mode: 'loop',
        phaseDomain: '0..1',
      };

      const values = calculateTimeDerivedValues(model, 1000, 0);
      expect(values.tAbsMs).toBe(1000);
      expect(values.tModelMs).toBe(1000);
      expect(values.phase01).toBeCloseTo(0.25);
      expect(values.wrapEvent).toBe(false);
    });

    it('detects wrap event in cyclic', () => {
      const model: CyclicTimeModelIR = {
        kind: 'cyclic',
        periodMs: 4000,
        mode: 'loop',
        phaseDomain: '0..1',
      };

      // Time went from 3900 to 4100, so phase wrapped from 0.975 to 0.025
      const values = calculateTimeDerivedValues(model, 4100, 3900);
      expect(values.wrapEvent).toBe(true);
    });

    it('detects end event in finite', () => {
      const model: FiniteTimeModelIR = {
        kind: 'finite',
        durationMs: 5000,
      };

      // Crossed the finish line
      const values = calculateTimeDerivedValues(model, 5100, 4900);
      expect(values.progress).toBe(1.0);
      expect(values.endEvent).toBe(true);
    });
  });
});
```

---

## File Structure to Create

```
src/editor/ir/
├── types/
│   ├── TypeDesc.ts           # Unified type descriptors
│   ├── Indices.ts            # Dense numeric indices
│   ├── DebugIndex.ts         # String↔index mapping
│   ├── typeConversion.ts     # Legacy type bridges
│   └── __tests__/
│       ├── TypeDesc.test.ts
│       └── Indices.test.ts
├── schema/
│   ├── CompiledProgramIR.ts  # Main IR schema
│   └── __tests__/
│       └── CompiledProgramIR.test.ts
├── time/
│   ├── TimeDerivation.ts     # Time signal derivation
│   └── __tests__/
│       └── TimeDerivation.test.ts
└── index.ts                  # Public exports
```

---

## Acceptance Criteria

### Topic 1: `type-unification`
- [ ] `TypeDesc` interface defined with world, domain, semantics, unit
- [ ] `TypeWorld` union includes 'signal', 'field', 'scalar', 'event', 'special'
- [ ] `TypeDomain` union covers all domains (number, vec2, color, phase01, etc.)
- [ ] `typeEquals()` function compares TypeDesc structurally
- [ ] `isCompatible()` function handles promotion (scalar→signal, signal→field)
- [ ] `isBusEligible()` function determines bus eligibility
- [ ] `getTypeCategory()` function returns 'core' or 'internal'
- [ ] Bridge utilities convert ValueKind → TypeDesc and SlotType → TypeDesc
- [ ] All tests pass

### Topic 2: `dense-id-system`
- [ ] Branded types for indices (NodeIndex, BusIndex, ValueSlot, etc.)
- [ ] Branded types for IDs (NodeId, BusId, StepId, etc.)
- [ ] DebugIndexBuilder interns entities and assigns sequential indices
- [ ] DebugIndex supports round-trip id↔index lookup
- [ ] No collisions when interning the same ID multiple times
- [ ] All tests pass

### Topic 3: `ir-core-types`
- [ ] CompiledProgramIR interface defined with all tables
- [ ] NodeIR, BusIR, StepIR interfaces complete
- [ ] InputSourceIR union covers slot, bus, const, defaultSource, rail, external
- [ ] OpCode union covers time, math, vector, state, render, transform, field ops
- [ ] TransformChainIR, TransformStepIR for adapters/lenses
- [ ] ScheduleIR with phase partition
- [ ] All types are readonly (immutable IR)
- [ ] Type-level tests pass (tsc compiles without errors)

### Topic 4: `timemodel-ir`
- [ ] FiniteTimeModelIR, CyclicTimeModelIR, InfiniteTimeModelIR variants
- [ ] CuePointIR for finite animations
- [ ] deriveTimeSignals() returns available signals per model kind
- [ ] validateTimeModel() catches invalid configurations
- [ ] calculateTimeDerivedValues() computes time-derived values correctly
- [ ] Wrap event detection works for cyclic
- [ ] End event detection works for finite
- [ ] All tests pass

---

## Running Tests

```bash
# From the worktree directory
cd .worktrees/ir-compiler

# Install dependencies (if not done)
pnpm install

# Run all tests
just test

# Run specific test file
pnpm vitest run src/editor/ir/types/__tests__/TypeDesc.test.ts

# Watch mode for development
pnpm vitest src/editor/ir/
```

---

## What NOT to Do

1. **Don't modify existing compiler yet.** Phase 1 is pure types. No runtime changes.
2. **Don't touch the canvas code.** Someone else is working on that.
3. **Don't add closures to IR types.** The IR must be pure data.
4. **Don't use `any`.** All types must be explicit.
5. **Don't skip tests.** Every type needs property tests.
6. **Don't estimate in time.** Focus on complexity only.

---

## Questions to Ask Yourself

Before each task:
1. Is this type pure data (no functions)?
2. Is this type readonly/immutable?
3. Can this type be serialized to JSON?
4. Does this type have stable identity for hot-swap?
5. Did I add tests for equality, conversion, and validation?

---

## Reference Documents

All specs are in `design-docs/12-Compiler-Final/`:

| Doc | Purpose |
|-----|---------|
| 01-Overview | Architecture vision |
| 02-IR-Schema | Full TypeScript types for IR |
| 03-Nodes | NodeTable, InputSourceIR |
| 10-Schedule-Semantics | Schedule phases, ordering |
| 11-Opcode-Taxonomy | OpCode enum |
| 19-Debugger-ValueKind | TypeKeyId encoding |
| 20-TraceStorage | DebugIndex |

---

## Success Looks Like

When you're done with Phase 1:

1. `pnpm tsc` passes with no errors
2. All new tests pass
3. The app still runs (`just dev`)
4. No changes to existing runtime behavior
5. Types are documented and match the spec
6. Code is in `.worktrees/ir-compiler` branch

---

Good luck on the island. Build it right.
