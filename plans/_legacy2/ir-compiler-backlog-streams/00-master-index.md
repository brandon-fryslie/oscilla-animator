# IR Compiler Operational Backlog - Parallel Workstreams

**Purpose:** Provide a parallelizable execution plan for making the IR compiler operational. Each stream has a dedicated file with scoped, detailed steps, file references, and dependencies.

## Workstreams

1. **Type Contracts + IR Plumbing**
   - File: `plans/ir-compiler-backlog-streams/01-type-contracts-ir-plumbing.md`
   - Scope: Canonical TypeDesc, adapters/lenses in IR, default sources materialization, link resolution hardening.

2. **Time + Event Semantics**
   - File: `plans/ir-compiler-backlog-streams/02-time-event-semantics.md`
   - Scope: TimeRoot -> TimeModel wiring, time derive runtime semantics, wrap events, scrub handling, event store.

3. **Field Runtime + Field/Signal Primitives**
   - File: `plans/ir-compiler-backlog-streams/03-field-runtime-primitives.md`
   - Scope: FieldExprMapIndexed/ZipSig, transform chains, field reduce, non-numeric field combine, domain IDs.

4. **Signal Runtime + Stateful Ops**
   - File: `plans/ir-compiler-backlog-streams/04-signal-runtime-stateful.md`
   - Scope: Stateful ops (delay, pulseDivider, envelope), non-numeric signal paths, ColorHSLToRGB.

5. **Bus System Execution**
   - File: `plans/ir-compiler-backlog-streams/05-bus-system-execution.md`
   - Scope: Bus eval schedule, event buses, non-numeric combine, field buses, ordering.

6. **Render Pipeline**
   - File: `plans/ir-compiler-backlog-streams/06-render-pipeline.md`
   - Scope: z-order, postFX, clipping/masking, materials, per-instance attributes, curve flattening.

7. **Debug + Export (Late)**
   - File: `plans/ir-compiler-backlog-streams/07-debug-export-late.md`
   - Scope: IR-compatible debug probes, runtime inspectors, export pipeline + deterministic replay.

## Dependency Map (High Level)

- **Stream 1** is a foundation for most other streams (TypeDesc and link resolution).
- **Stream 2** depends on pass3 TimeRoot extraction and schedule wiring in Stream 1.
- **Stream 3** benefits from Stream 1 (TypeDesc unification) and from Stream 2 for time-aware field patterns.
- **Stream 4** depends on Stream 1 (TypeDesc/slot allocation).
- **Stream 5** depends on Stream 1 (builder schedule plumbing) and Stream 2 (event store semantics).
- **Stream 6** is mostly independent but becomes more valuable after Streams 2–5 deliver richer data.
- **Stream 7** should land after core runtime behaviors stabilize (Streams 1–6).

## Validation Guidance

- **Do not rely on `just test`**. Use Chrome DevTools MCP to verify behavior in the editor/runtime.
- Ensure changes align with `design-docs/3-Synthesized/` and the SPEC docs in `plans/`.

