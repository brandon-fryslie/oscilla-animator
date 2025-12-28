# Historical Design Documents

**Status:** These documents are HISTORICAL REFERENCE ONLY.

The **authoritative** specification is: `design-docs/final-Synthesized-v2/`

---

## Contents

### `1-Full-System-Design/`
Original design documents from early project development. These established the foundational vision but have been superseded by the synthesized spec.

### `3-Synthesized/`
First synthesis of design documents. Superseded by `final-Synthesized-v2/` which incorporates all resolved decisions and removes inconsistencies.

### `00-Organized-By-Topic-verbatim.md`
A verbatim compilation of all topic documents. Contains unresolved inconsistencies (CycleTimeRoot, PhaseClock, pulseA/pulseB references). Moved here 2025-12-28 after topic files were updated.

---

## Why These Are Historical

As the project evolved, inconsistencies emerged between documents:
- CycleTimeRoot was defined in some docs, removed in others
- Rails vs buses had conflicting definitions
- TimeModel had 2 vs 3 variants in different places
- Scrubbing was both "deferred" and "required"

The `final-Synthesized-v2/` directory resolves all these inconsistencies based on explicit decisions documented in `.agent_planning/PLANNING-DOCS-INCONSISTENCY-REPORT.md`.

---

## When to Reference These

- To understand the evolution of design decisions
- To trace the origin of specific architectural choices
- For historical context on why certain approaches were adopted or rejected

**Do NOT use these for implementation guidance.** Use `final-Synthesized-v2/` instead.
