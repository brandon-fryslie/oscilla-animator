# Oscilla Animator

Visual animation editor with node-based patch bay interface.

> **Animations are not timelines. They are living systems observed over time.**

> **CRITICAL: Adding new blocks is strictly NOT ALLOWED unless the user explicitly asks you to, and you confirm it with them. Use existing blocks, composites, defaultSource, and adapters instead.**

## Quick Commands

```bash
just dev          # Start dev server
just build        # Production build
just check        # Full check: typecheck + lint + test
```

## Memory Files

Detailed context lives in `claude_memory/`:

| File | Topic |
|------|-------|
| `00-essentials.md` | Commands, design doc refs, verification |
| `01-architecture.md` | Directory structure, MobX stores |
| `02-type-system.md` | Signal, Field, TypeDesc hierarchy |
| `03-time-architecture.md` | TimeRoot, TimeModel, Player |
| `04-buses.md` | Canonical buses, production rules |
| `05-blocks.md` | Creating blocks, composites, macros |
| `06-invariants.md` | Non-negotiable rules, pitfalls |
| `07-golden-patch.md` | "Breathing Constellation" reference |

## Design Docs

Authoritative specs: `design-docs/3-Synthesized/`

**If code conflicts with spec, the spec is authoritative.**

## Verification

Use Chrome DevTools MCP to verify behavior - tests are NOT a reliable indicator.
