# Unified Transforms Implementation Status

**Date**: 2025-12-30
**Status**: Sprints 1-4 COMPLETE, Sprint 5 PARTIAL, Sprint 6 NOT STARTED

---

## Executive Summary

The Unified Transforms refactor has successfully implemented the core infrastructure and most deliverables. The transform facade exists, adapters execute through the registry, lens scopes are unified, transform application is centralized, and the UI is registry-driven.

**What works today:**
- All transforms work in **closure/legacy compilation mode** (unchanged)
- IR mode now supports **ConstToSignal adapter**, **scale lens**, and **clamp lens**
- Other transforms in IR mode produce **clear error messages** instead of silent failures

---

## Sprint Status

### Sprint 1: Foundation & Adapter Unification ✅ COMPLETE
**Commits**: `48d26f0`

**Deliverables:**
1. ✅ Transform Facade Modules (`src/editor/transforms/`)
   - `types.ts` - TransformScope, TransformStep, TransformStack
   - `normalize.ts` - normalizeTransformStack, splitTransformStack
   - `catalog.ts` - listAdapters, listLenses, listLensesFor
   - `validate.ts` - scope validation, IR mode validation
   - `apply.ts` - centralized transform execution
   - `index.ts` - public exports

2. ✅ Unified Adapter Execution
   - All 18 adapters have `apply` function in AdapterRegistry
   - 112-line switch statement removed from compileBusAware.ts
   - Registry is now single source of truth for adapter execution

---

### Sprint 2: Lens Scope Unification ✅ COMPLETE
**Commits**: `7ba1009`

**Deliverables:**
1. ✅ LensScope expanded to 4 types: `'wire' | 'publisher' | 'listener' | 'lensParam'`
2. ✅ All 27 lenses have explicit `allowedScopes` arrays
3. ✅ Scope validator integrated into compiler
4. ✅ Wire lenses explicitly supported (not special-cased)

**Lens scope breakdown:**
- **21 general lenses** (all scopes): scale, polarity, clamp, softclip, deadzone, slew, quantize, phaseOffset, pingPong, phaseScale, phaseQuantize, wrapMode, rotate2d, vec2GainBias, translate2d, clampBounds, swirl, hueShift, colorGain, saturate, contrast, clampGamut
- **6 listener-only lenses**: ease, mapRange, hysteresis, phaseWindow, normalize, smoothPath

---

### Sprint 3: Centralized Transform Application ✅ COMPLETE
**Commits**: `f99d825`

**Deliverables:**
1. ✅ `transforms/apply.ts` contains canonical implementation
2. ✅ All transform application goes through centralized engine
3. ✅ Scope parameter explicit at all call sites
4. ✅ ~130 lines removed from compileBusAware.ts

---

### Sprint 4: Registry-Driven Lens UI ✅ COMPLETE
**Commits**: `c6cedab`

**Deliverables:**
1. ✅ LensChainEditor.tsx uses LensRegistry (removed hardcoded LENS_TYPES)
2. ✅ Lens list filtered by scope and domain
3. ✅ Param editors render from LensDef.params schema
4. ✅ Net reduction: -128 lines of code

---

### Sprint 5: Full IR Transform Support 🔶 PARTIAL
**Commits**: `41f7197`, `0a626ad`

**Infrastructure Complete:**
- ✅ `compileToIR` field added to AdapterDef and LensDef
- ✅ `validateForIRMode()` implemented with clear error messages
- ✅ IR node types added (TransformStepAdapter, TransformStepLens)
- ✅ Pass 8 integration: `applyAdapterChain()` and `applyLensStack()` functions

**Implementations Complete:**
- ✅ ConstToSignal adapter `compileToIR`
- ✅ scale lens `compileToIR`
- ✅ clamp lens `compileToIR`

**Implementations Remaining:**

