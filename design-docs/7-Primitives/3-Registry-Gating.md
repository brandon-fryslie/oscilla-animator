# Registry Gating Rules

> **Status**: Canonical
> **Decision Date**: 2024-12-21
> **Scope**: Enforcement mechanisms that prevent primitive set expansion.

---

## Overview

The primitive set is closed. These rules make it **impossible** to accidentally add new kernel primitives without explicit architectural decision.

---

## BlockDefinition Schema

```typescript
/**
 * Kernel capabilities - the five authorities that define primitives.
 */
export type KernelCapability =
  | 'time'      // Defines time topology
  | 'identity'  // Creates Domain / element identity
  | 'state'     // Holds memory across frames
  | 'render'    // Emits RenderTree
  | 'io'        // Imports external assets
  | 'pure';     // No special authority (default)

/**
 * Block form - how the block is structured.
 */
export type BlockForm = 'primitive' | 'composite' | 'macro';

/**
 * Extended BlockDefinition with capability field.
 */
export interface BlockDefinition {
  // Existing fields
  type: string;
  label: string;
  form: BlockForm;
  category: BlockCategory;
  subcategory: BlockSubcategory;
  description: string;
  inputs: readonly Slot[];
  outputs: readonly Slot[];
  paramSchema: readonly ParamDef[];
  defaultParams: BlockParams;
  color: string;
  laneKind: LaneKind;
  priority: number;

  // NEW: Kernel capability (required)
  capability: KernelCapability;
}
```

---

## Allowed Kernel Primitives (Exhaustive List)

This is the **only** place where non-pure capabilities are allowed:

```typescript
// src/editor/blocks/kernel-primitives.ts

/**
 * Exhaustive list of kernel primitives.
 * This file is the single source of truth.
 * CI will reject any block claiming non-pure capability that isn't listed here.
 */
export const KERNEL_PRIMITIVES = {
  // Time Authority (exactly 3)
  'FiniteTimeRoot': 'time',
  'CycleTimeRoot': 'time',
  'InfiniteTimeRoot': 'time',

  // Identity Authority (exactly 2)
  'DomainN': 'identity',
  'SVGSampleDomain': 'identity',

  // State Authority (exactly 2)
  'IntegrateBlock': 'state',
  'HistoryBlock': 'state',

  // Render Authority (exactly 3, some future)
  'RenderInstances': 'render',
  'RenderStrokes': 'render',      // Future slot
  'RenderProgramStack': 'render', // Future slot

  // External IO Authority (exactly 3, some future)
  // Note: SVGSampleDomain is both identity AND io
  'TextSource': 'io',             // Future slot
  'ImageSource': 'io',            // Future slot
} as const satisfies Record<string, Exclude<KernelCapability, 'pure'>>;

export type KernelPrimitiveType = keyof typeof KERNEL_PRIMITIVES;
```

---

## Registration Validation

```typescript
// src/editor/blocks/registry-validation.ts

import { KERNEL_PRIMITIVES, type KernelPrimitiveType } from './kernel-primitives';

/**
 * Validate a block definition before registration.
 * Throws if a block claims non-pure capability without being in KERNEL_PRIMITIVES.
 */
export function validateBlockDefinition(def: BlockDefinition): void {
  // Rule 1: Non-pure capability must be in KERNEL_PRIMITIVES
  if (def.capability !== 'pure') {
    const expectedCapability = KERNEL_PRIMITIVES[def.type as KernelPrimitiveType];

    if (!expectedCapability) {
      throw new Error(
        `Block "${def.type}" claims capability "${def.capability}" but is not in KERNEL_PRIMITIVES. ` +
        `Only the following blocks may have non-pure capability: ${Object.keys(KERNEL_PRIMITIVES).join(', ')}`
      );
    }

    if (expectedCapability !== def.capability) {
      throw new Error(
        `Block "${def.type}" claims capability "${def.capability}" but KERNEL_PRIMITIVES says "${expectedCapability}".`
      );
    }
  }

  // Rule 2: Primitives with form:'composite' cannot have kernel capability
  if (def.form === 'composite' && def.capability !== 'pure') {
    throw new Error(
      `Block "${def.type}" is form:'composite' but claims capability "${def.capability}". ` +
      `Composites must have capability:'pure'.`
    );
  }

  // Rule 3: Macros cannot have kernel capability
  if (def.form === 'macro' && def.capability !== 'pure') {
    throw new Error(
      `Block "${def.type}" is form:'macro' but claims capability "${def.capability}". ` +
      `Macros must have capability:'pure'.`
    );
  }
}

/**
 * Wrap registry.register() to enforce validation.
 */
export function registerBlock(registry: BlockRegistry, def: BlockDefinition): void {
  validateBlockDefinition(def);
  registry.set(def.type, def);
}
```

---

## Pure Block Constraints

Blocks with `capability: 'pure'` must compile to a restricted operator AST:

