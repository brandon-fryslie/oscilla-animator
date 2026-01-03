# Comprehensive Plan: Unified Transforms & Port Modifiers
**Date**: 2026-01-01
**Context**: Unifying Lenses/Adapters and architecting stateful connections without "Compiler Inserted Blocks" or "Stateful Wires".

## 1. Executive Summary

We are unifying all signal transformations (Lenses and Adapters) into a single, registry-driven system. This removes legacy "Publisher/Listener" concepts and replaces them with a flat **Wire + Port Modifier** architecture.

**The Big Shift**:
*   **Old**: Wires are dumb. "Listeners" wrap input ports and hold state. Logic is scattered in switch statements.
*   **New**: Wires are stateless definitions. Transforms are **Port Modifiers** attached to the destination input. Logic is encapsulated in the `TransformRegistry`.

This plan focuses on **populating the registry** and **updating the UI**. The actual runtime state allocation for stateful transforms (like Slew) is defined here conceptually but implemented in a follow-up phase.

---

## 2. New Concepts & Architecture

### 2.1 Concept: "Port Modifiers" (Input Attachments)
*   **What**: A transform applied to a connection is architecturally treated as a modifier on the **Destination Port**.
*   **Why**: To preserve the invariant that **Wires are Stateless**. A wire just says "A connects to B". The *processing* of that signal (smoothing, scaling) is the responsibility of Block B (the receiver).
*   **Relative Importance**: **Critical**. This decision prevents us from creating "Compiler Inserted Blocks" (which break graph topology) or "Stateful Wires" (which break the execution model).

### 2.2 Concept: Input-Hosted State
*   **What**: If a transform needs state (e.g., `slew` needs `lastValue`), that state is allocated within the **Destination Block's** runtime memory, specifically in a reserved `inputs` namespace.
*   **Why**: State lifecycle must match the block lifecycle. If Block B is deleted, the Slew state must vanish.
*   **UI Implication**: Dragging a Slew lens onto a wire conceptually attaches it to the input port.

### 2.3 Concept: Registry-Driven UI
*   **What**: The `LensSelector` and `ChainEditor` will no longer have hardcoded lists. They will query `TRANSFORM_REGISTRY.getAllLenses()`.
*   **Why**: To allow "Drop-in" extensibility. Adding a new lens file immediately makes it available in the UI.

---

## 3. Implementation Plan (Primary Work)

This work focuses on **Registry Population** and **UI Integration**.

### Phase 1: Infrastructure & Types

**Goal**: Update the registry to support statefulness metadata and rename scopes to eliminate legacy terminology.

1.  **Update `TransformScope`** (`src/editor/transforms/types.ts`):
    *   **Rename**: `listener` -> `input`
    *   **Rename**: `publisher` -> `output`
    *   **Rename**: `wire` -> `connection` (optional, or merge into `input`)
    *   **New Set**: `'input' | 'output' | 'connection' | 'param'`
    *   *Task*: Find and replace all usages of old scope names in the codebase.

2.  **Update `TransformDef`** (`src/editor/transforms/TransformRegistry.ts`):
    *   Add `isStateful: boolean` (Default `false`).
    *   Update `allowedScopes` to use the new `TransformScope` values.
    *   *Note*: This flag enables the compiler (in Follow-up Work) to allocate state slots.

### Phase 2: Registry Population (The "Lift & Shift")

**Goal**: Move all hardcoded logic from `src/editor/lenses/index.ts` and `compileBusAware.ts` into isolated definition files.

**Pattern**: "Factory Pattern" (Define locally, register centrally).

1.  **Create Directory Structure**:
    *   `src/editor/transforms/definitions/adapters/`
    *   `src/editor/transforms/definitions/lenses/`

2.  **Migrate Adapters** (from `autoAdapter.ts`):
    *   Create `definitions/adapters/scalars.ts` (Const → Signal).
    *   Create `definitions/adapters/signals.ts` (Signal → Field).
    *   *Rule*: Implement `apply` function inline. **Do not link back to legacy code.**

3.  **Migrate Stateless Lenses**:
    *   Create `definitions/lenses/math.ts`: `scale`, `clamp`, `offset`, `mapRange`, `polarity`, `deadzone`.
    *   Create `definitions/lenses/quantize.ts`.
    *   *Configuration*: `isStateful: false`, `allowedScopes: ['input', 'output', 'connection', 'param']`.

4.  **Migrate Stateful Lenses (`slew`, `ease` context-dependent)**:
    *   Create `definitions/lenses/timing.ts`.
    *   *Configuration*: `isStateful: true`, `allowedScopes: ['input']` (**Strict Restriction**: Stateful lenses only allowed on inputs).
    *   *Logic*: Implement the logic assuming `state` is passed to `apply`.

5.  **Create Registration Entry Point**:
    *   Create `src/editor/transforms/registerAll.ts`.
    *   Import all definition files.
    *   Call `TRANSFORM_REGISTRY.register...` for each.
    *   Import this file in `src/main.tsx`.

### Phase 3: UI Integration

**Goal**: Make the UI data-driven.

1.  **Refactor `LensSelector.tsx`**:
    *   Delete `LENS_TYPES` constant.
    *   Use `TRANSFORM_REGISTRY.getAllLenses()` to populate the dropdown.
    *   Replace the big switch statement with a generic `ParamsEditor` that reads `lens.params` schema.

---

## 4. Ambiguity Resolutions

*   **Registration Location**: `src/editor/transforms/registerAll.ts`.
*   **Adapter Organization**: Inline logic in definition files. No delegation.
*   **Lens Scopes**:
    *   **Stateless**: `['input', 'output', 'connection', 'param']`
    *   **Stateful**: `['input']` (Strictly enforced).
*   **LensParam Transforms**:
    *   **Adapters**: Allowed (for type coercion).
    *   **Lenses**: Allowed (if stateless).
    *   **Reason**: Consistency.

---

## 5. Follow-Up Work (Secondary Document)

The following tasks are **NOT** part of this immediate implementation plan but are required to make the system fully functional. They should be tracked separately in `PLAN-2026-01-01-unified-transforms-followup.md`.

### 5.1 Compiler State Allocation (Pass 8)
*   **Goal**: Update `pass8-link-resolution.ts` to respect `isStateful`.
*   **Task**: When encountering a stateful transform, allocate a slot in the destination block's `BlockInputRootIR`.
*   **Task**: Update `TransformIRCtx` to pass this state slot to `compileToIR`.

### 5.2 Runtime State Support
*   **Goal**: Ensure `RuntimeCtx` has access to input-hosted state.
*   **Task**: Update `Executor` to initialize `blockState.inputs` on startup.

### 5.3 IR Lowering Implementation
*   **Goal**: Implement `compileToIR` for all migrated transforms.
*   **Task**: Systematically go through `definitions/**/*.ts` and implement the IR generation logic (currently only ~7% complete).

---

## 6. Verification Checklist

1.  **Registry Count**: App startup logs correct number of adapters/lenses.
2.  **UI Check**: `LensSelector` shows all lenses, and adding a lens updates the definition.
3.  **Migration**: Loading an old patch with `lensStack` correctly migrates to `Edge.transforms`.
4.  **Scope**: Trying to add `slew` to an Output (via code/test) throws a validation error (if scoped correctly).