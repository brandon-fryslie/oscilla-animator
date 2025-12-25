# Parallel Plan 02 (v2): Semantics Kernel + Port Identity

**Goal:** Make the semantic kernel and PortKey the single source of truth for graph structure, validation, and compatibility.

## Parallel-Friendly Task Sequence
1. **Port Identity Canonicalization**
   - [ ] Define `PortRef` and `PortKey` as the only port identity format.
   - [ ] Update connections, publishers/listeners, diagnostics, and selections to use PortRef only.
   - [ ] Add/extend composite definition syntax to include explicit port maps (external slotId → internal port).
   - [ ] Update composite registry validation to require port maps at registration time.

2. **SemanticGraph & Validation API**
   - [ ] Implement `SemanticGraph` with indexed maps/sets for fast lookup:
     - `inEdgesByInPort: Map<PortKey, Edge[]>`
     - `outEdgesByOutPort: Map<PortKey, Edge[]>`
     - `publishersByBus: Map<busId, PublisherRef[]>` (sorted by sortKey + id)
     - `listenersByBus: Map<busId, ListenerRef[]>`
     - `typeByPort: Map<PortKey, TypeDesc>`
     - `portsByBlock: Map<blockId, { inputs: SlotId[]; outputs: SlotId[] }>`
     - `adjacency: Map<NodeKey, NodeKey[]>` (for cycle/SCC checks)
   - [ ] Implement validation strata: structural errors vs runtime warnings (`7-PatchSemantics.md`), with examples:
     - Structural errors: missing endpoints, invalid PortRef, type mismatch with no adapter, multiple TimeRoots, illegal cycles.
     - Runtime warnings: empty buses, expensive adapters, unused blocks, heavy fan-in/fan-out.
   - [ ] Provide a preflight + delta validation API for editor ops.
   - [ ] Emit diagnostics in a UI-friendly format aligned with debugger plans (`design-docs/11-Debugger/_planning/`).
   - [ ] Add performance strategy: incremental graph updates, memoized lookups, and bounded SCC checks.

3. **Adapter Selection in Kernel**
   - [ ] Implement adapter registry + auto-adapter pathfinder per `19-AdaptersCanonical-n-Impl.md`.
   - [ ] Enforce adapter policies (AUTO/SUGGEST/EXPLICIT/FORBIDDEN) and cost classes.
   - [ ] Expose adapter suggestions in diagnostics for UI quick-fix.

4. **Compiler + UI Integration**
   - [ ] Compiler consumes SemanticGraph + resolved adapter chains, not ad-hoc scans.
   - [ ] UI uses the same semantic helpers for compatibility and combine modes.

5. **Tests**
   - [ ] Add tests for PortKey stability and composite port mapping.
   - [ ] Add tests for adapter path selection and deterministic ordering.
   - [ ] Add a full codebase audit task to remove non-PortKey addressing in critical paths.

## Deliverables
- One canonical port addressing scheme.
- One shared semantic kernel for UI + compiler.
- Auto-adapter selection is deterministic and policy-driven.