```typescript
// src/editor/compiler/pure-block-validator.ts

/**
 * Allowed operator AST node types for pure blocks.
 */
export type PureOperatorAST =
  | { op: 'const'; value: Scalar }
  | { op: 'input'; name: string }
  | { op: 'param'; key: string }
  | { op: 'unary'; fn: UnaryFn; arg: PureOperatorAST }
  | { op: 'binary'; fn: BinaryFn; left: PureOperatorAST; right: PureOperatorAST }
  | { op: 'ternary'; cond: PureOperatorAST; then: PureOperatorAST; else: PureOperatorAST }
  | { op: 'map'; fn: MapFn; field: PureOperatorAST }
  | { op: 'zip'; fn: ZipFn; a: PureOperatorAST; b: PureOperatorAST }
  | { op: 'reduce'; fn: ReduceFn; field: PureOperatorAST };

/**
 * Validate that a pure block's compiled output doesn't violate constraints.
 */
export function validatePureBlockOutput(
  blockType: string,
  capability: KernelCapability,
  outputs: CompiledOutputs
): void {
  if (capability !== 'pure') return;

  for (const [port, artifact] of Object.entries(outputs)) {
    // Pure blocks cannot emit RenderTree
    if (artifact.kind === 'RenderTree' || artifact.kind === 'RenderTreeProgram') {
      throw new Error(
        `Pure block "${blockType}" emits ${artifact.kind} on port "${port}". ` +
        `Only render-capability blocks may emit render output.`
      );
    }

    // Pure blocks cannot create Domains
    if (artifact.kind === 'Domain') {
      throw new Error(
        `Pure block "${blockType}" creates Domain on port "${port}". ` +
        `Only identity-capability blocks may create Domains.`
      );
    }

    // Pure blocks cannot have state artifacts
    if (artifact.kind === 'StateHandle' || artifact.kind === 'HistoryBuffer') {
      throw new Error(
        `Pure block "${blockType}" creates state on port "${port}". ` +
        `Only state-capability blocks may hold runtime state.`
      );
    }
  }
}
```

---

## CI Enforcement

### Pre-commit Hook

```bash
#!/bin/bash
# .husky/pre-commit

# Check for unauthorized kernel primitive additions
node scripts/check-kernel-primitives.js
```

### CI Script

```typescript
// scripts/check-kernel-primitives.ts

import { KERNEL_PRIMITIVES } from '../src/editor/blocks/kernel-primitives';
import { getAllBlockDefinitions } from '../src/editor/blocks/registry';

const errors: string[] = [];

for (const def of getAllBlockDefinitions()) {
  if (def.capability !== 'pure') {
    const expected = KERNEL_PRIMITIVES[def.type];
    if (!expected) {
      errors.push(
        `UNAUTHORIZED KERNEL PRIMITIVE: "${def.type}" claims capability "${def.capability}" ` +
        `but is not in KERNEL_PRIMITIVES.`
      );
    } else if (expected !== def.capability) {
      errors.push(
        `CAPABILITY MISMATCH: "${def.type}" claims "${def.capability}" but should be "${expected}".`
      );
    }
  }
}

if (errors.length > 0) {
  console.error('Kernel primitive validation failed:');
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}

console.log('Kernel primitive validation passed.');
```

### GitHub Actions Workflow

```yaml
# .github/workflows/check-primitives.yml

name: Check Kernel Primitives
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm tsx scripts/check-kernel-primitives.ts
```

---

## PR Review Checklist

For any PR that touches block definitions:

### Automatic (CI enforced)
- [ ] No new blocks claim `capability !== 'pure'` unless in KERNEL_PRIMITIVES
- [ ] Existing kernel primitives have correct capability
- [ ] Composites and macros have `capability: 'pure'`
- [ ] Pure blocks don't emit RenderTree/Domain/State

### Manual Review
- [ ] If claiming new kernel capability, is there architectural justification?
- [ ] If adding future slot (TextSource, ImageSource, etc.), is it in KERNEL_PRIMITIVES?
- [ ] Does this block really need to be primitive, or can it be composite?

---

## Adding New Kernel Capabilities

This should be **extremely rare** (once every few years at most).

To add a new kernel capability:

1. **Architectural Decision Record (ADR)** required
   - Why existing capabilities don't cover this?
   - What new authority does this introduce?
   - What primitives need this capability?

2. **Update the types**
   ```typescript
   export type KernelCapability =
     | 'time'
     | 'identity'
     | 'state'
     | 'render'
     | 'io'
     | 'newcapability'  // NEW - with justification
     | 'pure';
   ```

3. **Update KERNEL_PRIMITIVES**
   ```typescript
   export const KERNEL_PRIMITIVES = {
     // ... existing ...
     'NewBlock': 'newcapability',
   };
   ```

4. **Update validators** to handle new capability constraints

5. **Review by maintainers** - this is a breaking architectural change

---

## Summary

| Mechanism | What It Prevents |
|-----------|------------------|
| `KernelCapability` type | Accidental new capability types |
| `KERNEL_PRIMITIVES` list | Unlisted blocks claiming authority |
| `validateBlockDefinition()` | Runtime registration of bad blocks |
| `validatePureBlockOutput()` | Pure blocks violating constraints |
| CI check | Commits that add unauthorized primitives |
| PR checklist | Human review of edge cases |

The primitive set is **locked by design**.