#### Adapters (17 remaining)
| Adapter | Status | Complexity | Notes |
|---------|--------|------------|-------|
| ConstToSignal:float | ✅ Done | Low | |
| ConstToSignal:vec2 | ❌ TODO | Low | Similar to float |
| ConstToSignal:color | ❌ TODO | Low | Similar to float |
| BroadcastScalarToField:* | ❌ TODO | Medium | Needs field IR support |
| BroadcastSignalToField:* | ❌ TODO | Medium | Needs field IR support |
| ReduceFieldToSignal:* | ❌ TODO | High | Expensive, may need runtime fallback |
| NormalizeToPhase:signal | ❌ TODO | Low | Modulo 1.0 |
| NormalizeToPhase:scalar | ❌ TODO | Low | Modulo 1.0 |
| PhaseToNumber:signal | ❌ TODO | Low | Identity (phase is already number) |
| PhaseToNumber:scalar | ❌ TODO | Low | Identity |
| NumberToDurationMs:* | ❌ TODO | Low | Multiply by 1000 |
| DurationToNumberMs:* | ❌ TODO | Low | Divide by 1000 |
| ExpressionToWaveform | ❌ TODO | High | Complex signal construction |

#### Lenses (25 remaining)
| Lens | Status | Complexity | Notes |
|------|--------|------------|-------|
| scale | ✅ Done | Low | |
| clamp | ✅ Done | Low | |
| polarity | ❌ TODO | Low | Negate or abs |
| softclip | ❌ TODO | Medium | Smooth saturation |
| deadzone | ❌ TODO | Medium | Conditional zero |
| slew | ❌ TODO | High | Stateful, needs per-frame state |
| quantize | ❌ TODO | Medium | Step rounding |
| phaseOffset | ❌ TODO | Low | Add offset, modulo 1.0 |
| pingPong | ❌ TODO | Medium | Triangle wave mapping |
| phaseScale | ❌ TODO | Low | Multiply phase |
| phaseQuantize | ❌ TODO | Medium | Step phase |
| wrapMode | ❌ TODO | Medium | Wrap/clamp/mirror |
| ease | ❌ TODO | Medium | Easing functions |
| mapRange | ❌ TODO | Low | Linear remap |
| hysteresis | ❌ TODO | High | Stateful |
| phaseWindow | ❌ TODO | Medium | Windowing function |
| normalize | ❌ TODO | Medium | Normalize to 0-1 |
| smoothPath | ❌ TODO | High | Path smoothing |
| rotate2d | ❌ TODO | Medium | 2D rotation |
| vec2GainBias | ❌ TODO | Low | Scale + offset |
| translate2d | ❌ TODO | Low | 2D translation |
| clampBounds | ❌ TODO | Medium | 2D bounds clamping |
| swirl | ❌ TODO | Medium | 2D swirl distortion |
| hueShift | ❌ TODO | Medium | Color hue rotation |
| colorGain | ❌ TODO | Low | Color multiply |
| saturate | ❌ TODO | Medium | Saturation adjustment |
| contrast | ❌ TODO | Low | Contrast adjustment |
| clampGamut | ❌ TODO | Medium | Color gamut clamping |

---

### Sprint 6: Semantic Registry ⬜ NOT STARTED

**Purpose**: Phase-specific lens validation without polluting TypeDesc

**Work Required:**
1. Create `src/editor/semantics/ValueSemantics.ts`
2. Map SlotTypes and bus names to semantic "flavors" (phase, unit, float, vec2, color)
3. Add `requiresSemantics` field to LensDef
4. Implement semantic validation in transforms/validate.ts

**Priority**: Optional enhancement. Phase lenses currently work but may accept invalid inputs.

---

## Architecture Summary

### File Structure
```
src/editor/
├── transforms/           # NEW - Unified transform facade
│   ├── types.ts          # TransformScope, TransformStep, TransformStack
│   ├── normalize.ts      # normalizeTransformStack, splitTransformStack
│   ├── catalog.ts        # listAdapters, listLenses, listLensesFor
│   ├── validate.ts       # validateLensScope, validateForIRMode
│   ├── apply.ts          # applyAdapterChain, applyLensStack, applyTransformStack
│   └── index.ts          # Public exports
├── adapters/
│   └── AdapterRegistry.ts  # MODIFIED - added apply() and compileToIR() to all adapters
├── lenses/
│   └── LensRegistry.ts     # MODIFIED - expanded LensScope, added allowedScopes
├── compiler/
│   ├── compileBusAware.ts  # MODIFIED - uses centralized transform engine
│   ├── ir/
│   │   └── transforms.ts   # NEW - IR node types for adapters/lenses
│   └── passes/
│       └── pass8-link-resolution.ts  # MODIFIED - applies transforms in IR mode
└── modulation-table/
    └── LensChainEditor.tsx  # MODIFIED - registry-driven UI
```

