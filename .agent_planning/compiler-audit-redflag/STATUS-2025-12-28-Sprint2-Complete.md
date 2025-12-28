# Sprint 2 Completion Status

**Date:** 2025-12-28
**Sprint:** Block Lowering Foundation

---

## Completed

### Deliverable 1: Pass 6 Block Lowering Infrastructure ✓

**Commits:**
- `9f4aa51` feat(compiler): Implement Pass 6 block lowering with registered functions
- `a3036d1` docs(compiler): Add Sprint 2 implementation summary

**What was done:**
- Added `lowerBlockInstance()` function to `pass6-block-lowering.ts`
- Pass 6 now dispatches to registered block lowering functions
- Blocks with `registerBlockType()` entries emit real IR via their `lower()` functions
- Fall back to artifact-based IR for blocks without lowering functions
- Handle lowering errors gracefully with NotImplemented error code

**Blocks now emitting real IR:**
- AddSignal → `sigZip()` with Add opcode
- MulSignal → `sigZip()` with Mul opcode
- SubSignal → `sigZip()` with Sub opcode
- DivSignal → `sigZip()` with Div opcode
- MinSignal → `sigZip()` with Min opcode
- MaxSignal → `sigZip()` with Max opcode
- ClampSignal → `sigZip()` with Clamp opcode

---

## Deferred - Requires Infrastructure Work

### Deliverable 2: ColorLFO HSL→RGB Kernel

**Status:** DEFERRED
**Reason:** Color operations need type system work beyond simple number-based opcodes

**What exists:**
- ColorHSLToRGB opcode is defined (OpCode 301)
- ColorLFO block has lowering function registered
- Lowering function throws error because color conversion infrastructure incomplete

**What's needed to complete:**
1. Define color representation in IR (packed RGB? separate channels? hex strings?)
2. Implement ColorHSLToRGB opcode in `OpCodeRegistry.ts`
3. Handle color encoding/decoding between hex strings and numeric values
4. Update ColorLFO lowering function to use implemented opcode
5. Add runtime tests for color conversion accuracy

**Estimated scope:** Medium - requires design decision on color representation

---

### Deliverable 3: SVGSampleDomain Initialization

**Status:** DEFERRED
**Reason:** SVG domain materialization requires runtime infrastructure that doesn't exist

**What exists:**
- SVGSampleDomain has IR lowering registered
- Lowering calls `ctx.b.domainFromSVG()`
- Block compiler parses SVG paths at compile time

**What's needed to complete:**
1. Add runtime support for SVG domain materialization
2. Store SVG path data in compiled program IR
3. Implement domainFromSVG opcode in executor
4. Handle domain slot allocation and registration
5. Test with actual SVG-based patches

**Estimated scope:** Large - requires runtime domain infrastructure

---

## Remaining Red Flags (from original audit)

### Schedule & Runtime Red Flags (Still Open)

1. **`busEval` steps not emitted** - Schedule builder doesn't emit bus evaluation
2. **`materializeColor` cannot evaluate field expressions** - Throws on `{ kind: 'fieldExpr' }`

### Bus System Red Flags (Still Open)

1. Bus evaluation absent from schedule
2. Event buses not lowered
3. Bus type support limited (no vec2/color)

### Type System Red Flags (Still Open)

1. Type conversion paths unimplemented
2. Publisher transform chains ignored
3. Field transform chains not implemented

---

## Sprint Recommendations

### Sprint 3: Bus System
- Bus eval step implementation
- Event bus lowering
- Bus type support

### Sprint 4: Color & Domain Infrastructure
- Color type representation in IR
- ColorHSLToRGB implementation
- SVG domain runtime materialization

### Sprint 5: Type System
- Type conversion paths
- Transform chains
- Field operations

---

## Files Modified in Sprint 2

- `src/editor/compiler/passes/pass6-block-lowering.ts` - Block lowering infrastructure
