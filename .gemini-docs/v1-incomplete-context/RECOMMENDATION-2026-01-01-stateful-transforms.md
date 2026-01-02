# Recommendation: Handling Stateful Transforms (No Publishers/Listeners)
**Date**: 2026-01-01
**Context**: "Publisher" and "Listener" concepts are being deleted. All connections are direct Wires between Blocks.

## 1. Analysis of Existing Transforms

| Transform ID | Kind | Statefulness | Notes |
| :--- | :--- | :--- | :--- |
| `slew` | Lens | **STATEFUL** | Uses `lastValue` / `lastTime`. |
| `ease` | Lens | Stateless* | Pure mapping in current implementation. |
| Others | Lens | Stateless | Pure math or type conversion. |

**Finding**: `slew` is the primary stateful transform today.

## 2. The Architectural Challenge

With Publishers and Listeners removed, we have a flat graph:
`SourceBlock.OutputPort` --[Wire + Transforms]--> `TargetBlock.InputPort`

*   **Constraint 1**: Wires (Edges) must be **stateless**. They are just definitions.
*   **Constraint 2**: We do **not** want hidden "shim blocks" (e.g., a `SlewBlock`) automatically inserted by the compiler, as this complicates graph topology.

**Question**: Where does the `lastValue` for the Slew transform live?

## 3. Recommended Architecture: "Input-Hosted State"

The state for any transform on a wire must be hosted by the **Destination Block**.

### Concept
The `TargetBlock` is responsible for "pulling" the value from the wire. Therefore, the `TargetBlock`'s runtime state is the natural home for any state required to process that pull.

### Implementation Strategy

#### A. Block Runtime State Structure
The runtime state object for every block must reserve a namespace for its input ports.

```typescript
// The runtime state of any block
interface BlockRuntimeState {
  // ... internal block logic state (e.g., oscillator phase)
  
  // NEW: State for processing inputs
  inputs: {
    [portId: string]: {
      // Namespace for transforms attached to this input connection
      transforms: {
        [transformIndex: number]: Record<string, unknown>; 
      }
    }
  }
}
```

#### B. Transform Registry Update
Transforms must explicitly declare if they need state, so the compiler knows to allocate it.

```typescript
export interface TransformDef {
  // ...
  readonly isStateful: boolean;
  
  // Apply function receives a "state container"
  readonly apply: (
    input: Artifact, 
    params: Record<string, Artifact>, 
    ctx: RuntimeCtx,
    state?: Record<string, unknown> // <--- THE STATE CONTAINER
  ) => Artifact;
}
```

#### C. Compilation Logic (The "Inliner")
When compiling the inputs for `TargetBlock`:

1.  Identify the connection to input port `X`.
2.  Iterate through the transforms on that connection.
3.  For each transform:
    *   If **Stateless** (e.g., Scale): Generate a pure expression `scale(val)`.
    *   If **Stateful** (e.g., Slew):
        *   Allocate a slot in the `BlockRuntimeState` schema: `state.inputs.X.transforms[i]`.
        *   Generate a call to the transform's apply function, passing that specific state slot.

```typescript
// Pseudo-code for compiled Block Update
function updateBlock(t, ctx, blockState) {
  // 1. Evaluate Input 'frequency'
  let rawVal = sourceBlock.out(t);
  
  // 2. Apply Transform 0: Scale (Stateless)
  let scaled = rawVal * 1.5;
  
  // 3. Apply Transform 1: Slew (Stateful)
  // Pass the dedicated state container for this specific transform instance
  let slewed = applySlew(scaled, slewParams, ctx, blockState.inputs['frequency'].transforms[1]);
  
  // 4. Block Logic
  return Math.sin(t * slewed);
}
```

### 4. Constraints & Rules

1.  **Wires are Definitions Only**: A wire defines *what* transforms happen, but holds no data itself.
2.  **No Shared State**: The state is unique to the **Connection**. If two blocks connect to the same source with `Slew`, they have independent `lastValue` states (hosted in their respective destination blocks).
3.  **Lifecycle**: When `TargetBlock` is reset, its `inputs` state is cleared, correctly resetting the Slew.

### 5. Specific Recommendation for `slew`

Refactor `slew` to use the passed-in state object:

```typescript
TRANSFORM_REGISTRY.registerLens({
  id: 'slew',
  kind: 'lens',
  isStateful: true, // Signal to compiler to allocate storage
  apply: (input, params, ctx, state) => {
    // state is guaranteed to be provided by compiler if isStateful=true
    if (!state) return input; // Should not happen in compiled code
    
    const current = input.value(ctx.t);
    
    // Use state.lastValue / state.lastTime
    if (state.lastValue === undefined) {
      state.lastValue = current;
      state.lastTime = ctx.t;
      return current;
    }
    
    // ... calculate slew ...
    // Update state
    state.lastValue = newValue;
    state.lastTime = ctx.t;
    
    return newValue;
  }
});
```

## Summary
*   **Delete** Publishers/Listeners classes.
*   **Keep** Wires stateless.
*   **Host** transform state in the `TargetBlock`'s runtime state object, under an `inputs` namespace.
*   **Compiler** manages the mapping from "Wire Transform" to "Block State Slot".