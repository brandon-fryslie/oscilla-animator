# Sprint Plan: Complete Removal of Legacy Code from pass6-block-lowering.ts

**Generated**: 2026-01-04 (REVISED)
**Topic**: remove-legacy-block-lowering
**Branch**: bmf_new_compiler

---

## Sprint Goal

**Remove ALL legacy and fallback code paths from pass6-block-lowering.ts with ZERO exceptions.**

Success means ONE code path through the compiler pass - no fallbacks, no backward compatibility, no deferred work.

---

## Current State Analysis

### Blockers Identified

**25 blocks prevent complete legacy removal:**
- **3 blocks** have NO IR lowering functions registered
- **22 blocks** use positional `outputs[]` instead of `outputsById`

**5 legacy code sections** to remove (180 lines total):
1. `artifactToValueRef()` function (lines 203-303) - 101 lines
2. Legacy input resolution fallback (lines 604-621) - 18 lines
3. Legacy output array processing (lines 665-676) - 12 lines
4. Fallback block lowering (lines 718-751) - 34 lines
5. Wire writer fallback in `getWriterValueRef()` (lines 480-491) - 12 lines

---

## Work Items

### Work Item 1: Migrate 22 Blocks to outputsById Pattern

**Blocks requiring migration:**

**Domain blocks (16):**
- DomainN
- FieldAddVec2
- FieldConstColor
- FieldConstNumber
- FieldFromSignalBroadcast
- FieldHash01ById
- FieldMapNumber
- FieldReduce
- FieldZipNumber
- FieldZipSignal
- PathConst
- PositionMapCircle
- PositionMapGrid
- PositionMapLine
- StableIdHash
- TriggerOnWrap

**Signal blocks (6):**
- ClampSignal
- ColorLFO
- DivSignal
- MaxSignal
- MinSignal
- Shaper

**Migration pattern for each block:**
```typescript
// BEFORE
return { outputs: [{ k: 'sig', id: sigId, slot }] };

// AFTER
return {
  outputs: [],
  outputsById: { out: { k: 'sig', id: sigId, slot } }
};
```

**Acceptance Criteria:**
- [ ] All 22 blocks return `outputsById` with correct port IDs
- [ ] All 22 blocks set `outputs: []` (empty array)
- [ ] Port IDs in `outputsById` match block definition port IDs exactly
- [ ] All existing tests pass after migration

---

### Work Item 2: Create IR Lowering for 3 Missing Blocks

**BroadcastSignalColor** - `/src/editor/compiler/blocks/signal/BroadcastSignalColor.ts`
```typescript
import { registerBlockType } from '../../ir/blockTypeRegistry';
import type { BlockLowerFn } from '../../ir/lowerTypes';

const lowerBroadcastSignalColor: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  const input = inputsById?.in ?? inputs[0];
  // Just pass through - broadcasting handled at runtime
  return {
    outputs: [],
    outputsById: { out: input }
  };
};

registerBlockType({
  type: 'BroadcastSignalColor',
  inputs: [{ portId: 'in', type: { world: 'signal', domain: 'color', category: 'core', busEligible: true } }],
  outputs: [{ portId: 'out', type: { world: 'signal', domain: 'color', category: 'core', busEligible: true } }],
  lower: lowerBroadcastSignalColor,
});
```

**DSConstSignalPhase** - `/src/editor/compiler/blocks/defaultSources/DSConstSignalPhase.ts`
```typescript
import { registerBlockType } from '../../ir/blockTypeRegistry';
import type { BlockLowerFn } from '../../ir/lowerTypes';

const lowerDSConstSignalPhase: BlockLowerFn = ({ ctx, config }) => {
  const value = config?.value ?? 0;
  const constId = ctx.b.allocConstId(value);
  const sigId = ctx.b.sigConst(value, { world: 'signal', domain: 'float', semantics: 'phase(0..1)', category: 'core', busEligible: true });
  const slot = ctx.b.allocValueSlot({ world: 'signal', domain: 'float', semantics: 'phase(0..1)', category: 'core', busEligible: true });
  ctx.b.registerSigSlot(sigId, slot);

  return {
    outputs: [],
    outputsById: { out: { k: 'sig', id: sigId, slot } }
  };
};

registerBlockType({
  type: 'DSConstSignalPhase',
  inputs: [],
  outputs: [{ portId: 'out', type: { world: 'signal', domain: 'float', semantics: 'phase(0..1)', category: 'core', busEligible: true } }],
  lower: lowerDSConstSignalPhase,
});
```

