# Oscillator Single-Source Layout & Port Catalog Migration Guide

## Table of Contents
1. [Overview](#overview)
2. [Port Catalog Helper](#port-catalog-helper)
3. [Migration Pattern](#migration-pattern)
4. [Complete Migration Example](#complete-migration-example)
5. [Strict-By-Default Enforcement](#strict-by-default-enforcement)
6. [Common Pitfalls](#common-pitfalls)
7. [Testing](#testing)
8. [File Organization](#file-organization)

---

## Overview

The Oscillator block is the reference example for a **single source of truth** that drives both the editor block definition and the IR compiler registration, using a canonical port catalog.

### Goals
- Prevent drift between editor and compiler port lists
- Ensure defaultSource behavior is consistent across UI and IR lowering
- Make IR errors deterministic and easier to debug
- Provide compile-time type safety for port definitions

### Key Files
- `src/editor/blocks/portCatalog.ts` - Canonical port definitions with `definePortCatalog` helper
- `src/editor/blocks/oscillatorSpec.ts` - Block spec derived from port catalog
- `src/editor/compiler/blocks/signal/Oscillator.ts` - IR lowering implementation
- `src/editor/compiler/passes/pass6-block-lowering.ts` - Port contract validation (strict-by-default)

---

## Port Catalog Helper

### `definePortCatalog<const Inputs, const Outputs>()`

TypeScript helper that enforces compile-time validation of port definitions.

**Type Signature:**
```typescript
export function definePortCatalog<
  const Inputs extends Record<string, PortSpec>,
  const Outputs extends Record<string, PortSpec>
>(catalog: {
  inputs: Inputs;
  inputOrder: readonly (keyof Inputs)[];
  outputs: Outputs;
  outputOrder: readonly (keyof Outputs)[];
}): {
  inputs: Inputs;
  inputOrder: readonly (keyof Inputs)[];
  outputs: Outputs;
  outputOrder: readonly (keyof Outputs)[];
}
```

**Compile-Time Enforcement:**
- `inputOrder` keys must exactly match keys in `inputs` object
- `outputOrder` keys must exactly match keys in `outputs` object
- TypeScript will error if keys are missing, extra, or misspelled
- Preserves `const` inference for literal types

**Example Usage:**
```typescript
import { definePortCatalog } from './portCatalog';

const MY_BLOCK_PORTS = definePortCatalog({
  inputs: {
    a: {
      id: 'a',
      label: 'A',
      slotType: 'Signal<float>',
      irType: { world: 'signal', domain: 'float' },
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 10, step: 0.1 },
      },
    },
    b: {
      id: 'b',
      label: 'B',
      slotType: 'Signal<float>',
      irType: { world: 'signal', domain: 'float' },
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 10, step: 0.1 },
      },
    },
  },
  inputOrder: ['a', 'b'] as const, // TypeScript error if keys don't match!
  outputs: {
    out: {
      id: 'out',
      label: 'Output',
      slotType: 'Signal<float>',
      irType: { world: 'signal', domain: 'float' },
    },
  },
  outputOrder: ['out'] as const,
});
```

**What TypeScript Catches:**
```typescript
// ERROR: Type '"c"' is not assignable to type '"a" | "b"'
inputOrder: ['a', 'b', 'c']  // Extra key

// ERROR: Property 'b' is missing
inputOrder: ['a']  // Missing key

// ERROR: Type '"beta"' is not assignable to type '"a" | "b"'
inputOrder: ['a', 'beta']  // Typo in key
```

---

## Migration Pattern

### `outputsById` Pattern

**New Migration Path (Order-Independent):**

Blocks return outputs using `outputsById` instead of positional `outputs` array:

```typescript
return {
  outputs: [],  // Empty - signals full migration to outputsById
  outputsById: {
    out: { k: 'sig', id: sigId, slot },
  },
};
```

**Why `outputs: []` is Empty:**

When a block is fully migrated to `outputsById`, the legacy `outputs` array should be empty to signal that the block no longer uses positional output ordering. Pass 6 prioritizes `outputsById` over `outputs` when both are present.

**Port ID Mapping:**

The keys in `outputsById` must match the `portId` fields in the block's IR port declarations:

```typescript
registerBlockType({
  type: 'AddSignal',
  outputs: [
    { portId: 'out', label: 'Out', ... },  // portId here...
  ],
  lower: ({ ctx }) => ({
    outputsById: {
      out: { ... },  // ...matches key here
    },
  }),
});
```

### `inputsById` Fallback Pattern

**Safe Access with Fallback:**

Lowering functions should use optional chaining with positional fallback for backward compatibility:

```typescript
const lowerMyBlock: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  const a = inputsById?.a ?? inputs[0];  // Safe fallback
  const b = inputsById?.b ?? inputs[1];  // Safe fallback

  // Use a and b...
};
```

**Why Fallback is Needed:**

During migration, some compilation paths may not provide `inputsById`. The fallback pattern ensures the block works in both legacy and migrated modes.

---

## Complete Migration Example

### Before: Legacy Positional Pattern

```typescript
/**
 * AddSignal Block Compiler (BEFORE MIGRATION)
 */

import type { BlockCompiler } from '../../types';
import { registerBlockType } from '../../ir/lowerTypes';

// IR Lowering - uses positional inputs/outputs
const lowerAddSignal = ({ ctx, inputs }) => {
  const a = inputs[0];  // Assumes 'a' is first - fragile!
  const b = inputs[1];  // Assumes 'b' is second - fragile!

  if (a.k !== 'sig' || b.k !== 'sig') {
    throw new Error('AddSignal requires signal inputs');
  }

  const outType = { world: 'signal' as const, domain: 'float' as const };
  const sigId = ctx.b.sigZip(a.id, b.id, {
    kind: 'opcode',
    opcode: OpCode.Add,
  }, outType);

  const slot = ctx.b.allocValueSlot();

  // Legacy positional output - must match port order!
  return {
    outputs: [{ k: 'sig', id: sigId, slot }],
  };
};

// Register block type
registerBlockType({
  type: 'AddSignal',
  capability: 'pure',
  inputs: [
    { portId: 'a', label: 'A', dir: 'in', type: { world: 'signal', domain: 'float' }, defaultSource: { value: 0 } },
    { portId: 'b', label: 'B', dir: 'in', type: { world: 'signal', domain: 'float' }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: 'signal', domain: 'float' } },
  ],
  lower: lowerAddSignal,
});
```

**Problems with Legacy Pattern:**
- Port order mismatches cause silent bugs
- No compile-time validation of port order
- Positional indexing is fragile and error-prone
- Hard to debug when editor and IR ports drift

### After: Migrated with Port Catalog

**Step 1: Create Port Catalog (if not using shared catalog)**

```typescript
// For simple blocks, you can inline the catalog or create a local const
// For blocks with complex ports, add to portCatalog.ts

const ADD_SIGNAL_PORTS = {
  inputs: {
    a: { id: 'a', label: 'A', /* ... */ },
    b: { id: 'b', label: 'B', /* ... */ },
  },
  inputOrder: ['a', 'b'] as const,
  outputs: {
    out: { id: 'out', label: 'Out', /* ... */ },
  },
  outputOrder: ['out'] as const,
};
```

**Step 2: Update Lowering Function**

```typescript
/**
 * AddSignal Block Compiler (AFTER MIGRATION)
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

const lowerAddSignal: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  // Use inputsById with positional fallback
  const a = inputsById?.a ?? inputs[0];
  const b = inputsById?.b ?? inputs[1];

  if (a.k !== 'sig' || b.k !== 'sig') {
    throw new Error('AddSignal requires signal inputs');
  }

  const outType = { world: 'signal' as const, domain: 'float' as const };
  const sigId = ctx.b.sigZip(a.id, b.id, {
    kind: 'opcode',
    opcode: OpCode.Add,
  }, outType);

  const slot = ctx.b.allocValueSlot();

  // New pattern: outputsById (order-independent)
  return {
    outputs: [],  // Empty - signals full migration
    outputsById: { out: { k: 'sig', id: sigId, slot } },
  };
};

// Register block type (unchanged)
registerBlockType({
  type: 'AddSignal',
  capability: 'pure',
  inputs: [
    { portId: 'a', label: 'A', dir: 'in', type: { world: 'signal', domain: 'float' }, defaultSource: { value: 0 } },
    { portId: 'b', label: 'B', dir: 'in', type: { world: 'signal', domain: 'float' }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'out', label: 'Out', dir: 'out', type: { world: 'signal', domain: 'float' } },
  ],
  lower: lowerAddSignal,
});
```

**Benefits of Migrated Pattern:**
- Port order mismatches caught by strict-by-default validation
- Named port access is self-documenting
- Backward compatible with legacy compilation paths
- Runtime validation ensures editor/IR alignment

---

## Strict-By-Default Enforcement

### Runtime Validation in Pass 6

**Location:** `src/editor/compiler/passes/pass6-block-lowering.ts:270`

**Validation Logic:**

```typescript
const blockDef = BLOCK_DEFS_BY_TYPE.get(block.type);
const enforcePortContract = blockDef?.tags?.irPortContract !== 'relaxed';

if (enforcePortContract && blockDef !== undefined) {
  const defInputIds = blockDef.inputs.map((input) => input.id);
  const irInputIds = blockType.inputs.map((input) => input.portId);
  const defOutputIds = blockDef.outputs.map((output) => output.id);
  const irOutputIds = blockType.outputs.map((output) => output.portId);

  const inputOrderMismatch = defInputIds.join('|') !== irInputIds.join('|');
  const outputOrderMismatch = defOutputIds.join('|') !== irOutputIds.join('|');

  if (inputOrderMismatch || outputOrderMismatch) {
    errors.push({
      code: "IRValidationFailed",
      message:
        `IR port contract mismatch for "${block.type}" (${block.id}). ` +
        `Editor inputs [${defInputIds.join(", ")}], IR inputs [${irInputIds.join(", ")}]; ` +
        `Editor outputs [${defOutputIds.join(", ")}], IR outputs [${irOutputIds.join(", ")}].`,
      where: { blockId: block.id },
    });
  }
}
```

**Error Message Format:**

```
IR port contract mismatch for "MyBlock" (block-123).
Editor inputs [b, a], IR inputs [a, b];
Editor outputs [out], IR outputs [out].
```

### Enforcement Modes

#### 1. Strict-By-Default (No Tag)

Blocks without a tag use strict validation by default:

```typescript
export const MyBlock = createBlock({
  type: 'MyBlock',
  // No tags property - defaults to strict enforcement
  inputs: [/* must match IR order */],
  outputs: [/* must match IR order */],
});
```

#### 2. Explicit Strict (Optional Documentation)

Explicitly document strict enforcement:

```typescript
export const MyBlock = createBlock({
  type: 'MyBlock',
  tags: { irPortContract: 'strict' },  // Explicit (same as default)
  inputs: [/* must match IR order */],
  outputs: [/* must match IR order */],
});
```

#### 3. Relaxed Opt-Out (Complex Blocks)

Use `relaxed` tag for blocks that cannot be migrated yet:

```typescript
export const ComplexBlock = createBlock({
  type: 'ComplexBlock',
  tags: { irPortContract: 'relaxed' },  // Opt-out of validation
  inputs: [/* order can differ from IR */],
  outputs: [/* order can differ from IR */],
});
```

**When to Use Relaxed:**
- Complex blocks with dynamic ports
- Blocks with conditional port generation
- Legacy blocks during incremental migration
- Temporary opt-out during refactoring

**Important:** Relaxed mode should be temporary. Migrate to strict mode once the block is stabilized.

---

## Common Pitfalls

### 1. Port Order Mismatches

**Problem:**
Editor block inputs `[b, a]` but IR block inputs `[a, b]` causes silent bugs in legacy mode, runtime errors in strict mode.

**Solution:**
Ensure editor block definition and IR block registration use the same port order:

```typescript
// Editor block (src/editor/blocks/signal.ts)
inputs: [
  { id: 'a', label: 'A', /* ... */ },
  { id: 'b', label: 'B', /* ... */ },
],

// IR block (src/editor/compiler/blocks/signal/MyBlock.ts)
inputs: [
  { portId: 'a', label: 'A', /* ... */ },
  { portId: 'b', label: 'B', /* ... */ },
],
```

**Debugging:**
1. Check error message for specific port names
2. Compare editor inputs vs IR inputs in error message
3. Verify `inputOrder`/`outputOrder` in port catalog matches both

### 2. Optional Property Access Pitfalls

**Problem:**
Forgetting optional chaining causes runtime errors when `inputsById` is undefined:

```typescript
// WRONG - crashes if inputsById is undefined
const a = inputsById.a;

// RIGHT - safe fallback
const a = inputsById?.a ?? inputs[0];
```

**Solution:**
Always use optional chaining (`?.`) with positional fallback.

### 3. Domain Coverage Issues

**Problem:**
Missing domain in type descriptor (e.g., `world: 'scalar'` without `domain: 'waveform'`) causes compilation errors.

**Solution:**
Always specify both `world` and `domain` in type descriptors:

```typescript
// WRONG
type: { world: 'scalar' }

// RIGHT
type: { world: 'scalar', domain: 'waveform' }
```

### 4. Empty `outputs` vs Positional `outputs`

**Problem:**
Mixing `outputsById` with non-empty `outputs` causes confusion about which is authoritative.

**Solution:**
When using `outputsById`, always set `outputs: []` (empty array):

```typescript
// RIGHT - fully migrated
return {
  outputs: [],
  outputsById: { out: { ... } },
};

// WRONG - mixed pattern (confusing)
return {
  outputs: [{ ... }],
  outputsById: { out: { ... } },
};
```

### 5. Forgetting to Register Block Type

**Problem:**
Lowering function defined but `registerBlockType()` not called causes block to be ignored.

**Solution:**
Always call `registerBlockType()` after defining the lowering function:

```typescript
const lowerMyBlock: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  // ...
};

// REQUIRED - register the block type
registerBlockType({
  type: 'MyBlock',
  capability: 'pure',
  inputs: [/* ... */],
  outputs: [/* ... */],
  lower: lowerMyBlock,
});
```

---

## Testing

### How to Verify Migration Worked

1. **TypeScript Compilation:**
   ```bash
   just typecheck
   ```
   - No TypeScript errors
   - Port catalog keys validated at compile-time

2. **Unit Tests:**
   ```bash
   just test
   ```
   - All existing tests pass
   - No new test failures introduced

3. **Runtime Validation:**
   - Start dev server: `just dev`
   - Create a patch using the migrated block
   - Check browser console for IR validation errors
   - Verify block compiles without errors

4. **Port Contract Tests:**
   - Reference: `src/editor/compiler/passes/__tests__/pass6-port-contract.test.ts`
   - Tests verify strict-by-default enforcement
   - Tests verify relaxed opt-out works
   - Tests verify error messages are clear

### When to Add Block-Specific Tests

Add tests when:
- Block has complex port generation logic
- Block has conditional inputs/outputs
- Block has multiple output configurations
- Block has non-trivial defaultSource values
- Block had bugs related to port ordering

**Test Pattern:**
```typescript
import { describe, it, expect } from 'vitest';
import { IRBuilderImpl } from '../../ir/IRBuilderImpl';
import { getBlockType } from '../../ir/lowerTypes';

describe('MyBlock IR Lowering', () => {
  it('should lower with correct port order', () => {
    const builder = new IRBuilderImpl();
    const irDecl = getBlockType('MyBlock');
    expect(irDecl).toBeDefined();

    // Create test inputs
    const typeNum = { world: 'signal', domain: 'float' };
    const sigA = builder.sigConst(5, typeNum);
    const slotA = builder.allocValueSlot(typeNum);
    builder.registerSigSlot(sigA, slotA);

    const inputs = [{ k: 'sig', id: sigA, slot: slotA }];
    const inputsById = { a: { k: 'sig', id: sigA, slot: slotA } };

    const ctx = {
      blockIdx: 0,
      blockType: 'MyBlock',
      instanceId: 'test',
      inTypes: [typeNum],
      outTypes: [typeNum],
      b: builder,
      seedConstId: 0,
    };

    const result = irDecl!.lower({ ctx, inputs, inputsById });

    // Verify outputsById exists and has correct structure
    expect(result.outputsById).toBeDefined();
    expect(result.outputsById!.out).toBeDefined();
    expect(result.outputsById!.out.k).toBe('sig');
  });
});
```

---

## File Organization

### Conventions

- **Port Catalog:** `src/editor/blocks/portCatalog.ts`
  - Reusable port definitions using `definePortCatalog()`
  - Shared across multiple blocks
  - Reference blocks: Oscillator (complex ports), AddSignal/MulSignal/SubSignal (simple ports)

- **Block Spec:** `src/editor/blocks/*Spec.ts`
  - Per-block specs for complex blocks
  - Derives editor block and IR declarations from port catalog
  - Example: `oscillatorSpec.ts`

- **Editor Blocks:** `src/editor/blocks/signal.ts` (or domain.ts, rhythm.ts, etc.)
  - Re-exports block definitions
  - Groups blocks by category
  - No standalone port definitions here (use catalog)

- **IR Lowering:** `src/editor/compiler/blocks/<category>/<BlockName>.ts`
  - IR lowering implementation
  - Registers block type with `registerBlockType()`
  - Uses `inputsById`/`outputsById` pattern

- **Pass 6:** `src/editor/compiler/passes/pass6-block-lowering.ts`
  - Port contract validation (strict-by-default)
  - Handles `defaultSource` values
  - Maps `outputsById` to port refs

### Migration Workflow (Step-by-Step)

#### Step 1: Create Port Catalog (if needed)

For simple blocks (2-3 ports), inline catalog is fine:
```typescript
const MY_BLOCK_PORTS = {
  inputs: { /* ... */ },
  inputOrder: [/* ... */] as const,
  outputs: { /* ... */ },
  outputOrder: [/* ... */] as const,
};
```

For complex blocks, add to `portCatalog.ts`:
```typescript
export const MY_BLOCK_PORTS = definePortCatalog({
  inputs: { /* ... */ },
  inputOrder: [/* ... */] as const,
  outputs: { /* ... */ },
  outputOrder: [/* ... */] as const,
});
```

#### Step 2: Update Lowering Function

Add `inputsById` parameter and use safe fallback pattern:
```typescript
const lowerMyBlock: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  const a = inputsById?.a ?? inputs[0];  // Add fallback
  const b = inputsById?.b ?? inputs[1];  // Add fallback

  // Rest of lowering logic...
};
```

#### Step 3: Return `outputsById`

Change return statement to use `outputsById`:
```typescript
return {
  outputs: [],  // Empty array
  outputsById: {
    out: { k: 'sig', id: sigId, slot },
  },
};
```

#### Step 4: Verify Block Definition

Ensure editor block definition matches IR port order:
```typescript
// Editor block inputs must match IR inputs order
inputs: [
  { id: 'a', /* ... */ },
  { id: 'b', /* ... */ },
],
```

#### Step 5: Run Typecheck and Tests

```bash
just typecheck  # Should pass with no errors
just test       # Should pass all tests
```

#### Step 6: Test in Browser (Optional)

```bash
just dev  # Start dev server
# Create patch using block, verify no IR validation errors
```

#### Step 7: Add Explicit Strict Tag (Optional)

Document strict enforcement explicitly:
```typescript
export const MyBlock = createBlock({
  type: 'MyBlock',
  tags: { irPortContract: 'strict' },  // Explicit documentation
  // ...
});
```

---

## Backward Compatibility

### Both Patterns Supported

During migration, both positional and named patterns work:

**Legacy Positional:**
```typescript
return {
  outputs: [{ k: 'sig', id: sigId, slot }],
};
```

**Migrated Named:**
```typescript
return {
  outputs: [],
  outputsById: { out: { k: 'sig', id: sigId, slot } },
};
```

**Fallback Strategy:**
```typescript
// Pass 6 prioritizes outputsById over outputs
if (result.outputsById !== undefined && Object.keys(result.outputsById).length > 0) {
  // Use outputsById (new path)
  for (const portId of portOrder) {
    const ref = result.outputsById[portId];
    outputRefs.set(portId, ref);
  }
} else {
  // Use outputs (legacy path)
  result.outputs.forEach((ref, index) => {
    outputRefs.set(block.outputs[index].id, ref);
  });
}
```

### Gradual Rollout

Blocks can be migrated incrementally:
1. Migrate high-priority blocks first (core signal/field processing)
2. Add `relaxed` tag to complex blocks during transition
3. Test each migration individually
4. Remove `relaxed` tags once block is stabilized

---

## Reference Blocks

### Migrated Blocks (4 total)

1. **Oscillator** - Complex block with multiple input tiers
   - File: `src/editor/compiler/blocks/signal/Oscillator.ts`
   - Catalog: `OSCILLATOR_PORTS` in `portCatalog.ts`
   - Inputs: phase, shape, amplitude, bias
   - Outputs: out

2. **AddSignal** - Simple binary math operation
   - File: `src/editor/compiler/blocks/signal/AddSignal.ts`
   - Inputs: a, b
   - Outputs: out

3. **MulSignal** - Simple binary math operation
   - File: `src/editor/compiler/blocks/signal/MulSignal.ts`
   - Inputs: a, b
   - Outputs: out

4. **SubSignal** - Simple binary math operation
   - File: `src/editor/compiler/blocks/signal/SubSignal.ts`
   - Inputs: a, b
   - Outputs: out

### Remaining Blocks (48 unmigrated)

All unmigrated blocks use strict-by-default validation. If a block has port order mismatches, it will fail at runtime with clear error messages.

**To migrate a block:**
1. Follow the [Migration Workflow](#migration-workflow-step-by-step) above
2. Reference one of the migrated blocks for examples
3. Test thoroughly before removing `relaxed` tag (if used)

---

## Why This Matters

### Benefits

1. **Compile-Time Safety:**
   - TypeScript catches port order mismatches before runtime
   - Port catalog keys validated at compile-time
   - Refactoring is safer with type checking

2. **Runtime Validation:**
   - Strict-by-default catches editor/IR drift immediately
   - Clear error messages with block type, instance ID, and port names
   - Fail-fast behavior prevents silent bugs

3. **Maintainability:**
   - Single source of truth for port definitions
   - Self-documenting code (named ports vs positional)
   - Easier to add/remove/reorder ports

4. **Consistency:**
   - defaultSource behavior consistent across UI and IR
   - Port order enforced across editor and compiler
   - Migration pattern reusable for all blocks

### Future Work

- Migrate remaining 48 blocks incrementally
- Consider tooling/automation for migration (codemod)
- Add validation rules to CI/CD pipeline
- Extend pattern to field and event blocks

---

## Quick Reference

### Port Catalog
- **Location:** `src/editor/blocks/portCatalog.ts`
- **Helper:** `definePortCatalog<const Inputs, const Outputs>()`
- **Example:** `OSCILLATOR_PORTS`

### Lowering Pattern
```typescript
const lowerMyBlock: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  const a = inputsById?.a ?? inputs[0];  // Safe fallback
  return {
    outputs: [],  // Empty for migrated blocks
    outputsById: { out: { k: 'sig', id: sigId, slot } },
  };
};
```

### Enforcement Modes
- **Strict (default):** No tag, or `tags: { irPortContract: 'strict' }`
- **Relaxed (opt-out):** `tags: { irPortContract: 'relaxed' }`

### Validation Location
- **File:** `src/editor/compiler/passes/pass6-block-lowering.ts:270`
- **Tests:** `src/editor/compiler/passes/__tests__/pass6-port-contract.test.ts`

### Migration Checklist
- [ ] Create port catalog (or use inline)
- [ ] Update lowering function with `inputsById` fallback
- [ ] Return `outputsById` with `outputs: []`
- [ ] Verify editor block matches IR port order
- [ ] Run `just typecheck` and `just test`
- [ ] Test in browser (optional)
- [ ] Add explicit strict tag (optional)
