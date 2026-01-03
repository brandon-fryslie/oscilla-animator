# Plan: IR Schema Unification (ADR-001)

**Status**: Ready for Implementation
**Dependencies**: None
**Blocks**: Bus Unification, IR Runtime

## Objective
Implement `ADR-001` by standardizing `CompiledProgramIR` to be the authoritative schema, aligning naming with `SignalExpr`/`FieldExpr` specifications, and fixing runtime mismatches.

## Phase 1: Schema & Types Definition
- [ ] **Update `src/editor/compiler/ir/program.ts`**
    - [ ] Add `irVersion`, `seed`, `compilerTag`
    - [ ] Rename `signalTable` (or `signalExprs` alias) to strictly `signalExprs`
    - [ ] Rename `fieldExprs` (array) to `fieldExprs` (Table)
    - [ ] Add `eventExprs` table
    - [ ] Add `constants` (ConstPool), `stateLayout`, `slotMeta`
    - [ ] Add `defaultSources`
    - [ ] Remove legacy `buses` table (or mark deprecated if needed for transition)

- [ ] **Update `src/editor/compiler/ir/types.ts`**
    - [ ] Define `ConstPool` interface (JSON + typed arrays)
    - [ ] Ensure `SignalExprTable`, `FieldExprTable`, `EventExprTable` are exported and consistent

## Phase 2: Runtime Alignment
- [ ] **Update `src/editor/runtime/executor/steps/executeSignalEval.ts`**
    - [ ] Change `program.signalTable` to `program.signalExprs`
- [ ] **Update `src/editor/runtime/executor/steps/executeFieldEval.ts` (if exists)**
    - [ ] Change to `program.fieldExprs`
- [ ] **Update `src/editor/runtime/executor/steps/executeEventBusEval.ts`**
    - [ ] Change to `program.eventExprs`
- [ ] **Update `src/editor/runtime/executor/steps/executeTimeDerive.ts`**
    - [ ] Ensure it uses correct time model slots from `program`

## Phase 3: Builder Transformation
- [ ] **Update `src/editor/compiler/compileBusAware.ts`**
    - [ ] Implement `finalizeCompiledProgram(builderIR)` function
    - [ ] Transform `builder.constants` (array) -> `ConstPool`
    - [ ] Map `builder.signalIR` -> `program.signalExprs`
    - [ ] Map `builder.fieldIR` -> `program.fieldExprs`
    - [ ] Populate `slotMeta`, `irVersion`, `seed`

## Phase 4: Verification
- [ ] **Run `tsc`** to verify 278+ errors are resolved
- [ ] **Run `vitest`** on compiler tests

## Detailed Schema (Reference)

```typescript
export interface CompiledProgramIR {
  readonly patchId: string;
  readonly compiledAt: number;
  readonly irVersion: string;
  readonly seed: number;

  readonly timeModel: TimeModelIR;
  readonly types: TypeTable;

  readonly signalExprs: SignalExprTable;
  readonly fieldExprs: FieldExprTable;
  readonly eventExprs: EventExprTable;

  readonly constants: ConstPool;
  readonly stateLayout: StateLayout;
  readonly slotMeta: SlotMetaEntry[];
  readonly defaultSources: DefaultSourceTable;

  readonly render: RenderIR;
  readonly cameras: CameraTable;
  readonly meshes: MeshTable;
  readonly schedule: ScheduleIR;
  
  readonly debugIndex?: DebugIndex;
}
```
