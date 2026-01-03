# Follow-Up Plan: Compiler & Runtime Support for Stateful Transforms
**Date**: 2026-01-01
**Context**: This is the secondary plan for Phase 5 of the Unified Transforms work. It covers the logic required to support `isStateful: true` transforms (like Slew) in the compiler and runtime.

**Pre-requisites**:
*   Registry is populated (Phase 1-2 of Primary Plan).
*   UI is updated (Phase 3 of Primary Plan).

---

## 1. Compiler Updates (Pass 8)

**Goal**: Allocate state slots for transforms marked `isStateful`.

### 1.1 Update `BlockInputRootIR`
**File**: `src/editor/compiler/passes/pass8-link-resolution.ts`

We need to track state requirements for each input.

```typescript
export interface InputStateReq {
  transformIndex: number;
  transformId: string;
  initialState?: Record<string, unknown>;
}

export interface BlockInputRootIR {
  // ... existing fields ...
  // Map of (blockIdx * maxInputs + portIdx) -> Array of State Requirements
  readonly stateRequirements: Map<number, InputStateReq[]>;
}
```

### 1.2 Update `applyTransforms`
**Logic**:
When iterating through transforms:
1.  Check `transformDef.isStateful`.
2.  If true, record a requirement in `stateRequirements`.
3.  Pass a `stateReference` to `compileToIR`.

### 1.3 Update `TransformIRCtx`
**File**: `src/editor/transforms/TransformRegistry.ts`

```typescript
export interface TransformIRCtx {
  // ... existing fields ...
  
  /**
   * Reference to the allocated state slot for this transform.
   * Only present if isStateful=true.
   */
  readonly stateSlot?: {
    type: 'inputState';
    blockId: string;
    portId: string;
    transformIndex: number;
  };
}
```

---

## 2. Runtime Updates (Executor)

**Goal**: Initialize the allocated state slots when the patch starts.

### 2.1 Update `BlockRuntimeState`
**File**: `src/editor/compiler/types.ts` (or equivalent runtime types)

```typescript
export interface BlockRuntimeState {
  // ... existing ...
  
  /**
   * Input-hosted state for transforms.
   * Structure: inputs[portId].transforms[index] -> State Object
   */
  inputs: Record<string, {
    transforms: Record<number, Record<string, unknown>>;
  }>;
}
```

### 2.2 Update `Executor.ts`
**Logic**:
On `init()` or `reset()`:
1.  Read the `stateRequirements` from the Compiled IR.
2.  For each requirement, initialize the corresponding path in `blockState.inputs`.
3.  Ensure this state persists across hot-reloads if possible (or resets cleanly).

---

## 3. IR Lowering Implementation

**Goal**: Implement `compileToIR` for the Slew lens.

**File**: `src/editor/transforms/definitions/lenses/timing.ts`

```typescript
compileToIR: (input, params, ctx) => {
  if (!ctx.stateSlot) return null; // Error: No state allocated
  
  // 1. Get reference to 'lastValue' from state slot
  const lastValueRef = ctx.builder.getStateField(ctx.stateSlot, 'lastValue');
  
  // 2. Generate Slew Math using IR Opcodes
  // ...
  
  // 3. Update 'lastValue' in state slot
  ctx.builder.setStateField(ctx.stateSlot, 'lastValue', newValue);
  
  return newValue;
}
```

---

## 4. Verification

*   **Test**: Create a patch with `Osc -> Slew -> Out`.
*   **Verify**: The generated IR includes state access instructions.
*   **Verify**: The Runtime `blockState` shows the `inputs` namespace populated.
*   **Verify**: Scrubbing the timeline works (state is respected or reset correctly).
