# Dependency Graph (v2)

## Workstream Dependencies (High-Level)
- Workstream 02 (Semantics + Port Identity) is foundational for all others.
- Workstream 01 (Lenses + Adapters) depends on Workstream 02’s adapter registry + PortKey.
- Workstream 03 (Default Sources + No-Params) depends on Workstream 02’s PortKey and graph semantics.
- Workstream 04 (Layout Projection) depends on Workstream 02’s SemanticGraph output.
- Workstream 05 (Legacy Cleanup) depends on Workstreams 01–04 reaching stability.

## Gate Dependencies
- Gate A → Gate B/C/D/E → Gate F

## Reverse Dependency Checks
- Confirm Workstream 01 does not require semantic graph structure changes beyond Gate A.
- Confirm Workstream 03 does not require PortKey schema changes after Gate A lands.
- Confirm Workstream 04 layout needs are satisfied by SemanticGraph indices (no backflow).

## ASCII Graph
```
Workstream 02 (Semantics + Port Identity)
  ├─> Workstream 01 (Lenses + Adapters)
  ├─> Workstream 03 (Default Sources + No-Params)
  ├─> Workstream 04 (Layout Projection)
  └─> Workstream 05 (Legacy Cleanup)

Gate A (PortKey + SemanticGraph)
  ├─> Gate B (Adapter Registry + Auto-Adapter)
  ├─> Gate C (Lens Registry + Lens Param Binding)
  ├─> Gate D (Default Source Store + Inputs-Only)
  ├─> Gate E (ViewState + Projection Layout)
  └─> Gate F (Legacy Removal)
```

## Detailed Gate Requirements
- Gate A: PortKey canonicalization, SemanticGraph indices, validation API.
- Gate B: Adapter registry + auto-adapter pathfinder available to UI + compiler.
- Gate C: Lens registry + LensInstance model + binding resolution wired into compiler.
- Gate D: DefaultSource model + inputs-only port schema + compiler fallback order.
- Gate E: ViewState model + projection layout consuming SemanticGraph.
- Gate F: Legacy removals (lanes, deprecated exports, stubs) after A–E.
