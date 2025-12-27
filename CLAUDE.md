# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Philosophy

> **Animations are not timelines. They are living systems observed over time.**

Oscilla treats animation as signal flow, not keyframe manipulation. The looping system is not a feature—it is the organizing principle.

## Commands

All commands via `just` (not pnpm/npm directly):

```bash
just dev          # Start dev server (http://localhost:5173)
just build        # Production build
just check        # Full check: typecheck + lint + test
just typecheck    # TypeScript only
just test         # Run tests (vitest)
just test-file <path>  # Run single test file
just lint-fix     # Lint with auto-fix
```

## Critical Rules

**CRITICAL: Adding new blocks is strictly NOT ALLOWED unless the user explicitly asks and confirms. Use existing blocks, composites, defaultSource, and adapters instead.**

**If code conflicts with spec, the spec is authoritative.** Design docs: `design-docs/3-Synthesized/`

**Tests are NOT a reliable indicator.** Use Chrome DevTools MCP to verify behavior.

## Type Hierarchy

| World | Description | Evaluation |
|-------|-------------|------------|
| **Scalar** | Compile-time constants | Once at compile |
| **Signal** | Time-indexed values `(t, ctx) => A` | Once per frame |
| **Field** | Per-element lazy expressions | At render sinks only |
| **Event** | Discrete triggers | Edge detection |

## Time System

TimeRoot blocks declare time topology. The player observes—never controls—the time axis.

| TimeRoot | Output | Use Case |
|----------|--------|----------|
| Finite | `progress: Signal<unit>` | One-shot animations |
| Cycle | `phase: Signal<phase>`, `wrap: Event` | Loops, music viz |
| Infinite | `t: Signal<time>` | Generative installations |

## Non-Negotiable Invariants

- **No `Math.random()` at runtime**—breaks scrubbing/replay. All randomness seeded at compile-time.
- **Player time is unbounded**—never wrap `t`. Looping is topological, not temporal.
- **Fields are lazy**—evaluate only at render sinks, never prematerialize.
- **World/domain mismatches are compile errors**—not runtime.
- **Exactly one TimeRoot per patch**—compile error otherwise.
- **Scrubbing never resets state**—only adjusts view transforms.

## Architecture

```
src/
  core/           # Animation kernel (Signal, Field, Event types)
  editor/
    stores/       # MobX state (RootStore, PatchStore, BusStore, UIStateStore)
    blocks/       # Block definitions and registry
    compiler/     # Patch → IR → Schedule compilation
      ir/         # Intermediate representation builder
      passes/     # Compiler passes (block lowering, bus lowering, link resolution)
    runtime/      # Player, executor, field materialization
      executor/   # ScheduleExecutor, step dispatch
      field/      # FieldHandle, BufferPool, Materializer
    components/   # React UI
```

## Extending the System

### Composites (Black-box single unit)
Define in `src/editor/composites.ts`, import in `composite-bridge.ts`.

### Macros (Expands to visible editable blocks)
Two parts: BlockDefinition in `src/editor/blocks/legacy/macros.ts` + expansion template in `src/editor/macros.ts` MACRO_REGISTRY.

### Block Compilers
Add to `src/editor/compiler/blocks/<category>/<Name>.ts`, register in block registry.

## Memory Files

Deep context in `claude_memory/`:
- `00-essentials.md` - Commands, design doc refs
- `01-architecture.md` - Directory structure, MobX stores
- `02-type-system.md` - Signal, Field, TypeDesc, BufferDesc
- `03-time-architecture.md` - TimeRoot, TimeModel, Player
- `04-buses.md` - Canonical buses, production rules
- `05-blocks.md` - Creating blocks, composites, macros
- `06-invariants.md` - Non-negotiable rules, pitfalls
- `07-golden-patch.md` - "Breathing Constellation" reference