**DSConstSignalTime** - `/src/editor/compiler/blocks/defaultSources/DSConstSignalTime.ts`
```typescript
import { registerBlockType } from '../../ir/blockTypeRegistry';
import type { BlockLowerFn } from '../../ir/lowerTypes';

const lowerDSConstSignalTime: BlockLowerFn = ({ ctx }) => {
  const sigId = ctx.b.sigTimeAbsMs();
  const slot = ctx.b.allocValueSlot({ world: 'signal', domain: 'timeMs', category: 'internal', busEligible: false });
  ctx.b.registerSigSlot(sigId, slot);

  return {
    outputs: [],
    outputsById: { out: { k: 'sig', id: sigId, slot } }
  };
};

registerBlockType({
  type: 'DSConstSignalTime',
  inputs: [],
  outputs: [{ portId: 'out', type: { world: 'signal', domain: 'float', category: 'core', busEligible: true } }],
  lower: lowerDSConstSignalTime,
});
```

**Register new files:**
- Import in `/src/editor/compiler/blocks/signal/index.ts` (BroadcastSignalColor)
- Create `/src/editor/compiler/blocks/defaultSources/index.ts` and import both DSConst blocks

**Acceptance Criteria:**
- [ ] All 3 new lowering functions created and registered
- [ ] New files imported in respective index.ts files
- [ ] `getBlockType()` returns valid BlockTypeDecl for all 3 blocks
- [ ] Test compilation succeeds for patches using these blocks

---

### Work Item 3: Remove ALL Legacy Code from pass6-block-lowering.ts

**Remove these sections (in order):**

1. **Lines 718-751**: Fallback for blocks without lowering
```typescript
// DELETE THIS ENTIRE ELSE BLOCK
} else {
  // No lowering function - fall back to artifact-based lowering
  ...
}
```

2. **Lines 665-676**: Legacy output array processing
```typescript
// DELETE THIS ENTIRE ELSE BLOCK
} else {
  // Legacy path: Use positional outputs array
  ...
}
```

3. **Lines 604-621**: Legacy input resolution fallback
```typescript
// DELETE THIS SECTION
// Legacy path: Look up in compiled port map
const portKey = `${block.id}:${inputPort.id}`;
...
```

4. **Lines 480-491**: Wire writer fallback in `getWriterValueRef()`
```typescript
// DELETE THIS SECTION
// Fallback: Wire blockId:slotId in compiledPortMap (legacy closure artifacts)
const portKey = `${writer.from.blockId}:${writer.from.slotId}`;
...
```

5. **Lines 203-303**: `artifactToValueRef()` function
```typescript
// DELETE ENTIRE FUNCTION
function artifactToValueRef(...) {
  ...
}
```

6. **Lines 126-184**: `artifactKindToTypeDesc()` function (no longer needed)
```typescript
// DELETE ENTIRE FUNCTION
function artifactKindToTypeDesc(kind: string): TypeDesc {
  ...
}
```

**After removal, verify:**
- [ ] `lowerBlockInstance()` has exactly ONE code path: call `getBlockType()` → call `lower()` → use `outputsById`
- [ ] No references to `artifactToValueRef` remain
- [ ] No references to `compiledPortMap` lookup remain in pass6
- [ ] No conditional branches for "legacy" or "fallback" paths
- [ ] Function `getWriterValueRef()` only looks in `blockOutputs`, never in `compiledPortMap`

**Acceptance Criteria:**
- [ ] All 5 legacy code sections completely removed
- [ ] Total line reduction: ~180 lines
- [ ] Zero conditional fallback paths in pass6-block-lowering.ts
- [ ] TypeScript compiles without errors
- [ ] All tests pass

---

### Work Item 4: Update VERIFIED_IR_BLOCKS and Enable Strict Mode

**Expand VERIFIED_IR_BLOCKS to include ALL blocks:**
```typescript
const VERIFIED_IR_BLOCKS = new Set([
  // All 60 registered blocks go here
  'FiniteTimeRoot',
  'InfiniteTimeRoot',
  'GridDomain',
  'DomainN',
  'Oscillator',
  'AddSignal',
  'MulSignal',
  'SubSignal',
  'FieldConstNumber',
  'FieldMapNumber',
  'RenderInstances2D',
  'FieldColorize',
  // Add all 22 migrated blocks
  'FieldAddVec2',
  'FieldConstColor',
  'ClampSignal',
  'ColorLFO',
  'DivSignal',
  'MaxSignal',
  'MinSignal',
  'Shaper',
  // ... (complete list)
  // Add 3 new blocks
  'BroadcastSignalColor',
  'DSConstSignalPhase',
  'DSConstSignalTime',
]);
```

