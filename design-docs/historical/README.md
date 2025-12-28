# Historical Design Documents

**Status:** These documents are HISTORICAL REFERENCE ONLY.

The **authoritative** specification is: `design-docs/spec/`

---

## Contents

### Superseded Specs
- `final-Synthesized-v2/` - Previous authoritative spec (consolidated into `spec/`)
- `final-System-Invariants/` - Previous invariants (consolidated into `spec/00-invariants.md`)
- `3-Synthesized/` - First synthesis (superseded by final-Synthesized-v2)
- `1-Full-System-Design/` - Original design documents

### Work Packages (Development History)
- `2-TimeRoot/` - TimeRoot development
- `4-Event-System/` - Event system design
- `6-Transactions/` - Transaction system
- `7-Primitives/` - Primitive blocks
- `8-UI-Redesign/`, `8.5-Modulation-Table/`, `9-UIReDesign-Real/` - UI iterations
- `10-Refactor-for-UI-prep/` - UI refactoring work

### Other
- `00-Organized-By-Topic-verbatim.md` - Large compilation with old content

---

## Why Historical

As the project evolved, inconsistencies emerged:
- CycleTimeRoot was defined then removed
- Rails vs buses had conflicting definitions
- TimeModel had 2 vs 3 variants
- Scrubbing was both "deferred" and "required"

These are resolved in `design-docs/spec/`.

---

## When to Reference

- To understand design evolution
- To trace architectural decisions
- For historical context

**Do NOT use for implementation guidance.**
