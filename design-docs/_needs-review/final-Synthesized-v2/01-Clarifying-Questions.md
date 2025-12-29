# Clarifying Questions — RESOLVED

**Status:** All questions resolved as of 2025-12-27. See `.agent_planning/PLANNING-DOCS-INCONSISTENCY-REPORT.md` for full resolution details.

---

## Summary of Resolutions

| # | Question | Resolution |
|---|----------|------------|

| 2 | TimeModel variants | **2 variants only**: `finite` and `infinite` (no `cyclic`) |
| 3 | TimeModel determination | **TimeRoot only** - Graph properties never change TimeModel |
| 4 | Finite view-looping | **Allowed** - View looping is a transport/player behavior |
| 5 | Rails vs buses | **Rails = reserved buses** - Same machinery, `origin: 'built-in'` constraint |
| 6 | pulse naming | **Single `pulse` rail** - No pulseA/pulseB |
| 7 | palette as rail/bus | **Rail (reserved bus)** - Part of canonical Global Rails |
| 8 | TimeRoot auto-publish | **TimeRoot publishes only `time`** - Other rails from Time Console |
| 9 | Reserved `time` bus | **Yes** - Always present, published only by TimeRoot |
| 10 | InfiniteTimeRoot outputs | **Minimal** - Only `systemTime`, no periodMs/phase/pulse/energy |
| 11 | Cycle A/B as blocks | **No** - Cycles are Time Console overlay, not blocks |
| 12 | Rail source selector UI | **Required** - Normalled/Patched/Mixed with bus binding |
| 13 | Rail read timing | **Frame-latched** - Reads see previous frame values |
| 14 | Overlay cycle materialization | **Deferred** - Not in v1 scope |
| 15 | Scrubbing | **Required** - Not deferred |
| 16 | Rail combine rules | **Time Console only** - Separate from generic bus UI |
| 17 | CYCLE UI mode | **Removed** - No CYCLE badge; cycles are rails, not TimeModel |


---

## Canonical Decisions

### Time Architecture
- **TimeModel**: `{ kind: 'finite', durationMs }` or `{ kind: 'infinite' }`

- **TimeRoot publishes**: Only `time` bus
- **Scrubbing**: Required (finite: absolute time, infinite: view window offset)

### Global Rails
Canonical set (reserved buses):
- `time` : Signal<time> (monotonic)
- `phaseA` : Signal<number> [0,1)
- `phaseB` : Signal<number> [0,1)
- `pulse` : Event<trigger>
- `energy` : Signal<number> [0,1]
- `palette` : Signal<number> [0,1]

### Combine Modes
Valid modes: `sum | average | max | min | last | layer`
Invalid: `or`, `mix`

### Rail Semantics
- **Frame-latched**: Rail reads observe previous frame snapshot
- **Drive policy**: Normalled (default), Patched, or Mixed
- **Source**: Time Console (Modulation Rack) or user bus binding

### Type System
- **TypeDesc is authoritative** - ValueKind deprecated
- **Field = FieldExpr<T>** - Lazy expression, materialized at sinks

### Blocks
- **PhaseClock removed** - Phase comes from rails

- **Domain and position mapping separate** - DomainN + PositionMap* blocks
