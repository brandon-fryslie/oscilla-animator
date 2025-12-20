# CLAUDE.md

This file provides guidance to Claude Code when implementing the Oscilla Animator.

## Commands

All commands should be run via `just` (not pnpm/npm directly):

```bash
just dev          # Start dev server
just build        # Production build
just typecheck    # TypeScript type checking
just test         # Run tests (vitest)
just test-watch   # Tests in watch mode
just lint         # ESLint
just check        # Full check: typecheck + lint + test
```

## Canonical Design Documentation

**The authoritative specification lives in `design-docs/3-Synthesized/`:**

| Document | Purpose |
|----------|---------|
| `00-Vision.md` | Core philosophy - "deterministic, continuously-running visual instrument" |
| `01-Core-Concepts.md` | Signals, Fields, Domains, Programs, type hierarchy |
| `02-Time-Architecture.md` | **TimeRoot, TimeModel, PhaseClock** - the keystone |
| `03-Buses.md` | Bus system, canonical buses (phaseA, pulse, energy) |
| `04-Adapters.md` | Lens/adapter system for type conversion |
| `05-Compilation.md` | Compiler pipeline, validation, error taxonomy |
| `06-Runtime.md` | Hot swap, change classification, state preservation |
| `07-UI-Spec.md` | Time Console, Bus Board, Finite/Cycle/Infinite UI modes |
| `08-Export.md` | Phase-driven sampling, loop closure, determinism |
| `09-Blocks.md` | Complete block registry: time, signal, field, render primitives |
| `10-Golden-Patch.md` | "Breathing Constellation" - reference implementation |
| `11-Roadmap.md` | WP0-WP9 work packages in dependency order |

**When in doubt, consult these docs. If code conflicts with spec, the spec is authoritative.**

---

## Architecture Overview

This is a **visual animation editor** with a **node-based patch bay** interface.

### The Core Insight

> **Animations are not timelines. They are living systems that happen to be observed over time.**

The looping system is not a feature - it is the organizing principle of the entire runtime.

### Directory Structure

```
src/
  core/                        # Animation kernel primitives
    types.ts                   # Signal, Event, Field, Program types
    rand.ts                    # Seedable PRNG
  editor/                      # Main editor application
    stores/                    # MobX state management
      RootStore.ts             # Main state container
      PatchStore.ts            # Blocks, connections, lanes
      BusStore.ts              # Buses, publishers, listeners
      UIStateStore.ts          # Selection, drag state
      CompositeStore.ts        # Composite definitions
    blocks/                    # Block definitions
      time-root.ts             # TimeRoot blocks (Finite/Cycle/Infinite)
      domain.ts                # Domain blocks (GridDomain, etc.)
      registry.ts              # Block registry
      factory.ts               # Block creation factory
    compiler/                  # Patch -> Program compilation
      blocks/                  # Per-block compilers
    runtime/                   # Animation runtime
      player.ts                # Player transport (owns time)
      renderTree.ts            # Render output structures
      svgRenderer.ts           # SVG rendering backend
    components/
      TimeConsole.tsx          # Time UI (Finite/Cycle/Infinite modes)
    BusBoard.tsx               # Bus visualization
    Inspector.tsx              # Block property editor
    PatchBay.tsx               # Block graph visualization
```

---

## Core Type System

### The Type Hierarchy

| World | Description | Evaluation |
|-------|-------------|------------|
| **Scalar** | Compile-time constants | Once at compile |
| **Signal** | Time-indexed values | Once per frame |
| **Field** | Per-element lazy expressions | At render sinks only |
| **Event** | Discrete triggers | Edge detection |

### Key Types (src/core/types.ts)

```typescript
// Signal: continuous time-indexed value
type Signal<A> = (t: Time, ctx: Context) => A

// Field: per-element lazy values (BULK FORM)
type Field<T> = (seed: Seed, n: number, ctx: CompileCtx) => readonly T[]

// Program: complete animation
type Program<Out, Ev> = {
  signal: Signal<Out>
  event: EventFn<Ev>
}
```

### TypeDesc (src/editor/types.ts)

Every port and bus has a TypeDesc:
```typescript
interface TypeDesc {
  world: 'signal' | 'field'
  domain: CoreDomain | InternalDomain
  category: 'core' | 'internal'
  busEligible: boolean
  semantics?: string
}
```

---

## Time Architecture (CRITICAL)

**Read `design-docs/3-Synthesized/02-Time-Architecture.md` completely before modifying time-related code.**

### The Core Rule

**There is exactly ONE time system. The patch defines time topology. The player does not.**

### TimeRoot Types

