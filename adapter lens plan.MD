# Adapter and Lens System Refactor Plan

This plan outlines the steps to implement the comprehensive Adapter and Lens system for `oscilla-animator`, distinguishing clearly between structural compatibility (Adapters) and perceptual expression (Lenses).

**Goal:** Implement a clean separation of concerns where Adapters handle type conversions (legality) and Lenses handle artistic transformations (feel), with a unified execution model and "mini-block" parameterization for lenses.

## Phase 1: Core Type System Updates
**Target File:** `src/editor/types.ts`

1.  **Update `Publisher` Interface:**
    *   Add `lensStack?: LensInstance[]`.
    *   *Constraint:* Publisher lenses are pre-combine.

2.  **Update `Listener` Interface:**
    *   Deprecate/Remove `lens?: LensDefinition`.
    *   Ensure `lensStack?: LensInstance[]` is the standard.
    *   *Constraint:* Listener lenses are post-combine.

3.  **Define Lens Data Models:**
    *   **`LensInstance`**: Replaces `LensDefinition`.
        ```typescript
        interface LensInstance {
          lensId: string;
          params: Record<string, LensParamBinding>;
          enabled: boolean;
          sortKey?: number;
        }
        ```
    *   **`LensParamBinding`**:
        ```typescript
        type LensParamBinding =
          | { kind: 'default'; defaultSourceId: string }
          | { kind: 'wire'; from: BindingEndpoint; adapters?: AdapterStep[]; lenses?: LensInstance[] } // Recursive!
          | { kind: 'bus'; busId: string; adapterChain?: AdapterStep[]; lensStack?: LensInstance[] };
        ```

4.  **Define Default Source State (for Lenses):**
    *   **`DefaultSourceState`**:
        ```typescript
        interface DefaultSourceState {
          id: string; // "ds:<bindingId>:<lensIndex>:<paramKey>"
          type: TypeDesc;
          value: unknown;
          uiHint?: UIControlHint; // Reuse existing UIControlHint
          rangeHint?: { min?: number; max?: number; step?: number; log?: boolean };
        }
        ```

5.  **Define Adapter Policy Types:**
    *   **`AdapterPolicy`**: `'AUTO' | 'SUGGEST' | 'EXPLICIT' | 'FORBIDDEN'`.
    *   **`AdapterCost`**: `'cheap' | 'medium' | 'heavy'`.

## Phase 2: Registry & Catalog Implementation
**Target Directory:** `src/editor/adapters/` & `src/editor/lenses/`

1.  **Adapter Registry (`src/editor/adapters/AdapterRegistry.ts`):**
    *   Define `AdapterDef` interface (id, policy, cost, implementation).
    *   Implement the **Canonical Adapter Table** (19-AdaptersCanonical-n-Impl.md):
        *   Scalar->Signal (Auto), Scalar->Field (Auto), Signal->Field (Auto).
        *   Field->Signal (Explicit - Reduce).
        *   Number<->Phase, Number<->Duration (Suggest).
        *   Forbidden: Signal->Scalar, Vec2->Number.

2.  **Lens Registry (`src/editor/lenses/LensRegistry.ts`):**
    *   Define `LensDef` interface (id, label, domain, allowedScopes: ['publisher', 'listener'], params).
    *   Implement the **Lens Catalog** (17-CanonicalLenses.md):
        *   **Number:** Gain, Polarity, Clamp, Softclip, etc.
        *   **Phase:** Offset, Scale, PingPong, Wrap, etc.
        *   **Vec2:** GainBias, Rotate, etc.
        *   **Color:** Gain, HueShift, etc.
        *   **Boolean:** Invert, etc.
    *   Ensure strict scope validation (e.g., `PhaseToPulse` is not a lens).

## Phase 3: Logic & Algorithms
**Target Directory:** `src/editor/adapters/` & `src/editor/lenses/`

1.  **Auto-Adapter Selection (`src/editor/adapters/autoAdapter.ts`):**
    *   Implement `findAdapterPath(from: TypeDesc, to: TypeDesc, context)` algorithm.
    *   **Pathfinding:** Max length 2.
    *   **Filtering:** Respect policies (Auto vs Suggest vs Explicit).
    *   **Scoring:** Minimize cost + length.
    *   **Caching:** Memoize results by type pair.

2.  **Lens Parameter Resolution (`src/editor/lenses/resolveLensParam.ts`):**
    *   Implement `resolveLensParam(binding, context)` logic.
    *   Handle `default`, `wire`, and `bus` cases.
    *   **Recursion Guard:** Detect and prevent cycles or deep nesting.
    *   **Invariant Check:** Ensure resolved value is Signal or Scalar (warn on Field).

## Phase 4: Compiler & Runtime Integration
**Target File:** `src/editor/semantic/busSemantics.ts` & `src/editor/compiler/compileBusAware.ts`

1.  **Update Publisher Evaluation:**
    *   Insert `Publisher Lens Stack` application *before* bus combination.
    *   Flow: `Block Output` -> `Adapter Chain` -> `Publisher Lens Stack` -> `Bus Mix`.

2.  **Update Listener Evaluation:**
    *   Ensure `Listener Lens Stack` application is *after* bus combination.
    *   Flow: `Bus Mix` -> `Adapter Chain` -> `Listener Lens Stack` -> `Block Input`.

3.  **Integrate Default Sources:**
    *   Create a store/lookup for `DefaultSourceState` accessible during compilation.
    *   Ensure lens params using `kind: 'default'` fetch from this store.

## Phase 5: Verification & Safety
**Target File:** `src/editor/validation/lensValidation.ts` (New)

1.  **Validation Rules:**
    *   **Type Preservation:** Verify Lens Output Type == Input Type.
    *   **Scope Compliance:** Verify Publisher bindings only use publisher-allowed lenses.
    *   **Cycle Detection:** Validate lens param bindings don't loop.

2.  **Unit Tests:**
    *   Test Auto-Adapter pathfinding cases.
    *   Test Lens Param resolution with nesting.
    *   Test "Publisher Lens pre-mix" behavior (e.g., gain on one publisher before sum).

## Phase 6: API for UI (Back-end support)
**Target File:** `src/editor/stores/LensStore.ts` (or similar)

1.  **Lens Management Actions:**
    *   `addLens(bindingId, lensId)`
    *   `removeLens(bindingId, lensIndex)`
    *   `reorderLenses(bindingId, newOrder)`
    *   `setLensParam(bindingId, lensIndex, paramKey, binding)`

2.  **Adapter Actions:**
    *   `resolveConnection(from, to)` -> returns explicit confirmation need if heavy.

## Execution Order
1.  **Refactor Types:** Modify `src/editor/types.ts`.
2.  **Create Registries:** Scaffold `src/editor/adapters` and `src/editor/lenses`.
3.  **Implement Logic:** Write pathfinding and resolution algorithms.
4.  **Update Compiler:** Wire it all up in `busSemantics.ts`.
5.  **Verify:** Run tests/validation.
