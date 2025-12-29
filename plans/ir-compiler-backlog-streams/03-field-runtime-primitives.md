# Workstream 3: Field Runtime + Field/Signal Primitives

**Goal:** Make field evaluation fully functional in IR by adding missing field opcodes and implementing runtime materialization behavior for transforms, reductions, and non-numeric domains.

## Scope

- Add FieldExprMapIndexed + FieldExprZipSig IR nodes.
- Implement transform chain evaluation in Materializer.
- Add fieldReduce signal expression (field -> signal reduction).
- Support non-numeric field combine (vec2/vec3/color).
- Propagate stable domain element IDs.

## Dependencies

- Depends on Workstream 1 (TypeDesc unification).
- Some kernels need Workstream 4 (signal kernels) for shared math utilities.

## Primary References

- `plans/SPEC-01-field-signal-combination.md`
- `plans/SPEC-02-field-runtime.md`

## Key Files + Line Anchors

- `src/editor/compiler/ir/fieldExpr.ts:46-127` (FieldExprIR union and node definitions)
- `src/editor/compiler/ir/IRBuilderImpl.ts:483-497` (reduceFieldToSig placeholder)
- `src/editor/runtime/field/Materializer.ts:1150-1179` (transform chain placeholder)
- `src/editor/runtime/field/Materializer.ts:1208-1247` (combine logic for numeric only)
- `src/editor/runtime/executor/steps/executeMaterializePath.ts:338-344` (curve flattening TODO)
- `src/editor/runtime/field/Materializer.ts:283-289` (domainElements fallback)

## Plan

### 1) Add FieldExprMapIndexed and FieldExprZipSig IR nodes

**Goal:** Support field ops that require element index and/or multiple signals.

Steps:

1. Extend `src/editor/compiler/ir/fieldExpr.ts:46-127`:
   - Add `FieldExprMapIndexed` node with access to element index/count and signal refs.
   - Add `FieldExprZipSig` node for combining field elements with multiple signals.

2. Update IRBuilder (`src/editor/compiler/ir/IRBuilderImpl.ts`) to emit these nodes:
   - Add `fieldMapIndexed(...)` and `fieldZipSig(...)` helpers.

3. Update any lowerers that need these ops (FieldHueGradient, JitterFieldVec2, FieldMapVec2).
   - These lowerers live under `src/editor/compiler/blocks/field/` (confirm file names).

### 2) Implement transform chain evaluation

**Goal:** Field materialization must apply transform chains instead of throwing.

Steps:

1. In `src/editor/runtime/field/Materializer.ts:1150-1179`, replace the placeholder:
   - Fetch transform chain steps.
   - Apply each step to the materialized buffer.

2. Implement helper functions for scale/bias, normalize, quantize, ease, cast.

3. Ensure transform chain respects buffer formats for non-numeric domains.

### 3) Field reduce support

**Goal:** Fix reduceFieldToSig and make reductions real.

Steps:

1. In `src/editor/compiler/ir/IRBuilderImpl.ts:483-497`, replace the closureBridge placeholder with a proper `SignalExprFieldReduce` node.

2. Add a new node type in `src/editor/compiler/ir/signalExpr.ts` to represent field reduction.

3. Implement evaluation in `src/editor/runtime/signal-expr/SigEvaluator.ts`:
   - Materialize field buffer.
   - Apply reducer (sum/avg/min/max/first/last).

### 4) Non-numeric field combine

**Goal:** Field combine must work for vec2/vec3/color domains.

Steps:

1. Update `src/editor/runtime/field/Materializer.ts:1208-1247` to branch by domain.
   - Implement vec2/vec3 combination component-wise.
   - Implement color combination (layer mode = alpha composite).

2. Ensure slot allocation supports multi-component formats.

### 5) Stable domain element IDs

**Goal:** hash01ById and related ops need stable IDs, not index fallback.

Steps:

1. In `src/editor/runtime/field/Materializer.ts:283-289`, replace fallback to index with domain-provided IDs.

2. Ensure domain builders provide element IDs:
   - Check domain creation blocks (e.g., GridDomain) for element ID emission.
   - Thread element IDs through domain handles into runtime.

## Deliverables

- Field runtime handles transform chains, reductions, and non-numeric combine.
- Field-signal combination ops are supported by IR.
- Domain element IDs are stable in runtime.

## Validation (No Tests)

- Use Chrome DevTools MCP to:
  - Run a patch with FieldHueGradient + JitterFieldVec2 and verify no IR errors.
  - Change domains and confirm stable element IDs in hash-based ops.

