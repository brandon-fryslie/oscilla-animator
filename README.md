# Oscilla Animator

Visual animation editor with a node-based patch bay interface.

> **Animations are not timelines. They are living systems observed over time.**

## Philosophy

Oscilla treats animation as signal flow, not keyframe manipulation. Patches define time topology through TimeRoots, and the player observes—never controls—the time axis.

- **Signals** are time-indexed values evaluated once per frame
- **Fields** are per-element lazy expressions evaluated at render sinks
- **Events** are discrete triggers with edge detection
- **Buses** connect blocks through typed publish/subscribe channels

## Quick Start

```bash
pnpm install
just dev
```

## Commands

All commands run through `just`:

| Command | Description |
|---------|-------------|
| `just dev` | Start development server |
| `just build` | Production build |
| `just check` | Full check: typecheck + lint + test |
| `just typecheck` | TypeScript type checking |
| `just test` | Run tests |
| `just lint` | Run ESLint |

Run `just` with no arguments to see all available commands.

## Architecture

```
src/
  core/           # Animation kernel (Signal, Field, Event, Program)
  editor/
    stores/       # MobX state (RootStore, PatchStore, BusStore)
    blocks/       # Block definitions and registry
    compiler/     # Patch → Program compilation
    runtime/      # Player, render tree, SVG renderer
    components/   # React UI (TimeConsole, BusBoard, Inspector)
```

### Time System

TimeRoot blocks declare time topology:

| TimeRoot | Output | Use Case |
|----------|--------|----------|
| Finite | `progress: Signal<unit>` | One-shot animations |
| Cycle | `phase: Signal<phase>`, `wrap: Event` | Loops, music viz |
| Infinite | `t: Signal<time>` | Generative installations |

The player never wraps time. It may loop or window the *view*, but programs always see the same unbounded time axis.

## Design Documentation

Authoritative specs live in `design-docs/3-Synthesized/`. If code conflicts with spec, the spec is authoritative.

## Tech Stack

- React 19 + TypeScript
- MobX for state management
- Vite for build tooling
- Vitest for testing

## License

Private
