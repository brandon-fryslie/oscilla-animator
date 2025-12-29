# Workstream 4: Signal Runtime + Stateful Ops

**Goal:** Ensure signal evaluation supports stateful ops, non-numeric domains, and IR-defined kernels (HSL->RGB), without falling back to legacy closures.

## Scope

- Stateful operations are fully wired (state layout, alloc, eval).
- Non-numeric signal slots (vec2/vec3/color) are evaluated correctly.
- Add ColorHSLToRGB kernel and use it in ColorLFO lowering.

## Dependencies

- Depends on Workstream 1 (TypeDesc unification, slot allocation rules).

## Primary References

- `plans/SPEC-03-signal-runtime.md`
- `plans/SPEC-06-type-system.md`

## Key Files + Line Anchors

- `src/editor/runtime/signal-expr/SigEvaluator.ts:498-1035` (stateful eval + delay/pulse/envelope)
- `src/editor/compiler/ir/signalExpr.ts:75-200` (SignalExprIR nodes)
- `src/editor/compiler/ir/IRBuilderImpl.ts` (state allocation; find state layout in builder)
- `src/editor/runtime/executor/RuntimeState.ts:50-115` (state buffer setup)

## Plan

### 1) Confirm stateful ops have correct state allocation

**Goal:** stateful ops must map to stable state offsets and sizes.

Steps:

1. Locate state allocation in IRBuilder (use `allocStateId` or similar in `src/editor/compiler/ir/IRBuilderImpl.ts`).
2. Define fixed state layouts per op (e.g., delayFrames needs N+1 slots, pulseDivider uses 1).
3. Ensure state layout info is emitted into compiled program for runtime state buffer init.

### 2) Validate stateful evaluators and inputs

**Goal:** Each stateful op reads/writes state correctly and uses deltaSec.

Steps:

1. Review `src/editor/runtime/signal-expr/SigEvaluator.ts:498-1035` for:
   - Integrate: uses deltaSec.
   - DelayFrames: ring buffer with index and buffer size.
   - PulseDivider: uses threshold or phase quantization.
   - EnvelopeAD: uses trigger edge detection and elapsed time.

2. Verify that node params include the expected fields (divisions, delayFrames, attack/decay).

3. If any op is missing, add it to `SignalExprIR` and implement evaluation logic.

### 3) Non-numeric signal slot evaluation

**Goal:** inputSlot evaluation supports vec2/vec3/color.

Steps:

1. Update `SigEvaluator` inputSlot handling to read multi-slot values based on TypeDesc domain.
2. Ensure ValueSlot allocation increments by correct component count.
   - This likely touches slot allocation code in IRBuilder (value slot sizing per type).

### 4) Add ColorHSLToRGB kernel

**Goal:** ColorLFO and HSL-based color blocks can lower in IR.

Steps:

1. Implement kernel in the kernel registry (locate kernel list, likely in `src/editor/runtime/signal-expr/kernels.ts` or equivalent).
2. Update lowering in `src/editor/compiler/blocks/signal/ColorLFO.ts` to use the kernel in IR mode.

## Deliverables

- Stateful ops fully deterministic in IR mode.
- Signal eval works across numeric and non-numeric domains.
- ColorLFO lowering uses a real IR kernel.

## Validation (No Tests)

- Use Chrome DevTools MCP to:
  - Run a patch with PulseDivider + EnvelopeAD and confirm stable timing.
  - Run ColorLFO and confirm color changes without legacy fallback.

