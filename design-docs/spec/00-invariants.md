# Core Invariants

These are structural laws, not features. Violating them creates a system that fights itself.

## Time & Continuity

### 1. Time is monotonic and unbounded
- `t` never wraps, never resets, never clamps
- Phase/cycle generators map unbounded `t` internally
- Player observes time; it does not control topology

### 2. Single time authority
- One TimeRoot per patch declares the time contract
- No "player loops" competing with patch loops
- Everything else derives from this authority

### 3. Transport continuity across hot-swap
- When recompiling, `t` continues
- Derived rails continue unless explicitly reset
- Old program renders until new program is ready; swap is atomic

### 4. State continuity with stable IDs
Stateful nodes (integrators, delays, accumulators) must have:
- Stable StateIds
- Explicit migration rules:
  - same StateId + same type → copy
  - same StateId + compatible type → transform
  - else → reset + surface diagnostic

### 5. Deterministic event ordering
Events (pulse, wrap, triggers) need stable ordering across:
- Publishers (by sortKey)
- Combine operations
- Listeners
- Within-frame scheduling

## Graph Semantics

### 6. Explicit cycle semantics
Feedback loops must be:
- Detected structurally (SCC analysis)
- Validated (crosses memory boundary)
- Scheduled deterministically

### 7. Slot-addressed execution
- Names are for UI; runtime uses indices
- No string lookups or object graphs in hot loops
- ValueStore with stable slot addresses

### 8. Schedule is data
- No hidden evaluation order
- Schedule IR must be inspectable, diffable, traceable
- Runtime behavior is explicit, not incidental

### 9. Uniform transform semantics
Adapters/lenses are table-driven and type-driven:
- Scalar transforms → scalars
- Signal transforms → signal plans
- Field transforms → field expr nodes
- Reductions (field→signal) are explicit

## Fields & Identity

### 10. Stable element identity
Elements have stable IDs for:
- Temporal effects (trails, history)
- Physics
- Per-element state
- Coherent selection/mapping UI
- Partial renders and caches

Domain is a first-class identity handle.

### 11. Lazy fields + explicit materialization
- Fields are lazy expressions, not eager arrays
- Materialization is scheduled, cached, attributable
- Render sinks choose materialization strategy

### 12. Structural sharing for expr DAGs
- Identical subexpressions share nodes
- Hash-consing prevents duplication explosion
- Enables efficient compilation and runtime

### 13. Explicit cache keys
Cache keys depend on:
- (time, domain, upstream slots, params, state version)
- Express "stable across frames" vs "changes each frame"
- Support cross-hot-swap reuse

## Rendering

### 14. Renderer is a sink, not an engine
- Accepts render commands/instances
- Batches, sorts, culls, rasterizes
- Does zero "creative logic"
- All motion/layout/color comes from the patch

### 15. Real Render IR
Generic intermediate representation:
- Instances (geometry id + transform + style refs)
- Paths/meshes/text as geometry assets
- Materials/shaders/effects as refs
- Layering/z-order rules

### 16. Planned batching
Performance requires:
- Minimizing state changes
- Minimizing path building
- Minimizing draw calls
- Grouping by material/style

### 17. Temporal stability
On live edits:
- Old program renders until new is ready
- Swap is atomic
- Optional crossfade or state carryover
- Field buffers persist if compatible

## Debuggability

### 18. First-class error taxonomy
Not "something went wrong." Errors include:
- Type mismatch: from/to, suggested adapters
- Illegal cycle: show loop and missing memory edge
- Bus conflict: show publishers + combine semantics
- Forced materialization: show culprit sink and expr chain

### 19. Traceability by stable IDs
Every value is attributable:
- Produced by NodeId/StepId
- Transformed by lens chain
- Combined on BusId
- Materialized due to SinkId

### 20. Deterministic replay
Given PatchRevision + Seed + inputs record, replay is exact.
Foundational for: bug reports, performance tuning, collaboration, server authority.

## Runtime Non-Negotiables

### 21. No Math.random() at runtime
Breaks scrubbing and replay. All randomness is seeded.

### 22. World mismatches are compile errors
Signal vs Field vs Scalar mixing is caught at compile time.

### 23. Domain mismatches are compile errors
Incompatible domains cannot be combined.

### 24. Full separation: compile → run → render
- Compile-time: type checking, graph building, scheduling
- Run-time: signal evaluation (once per frame)
- Render-time: field materialization (at sinks only)

## The Meta-Rule

**If behavior depends on UI order, object identity, or incidental evaluation order — it's a toy.**

Ensure:
- Execution order is explicit
- Identity is explicit
- State is explicit
- Transforms are explicit
- Time topology is explicit
