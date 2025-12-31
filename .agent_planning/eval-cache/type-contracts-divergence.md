# Type Contracts Divergence (Eval Cache)
Cached: 2025-12-31 01:45
Source: project-evaluator (type-contracts-ir-plumbing)
Confidence: HIGH

## Summary
Editor and IR compiler have **incompatible TypeDesc definitions**. Not just naming ('config' vs 'special'), but different fields and domain enums.

## Editor TypeDesc
**Location**: `src/editor/types.ts:148-166`

```typescript
interface TypeDesc {
  world: 'signal' | 'event' | 'field' | 'scalar' | 'config';
  domain: Domain; // 90+ domains
  category: 'core' | 'internal';
  busEligible: boolean;
  semantics?: string;
  unit?: string;
}
```

**Key characteristics**:
- Has 'config' world (not in IR)
- Has category/busEligible fields
- Domain enum includes: expression, waveform, phaseSample, phaseMachine, wobble, spiral, wave, jitter, cameraRef, spec
- Used by: editor UI, block definitions, type conversion

## IR TypeDesc
**Location**: `src/editor/compiler/ir/types.ts:171-206`

```typescript
interface TypeDesc {
  world: 'signal' | 'field' | 'scalar' | 'event' | 'special';
  domain: TypeDomain; // ~30 domains
  bundleKind?: BundleKind;
  bundleArity?: number;
  semantics?: string;
  unit?: string;
}
```

**Key characteristics**:
- Has 'special' world (not 'config')
- Has bundleKind/bundleArity fields (bundle type system)
- Domain enum includes: timeMs (not 'time'), unknown, mesh, camera, quat, mat4, vec4
- Used by: all compiler passes, IRBuilder, runtime

## Incompatibilities

1. **World mismatch**: 'config' vs 'special'
   - Same semantic concept, different names
   - Breaks defaultSource materialization (pass6 checks for 'special', editor sends 'config')

2. **Missing fields**:
   - Editor has category/busEligible → IR doesn't
   - IR has bundleKind/bundleArity → Editor doesn't

3. **Domain divergence**:
   - Editor has ~90 domains
   - IR has ~30 domains
   - Partial overlap, many editor domains missing from IR
   - Some IR domains missing from editor

4. **Domain naming**:
   - Editor: 'time'
   - IR: 'timeMs'

## Evidence of Dual System

**Explicit dual import**: `src/editor/adapters/AdapterRegistry.ts:6`
```typescript
import type { TypeDesc } from '../types';
import type { TypeDesc as IRTypeDesc } from '../compiler/ir/types';
```

**19 files** in `src/editor/compiler/ir/` import TypeDesc from local `./types`, not from editor types.

## Impact

**Adapters broken**: Can't match types across editor/IR boundary
**DefaultSource broken**: 'config' types don't match 'special' checks in pass6
**Type safety illusion**: TypeScript sees structural compatibility, but runtime breaks
**Silent failures**: No compile-time detection of world mismatch

## Unification Options

### Option A: Editor TypeDesc is canonical
- Extend editor TypeDesc with optional bundleKind/bundleArity
- IR imports from editor
- Update IR domain enum to match editor

### Option B: Separate with explicit conversion
- Keep both TypeDesc definitions
- Create conversion utilities: toIRTypeDesc(editorType), toEditorTypeDesc(irType)
- Apply conversions at boundaries

### Option C: IR TypeDesc is canonical
- Remove editor TypeDesc
- Add category/busEligible to IR TypeDesc
- Everything uses compiler types

## Test Strategy

**Boundary tests needed**:
1. TypeDesc conversion (if Option B chosen)
2. World mismatch detection
3. Domain compatibility verification
4. Adapter type matching across boundary

## Files Affected (Unification)

**If Option A** (editor canonical):
- `src/editor/compiler/ir/types.ts` - remove TypeDesc, import from editor
- ~19 files in compiler/ir - update imports
- IR domain enum - merge with editor domains

**If Option B** (separate + convert):
- Create `src/editor/compiler/ir/typeConversion.ts`
- Add conversions at pass boundaries
- Document conversion rules

**If Option C** (IR canonical):
- `src/editor/types.ts` - remove TypeDesc
- Update all editor code to use IR types
- Risk: circular dependencies
