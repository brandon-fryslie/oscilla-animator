# STATUS: IR Architecture Blocker

**Date**: 2026-01-02
**Status**: BLOCKED - Architecture redesign needed
**Context**: Bus cleanup exposed deeper IR schema issues

---

## What We Discovered

The aggressive bus cleanup (removing Pass 7, BusIndex, bus-specific code) exposed a **fundamental IR schema mismatch** that has been latent in the codebase.

### Three Competing IR Types

| Type | Location | Purpose | Status |
|------|----------|---------|--------|
| `BuilderProgramIR` | `ir/builderTypes.ts` | IRBuilder output | Has all fields |
| `CompiledProgramIR` | `ir/program.ts` | Formal schema | **Incomplete** |
| `CompiledProgram` | `compiler/types.ts` | Legacy format | Partially populated |

### The Problem

1. **`CompiledProgramIR`** is documented as "the authoritative output of the compiler"
2. **Runtime executor imports `CompiledProgramIR`** expecting it to have all needed data
3. **`CompiledProgramIR` is missing critical fields**:
   - `constants` (30 errors) - constant pool for evaluation
   - `seed` (10 errors) - deterministic randomness
   - `irVersion` (7 errors) - schema version
   - `signalTable` vs `signalExprs` - naming mismatch
   - `fields` vs `fieldExprs` - naming mismatch
   - `slotMeta` (5 errors) - value slot metadata
   - `defaultSources` (8 errors) - default value bindings
   - `busTypes` (9 errors) - even after bus cleanup, this is expected
   - `outputs` (6 errors) - output specifications
   - ...and more (278 total TypeScript errors)

### Root Cause

There's no proper transformation from `BuilderProgramIR` → `CompiledProgramIR`. The formal schema was designed but never fully implemented. The runtime was written expecting fields that `CompiledProgramIR` doesn't have.

---

## What Was Accomplished Before Blocking

### Commits Made
1. `435b080` - Delete Pass 7, bus-block-utils, migrate.ts, BusChannel.tsx
2. `fb1c276` - Remove LensParamBinding 'bus' and 'wire' variants
3. `5cf7262` - Remove BusIndex from combine operations
4. `ce68320` - Remove bus-specific types from IR schedule
5. `a8854d5` - Attempted fix of TypeScript errors (incomplete)

### Code Deleted
- `pass7-bus-lowering.ts` (~350 lines)
- `bus-block-utils.ts`
- `migrate.ts` (~145 lines)
- `BusChannel.tsx`
- Various bus-specific test files
- `StepBusEval`, `StepEventBusEval` step types
- `BusIndex` type
- `LensParamBinding` 'bus' and 'wire' variants

### Current State
- TypeScript: **278 errors** (IR schema mismatch)
- Tests: Cannot run until TypeScript compiles
- Bus-specific code: Mostly removed from compiler passes

---

## Architectural Questions to Resolve

### Q1: What is the authoritative IR type?

**Options**:
- A) `CompiledProgramIR` - Complete it with all needed fields
- B) `BuilderProgramIR` - Use it directly as the runtime target
- C) New unified type - Merge the best of both

### Q2: How should constants be represented?

**Current state**:
- `BuilderProgramIR.constants: readonly unknown[]`
- `CompiledProgramIR` - missing entirely
- Runtime expects `program.constants.json`

### Q3: What about schema versioning?

**Current state**:
- Runtime expects `irVersion`
- Neither IR type has it
- Needed for hot-swap and cache invalidation

### Q4: Signal/Field table naming

**Current state**:
- `CompiledProgramIR` uses `signalExprs`, `fieldExprs`
- Runtime expects `signalTable`, `fields`
- `SignalExprTable` has `.nodes` internally

### Q5: Where should `seed` come from?

**Current state**:
- Runtime expects deterministic randomness via `seed`
- Neither IR type provides it
- Critical for reproducible animations

---

## Recommended Path Forward

### Option A: Complete CompiledProgramIR (Recommended)

1. Add all missing fields to `CompiledProgramIR`:
   ```typescript
   interface CompiledProgramIR {
     // Identity (existing)
     patchId: string;
     compiledAt: number;

     // NEW: Schema versioning
     irVersion: string;  // Semver for hot-swap compat
     seed: number;       // Deterministic randomness
     compilerTag?: string;

     // Time (existing)
     timeModel: TimeModelIR;

     // Types (existing)
     types: TypeTable;

     // Tables - RENAMED for consistency
     signalTable: SignalExprTable;  // was signalExprs
     fieldTable: FieldExprTable;    // was fieldExprs

     // NEW: Constant pool
     constants: ConstPool;

     // NEW: Slot metadata
     slotMeta: SlotMetaEntry[];

     // NEW: Default sources
     defaultSources: DefaultSourceTable;

     // ... etc
   }
   ```

2. Create proper `buildCompiledProgram()` function that transforms `BuilderProgramIR` → `CompiledProgramIR`

3. Update runtime to use the new field names (or use the names runtime expects)

### Option B: Pause Bus Cleanup, Fix IR First

1. Revert bus cleanup commits
2. Design proper IR schema
3. Implement schema transformation
4. Resume bus cleanup on solid foundation

### Option C: Incremental Fix

1. Add type aliases to bridge naming
2. Add missing fields incrementally
3. Keep both working while migrating

---

## Decision Needed

The bus cleanup cannot proceed until we decide how to handle the IR architecture. The 278 TypeScript errors are not fixable without architectural decisions.

**Recommendation**: Option A - Complete `CompiledProgramIR` to be the true authoritative type, with proper transformation from builder output.

---

## Files for Reference

- `src/editor/compiler/ir/program.ts` - CompiledProgramIR (incomplete)
- `src/editor/compiler/ir/builderTypes.ts` - BuilderProgramIR (has fields)
- `src/editor/compiler/types.ts` - CompiledProgram (legacy)
- `src/editor/runtime/executor/steps/*.ts` - Runtime expecting missing fields
