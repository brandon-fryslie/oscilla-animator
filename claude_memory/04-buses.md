# Oscilla Animator - Buses

**CRITICAL: Read `design-docs/3-Synthesized/03-Buses.md` before modifying bus-related code.**

## Canonical Buses

| Bus | Type | Combine | Purpose |
|-----|------|---------|---------|
| `phaseA` | Signal<phase> | last | Primary phase from CycleTimeRoot |
| `pulse` | Event | or | Wrap events, beat triggers |
| `energy` | Signal<number> | sum | Intensity, envelope contributions |
| `palette` | Signal<color> | last | Color theming |
| `progress` | Signal<unit> | last | FiniteTimeRoot only |

## Bus Production Rules

- CycleTimeRoot auto-publishes: `phase` -> `phaseA`, `wrap` -> `pulse`
- FiniteTimeRoot auto-publishes: `progress` -> `progress`
- Reserved bus types are enforced at compile time