**Enable strictIR by default:**
```typescript
export function pass6BlockLowering(
  validated: AcyclicOrLegalGraph,
  blocks: readonly Block[],
  compiledPortMap: Map<string, Artifact>,  // Remove this parameter
  edges?: readonly Edge[],
  options?: Pass6Options
): UnlinkedIRFragments {
  const strictIR = options?.strictIR ?? true;  // Change default to true
  ...
}
```

**Remove compiledPortMap parameter entirely:**
- Update function signature
- Remove parameter from all call sites in `compile.ts`
- Remove parameter passing through call chain

**Acceptance Criteria:**
- [ ] VERIFIED_IR_BLOCKS contains all 60 blocks (12 + 22 + 3 + 23 existing)
- [ ] strictIR defaults to true
- [ ] compiledPortMap parameter removed from pass6BlockLowering signature
- [ ] All callers of pass6BlockLowering updated (compile.ts line 161)
- [ ] Tests pass with strictIR=true by default

---

### Work Item 5: Verify One Code Path and Create Enforcement Test

**Create verification test: `src/editor/compiler/__tests__/no-legacy-fallbacks.test.ts`**
```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Legacy Fallback Code Removal', () => {
  it('pass6-block-lowering.ts has NO legacy fallback code', () => {
    const filePath = join(__dirname, '../passes/pass6-block-lowering.ts');
    const fileContent = readFileSync(filePath, 'utf-8');

    // Verify no legacy code sections exist
    expect(fileContent).not.toContain('artifactToValueRef');
    expect(fileContent).not.toContain('artifactKindToTypeDesc');
    expect(fileContent).not.toContain('Legacy path');
    expect(fileContent).not.toContain('Fallback for blocks without');
    expect(fileContent).not.toContain('fall back to artifact');
    expect(fileContent).not.toContain('compiledPortMap.get');

    // Verify one code path exists
    expect(fileContent).toContain('result.outputsById');
    expect(fileContent).not.toContain('result.outputs.forEach');
  });

  it('all blocks have IR lowering registered', () => {
    // Get all block types from registry
    const blockTypes = getAllBlockTypes(); // Helper from registry

    for (const blockType of blockTypes) {
      const blockTypeDecl = getBlockType(blockType);
      expect(blockTypeDecl).toBeDefined();
      expect(blockTypeDecl?.lower).toBeDefined();
    }
  });

  it('all blocks use outputsById pattern', () => {
    const blockTypes = getAllBlockTypes();

    for (const blockType of blockTypes) {
      const blockTypeDecl = getBlockType(blockType);
      const mockCtx = createMockLowerCtx();
      const mockInputs = createMockInputs(blockTypeDecl);

      const result = blockTypeDecl.lower({ ctx: mockCtx, inputs: mockInputs, inputsById: {} });

      expect(result.outputsById).toBeDefined();
      expect(Object.keys(result.outputsById).length).toBeGreaterThan(0);
      expect(result.outputs).toEqual([]);
    }
  });
});
```

**Acceptance Criteria:**
- [ ] Test file created with 3 test cases
- [ ] Test fails if any legacy code reintroduced
- [ ] Test validates all blocks have IR lowering
- [ ] Test validates all blocks use outputsById
- [ ] Test runs in CI

---

## Dependencies

**Execution order (sequential):**
1. Work Item 1 (migrate 22 blocks) → Work Item 2 (create 3 lowering functions)
2. Work Item 1 + 2 complete → Work Item 3 (remove legacy code)
3. Work Item 3 complete → Work Item 4 (update VERIFIED set, enable strict mode)
4. Work Item 4 complete → Work Item 5 (verification test)

**All work items must complete in this sprint - no deferrals.**

---

## Acceptance Criteria (Sprint Complete)

**Code changes:**
- [ ] 22 blocks migrated to outputsById pattern
- [ ] 3 new IR lowering functions created and registered
- [ ] 180 lines of legacy code removed from pass6-block-lowering.ts
- [ ] VERIFIED_IR_BLOCKS contains all 60 blocks
- [ ] strictIR=true by default
- [ ] compiledPortMap parameter removed

**Verification:**
- [ ] `just typecheck` passes
- [ ] `just test` passes (all tests)
- [ ] `just build` succeeds
- [ ] Verification test passes proving no legacy code exists
- [ ] ONE code path through pass6BlockLowering

**Success criteria:**
- [ ] Zero conditional fallback branches in pass6-block-lowering.ts
- [ ] Zero references to `artifactToValueRef` in pass6
- [ ] Zero references to legacy input/output resolution
- [ ] All blocks compile in IR-only mode (strictIR=true)

---

## Out of Scope

**NOTHING is out of scope.** All legacy code removal completes in this sprint.
