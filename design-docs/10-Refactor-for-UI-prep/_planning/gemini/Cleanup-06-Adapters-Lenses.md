# Cleanup Plan: Adapters & Lenses

**Goal:** Remove stub files, enforce registry completeness, and ensure the "Binding Stack" is fully type-safe.

## 1. Remove Registry Stubs
- [ ] Audit `src/editor/lenses` and `src/editor/adapters`.
- [ ] Ensure `LensRegistry` and `AdapterRegistry` are the only source of truth.
- [ ] Remove any hardcoded adapter lists in `portUtils.ts` or `compile.ts`.

## 2. Enforce Type Safety
- [ ] Review `AdapterDef` and `LensDef`. Ensure `params` specs are strictly typed using `TypeDesc`.
- [ ] Ensure `apply` functions in adapters/lenses return `Artifact` objects that match the declared output type.

## 3. Implement Missing Lenses
- [ ] Populate `LensRegistry` with the full canonical set (Gain, Clamp, Slew, etc.) defined in `design-docs/17-CanonicalLenses.md`.
- [ ] Ensure all lens params have sane defaults and UI hints.

## 4. Compiler Integration Polish
- [ ] Review `lensResolution.ts`. Ensure it handles recursion loops (lens param depending on bus it modifies).
- [ ] Connect `compileBusAware.ts` to fully execute the lens stack (currently a placeholder comment).

## 5. Verification
- [ ] Verify: Adding a "Gain" lens to a listener actually scales the value in the running program.
- [ ] Verify: Incompatible bindings suggest valid adapters via `findAdapterPath`.