| Type | Output | Use Case |
|------|--------|----------|
| `FiniteTimeRoot` | `progress: Signal<unit>` | Logo stingers, one-shot animations |
| `CycleTimeRoot` | `phase: Signal<phase>`, `wrap: Event` | Ambient loops, music viz |
| `InfiniteTimeRoot` | `t: Signal<time>` | Generative, evolving installations |

### TimeModel (Compiler Output)

```typescript
type TimeModel =
  | { kind: 'finite'; durationMs: number }
  | { kind: 'cyclic'; periodMs: number }
  | { kind: 'infinite'; windowMs: number }
```

### Player Invariants

1. **Player time is unbounded - NEVER wraps t**
2. Player receives TimeModel from compiler
3. Player configures UI based on TimeModel (not the reverse)
4. Scrubbing sets phase offset, never resets state

---

## Buses (CRITICAL)

**Read `design-docs/3-Synthesized/03-Buses.md` before modifying bus-related code.**

### Canonical Buses

| Bus | Type | Combine | Purpose |
|-----|------|---------|---------|
| `phaseA` | Signal<phase> | last | Primary phase from CycleTimeRoot |
| `pulse` | Event | or | Wrap events, beat triggers |
| `energy` | Signal<number> | sum | Intensity, envelope contributions |
| `palette` | Signal<color> | last | Color theming |
| `progress` | Signal<unit> | last | FiniteTimeRoot only |

### Bus Production Rules

- CycleTimeRoot auto-publishes: `phase` -> `phaseA`, `wrap` -> `pulse`
- FiniteTimeRoot auto-publishes: `progress` -> `progress`
- Reserved bus types are enforced at compile time

---

## Block System

### Block Forms

| Form | Description |
|------|-------------|
| `primitive` | Irreducible atomic operations (TypeScript implemented) |
| `composite` | Built from primitives, single block in UI |
| `macro` | Expands into visible blocks when added |

### Creating New Blocks

1. Define in `src/editor/blocks/` (use `createBlock` factory)
2. Add compiler in `src/editor/compiler/blocks/`
3. Register in block registry

### Creating Composites

Composites are pre-built combinations of primitives that appear as a single block in the UI.

**File Location:** `src/editor/composites.ts` or domain-specific files like `src/editor/domain-composites.ts`

**Pattern:**
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

### Creating Macros

Macros are "recipe starters" that expand into **multiple visible blocks** when added to the patch. Unlike composites (single unit), macros show all internal blocks and connections, allowing users to tweak them.

**Two-Part System:**

1. **Macro Definition** (`src/editor/blocks/legacy/macros.ts`) - BlockDefinition with `form: 'macro'`
2. **Macro Expansion** (`src/editor/macros.ts`) - The actual blocks and wiring in `MACRO_REGISTRY`

**Part 1: Macro Block Definition:**
```typescript
// In src/editor/blocks/legacy/macros.ts
function createMacro(config: { type: string; label: string; description: string; priority: number; color?: string; subcategory?: BlockSubcategory }): BlockDefinition {
  return {
    type: config.type,
    label: config.label,
    form: 'macro',                    // <-- This is key
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
  type: 'macro:myEffect',             // Convention: 'macro:' prefix
  label: '✨ My Effect',
  description: 'Macro: Description of what it creates.',
  priority: -100,
});
```

**Part 2: Macro Expansion Template:**
```typescript
// In src/editor/macros.ts, add to MACRO_REGISTRY
'macro:myEffect': {
  blocks: [
    // Each block placed when macro expands
    { ref: 'clock', type: 'PhaseClock', laneKind: 'Phase', label: 'Timing',
      params: { period: 2000 } },
    { ref: 'osc', type: 'Oscillator', laneKind: 'Phase', label: 'Wave',
      params: { shape: 'sine' } },
    { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Output' },
  ],
  connections: [
    // Wire blocks together (uses 'ref' from blocks array)
    { fromRef: 'clock', fromSlot: 'phase', toRef: 'osc', toSlot: 'phase' },
  ],
  publishers: [
    // Optional: publish block outputs to buses
    { fromRef: 'clock', fromSlot: 'phase', busName: 'phaseA' },
  ],
  listeners: [
    // Optional: subscribe block inputs to buses (with optional lens)
    { busName: 'phaseA', toRef: 'render', toSlot: 'radius',
      lens: { type: 'scale', params: { scale: 10, offset: 2 } } },
  ],
},
```

**Key Interfaces:**
- `MacroBlock`: `{ ref, type, laneKind, label?, params? }`
- `MacroConnection`: `{ fromRef, fromSlot, toRef, toSlot }`
- `MacroPublisher`: `{ fromRef, fromSlot, busName }`
- `MacroListener`: `{ busName, toRef, toSlot, lens? }`

