# Oscilla Animator - Architecture

## Overview

Visual animation editor with node-based patch bay interface.

## Directory Structure

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

## File Naming Conventions

- Block definitions: `src/editor/blocks/<name>.ts`
- Block compilers: `src/editor/compiler/blocks/<category>/<Name>.ts`
- Components: PascalCase `.tsx`
- Utilities: camelCase `.ts`
- Tests: `*.test.ts` in `__tests__/` directories
