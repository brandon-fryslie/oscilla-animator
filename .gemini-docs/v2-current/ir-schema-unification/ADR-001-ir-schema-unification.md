# ADR 001: Unified IR Schema for Compiler and Runtime

**Date**: 2026-01-02
**Status**: Accepted

## Context

The Oscilla compiler architecture currently suffers from a schema mismatch between the intermediate representation produced by the builder (`BuilderProgramIR`) and the authoritative schema expected by the runtime (`CompiledProgramIR`).

- `BuilderProgramIR` (in `src/editor/compiler/ir/builderTypes.ts`) contains a rich set of data but uses flat naming (`signalIR`, `fieldIR`).
- `CompiledProgramIR` (in `src/editor/compiler/ir/program.ts`) is the formally documented output but is incomplete.
- The Runtime (e.g., `executeSignalEval.ts`) expects ad-hoc names like `signalTable` that don't match our core specifications.
- **Detailed Specifications** (e.g., `12-SignalExpr.md`, `04-FieldExpr.md`) explicitly define `SignalExpr` and `FieldExpr` as the core abstractions.

We need to resolve the "Red Flags" blocking the build, but we must do so by aligning to our **approved specifications** (`SignalExpr`, `FieldExpr`), not by adopting the runtime's ad-hoc naming (`signalTable`).

## Decision

We will **complete `CompiledProgramIR`** to be the authoritative source of truth, and we will strictly align its naming with the `SignalExpr` / `FieldExpr` nomenclature found in our design documents.

This involves:

1.  **Updating `CompiledProgramIR`** to include all missing fields (`constants`, `seed`, `slotMeta`, etc.).
2.  **Standardizing Naming**: Use `signalExprs` and `fieldExprs` (plural) for the tables, matching the `SignalExpr` / `FieldExpr` type definitions.
3.  **Updating the Runtime**: Refactor runtime executors (e.g., `executeSignalEval.ts`) to read from `program.signalExprs` instead of `program.signalTable`.
4.  **Transformation**: Implement a finalization pass to transform `BuilderProgramIR` into this schema.

### Schema Definition

The `CompiledProgramIR` interface will be updated to:

```typescript
export interface CompiledProgramIR {
  // Identity & Versioning
  readonly patchId: string;
  readonly compiledAt: number;
  readonly irVersion: string;      // e.g., "1.0.0"
  readonly compilerTag?: string;   // e.g., "unified-v1"
  readonly seed: number;           // For deterministic randomness

  // Time Topology
  readonly timeModel: TimeModelIR;

  // Type System
  readonly types: TypeTable;

  // Execution Tables (Aligned to Spec naming)
  readonly signalExprs: SignalExprTable; // Was signalTable (runtime) or signalIR (builder)
  readonly fieldExprs: FieldExprTable;   // Was fieldTable (runtime) or fieldIR (builder)
  readonly eventExprs: EventExprTable;   // Was eventIR (builder)

  // Constant Pool
  readonly constants: ConstPool;         // { json: unknown[], f64?: Float64Array, ... }

  // State Layout
  readonly stateLayout: StateLayout;

  // Slot Metadata (Critical for debugging & runtime validation)
  readonly slotMeta: SlotMetaEntry[];

  // Default Sources
  readonly defaultSources: DefaultSourceTable;

  // Render & 3D
  readonly render: RenderIR; // Container for render sinks/passes
  readonly cameras: CameraTable;
  readonly meshes: MeshTable;

  // Schedule
  readonly schedule: ScheduleIR;

  // Debug & Metadata
  readonly sourceMap?: SourceMapIR;
  readonly warnings?: CompilerWarning[];
  readonly debugIndex?: DebugIndex; // From builder
}
```

### Mapping Logic

We will map `BuilderProgramIR` to `CompiledProgramIR` as follows:

- `builder.signalIR` → `program.signalExprs`
- `builder.fieldIR` → `program.fieldExprs`
- `builder.eventIR` → `program.eventExprs`
- `builder.constants` → `program.constants` (serialized to pool)

## Consequences

-   **Pros**:
    -   **Spec Alignment**: Code matches the "SignalExpr / FieldExpr" language in our detailed design docs.
    -   **Consistency**: Eliminates "signalTable" vs "signalIR" vs "signalExprs" confusion.
    -   **Correctness**: Runtime is forced to update to the correct spec-defined names.

-   **Cons**:
    -   Runtime files (executors) must be updated immediately to fix TypeScript errors (renaming `signalTable` to `signalExprs`).

## Roadmap Alignment

This decision unblocks `wp2-bus-aware-compiler` and `wp4-lazy-field-core` by establishing a stable, spec-compliant IR contract.