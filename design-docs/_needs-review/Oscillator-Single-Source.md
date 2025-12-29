# Oscillator Single-Source Layout (Example)

## Goal
The Oscillator block is the reference example for a **single source of truth** that drives both the editor block definition and the IR compiler registration, using a canonical port catalog.

## Files
- `src/editor/blocks/portCatalog.ts`
  - Canonical port definitions for Oscillator (and future blocks).
  - Ports are keyed by stable IDs and referenced by block specs.
  - Exports `OSCILLATOR_PORTS` with `inputs/outputs` and `inputOrder/outputOrder`.

- `src/editor/blocks/oscillatorSpec.ts`
  - Builds the editor block and IR port lists from `OSCILLATOR_PORTS`.
  - Exports:
    - `Oscillator` (editor `BlockDefinition`)
    - `OSCILLATOR_IR_INPUTS` and `OSCILLATOR_IR_OUTPUTS` (IR port declarations)

- `src/editor/blocks/signal.ts`
  - Re-exports `Oscillator` from `oscillatorSpec.ts`.
  - No standalone Oscillator definition here.

- `src/editor/compiler/blocks/signal/Oscillator.ts`
  - IR lowering implementation.
  - Registers IR block using `OSCILLATOR_IR_INPUTS/OUTPUTS` so the compiler and editor share the same port list.
  - Reads `shape` as a scalar constant from the IR const pool.

- `src/editor/compiler/passes/pass6-block-lowering.ts`
  - Handles scalar `defaultSource` by emitting `scalarConst` values.
  - Required for `Scalar:*` defaults to work in IR.

## Conventions
- **File layout:** keep per-block specs in `src/editor/blocks/*Spec.ts`; keep reusable port definitions in `src/editor/blocks/portCatalog.ts`.
- **SlotType syntax:** use `Scalar:waveform` (colon syntax) for scalar domains.
- **IR type:** `world: 'scalar', domain: 'waveform'`.
- **DefaultSource:** stored in the port catalog; the compiler uses it when no wire/bus value is provided.
- **Order:** always derive input/output order from `inputOrder/outputOrder` in the catalog.
- **Lowering inputs:** use `inputsById` (portId map) when available; fall back to positional `inputs` only for legacy blocks.

## Required Exports (Per Block Spec)
- `<BlockName>` editor definition (`BlockDefinition`)
- `<BLOCK>_IR_INPUTS` and `<BLOCK>_IR_OUTPUTS` for compiler registration

## Validation Rule (Required)
At registry validation time, assert:
- Every block spec uses only ports defined in the port catalog.
- The catalog order exactly matches the IR declaration order.
This fails fast if editor/IR ports drift.

For migration, enable this rule per-block using:
- `tags: { irPortContract: 'strict' }`

## Canonical Port Catalog Rule
Port schemas must live in a catalog and be referenced by block specs; no ad-hoc port objects inside block definitions.

## How to Apply This Pattern to Other Blocks
1. Add a port definition to the catalog with `inputs/outputs` and an explicit order list.
2. Create a `*Spec.ts` module that builds editor + IR declarations from the catalog entry.
3. In the compiler block file, import and use the shared IR port arrays.

## Why This Matters
- Prevents drift between editor and compiler port lists.
- Ensures defaultSource behavior is consistent across UI and IR lowering.
- Makes IR errors deterministic and easier to debug.
