# Evaluation: Compiler Input Resolution Errors

**Generated:** 2026-01-04
**Topic:** Fix compiler errors for GridDomain, FieldFromExpression, FieldStringToColor, RenderInstances2D, Oscillator, and InfiniteTimeRoot

## Executive Summary

Five blocks have **critical IR lowering issues**. The "Unresolved input" errors occur because IR lowering functions don't accept/use the `inputs` or `inputsById` parameters that Pass6 provides. Additionally, several blocks use the deprecated `outputs` array instead of `outputsById`.

## Root Cause Analysis

The errors like:
```
NotImplemented: Unresolved input "originY" for block "GridDomain"
```

**Don't** mean the inputs aren't connected. They mean the IR lowering function signature doesn't include `inputs`/`inputsById` parameters, so Pass6 validation fails.

## Block Status

| Block | Issue | Fix Required |
|-------|-------|--------------|
| **GridDomain** | No `inputs`/`inputsById` in signature, uses config only | Add input params, migrate outputs |
| **FieldFromExpression** | IR disabled intentionally (uses `Function()`) | None - correct behavior |
| **FieldStringToColor** | Positional `inputs[0]`, legacy `outputs` array | Use inputsById, outputsById |
| **RenderInstances2D** | Array destructuring, missing 2 inputs | Use inputsById, handle all 7 inputs |
| **Oscillator** | ✅ CORRECT - uses inputsById/outputsById | None needed |
| **InfiniteTimeRoot** | Legacy `outputs` array | Migrate to outputsById |
| **FiniteTimeRoot** | Legacy `outputs` array (same issue) | Migrate to outputsById |

## Anti-Patterns Found

### 1. Missing Input Parameters
```typescript
// WRONG - GridDomain does this
const lowerGridDomain: BlockLowerFn = ({ ctx, config }) => { ... }

// CORRECT
const lowerGridDomain: BlockLowerFn = ({ ctx, inputs, inputsById, config }) => { ... }
```

### 2. Legacy Outputs Array
```typescript
// WRONG - deprecated
return { outputs: [ref1, ref2] };

// CORRECT
return { outputs: [], outputsById: { port1: ref1, port2: ref2 } };
```

### 3. Positional Indexing
```typescript
// WRONG - fragile
const [domain, pos, radius] = inputs;

// CORRECT
const domain = inputsById?.domain ?? inputs[0];
```

## Files to Modify

1. `src/editor/compiler/blocks/domain/GridDomain.ts`
2. `src/editor/compiler/blocks/domain/FieldStringToColor.ts`
3. `src/editor/compiler/blocks/domain/RenderInstances2D.ts`
4. `src/editor/compiler/blocks/domain/TimeRoot.ts` (both FiniteTimeRoot and InfiniteTimeRoot)

## Verdict: CONTINUE

All issues have clear fixes. No ambiguity requiring user input.
