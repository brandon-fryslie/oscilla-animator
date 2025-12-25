# Oscilla Animator - Essentials

## Commands

All commands via `just` (not pnpm/npm directly):

```bash
just dev          # Start dev server
just build        # Production build
just typecheck    # TypeScript type checking
just test         # Run tests (vitest)
just lint         # ESLint
just check        # Full check: typecheck + lint + test
```

## Canonical Design Docs

**Authoritative specs live in `design-docs/3-Synthesized/`:**

| Doc | Purpose |
|-----|---------|
| `00-Vision.md` | Core philosophy |
| `01-Core-Concepts.md` | Signals, Fields, Domains, type hierarchy |
| `02-Time-Architecture.md` | TimeRoot, TimeModel, PhaseClock (keystone) |
| `03-Buses.md` | Bus system, canonical buses |
| `04-Adapters.md` | Lens/adapter system |
| `05-Compilation.md` | Compiler pipeline, validation |
| `06-Runtime.md` | Hot swap, state preservation |
| `07-UI-Spec.md` | Time Console, Bus Board |
| `08-Export.md` | Phase-driven sampling, determinism |
| `09-Blocks.md` | Complete block registry |
| `10-Golden-Patch.md` | "Breathing Constellation" reference |
| `11-Roadmap.md` | WP0-WP9 work packages |

**If code conflicts with spec, the spec is authoritative.**

## Core Philosophy

> **Animations are not timelines. They are living systems observed over time.**

The looping system is not a feature - it is the organizing principle.

## Verification

Use Chrome DevTools MCP to verify behavior rather than running tests. Tests are NOT a good indication that the code is working.
