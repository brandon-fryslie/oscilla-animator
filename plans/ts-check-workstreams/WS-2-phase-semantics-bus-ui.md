# WS-2: Phase Semantics + Bus/Adapter UI

## Scope
Remove invalid `number`/`phase` domain comparisons and represent phase as `float` with semantics. Update adapters and bus UI to key off semantics instead of domain strings.

## Files & Tasks
- [ ] **Adapter registry uses float + semantics (no `number`/`phase` domains).**
  - `src/editor/adapters/AdapterRegistry.ts:135`
  - Replace `makeTypeDesc('signal', 'number')`/`('phase')` and `('scalar', 'number')`/`('phase')` with `float` + explicit semantics.
  - Likely update `makeTypeDesc` signature to accept optional `semantics` (and pass `'phase(0..1)'`), e.g. `makeTypeDesc('signal', 'float', 'phase(0..1)')`.
  - Ensure the adapter labels remain “Number → Phase” / “Phase → Number”, but the underlying TypeDesc uses `domain: 'float'` with/without semantics.

- [ ] **Bus creation defaults to float (not number).**
  - `src/editor/BusCreationDialog.tsx:270`
  - Default domain should be `'float'` (update comment + return value).

- [ ] **Bus inspector numeric editor uses semantics for phase behavior.**
  - `src/editor/BusInspector.tsx:32`
  - Replace `case 'number'`/`case 'phase'` with `case 'float'` and check `bus.type.semantics === 'phase(0..1)'` for step/min/max.
  - Keep rate/time handling as-is.

- [ ] **Bus visualization uses float + semantics for phase rendering.**
  - `src/editor/BusViz.tsx:26`
  - Replace `case 'number'` with `case 'float'`.
  - Remove `case 'phase'`; use a semantics hint instead (see BusChannel).
  - Update `BusViz` props to accept `semantics?: string` (or full TypeDesc) and choose `PhaseViz` when semantics indicate phase.
  - Update call site: `src/editor/BusChannel.tsx:163` to pass `bus.type.semantics` (or whole TypeDesc).

- [ ] **Lens resolution uses semantics to emit `Signal:phase`.**
  - `src/editor/lenses/lensResolution.ts:62`
  - Remove `type.domain === 'phase'` branch.
  - Add logic: if `type.domain === 'float'` and `type.semantics === 'phase(0..1)'`, return `Signal:phase`.

## Notes
- Keep `phase` in ValueKind (legacy) so the compiler can still use `Signal:phase`, but treat it as `float` with `phase(0..1)` semantics in UI/adapters.
- If you introduce a helper like `isPhaseSemantics(typeDesc)`, place it in `src/editor/semantic` or `src/editor/ir/types/TypeDesc.ts` and reuse it in BusInspector/BusViz/lensResolution.
