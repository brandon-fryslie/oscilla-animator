# Parallel Plan 01 (v2): Lenses & Adapters End-to-End

**Goal:** Implement the binding stack as specified: adapterChain (compatibility) + lensStack (expression), with lens params as bindings and default sources.

## Dependencies
- Requires adapter registry interfaces from Gate B.
- Uses PortKey/PortRef from Gate A for binding endpoints.

## Parallel-Friendly Task Sequence
1. **Spec Alignment**
   - [ ] Review `design-docs/10-Refactor-for-UI-prep/16-AdapterVsLens.md` and `design-docs/10-Refactor-for-UI-prep/17-CanonicalLenses.md`.
   - [ ] Confirm the canonical lens list and which lenses are allowed for publishers vs listeners.

2. **Lens Data Model**
   - [ ] Introduce `LensInstance` (lensId, params bindings, enabled, sortKey) per `18-LensDefaulltSources-n-Impl.md`.
   - [ ] Update `Listener` / `Publisher` types to use `lensStack: LensInstance[]`.
   - [ ] Add lens param binding types: default/wire/bus, with adapterChain + nested lensStack (guarded).
   - [ ] Break down lens param binding resolution per `18-LensDefaulltSources-n-Impl.md`:
     - default source resolution
     - bus resolution with adapterChain + lensStack
     - wire resolution with adapterChain + lensStack

3. **Lens Registry & Execution**
   - [ ] Complete `src/editor/lenses/LensRegistry.ts` for all canonical lenses.
   - [ ] Enforce type-preserving lens rule (same world/domain in/out).
   - [ ] Implement lens application with stability hints (scrubSafe vs transportOnly).

4. **Binding Stack Compilation**
   - [ ] Apply adapterChain first, then lensStack (adapters ensure compatibility; lenses express shaping).
   - [ ] Enforce type-preserving lens rule at compile time.
   - [ ] Implement param resolution for lenses using the same resolver as block inputs.
   - [ ] Add recursion guards for lens-param bindings (cycle and depth limits).

5. **UI Wiring**
   - [ ] Build/extend base UI components for lens chips + param drawers (if missing).
   - [ ] Render lens chips + param drawers from registry.
   - [ ] Each param shows Default/Bus/Wire source with inline control when default.
   - [ ] Add explicit publisher lens UI (fully supported; expected in most projects).

6. **Tests**
   - [ ] Update lens tests to use LensRegistry and LensInstance model.
   - [ ] Add a runtime test verifying a publisher lens affects bus combine results.

## Deliverables
- Canonical lens registry fully functional.
- AdapterChain + LensStack applied in correct order.
- Lens params are bindable inputs with defaults.
