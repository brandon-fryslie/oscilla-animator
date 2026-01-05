# Core Invariants (Unified Spec)

These are non-negotiable rules. If any of these are violated, the system becomes unstable, non-deterministic, or impossible to debug.

## 1) Graph and Compilation Boundaries

- **Compiler never mutates the graph.** No blocks or edges are inserted during compilation, ever.
- **GraphNormalization is required.** The compiler consumes a fully explicit NormalizedGraph produced by the editor (or a dedicated normalization step).
- **Everything is a block at compile time.** Buses, default sources, lenses/adapters, and stateful infrastructure are explicit blocks in the NormalizedGraph.
- **Transforms are blocks.** Lenses/adapters are UI affordances that normalize into explicit derived blocks. Edges are pure connections.
- **Derived blocks are real blocks.** The UI may render them differently, but they are compiled and executed like any other block.

## 2) Time

- **Time is monotonic and unbounded.** `t` never wraps, resets, or clamps.
- **Exactly one TimeRoot per patch.** The TimeRoot defines the time contract; the player does not.
- **Only two TimeRoot kinds exist:** finite and infinite. Nothing else is allowed.

## 3) Multi-Writer Inputs (Combine is Mandatory)

- **Every input supports multiple writers.** No implicit single-writer assumption.
- **Every input has a CombineMode.** The compiler must combine writers deterministically each frame.
- **If an input has no writers, a DefaultSource block is connected during GraphNormalization.**
- **Default sources are not combined with explicit writers.** They exist only when writer count is zero.

## 4) Buses Are Blocks

- **Buses are just blocks with a special UI affordance.**
- **Bus publish/subscribe is UI sugar.** GraphNormalization expands it into normal blocks and edges.
- **Bus combination uses the same multi-writer rules as any other input.**
- **Rails are immutable global bus blocks present in every patch.**

## 5) State and Feedback

- **Statefulness must be explicit.** Any operation with memory is a block.
- **Feedback is allowed only through explicit stateful blocks (UnitDelay or equivalent).**
- **Cycle validation is mandatory.** Every cycle must cross a stateful boundary.

## 6) Fields, Domains, and Identity

- **Domains provide stable element identity.** IDs survive edits and enable deterministic state mapping.
- **Fields are lazy.** They are evaluated only at render sinks or explicit materialization points.
- **Materialization is scheduled and attributable.** No hidden bulk evaluation.

## 7) Determinism and Replay

- **No Math.random() at runtime.** All randomness is seeded and deterministic.
- **Order-dependent combine is deterministic.** Writer ordering is stable and explicit.
- **Replay is exact.** Given patch revision + seed + inputs, output is identical.
- **Pure evaluation contract.** Output is a pure function of (Patch, TimeCtx, Explicit State); no hidden influences.

## 8) Runtime Continuity

- **Hot-swap preserves time.** Recompilation never resets `t`.
- **State continuity follows explicit StateIds.** If identity changes, state is reset with diagnostics.
- **Old program renders until new program is ready.** Swap is atomic.
