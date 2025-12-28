# Needs Review

These directories were moved here during a docs reorganization on 2025-12-28. Their status is unclear and they need human review to determine:

1. **Should they be authoritative spec?** → Move to `spec/` or `reference/`
2. **Are they implementation guides?** → Move to `implementation/`
3. **Are they truly historical?** → Move to `historical/`
4. **Are they active work?** → Keep at top level or in appropriate location

## Contents

### Previous "Authoritative" Specs
- `final-Synthesized-v2/` - Was the authoritative spec before consolidation
- `final-System-Invariants/` - Core laws and checklists

### Numbered Work Packages
- `2-TimeRoot/` - TimeRoot design work
- `4-Event-System/` - Event system design
- `6-Transactions/` - Transaction system design
- `7-Primitives/` - Primitive blocks design
- `8-UI-Redesign/` - UI redesign iteration
- `8.5-Modulation-Table/` - Modulation table design
- `9-UIReDesign-Real/` - Another UI redesign iteration
- `10-Refactor-for-UI-prep/` - UI refactoring preparation

## Questions to Answer

1. Do the numbered work packages contain specs that should be authoritative?
2. Is the content in `final-Synthesized-v2/topics/` fully captured in `spec/`?
3. Are any of these still active work vs completed vs abandoned?

## What Was Consolidated

The new `spec/` directory was created by consolidating:
- `final-System-Invariants/1-Core-Laws.md` → `spec/00-invariants.md`
- `final-Synthesized-v2/topics/02-Core-Concepts-and-Type-System.md` → `spec/01-type-system.md`
- `final-Synthesized-v2/topics/03-Time-Architecture.md` + `01-Vision.md` → `spec/02-time.md`
- `final-Synthesized-v2/topics/04-Buses.md` → `spec/03-buses.md`
- `final-Synthesized-v2/topics/06-Compilation.md` → `spec/04-compilation.md`
- `final-Synthesized-v2/topics/07-Runtime.md` → `spec/05-runtime.md`
- `final-Synthesized-v2/topics/10-Blocks.md` → `spec/06-blocks.md`

The consolidation reduced verbosity but may have lost nuance. Compare originals to consolidated versions.
