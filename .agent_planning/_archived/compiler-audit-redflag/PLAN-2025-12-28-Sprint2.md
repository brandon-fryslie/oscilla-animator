# Sprint Plan: Block Lowering Foundation - Sprint 2

**Generated:** 2025-12-28
**Source:** STATUS-2025-12-28.md
**Topic:** compiler-audit-redflag
**Scope:** Pass 6 block lowering for core signal blocks

---

## Executive Summary

**Current State:** Sprint 1 complete. TimeModel threading works, timeDerive writes tAbsMs, feature flags parse correctly. However, Pass 6 still uses placeholder IR nodes - blocks emit `sigTimeAbsMs` instead of actual signal expressions.

**Sprint Goal:** Implement real IR lowering for core signal blocks so patches with signal math compile to actual IR (not placeholders).

**Deliverables (3):**
1. **Pass 6 Block Lowering** - Core signal blocks (math, LFO, constants)
2. **ColorLFO HSL→RGB Kernel** - Color conversion opcode
3. **SVGSampleDomain Initialization** - Fix domain registration at runtime

---

## Sprint Scope: What We're Doing

### Deliverable 1: Pass 6 Block Lowering for Core Signal Blocks

**Priority:** P0 (CRITICAL)
**Status:** Not Started
**Dependencies:** Sprint 1 complete (TimeModel threading)

**Spec Reference:** STATUS-2025-12-28.md § "Sprint 2: Block Lowering Foundation"

#### Description

Currently `artifactToValueRef()` in pass6-block-lowering.ts creates placeholder IR nodes (e.g., `sigTimeAbsMs()` for all signals). We need to:

1. Parse block definitions to understand their computation
2. Emit proper IR nodes that represent actual signal operations
3. Handle the core signal block categories:
   - **Math blocks:** Add, Multiply, Subtract, Divide, etc.
   - **LFO blocks:** SineLFO, SawLFO, TriangleLFO, etc.
   - **Constant blocks:** Constant, Vec2Constant, ColorConstant
   - **Utility blocks:** Remap, Clamp, Mix

#### Implementation Strategy

**Option A: Block-specific lowering functions**
- Create `lowerAddBlock()`, `lowerMultiplyBlock()`, etc.
- Each function knows how to emit proper IR
- Pro: Clear, explicit
- Con: Many small functions

**Option B: Pattern-based lowering**
- Detect patterns in closure structure
- Map common patterns to IR opcodes
- Pro: More generic
- Con: Harder to debug

**Recommendation:** Option A - explicit block compilers for each type.

#### Implementation Steps

1. **Create block lowering registry** - Map block type → lowering function
2. **Implement math block lowering:**
   - `lowerConstant()` - emit `sigConst(value)`
   - `lowerAdd()` - emit `sigMap(add, [input1, input2])`
   - `lowerMultiply()` - emit `sigMap(mul, [input1, input2])`
   - Similar for Subtract, Divide, Min, Max, Abs, etc.
3. **Implement LFO block lowering:**
   - `lowerSineLFO()` - emit `sigMap(sin, [sigMap(mul, [t, freq])])`
   - Similar for Saw, Triangle, Square
4. **Implement utility block lowering:**
   - `lowerRemap()` - emit linear interpolation IR
   - `lowerClamp()` - emit min/max combination
   - `lowerMix()` - emit lerp IR
5. **Update `artifactToValueRef()`** to dispatch to lowering functions
6. **Test with real patches** containing signal math

#### Files to Modify

- `src/editor/compiler/passes/pass6-block-lowering.ts` - Main implementation
- Possibly create `src/editor/compiler/passes/block-lowerers/` directory

---

### Deliverable 2: ColorLFO HSL→RGB Kernel

**Priority:** P1 (HIGH)
**Status:** Not Started
**Dependencies:** None

**Spec Reference:** STATUS-2025-12-28.md § "Block-Level Issues" - ColorLFO

#### Description

ColorLFO needs HSL→RGB conversion which requires a dedicated opcode/kernel. The IR system doesn't have color space conversion.

#### Implementation Steps

1. **Add `colorHslToRgb` opcode** to IR transforms
2. **Implement in signal evaluator** - actual HSL→RGB math
3. **Update ColorLFO block lowering** to use new opcode
4. **Test with ColorLFO patch**

#### Files to Modify

- `src/editor/compiler/ir/transforms.ts` - Add opcode
- `src/editor/runtime/executor/steps/executeSignalEval.ts` - Implement
- `src/editor/compiler/passes/pass6-block-lowering.ts` - Use in ColorLFO

---

### Deliverable 3: SVGSampleDomain Initialization

**Priority:** P1 (HIGH)
**Status:** Not Started
**Dependencies:** None

**Spec Reference:** STATUS-2025-12-28.md § "Block-Level Issues" - SVGSampleDomain

#### Description

SVGSampleDomain block doesn't register its domain at runtime, causing invalid domain slots. Need to call `domainFromSVG()` during initialization.

#### Implementation Steps

1. **Find where domain registration happens** in runtime
2. **Add SVGSampleDomain initialization** to domain registry
3. **Ensure domain slots are valid** before field evaluation
4. **Test with SVG-based patches**

#### Files to Modify

- `src/editor/runtime/` - Domain initialization
- `src/editor/compiler/blocks/` - SVGSampleDomain compiler if needed

---

## What We're NOT Doing (Deferred)

### Explicitly Out of Scope for Sprint 2

- **Bus evaluation steps** - Sprint 3
- **Event bus lowering** - Sprint 3
- **Type conversion paths** - Sprint 4
- **Transform chains** - Sprint 4
- **Field operations** (reduce, complex transforms) - Sprint 4

---

## Validation Plan

### After All Deliverables Complete

1. **TypeScript compilation:**
   ```bash
   just typecheck  # Pre-existing errors only
   ```

2. **Tests run:**
   ```bash
   just test  # All files load
   ```

3. **Signal math patches:**
   - Create patch: Constant → Add → Multiply → Render
   - Verify IR nodes represent actual operations
   - Verify runtime produces correct output

4. **ColorLFO test:**
   - Create patch with ColorLFO
   - Verify HSL→RGB conversion works
   - Verify color output is correct

---

## Success Metrics

**Sprint 2 is successful if:**

1. Core signal blocks emit real IR (not placeholders)
2. Math operations (add, mul, etc.) work in IR mode
3. LFO blocks produce correct waveforms
4. ColorLFO HSL→RGB conversion works
5. SVGSampleDomain initializes correctly

**NOT success metrics:**
- All blocks working (just core signal blocks)
- Bus-driven patches working (Sprint 3)
- Complex field operations (Sprint 4)

---

## Risk Assessment

### High Risk: Block Lowering Complexity

**Concern:** Many block types, each needs specific lowering logic.

**Mitigation:**
- Start with simplest blocks (Constant, Add)
- Build incrementally
- Focus on signal blocks only (fields later)

### Medium Risk: IR Opcode Gaps

**Concern:** IR schema may not have all needed opcodes.

**Mitigation:**
- Add opcodes as needed
- Keep opcodes simple (math primitives)
- Document new opcodes

---

## Next Steps After Sprint 2

**Sprint 3:**
- Bus eval step implementation
- Event bus lowering
- Bus type support (vec2, color)
