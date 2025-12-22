# Work Plan: Canonical Adapters & Lenses

This plan details the steps to fully implement the canonical set of Adapters and Lenses as defined in the design specifications. This work ensures the "Binding Stack" (Adapters + Lenses) is fully functional, type-safe, and expressive.

**References:**
- `design-docs/10-Refactor-for-UI-prep/17-CanonicalLenses.md`
- `design-docs/10-Refactor-for-UI-prep/19-AdaptersCanonical-n-Impl.md`

---

## Phase A: Canonical Adapters (Structural Compatibility)

**Goal:** Implement the registry definitions and compile-time transformation logic for all required type converters.

### 1. Adapter Implementation (`src/editor/adapters/definitions.ts`)
Create/populate the adapter registry with the following canonical adapters. Each must define its `from`, `to`, `cost`, `policy`, and `apply` logic.

#### World Adapters
- [ ] **Scalar → Signal**: `ConstToSignal` (AUTO, Cheap). Wraps value in `() => val`.
- [ ] **Scalar → Field**: `BroadcastScalarToField` (AUTO, Medium). Returns constant array generator.
- [ ] **Signal → Field**: `BroadcastSignalToField` (AUTO, Medium). Samples signal at `t`, broadcasts to all elements.
- [ ] **Field → Signal**: `ReduceFieldToSignal` (EXPLICIT, Heavy). Requires `mode` param (mean, sum, min, max).

#### Domain Adapters
- [ ] **Number → Phase**: `NormalizeToPhase` (SUGGEST, Cheap). `val % 1`.
- [ ] **Phase → Number**: `PhaseToNumber` (AUTO, Cheap). Identity (0..1).
- [ ] **Number ↔ Duration**: `NumberToDurationMs` / `DurationToNumberMs` (AUTO/SUGGEST). Unit handling.
- [ ] **Vec2/Point Semantics**: `PointVec2Alias` (AUTO, Cheap). Metadata remapping.

### 2. Runtime Integration
- [ ] Update `src/editor/compiler/compileBusAware.ts` (or `busSemantics.ts`) to execute the `adapterChain`.
- [ ] Ensure `applyAdapter` function takes an upstream `Artifact` and produces a downstream `Artifact` of the correct type.

---

## Phase B: Canonical Lenses (Perceptual Shaping)

**Goal:** Populate the `LensRegistry` with the full set of expressive transforms defined in spec 17.

### 1. Number Domain (`src/editor/lenses/LensRegistry.ts`)
- [ ] `Polarity` (Invert)
- [ ] `Softclip` (Tanh/Sigmoid)
- [ ] `Deadzone` (Rhythmic gating)
- [ ] `Quantize` (Stepped values)
- [ ] `MapRange` (Remap inMin..inMax to outMin..outMax)
- [ ] `Hysteresis` (Schmitt trigger smoothing)
- [ ] `SampleHold` (Stateful / TransportOnly)

### 2. Phase Domain
- [ ] `PhaseScale` (Frequency multiplication)
- [ ] `WrapMode` (Wrap vs Clamp vs PingPong boundary handling)
- [ ] `PhaseQuantize` (Rhythmic steps)
- [ ] `PhaseWindow` (Time warping within cycle)

### 3. Vector Domain (Vec2)
- [ ] `Vec2GainBias` (Per-component scale/offset)
- [ ] `Translate2D` (Move)
- [ ] `ClampBounds` (Box constraint)
- [ ] `Swirl` (Radial distortion)
- [ ] `Normalize` (Unit vector)

### 4. Color Domain
- [ ] `ColorGain` (Brightness/Alpha)
- [ ] `Saturate`
- [ ] `Contrast`
- [ ] `ClampGamut`

### 5. Implementation Details
- Ensure every lens has `apply(artifact, resolvedParams)` implemented.
- Ensure `resolvedParams` are `Artifacts` (Signals/Scalars), allowing modulation of lens parameters via the `lensResolution.ts` logic.

---

## Phase C: Compiler Integration

**Goal:** Connect the registry logic to the actual compilation pipeline.

### 1. Lens Stack Execution
- [ ] In `compileBusAware.ts`, inside the input resolution loop:
    - [ ] Call `resolveLensParams` (from `src/editor/lenses/lensResolution.ts`) for each lens in the stack.
    - [ ] Call `lens.apply(upstreamArtifact, paramArtifacts)` to chain the transformations.
- [ ] Ensure Lens Params properly fallback to `DefaultSource` if not wired (reusing the logic from Phase 1).

### 2. Validation & Safety
- [ ] Add `Validator` checks to ensure Lenses do NOT change the underlying `TypeDesc` (world/domain).
- [ ] Add cycle detection for Lens Parameters (lens param depending on the bus it modifies).

---

## Execution Order

1.  **Adapters**: Implement the `AdapterRegistry` population first, as it's structurally required for connections.
2.  **Lens Registry**: Populate the missing lens definitions.
3.  **Compiler Hookup**: Wire `applyAdapter` and `applyLensStack` into `getBusValue` / input resolution.
