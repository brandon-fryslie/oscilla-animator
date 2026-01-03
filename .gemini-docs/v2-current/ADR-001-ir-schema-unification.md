# ADR 001: Unified IR Schema for Compiler and Runtime

**Date**: 2026-01-02
**Status**: Accepted

## Context

The Oscilla compiler architecture currently suffers from a schema mismatch between the intermediate representation produced by the builder (`BuilderProgramIR`) and the authoritative schema expected by the runtime (`CompiledProgramIR`).

- `BuilderProgramIR` (in `src/editor/compiler/ir/builderTypes.ts`) contains a rich set of data but uses inconsistent naming and structure.
- `CompiledProgramIR` (in `src/editor/compiler/ir/program.ts`) is incomplete and lacks a firm execution contract.
- The Runtime (e.g., `executeSignalEval.ts`) expects ad-hoc names like `signalTable` that don't match core specifications (`SignalExpr`, `FieldExpr`).

## Decision

We will **complete `CompiledProgramIR`** to be the authoritative, pure, and immutable source of truth for the runtime. We will strictly align naming with the `SignalExpr` / `FieldExpr` nomenclature and enforce a rigorous execution contract.

### 1. Execution Contract

- **Schedule-Driven**: `schedule.steps[]` is the authoritative ordered plan. Runtime never scans expression tables for work; it only executes steps.
- **Reference-Based**: Expression tables (`signalExprs`, `fieldExprs`, `eventExprs`) are referenced by numeric `ExprId` only when a step requires them.
- **Slot-Addressed**: `ValueStore` is the single runtime memory interface. Every step reads from and writes to `ValueSlot` indices.
- **No Hidden Evaluation**: Tables are data assets, not executable closures.

### 2. Schema Definition (Tightened)

```typescript
export interface CompiledProgramIR {
  // Identity & Versioning
  readonly patchId: string;
  readonly compiledAt: number;    // Non-semantic: must NOT influence determinism/caching
  readonly irVersion: number;     // Monotonic integer
  readonly features?: Record<string, boolean>;
  readonly compilerTag?: string;  // For metadata only
  readonly seed: number;          // For deterministic randomness

  // Time Topology
  readonly timeModel: TimeModelIR;

  // Type System
  readonly types: TypeTable;      // Interned TypeDesc instances

  // Execution Tables (Pluralized plural Spec naming)
  readonly signalExprs: SignalExprTable; // SignalExprIR[], index = SigExprId
  readonly fieldExprs: FieldExprTable;   // FieldExprIR[], index = FieldExprId
  readonly eventExprs: EventExprTable;   // EventExprIR[], index = EventExprId

  // Constant Pool
  readonly constants: ConstPool;         // { json: unknown[], f64?: Float64Array, ... }

  // State Layout
  readonly stateLayout: StateLayout;

  // Slot Metadata (Dense table: index = SlotId)
  readonly slotMeta: SlotMetaTable;      // SlotMetaEntry[]

  // Render & 3D (Declarative assets consumed by schedule steps)
  readonly render: RenderIR;
  readonly cameras: CameraTable;
  readonly meshes: MeshTable;

  // Schedule
  readonly schedule: ScheduleIR;

  // Debug & Metadata
  readonly sourceMap?: SourceMapIR;
  readonly warnings?: CompilerWarning[];
  readonly debugIndex?: unknown;
}
```

### 3. Separation: IR vs. Instance

We distinguish between the **Immutable IR** (`CompiledProgramIR`) and the **Mutable Runtime State** (`ProgramInstance`).

```typescript
interface ProgramInstance {
  readonly program: CompiledProgramIR;
  readonly values: ValueStore;      // Backed by SlotId indices
  readonly cache: StepCacheStore;   // Frame-local and memo caches
  readonly events: EventStore;      // Discrete event triggers
}
```

### 4. Finalization Guarantees

The transformation from `BuilderProgramIR` to `CompiledProgramIR` must:
1.  **Topologically order** and validate the schedule.
2.  **Finalize dense IDs** for all expression tables (index = ID).
3.  **Finalize dense Slot IDs** (u16) and populate `slotMeta`.
4.  **Enforce referential integrity**: every referenced `ExprId` and `SlotId` must exist.
5.  **Enforce data-flow integrity**: every step must read from an initialized slot or have an explicit dependency.
6.  **Compute deterministic cache keys/hashes** (ignoring `compiledAt`).

### 5. Removal of Default Sources

`CompiledProgramIR` will **not** contain a `defaultSources` table.
- **Patch Normalization Invariant**: Before compilation, the editor/compiler must produce a normalized patch where every input has at least one writer (wire, bus binding, or an explicitly injected `DefaultSource` block).
- All default values are lowered into standard IR nodes (e.g., `const` expressions or `SignalExpr`).

## Consequences

-   **Pros**:
    -   **Total Determinism**: Execution is strictly schedule-driven.
    -   **Spec Alignment**: Names match `SignalExpr` / `FieldExpr` standards.
    -   **Rust Readiness**: Dense, indexed tables are 1:1 portable to WASM/Rust.
-   **Cons**:
    -   Existing runtime executors must be refactored to remove "table scanning" behavior and strictly follow the schedule.
    -   `defaultSources` must be handled earlier in the pipeline (normalization).

## Roadmap Alignment

Unblocks `wp2-bus-aware-compiler` and `wp4-lazy-field-core` by providing a stable, verifiable, and spec-compliant data contract.
