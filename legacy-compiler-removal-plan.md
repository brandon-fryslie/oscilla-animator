# Plan: Remove Legacy Closure Compiler

**Goal**: Remove all code related to the legacy closure-based compiler and enforce `strictIR` mode everywhere. This involves deleting legacy files, removing fallback logic, and cleaning up block definitions.

## 1. Delete Legacy Files
Remove the following files which are exclusively part of the legacy pipeline:
- `src/editor/compiler/v2adapter.ts` (Bridge between V1/V2)
- `src/editor/compiler/compileBusAware.ts` (Legacy stub)
- `src/editor/compiler/passes/pass7-bus-lowering.ts` (Removed pass)

## 2. Refactor `src/editor/compiler/compile.ts`
- Remove import and usage of `pass1Normalize` (if it's not used by new pipeline, but `compile.ts` seems to use it). *Correction*: `pass1Normalize` is part of the new pipeline.
- Remove any try/catch blocks that fall back to legacy compilation.
- Remove `compileBusAware` or related legacy exports if they exist in `compile.ts`.
- Remove usage of `getFeatureFlags().emitIR` (assume always true).

## 3. Refactor `src/editor/compiler/passes/pass6-block-lowering.ts`
- Remove the fallback logic that catches errors and tries to use closure artifacts.
- Remove `compileLegacyBlock` function (or similar) if present.
- Ensure strict IR validation is always enabled.

## 4. Update `src/editor/compiler/types.ts`
- Remove `BlockCompiler` interface (the signature for closure compilers).
- Remove `LegacyClosureContext`.
- Audit `Artifact` type. If it's used for runtime values, keep it but remove closure-specific variants if possible.

## 5. Remove `featureFlags.ts` and Update Consumers
- Delete `src/editor/compiler/featureFlags.ts`.
- Update `src/editor/compiler/integration.ts` to remove `getFeatureFlags().emitIR` usage.
- Remove usages in tests or other files (replace with `true` or remove checks).

## 6. Batch Update Block Definitions
- Iterate through all files in `src/editor/blocks/**/*.ts`.
- Remove the `compile: ...` property from the object passed to `createBlock`.
- Example transformation:
  ```typescript
  // Before
  export const MyBlock = createBlock({
    type: 'MyBlock',
    inputs: [...],
    outputs: [...],
    compile: ({ inputs }) => { ... } // Remove this
  });

  // After
  export const MyBlock = createBlock({
    type: 'MyBlock',
    inputs: [...],
    outputs: [...],
  });
  ```
- Remove imports related to legacy compilation (e.g., `BlockCompiler`, `LegacyClosureContext`) from these files.

## 7. Clean up `src/editor/compiler/pure-block-validator.ts`
- Remove "Legacy artifact validation" logic.
- Simplify to only validate IR-relevant constraints if needed.

## 8. Fix/Remove Legacy Tests
- Run `just test` to identify failures.
- Remove tests that specifically target "Dual-Emit" or legacy fallbacks.
- Update tests that mock the compiler to expect IR output.

## Execution Order
1.  **Delete Files**: `v2adapter.ts`, `compileBusAware.ts`, `pass7-bus-lowering.ts`.
2.  **Refactor Core**: `compile.ts`, `pass6-block-lowering.ts`, `integration.ts`.
3.  **Refactor Types**: `types.ts`.
4.  **Batch Cleanup Blocks**: Use `replace` tool or shell commands to remove `compile` properties.
5.  **Cleanup Tests**: Fix breakage.