### Data Flow

**Closure/Legacy Mode** (unchanged):
```
Connection/Publisher/Listener
  → normalize to TransformStack
  → applyTransformStack() from transforms/apply.ts
  → AdapterDef.apply() and LensDef.apply() from registries
  → Transformed Artifact
```

**IR Mode** (new):
```
Connection/Publisher/Listener
  → Pass 8 resolves wire
  → applyAdapterChain() calls AdapterDef.compileToIR()
  → applyLensStack() calls LensDef.compileToIR()
  → Transformed ValueRefPacked (IR node)
  → IR execution
```

---

## Remaining Work Recommendations

### High Priority (Should Complete)
1. **Implement compileToIR for common lenses**: polarity, mapRange, phaseOffset
2. **Implement compileToIR for domain adapters**: PhaseToNumber, NormalizeToPhase (identity-like)

### Medium Priority (Nice to Have)
3. **Implement compileToIR for broadcast adapters**: BroadcastSignalToField (needed for field buses in IR)
4. **Implement compileToIR for vec2/color transforms**: rotate2d, hueShift, etc.

### Low Priority (Future Work)
5. **Sprint 6**: Semantic registry for phase lens validation
6. **Stateful lenses**: slew, hysteresis (require per-frame state in IR runtime)
7. **Complex adapters**: ReduceFieldToSignal, ExpressionToWaveform

---

## Testing Status

- **Automated Tests**: 2425 passing, 10 skipped, 10 todo
- **TypeScript**: Clean, no errors
- **Lint**: Pre-existing warnings only, no new issues

### Manual Testing Checklist
- [x] Wire lens editing works (closure mode)
- [x] Publisher lens editing works (closure mode)
- [x] Listener lens editing works (closure mode)
- [x] Lens selector shows registry-driven options
- [x] Scope filtering works (listener-only lenses hidden for wires)
- [ ] ConstToSignal adapter in IR mode (needs manual verification)
- [ ] scale lens in IR mode (needs manual verification)
- [ ] clamp lens in IR mode (needs manual verification)

---

## Commits Summary

| Commit | Description | Sprint |
|--------|-------------|--------|
| `48d26f0` | feat(transforms): add unified transform facade and registry-based adapter execution | Sprint 1 |
| `7ba1009` | feat(transforms): expand lens scope to include wire and lensParam | Sprint 2 |
| `f99d825` | feat(transforms): centralize transform application logic | Sprint 3 |
| `c6cedab` | feat(transforms): migrate lens UI to registry-driven catalog | Sprint 4 |
| `41f7197` | feat(transforms): add IR validation and compileToIR infrastructure | Sprint 5 |
| `0a626ad` | feat(compiler): Integrate adapter/lens compileToIR in Pass 8 | Sprint 5 |

---

## Blockers and Risks

### No Current Blockers

### Risks
1. **Stateful lenses in IR mode**: slew, hysteresis require per-frame state. May need IR runtime enhancement or permanent rejection.
2. **Field broadcasts in IR mode**: BroadcastSignalToField adapters need field IR support which may not be complete.
3. **Complex expression adapters**: ExpressionToWaveform is complex and may require significant work.

---

## Definition of Done Progress

### Required (from DOD)
- [x] One canonical transform abstraction exists (`src/editor/transforms/*`)
- [x] No adapter execution logic in compiler switch statements
- [x] Lens scope enforced consistently (wires not special-cased)
- [x] Lens lists and param schemas are registry-driven in UI
- [x] IR compiler behavior is explicit (errors clearly when unsupported)
- [x] `just check` passes
- [x] All existing tests pass

### Partial
- [ ] All cheap adapters have `compileToIR` implementations (1/18 done)
- [ ] All pure lenses have `compileToIR` implementations (2/27 done)
- [ ] IR passes support all transforms (minimal set only)

### Optional (from DOD)
- [ ] Numeric semantics registry for phase lens validation (Sprint 6)
- [ ] Transform chain editor UI shared across inspectors