**How Expansion Works:**
When user adds a macro block, `PatchStore.addBlock()` calls `expandMacro()` which:
1. Clears the current patch
2. Creates all blocks from the expansion template
3. Wires up all connections
4. Sets up bus publishers/listeners

**When to Use Macros vs Composites:**
- **Composite**: User wants a black-box, single-unit abstraction
- **Macro**: User wants to see all the pieces, ready to customize

### Key Block Files

- `time-root.ts` - TimeRoot blocks (already defined)
- `domain.ts` - Domain blocks (GridDomain, etc.)
- `factory.ts` - Block creation helper

---

## Implementation Roadmap

**The work packages in `design-docs/3-Synthesized/11-Roadmap.md` are dependency-ordered.**

### Current State Assessment

Partially implemented:
- Basic block system and registry
- BusStore with default buses
- TimeRoot block definitions (not compiled)
- Player with legacy loopMode (needs rewrite)

### Next Work Packages

**WP0: Lock the Contracts**
- [ ] TypeDesc validation enforcement
- [ ] Reserved bus name/type enforcement
- [ ] Exactly-one-TimeRoot compile-time validation
- [ ] TimeRoot upstream dependency validation

**WP1: TimeRoot + TimeModel + Player Rewrite**
- [ ] CycleTimeRoot compiler implementation
- [ ] Player transport rewrite (remove loopMode)
- [ ] Time Console UI driven by TimeModel
- [ ] Bus auto-publication from TimeRoot

**WP2: Bus-Aware Compiler Graph**
- [ ] Compiler graph with bus value nodes
- [ ] Deterministic publisher ordering (sortKey)
- [ ] Bus combination semantics (last, sum, or)

---

## Non-Negotiable Invariants

### Runtime Purity
1. **No `Math.random()` at runtime** - Breaks scrubbing/replay
2. **All randomness seeded, evaluated at compile-time**
3. **Animations are time-indexed programs**

### Time Invariants
4. **Player time is unbounded** - Never wrap t
5. **TimeRoot defines topology** - Player only observes
6. **Scrubbing never resets state** - Only adjusts view transforms

### Field Invariants
7. **Fields are lazy** - Evaluate only at render sinks
8. **Domain identity is stable** - IDs survive edits
9. **No bulk re-evaluation on wrap** - Looping is topological

### Compilation Invariants
10. **World mismatches are compile errors** - Not runtime
11. **Domain mismatches are compile errors** - Not runtime
12. **Exactly one TimeRoot per patch** - Compile error otherwise

---

## Golden Patch: "Breathing Constellation"

**The reference implementation for testing architectural correctness.**

See `design-docs/3-Synthesized/10-Golden-Patch.md` for full specification.

### Quick Summary
- CycleTimeRoot (8s period)
- GridDomain (20x20)
- Buses: phaseA, pulse, energy, palette
- Per-element phase offset via StableIdHash
- Breathing radius from energy signal
- Position drift from slow phaseB

### Acceptance Criteria
1. Phase ring animating, pulse indicator ticking
2. No clamping/wrapping bugs in player time
3. Param tweaks apply without jank
4. Period changes scheduled at pulse boundary
5. Same seed = identical motion every reload

---

## Testing Strategy

### Test Files Location
`src/editor/__tests__/`

### Key Test Areas
- `bus-compilation.test.ts` - Bus routing compilation
- `composite.expansion.test.ts` - Composite resolution
- `domain-pipeline.test.ts` - Domain/field pipeline
- `lenses.test.ts` - Adapter/lens system

### Running Tests
```bash
just test              # Run all
just test-watch        # Watch mode
just test-file <path>  # Single file
```

---

## Common Pitfalls

### DO NOT
- Add `loopMode` to player (topology is in TimeRoot)
- Use `Math.random()` anywhere in runtime code
- Materialize fields before render sinks
- Reset state on scrub
- Assume a maximum time value

### DO
- Consult spec docs before architectural changes
- Run `just check` before committing
- Add tests for new block compilers
- Preserve determinism (same seed = same output)
- Update spec docs if implementation requires changes

---

## MobX State Architecture

### Store Hierarchy
```
RootStore
├── PatchStore      # Blocks, connections, lanes
├── BusStore        # Buses, publishers, listeners
├── UIStateStore    # Selection, playback state
└── CompositeStore  # Composite definitions
```

### Key Observables
- `patchStore.blocks` - All block instances
- `busStore.buses` - All bus definitions
- `busStore.publishers` - Block->Bus connections
- `busStore.listeners` - Bus->Block connections

---

## File Naming Conventions

- Block definitions: `src/editor/blocks/<name>.ts`
- Block compilers: `src/editor/compiler/blocks/<category>/<Name>.ts`
- Components: PascalCase `.tsx`
- Utilities: camelCase `.ts`
- Tests: `*.test.ts` in `__tests__/` directories
