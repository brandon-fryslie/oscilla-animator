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

**Authoritative specs live in `design-docs/final-Synthesized-v2/`:**

| Doc | Purpose |
|-----|---------|
| `01-Clarifying-Questions.md` | Resolved inconsistencies |
| `topics/01-Vision.md` | Core philosophy |
| `topics/02-Core-Concepts-and-Type-System.md` | Signals, Fields, Domains, type hierarchy |
| `topics/03-Time-Architecture.md` | TimeRoot, TimeModel, Global Rails (keystone) |
| `topics/04-Buses.md` | Bus system, canonical rails |
| `topics/05-Adapters.md` | Lens/adapter system |
| `topics/06-Compilation.md` | Compiler pipeline, validation |
| `topics/07-Runtime.md` | Hot swap, state preservation |
| `topics/08-UI-Spec.md` | Time Console, Bus Board |
| `topics/09-Export.md` | Phase-driven sampling, determinism |
| `topics/10-Blocks.md` | Complete block registry |
| `topics/11-Golden-Patch.md` | "Breathing Constellation" reference |
| `topics/12-Roadmap.md` | WP0-WP9 work packages |

**If code conflicts with spec, the spec is authoritative.**

## Core Philosophy

> **Animations are not timelines. They are living systems observed over time.**

The looping system is not a feature - it is the organizing principle.

## Verification

Use Chrome DevTools MCP to verify behavior rather than running tests. Tests are NOT a good indication that the code is working.
