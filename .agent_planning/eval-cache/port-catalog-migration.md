# Port Catalog Migration Architecture

**Cached**: 2025-12-29 00:15
**Source**: project-evaluator (port-catalog-lowering)
**Confidence**: HIGH (fresh evaluation, stable patterns)

## Migration Pattern Overview

The port catalog + lowering migration introduces a future-proof IR lowering architecture with:
1. Typed port catalogs (enforced contracts)
2. Named port access (`inputsById`, `outputsById`)
3. Strict-by-default port validation
4. Clear migration path from positional to named APIs

## File Organization

**Port Catalogs**:
- `src/editor/blocks/portCatalog.ts` - Port specifications with IR types
- `src/editor/blocks/<name>Spec.ts` - Block-specific derived specs (e.g., `oscillatorSpec.ts`)

**IR Lowering Types**:
- `src/editor/compiler/ir/lowerTypes.ts` - Core types (`BlockLowerFn`, `LowerResult`, `ValueRefPacked`)
- `src/editor/compiler/ir/types/TypeDesc.ts` - Type system (`TypeDomain`, `TypeDesc`)

**Compiler Passes**:
- `src/editor/compiler/passes/pass6-block-lowering.ts` - Block lowering orchestration
- Builds `inputsById` from positional inputs + port definitions
- Validates port contracts (when strict)

**Block Compilers**:
- `src/editor/compiler/blocks/<category>/<Name>.ts` - Individual block lowering functions
- Example: `src/editor/compiler/blocks/signal/Oscillator.ts`

## Port Catalog Structure

```typescript
// Port specification
type PortSpec = {
  id: string;              // Stable port ID
  label: string;           // UI label
  slotType: SlotType;      // Legacy editor type
  irType: IRTypeDesc;      // IR type descriptor
  tier?: SlotTier;         // UI tier (primary/secondary)
  optional?: boolean;      // Can be unconnected
  defaultSource?: DefaultSource;  // Default value when unconnected
};

// Port catalog
const BLOCK_PORTS = {
  inputs: Record<string, PortSpec>;
  inputOrder: readonly string[];   // Must match inputs keys
  outputs: Record<string, PortSpec>;
  outputOrder: readonly string[];  // Must match outputs keys
};
```

## Block Lowering Function Signature

```typescript
type BlockLowerFn = (args: {
  ctx: LowerCtx;
  inputs: readonly ValueRefPacked[];           // Positional (legacy)
  inputsById?: Readonly<Record<string, ValueRefPacked>>;  // Named (future)
  config?: unknown;
}) => LowerResult;

interface LowerResult {
  readonly outputs: readonly ValueRefPacked[];  // Positional (legacy)
  // Future: readonly outputsById?: Record<string, ValueRefPacked>;
}
```

## Migration Phases

**Phase 1 (Current)**: Input migration
- ✅ `inputsById` parameter exists
- ✅ Pass 6 builds `inputsById` automatically
- ✅ Blocks use fallback pattern: `inputsById?.port ?? inputs[n]`
- ❌ Still return positional `outputs[]`

**Phase 2 (Planned)**: Output migration
- Add `outputsById` to `LowerResult`
- Pass 6 checks for and uses `outputsById` if present
- Blocks return `outputsById` + empty `outputs: []`
- Remove positional arrays once all blocks migrated

## Port Contract Validation

**Current** (opt-in):
```typescript
const enforcePortContract = blockDef?.tags?.irPortContract === 'strict';
```

**Plan** (strict-by-default):
```typescript
const enforcePortContract = blockDef?.tags?.irPortContract !== 'relaxed';
```

**Enforcement**:
- Editor input order must match IR input order (by port ID)
- Editor output order must match IR output order (by port ID)
- Error on mismatch: `IRValidationFailed` with clear message

**Opt-out tag**: `tags: { irPortContract: 'relaxed' }`

## Migrated Blocks (Examples)

**Oscillator** - Full pattern (inputs only):
```typescript
const lowerOscillator: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  const phase = inputsById?.phase ?? inputs[0];
  const shapeInput = inputsById?.shape ?? inputs[1];
  // ... lowering logic ...
  return { outputs: [{ k: 'sig', id: sigId, slot }] };
};

registerBlockType({
  type: 'Oscillator',
  capability: 'pure',
  inputs: OSCILLATOR_IR_INPUTS,   // From port catalog
  outputs: OSCILLATOR_IR_OUTPUTS, // From port catalog
  lower: lowerOscillator,
});
```

**AddSignal** - Math block pattern:
```typescript
const lowerAddSignal: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  const a = inputsById?.a ?? inputs[0];
  const b = inputsById?.b ?? inputs[1];
  const sigId = ctx.b.sigZip(a.id, b.id, { kind: 'opcode', opcode: OpCode.Add }, outType);
  return { outputs: [{ k: 'sig', id: sigId, slot }] };
};
```

## Known Gaps (As of 2025-12-29)

1. **Type errors** - `'expression'` and `'waveform'` not in `TypeDomain`
2. **outputsById missing** - Not implemented in `LowerResult` or Pass 6
3. **definePortCatalog helper missing** - No typed enforcement of order arrays
4. **Strict-by-default inverted** - Uses opt-in instead of opt-out
5. **Most blocks not migrated** - Only 4 of ~57 blocks use `inputsById`

## Related Files

- `.agent_planning/_active/port-catalog-lowering/STATUS-2025-12-29-001500.md` - Full evaluation
- `design-docs/_needs-review/Plan-Port-Catalog-Lowering-Migration.md` - Migration plan
- `src/editor/compiler/__tests__/signal-math.test.ts` - Block lowering tests
