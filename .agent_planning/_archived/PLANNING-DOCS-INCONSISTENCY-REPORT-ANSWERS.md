# Planning Documents Inconsistency Report - Answers

Below are proposed resolutions to the questions in `.agent_planning/PLANNING-DOCS-INCONSISTENCY-REPORT.md`.

## 1. TimeRoot and TimeModel




### 1.2 TimeModel variants
- Two variants only: `finite` and `infinite`.

### 1.3 TimeModel determination
- Determined only by TimeRoot. Graph structure never changes TimeModel.

## 2. Rails vs Buses

### 2.1 Rails distinct from buses
- Treat rails as reserved buses (no separate concept).

### 2.2 pulse vs pulseA/pulseB
- Single `pulse` bus only.

### 2.3 palette as rail or bus
- Canonical bus (not a separate rail).

## 3. Time Console and Player

### 3.1 Scrubbing
- Scrubbing is implemented and canonical. It must not reset state.

### 3.2 Finite view looping


## 4. Canonical Bus Set

### 4.1 Definitive canonical bus list
- `phaseA`, `pulse`, `energy`, `palette`, `progress`.

### 4.2 Reserved `time` bus
- No reserved `time` bus.

## 5. Auto-Publication Behavior

### 5.1 TimeRoot auto-publication
- Auto-publish `phaseA`, `pulse`, `energy`, `progress` where applicable. No `time` bus.

### 5.2 InfiniteTimeRoot outputs
- Minimal outputs only: `systemTime` and `energy` (no ambient phase/pulse unless explicitly reintroduced).

## 6. Type System Representation

### 6.1 Dual type systems
- Unify on TypeDesc; legacy string kinds are transitional only.

## 7. Document Authority and Version Confusion

### 7.1 Authoritative docs
- `design-docs/3-Synthesized-v2/` is authoritative. `1-Full-System-Design/` is historical. Update `CLAUDE.md` accordingly.

### 7.2 Provisional markers
- Promote by explicit decision and update the authoritative doc, then remove provisional labels.

## 8. Scrubbing Behavior

### 8.1 Rail reads timing
- Not applicable if rails are merged into buses. Bus reads are same-frame with deterministic ordering.

## 9. Compilation and Runtime Model

### 9.1 Closure vs IR
- IR is the target; legacy closure model is transitional and should be labeled as such.

## 10. Block Naming Inconsistencies

### 10.1 PhaseClock vs PhaseFromTime
- Standardize on `PhaseClock`.

### 10.2 Position mapper naming
- Keep domain creation and position mapping separate (`GridDomain` + `PositionMap*`). Combined blocks can be composites.

## 11. Field Semantics

### 11.1 Canonical Field signature
- Field is a lazy bulk expression: `(seed, n, ctx) => readonly T[]`.

## 12. Terminology Drift

### 12.1 App name
- Oscilla.

### 12.2 Combine modes
- Standardize on `last`, `sum`, `or`. `mix` is not valid.

