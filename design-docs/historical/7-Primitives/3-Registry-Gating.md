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
export type KernelCapability = 'time' | 'identity' | 'state' | 'render' | 'io';

/**
 * Full capability type including pure.
 */
export type Capability = KernelCapability | 'pure';

/**
 * The exhaustive list of kernel primitive IDs.
 * This union type provides COMPILE-TIME enforcement.
 * A developer cannot declare a new kernel primitive without editing this.
 */
export type KernelId =
  // Time Authority
  | 'FiniteTimeRoot'

  | 'InfiniteTimeRoot'
  // Identity Authority
  | 'DomainN'
  | 'SVGSampleDomain'
  // State Authority
  | 'IntegrateBlock'
  | 'HistoryBlock'
  // Render Authority
  | 'RenderInstances'
  | 'RenderStrokes'
  | 'RenderProgramStack'
  // External IO Authority
  | 'TextSource'
  | 'ImageSource';

/**
 * Block form - how the block is structured.
 */
export type BlockForm = 'primitive' | 'composite' | 'macro';

/**
 * Compile kind for pure blocks - determines what AST they can produce.
 */
export type PureCompileKind = 'operator' | 'composite' | 'spec';

/**
 * Extended BlockDefinition with capability field.
 * Uses discriminated union for compile-time enforcement.
 */
export type BlockDefinition =
  | KernelBlockDefinition
  | PureBlockDefinition;

interface BlockDefinitionBase {
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
}

/**
 * Kernel block definition - has kernel capability and kernelId.
 */
interface KernelBlockDefinition extends BlockDefinitionBase {
  capability: KernelCapability;
  kernelId: KernelId;  // REQUIRED for non-pure, must match type
}

/**
 * Pure block definition - no kernelId allowed.
 */
interface PureBlockDefinition extends BlockDefinitionBase {
  capability: 'pure';
  compileKind: PureCompileKind;
  // kernelId is NOT present
}
```

**Key enforcement**: If `capability !== 'pure'`, then `kernelId` is mandatory and must be one of the locked `KernelId` values. This is compile-time enforcement.

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

## Pure Block Constraints (Purity Enforcement)

Pure blocks cannot secretly allocate memory or emit RenderTree. This is enforced by requiring pure blocks to compile to a **restricted AST**, not arbitrary closures.

### The Rule

> **Pure operator blocks must compile to AST nodes, not arbitrary functions.**
> Only kernel blocks are allowed to produce runtime closures / stateful evaluators.

### Allowed AST for Pure Blocks

```typescript
// src/editor/compiler/pure-operator-ast.ts

/**
 * Signal expression AST - what pure Signal blocks can produce.
 */
export type SignalExpr =
  | { op: 'const'; value: number | Vec2 | Vec3 | string }
  | { op: 'input'; name: string }
  | { op: 'param'; key: string }
  | { op: 'bus'; busId: string }
  | { op: 'unary'; fn: UnaryFn; arg: SignalExpr }
  | { op: 'binary'; fn: BinaryFn; left: SignalExpr; right: SignalExpr }
  | { op: 'ternary'; cond: SignalExpr; then: SignalExpr; else: SignalExpr }
  | { op: 'time' };  // Reference to t (but not ownership)

/**
 * Field expression AST - what pure Field blocks can produce.
 */
export type FieldExpr =
  | { op: 'const'; value: number | Vec2 | Vec3 | string }
  | { op: 'source'; name: string }
  | { op: 'bus'; busId: string }
  | { op: 'map'; fn: MapFn; field: FieldExpr }
  | { op: 'zip'; fn: ZipFn; a: FieldExpr; b: FieldExpr }
  | { op: 'broadcast'; signal: SignalExpr }
  | { op: 'reduce'; fn: ReduceFn; field: FieldExpr };

/**
 * Unary functions allowed in pure expressions.
 */
export type UnaryFn =
  | 'neg' | 'abs' | 'sin' | 'cos' | 'tan' | 'tanh'
  | 'sqrt' | 'exp' | 'log' | 'floor' | 'ceil' | 'round'
  | 'smoothstep' | 'fract';

/**
 * Binary functions allowed in pure expressions.
 */
export type BinaryFn =
  | 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'pow'
  | 'min' | 'max' | 'atan2' | 'step';

/**
 * Map functions for per-element operations.
 */
export type MapFn = UnaryFn | { fn: 'scale'; k: number } | { fn: 'offset'; k: number };

/**
 * Zip functions for combining two fields.
 */
export type ZipFn = BinaryFn;

/**
 * Reduce functions for aggregating fields.
 */
export type ReduceFn = 'sum' | 'avg' | 'min' | 'max' | 'first' | 'last';
```

### Compile-Time Enforcement

```typescript
// src/editor/compiler/pure-block-validator.ts

/**
 * Validate that a pure block's compiled output doesn't violate constraints.
 * Called during block compilation.
 */
export function validatePureBlockOutput(
  blockType: string,
  compileKind: PureCompileKind,
  outputs: CompiledOutputs
): void {
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

    // Pure blocks cannot reference external IO
    if (artifact.kind === 'ExternalAsset') {
      throw new Error(
        `Pure block "${blockType}" references external asset on port "${port}". ` +
        `Only io-capability blocks may access external assets.`
      );
    }

    // Operator blocks must produce AST nodes
    if (compileKind === 'operator') {
      if (!isValidOperatorArtifact(artifact)) {
        throw new Error(
          `Pure operator block "${blockType}" produces invalid artifact on port "${port}". ` +
          `Operators must produce SignalExpr or FieldExpr, not raw closures.`
        );
      }
    }
  }
}

/**
 * Check if artifact is a valid operator output (AST node, not closure).
 */
function isValidOperatorArtifact(artifact: Artifact): boolean {
  // Valid: FieldExpr nodes
  if (artifact.kind === 'FieldExpr') return true;

  // Valid: Scalar values (compile-time constants)
  if (artifact.kind.startsWith('Scalar:')) return true;

  // Valid: Signals expressed as AST (not closures)
  if (artifact.kind.startsWith('Signal:') && 'expr' in artifact) return true;

  // Invalid: raw closures, handles, etc.
  return false;
}
```

### Why AST, Not Closures

| Approach | Pros | Cons |
|----------|------|------|
| **Closures** | Flexible, easy to write | Can hide state, hard to optimize, no inspection |
| **AST nodes** | Inspectable, optimizable, verifiable | More structured, requires interpreter |

For pure operators, AST nodes are essential because:
1. **Verifiability**: We can prove purity by inspecting the AST
2. **Optimization**: Compiler can constant-fold, fuse operations
3. **Debugging**: Expression trees are inspectable
4. **Export**: AST can be transpiled to shaders, expressions, etc.

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
