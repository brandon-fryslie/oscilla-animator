# Field Runtime Red Flags - Resolution Summary

**Date:** 2025-12-28
**Branch:** redflags-field-runtime
**Status:** RESOLVED

## Overview

This document summarizes the field runtime red flags that were identified and resolved. The core issue was silent fallback behavior in signal evaluation and missing default source wiring in the compiler.

## Red Flags Identified and Fixed

### P0: Hard Error on Signal Fallback in evalSig()

**Problem:** Signal evaluation (`evalSig()`) was silently falling back to default values when signals couldn't be evaluated, hiding bugs.

**Solution:** Added hard error in `evalSig()` that throws when a signal cannot be evaluated instead of silently returning a fallback value.

**Files Modified:**
- `src/editor/runtime/signal-expr/SigEvaluator.ts`

### P0.5: Audit Compiler Default Source Flow

**Problem:** Default sources declared in block definitions weren't being properly wired into the IR.

**Solution:** Audited the flow from BlockDefinition → IR Registration → Pass 8 Link Resolution and identified gaps.

### P1: Compiler Wires Default Sources to Field IR

**Problem:** Pass 8 link resolution wasn't checking block type definitions for default sources, causing "MissingInput" errors for optional inputs.

**Solution:**
1. Added `defaultSource` property to `BlockPortDecl` interface in `lowerTypes.ts`
2. Updated `pass8-link-resolution.ts` to:
   - Check both block instance and block definition for defaultSource
   - Skip scalar types (compile-time config, not runtime IR)
   - Create proper IR refs for signal and field types with default values
3. Updated IR registrations for all blocks to include defaultSource on inputs:

   - `GridDomain` (rows, cols, spacing, originX, originY)
   - `RenderInstances2D` (radius, color, opacity, glow, glowIntensity)
   - `FieldConstNumber` (value)
   - `DomainN` (n, seed)
   - `PositionMapGrid` (rows, cols, spacing, originX, originY, order)
   - `PositionMapCircle` (centerX, centerY, radius, startAngle, winding, distribution)
   - `FieldFromExpression` (expression)

**Files Modified:**
- `src/editor/compiler/ir/lowerTypes.ts`
- `src/editor/compiler/passes/pass8-link-resolution.ts`
- `src/editor/compiler/blocks/domain/TimeRoot.ts`
- `src/editor/compiler/blocks/domain/GridDomain.ts`
- `src/editor/compiler/blocks/domain/RenderInstances2D.ts`
- `src/editor/compiler/blocks/domain/FieldConstNumber.ts`
- `src/editor/compiler/blocks/domain/DomainN.ts`
- `src/editor/compiler/blocks/domain/PositionMapGrid.ts`
- `src/editor/compiler/blocks/domain/PositionMapCircle.ts`
- `src/editor/compiler/blocks/domain/FieldFromExpression.ts`

### P2: Materializer params Audit (No Changes Needed)

**Problem (Initially Suspected):** Thought `readParamNumber` in Materializer was doing silent fallbacks.

**Finding:** Upon investigation, `readParamNumber` is correctly implemented:
- Throws hard error if param is missing: `throw new Error(\`Missing param "${key}" for field op ${opLabel}\`)`
- Validates that values are finite: `throw new Error(\`Invalid param "${key}" for field op ${opLabel}\`)`
- Supports dynamic signal slots for runtime-evaluated params

**Conclusion:** This is NOT legacy code - it's the correct implementation for field operation parameters.

## Architectural Notes

### Two Registry Systems

The system has two parallel registries that need to stay aligned:

1. **BlockDefinition** (in `src/editor/blocks/` directories)
   - Used for creating Block instances with Slots
   - Slots have `defaultSource` for UI and instance creation

2. **IR Registration** (via `registerBlockType()`)
   - Used by Pass 8 for type information
   - `BlockPortDecl` needs `defaultSource` for IR resolution

### Type Handling

- **Scalar types** (`world: 'scalar'`): Compile-time config, passed via `config` to block lowering, NOT resolved in IR
- **Signal types** (`world: 'signal'`): Runtime values, need IR resolution with defaultSource
- **Field types** (`world: 'field'`): Per-element expressions, need IR resolution with defaultSource

### Block.params vs FieldHandle.params

These are different concepts:

1. **Block.params** - Legacy block configuration system being phased out in favor of Slots with defaultSource
2. **FieldHandle.params** - Required parameters for field operations (e.g., `k` for scale, `a,b` for clamp)

The Materializer's `readParamNumber` handles FieldHandle.params, not Block.params.

## Test Results

All 2426 tests pass (3 skipped).

## Future Work (Out of Scope)

Removing `Block.params` entirely would be a significant architectural refactor affecting:
- Block interface definition
- PatchStore methods
- All macros in `src/editor/macros.ts`
- All composites
- Many test files

This is a separate initiative from the field runtime red flags fix.
