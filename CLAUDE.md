# CLAUDE.md

## Philosophy

> **Animations are not timelines. They are living systems observed over time.**

Oscilla treats animation as signal flow, not keyframe manipulation. Looping is the organizing principle, not a feature.

## Commands

All commands via `just` (not pnpm/npm directly):

```bash
just dev          # Dev server (http://localhost:5173)
just build        # Production build
just check        # Full check: typecheck + lint + test
just typecheck    # TypeScript only
just test         # Run tests (vitest)
just test-file <path>  # Single test file
just lint-fix     # Lint with auto-fix
```

## Critical Rules

1. **No new blocks** unless explicitly requested. Use composites, defaultSource, or adapters.
2. **Spec is authoritative.** If code conflicts with `design-docs/spec/`, the spec wins.
3. **Tests lie.** Verify behavior with Chrome DevTools MCP, not just passing tests.

## Fixing Bugs

When fixing bugs or "red flags":

1. **Fix means it works correctly**—not that errors are suppressed
2. **Silent failures are worse than loud ones**—emit compile-time errors with clear messages
3. **"Documented limitation" is not a fix**—a TODO comment does not resolve a bug
4. **Don't paper over problems**—coercing invalid values to defaults hides bugs
5. **Fail fast**—reject invalid configurations early with actionable errors

If you cannot actually fix something, say so and stop. Do not pretend the problem is solved by making it fail quietly.

## Type Hierarchy

| World | Description | Evaluation |
|-------|-------------|------------|
| **Scalar** | Compile-time constants | Once at compile |
| **Signal** | Time-indexed values `(t, ctx) => A` | Once per frame |
| **Field** | Per-element lazy expressions | At render sinks only |
| **Event** | Discrete triggers | Edge detection |

## Non-Negotiable Invariants

- **No `Math.random()` at runtime**—breaks scrubbing/replay. Seed randomness at compile-time.
- **Player time is unbounded**—never wrap `t`. Looping is topological, not temporal.
- **Fields are lazy**—evaluate only at render sinks, never prematerialize.
- **World/domain mismatches are compile errors**—not runtime.
- **Exactly one TimeRoot per patch**—compile error otherwise.

## Architecture

```
src/
  core/           # Animation kernel (Signal, Field, Event types)
  editor/
    stores/       # MobX state (RootStore, PatchStore, BusStore)
    blocks/       # Block definitions and registry
    compiler/     # Patch → IR → Schedule
      ir/         # Intermediate representation
      passes/     # Compiler passes
    runtime/      # Player, executor, field materialization
    components/   # React UI
```

## Extending the System

| Extension | Location |
|-----------|----------|
| Composites | `src/editor/composites.ts` → import in `composite-bridge.ts` |
| Macros | `src/editor/blocks/macros.ts` + `src/editor/macros.ts` MACRO_REGISTRY |
| Block compilers | `src/editor/compiler/blocks/<category>/<Name>.ts` |

## Reference

- **Authoritative spec:** `design-docs/spec/`
- **Quick reference:** `claude_memory/` (non-authoritative)
