# Int/Float Migration Plan

Goal: Replace the single `number` domain with canonical `int` and `float` domains in the editor + IR type systems. Ensure all port specs, SlotTypes, IR lowering, and diagnostics use `int`/`float` internally while preserving a safe migration path.

## 1) Type System Foundations

### Editor Type System
- Update `CoreDomain` in `src/editor/types.ts` to include `int` and `float` (remove `number`).
- Extend `SlotType` in `src/editor/types.ts` to include:
  - `Scalar:int`, `Scalar:float`
  - `Signal<int>`, `Signal<float>`
  - `Field<int>`, `Field<float>`
- Update `SLOT_TYPE_TO_TYPE_DESC` in `src/editor/types.ts`:
  - Map `Scalar:float`, `Signal<float>`, `Field<float>` to core domain `float`.
  - Map `Scalar:int`, `Signal<int>`, `Field<int>` to core domain `int`.
  - Update `ElementCount` to map to `Signal<int>` semantics.
- Update `CORE_DOMAIN_DEFAULTS` in `src/editor/types.ts`:
  - `float: 0`
  - `int: 0`
- Update `validateDefaultValue` in `src/editor/types.ts`:
  - `float` accepts any `number`.
  - `int` requires `Number.isInteger`.

### IR Type System
- Update `CoreDomain` in `src/editor/ir/types/TypeDesc.ts` to include `int` and `float` (remove `number`).
- Ensure `INTERNAL_DOMAINS` does not include `int`/`float` and does not rely on `number`.
- Update any helpers / comparisons in `src/editor/ir/types/TypeDesc.ts` that assume `number`.

## 2) Legacy Compatibility (Parsing)

Even after the migration, some patches/tests may still reference `number` in SlotTypes or ValueKinds. Add compatibility in the conversion layers:

- Update SlotType parsing in `src/editor/compiler/passes/pass2-types.ts`:
  - Map `Signal<number>` -> `signal/float`
  - Map `Field<number>` -> `field/float`
  - Map `Scalar:number` -> `scalar/float`
- Update ValueKind parsing in `src/editor/ir/types/typeConversion.ts`:
  - Map `Signal:number`, `Field:number`, `Scalar:number` -> `float`

This keeps serialized legacy content loadable without reintroducing `number` into canonical types.

## 3) Semantic Layer + Bus Utilities

- Update `VALUE_KIND_TO_TYPE_DESC` in `src/editor/semantic/index.ts` to map numeric kinds to `float`.
- Update `COMPILER_COMPATIBLE_DOMAIN_SETS` in `src/editor/semantic/index.ts`:
  - Replace `['elementCount', 'number']` with `['elementCount', 'int']`.
- Update `CORE_DOMAIN_DEFAULTS` usage in `src/editor/semantic/busSemantics.ts` if it expects `number`.

## 4) Port Catalog + Block Specs

- Update the canonical port catalog definitions in `src/editor/blocks/portCatalog.ts`:
  - Oscillator: `amplitude`, `bias`, and `out` should be `Signal<float>` with IR domain `float`.
- Update any related block specs (e.g. `src/editor/blocks/oscillatorSpec.ts`) to match.

## 5) Block Definitions / Compilers

- Replace ValueKind references in compiler blocks from `Signal:number`/`Field:number`/`Scalar:number` to float.
- Identify and update the **few integer ports**:
  - `GridDomain` rows/cols -> `Scalar:int`
  - `DomainN` count -> `Scalar:int`
  - `SVGSampleDomain` sampleCount -> `Scalar:int`
- Ensure any integer defaultSource values are integers.

Key files to update:
- `src/editor/compiler/blocks/domain/GridDomain.ts`
- `src/editor/compiler/blocks/domain/DomainN.ts`
- `src/editor/compiler/blocks/domain/SVGSampleDomain.ts`
- `src/editor/compiler/blocks/domain/*.ts` (float ValueKinds)
- `src/editor/compiler/blocks/signal/*.ts` (float ValueKinds)
- `src/editor/compiler/blocks/rhythm/*.ts` (float ValueKinds)

## 6) Lenses / Adapters

- Update artifact kinds in:
  - `src/editor/lenses/index.ts`
  - `src/editor/lenses/lensResolution.ts`
  - `src/editor/lenses/LensRegistry.ts`
- Decide int<->float adapter policy (default to `floor` on float->int or `round` if preferred), and wire into adapters once they exist.

## 7) Tests + Docs

- Update tests and docs referencing `Signal<number>`/`Field<number>`/`Scalar:number` to `float` (or `int` where appropriate).
- Update any compatibility text in:
  - `src/editor/CONCEPTS.md`
  - Test fixtures in `src/editor/**/__tests__`

## 8) Verify + Regression Checks

- Ensure TypeDesc mappings are consistent across:
  - `src/editor/types.ts`
  - `src/editor/semantic/index.ts`
  - `src/editor/ir/types/TypeDesc.ts`
  - `src/editor/ir/types/typeConversion.ts`
  - `src/editor/compiler/passes/pass2-types.ts`
- Spot-check a few compiler lowerings for numeric types (Oscillator, GridDomain, DomainN) to confirm IR types align.

