# Oscilla Animator - Block System

## Block Forms

| Form | Description |
|------|-------------|
| `primitive` | Irreducible atomic operations (TypeScript implemented) |
| `composite` | Built from primitives, single block in UI |
| `macro` | Expands into visible blocks when added |

## Creating New Blocks

1. Define in `src/editor/blocks/` (use `createBlock` factory)
2. Add compiler in `src/editor/compiler/blocks/`
3. Register in block registry

## Key Block Files

- `time-root.ts` - TimeRoot blocks (Finite/Cycle/Infinite)
- `domain.ts` - Domain blocks (GridDomain, etc.)
- `factory.ts` - Block creation helper

## Creating Composites

Composites are pre-built combinations of primitives that appear as a single block.

**Location:** `src/editor/composites.ts` or domain-specific files

```typescript
import { registerComposite } from './composites';

export const MyComposite = registerComposite({
  id: 'MyComposite',
  label: 'My Composite',
  description: 'Description of what it does',
  color: '#3B82F6',
  subcategory: 'Time',
  laneKind: 'Phase',
  tags: { origin: 'my-composites', form: 'composite' },
  graph: {
    nodes: {
      nodeA: { type: 'BlockTypeA', params: { key: { __fromParam: 'exposedParam' } } },
      nodeB: { type: 'BlockTypeB', params: { staticParam: 42 } },
    },
    edges: [
      { from: 'nodeA.outputPort', to: 'nodeB.inputPort' },
    ],
    inputMap: { externalInput: 'nodeA.inputPort' },
    outputMap: { externalOutput: 'nodeB.outputPort' },
  },
  exposedInputs: [
    { id: 'externalInput', label: 'Input', direction: 'input', slotType: 'Signal<number>', nodeId: 'nodeA', nodePort: 'inputPort' },
  ],
  exposedOutputs: [
    { id: 'externalOutput', label: 'Output', direction: 'output', slotType: 'Signal<number>', nodeId: 'nodeB', nodePort: 'outputPort' },
  ],
});
```

**Import in `composite-bridge.ts`:**
```typescript
import './my-composites';  // Auto-registers on import
```

## Creating Macros

Macros expand into **multiple visible blocks** when added. Users can tweak them.

**Two-Part System:**
1. **Macro Definition** (`src/editor/blocks/legacy/macros.ts`) - BlockDefinition with `form: 'macro'`
2. **Macro Expansion** (`src/editor/macros.ts`) - The actual blocks and wiring in `MACRO_REGISTRY`

**Part 1: Macro Block Definition:**
```typescript
function createMacro(config: { type: string; label: string; description: string; priority: number; color?: string; subcategory?: BlockSubcategory }): BlockDefinition {
  return {
    type: config.type,
    label: config.label,
    form: 'macro',
    subcategory: config.subcategory || 'Animation Styles',
    category: 'Macros',
    description: config.description,
    inputs: [],
    outputs: [],
    defaultParams: {},
    paramSchema: [],
    color: config.color || '#fbbf24',
    laneKind: 'Program',
    priority: config.priority,
  };
}

export const MacroMyEffect = createMacro({
  type: 'macro:myEffect',
  label: 'My Effect',
  description: 'Macro: Description of what it creates.',
  priority: -100,
});
```

**Part 2: Macro Expansion Template:**
```typescript
// In src/editor/macros.ts, add to MACRO_REGISTRY
'macro:myEffect': {
  blocks: [
    { ref: 'clock', type: 'PhaseClock', laneKind: 'Phase', label: 'Timing', params: { period: 2000 } },
    { ref: 'osc', type: 'Oscillator', laneKind: 'Phase', label: 'Wave', params: { shape: 'sine' } },
    { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Output' },
  ],
  connections: [
    { fromRef: 'clock', fromSlot: 'phase', toRef: 'osc', toSlot: 'phase' },
  ],
  publishers: [
    { fromRef: 'clock', fromSlot: 'phase', busName: 'phaseA' },
  ],
  listeners: [
    { busName: 'phaseA', toRef: 'render', toSlot: 'radius', lens: { type: 'scale', params: { scale: 10, offset: 2 } } },
  ],
},
```

**Key Interfaces:**
- `MacroBlock`: `{ ref, type, laneKind, label?, params? }`
- `MacroConnection`: `{ fromRef, fromSlot, toRef, toSlot }`
- `MacroPublisher`: `{ fromRef, fromSlot, busName }`
- `MacroListener`: `{ busName, toRef, toSlot, lens? }`

**When to Use:**
- **Composite**: Black-box, single-unit abstraction
- **Macro**: User sees all pieces, ready to customize
