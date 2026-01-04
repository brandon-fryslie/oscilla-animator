Workstream 07: Legacy Migrations to 100 Percent (P2)

Goal
- Remove all legacy paths and make the new architecture the only path:
  - buses -> blocks
  - lens/adapter -> transform
  - bus connections/wires -> edges
  - default sources -> structural blocks

Scope
- Compiler, stores, and editor data model.

Out of scope
- New block library expansion and UI polish (Workstream 08).

Dependencies
- Workstreams 01-05 complete, steel thread verified.

Parallel safety
- This stream is broad and should be done after P0/P1 to avoid conflicts.

Implementation steps
1. Buses -> blocks:
   - Remove legacy publisher/listener types and any bus-specific compile paths.
   - Ensure BusBlocks are the only representation (edges only).
2. Lens/adapter -> transform:
   - Remove adapter and lens application paths outside of transforms.
   - Delete applyAdapterChain/applyLensStack and enforce TransformStep pipeline.
3. Bus connections/wires -> edges:
   - Remove CompilerConnection and wire-only code paths.
   - Enforce edge-only schema in patch conversion and compiler validation.
4. Default sources -> structural blocks:
   - Remove compile-time default resolution in compileBusAware.
   - Require pass0 materialization and structural providers for all defaults.
5. Delete deprecated tests and docs referencing legacy paths.
6. Update design-docs if any behavior changes were required.

Verification (DevTools, no tests)
- Load patches that previously used buses and defaults; confirm they compile with edges only.
- Confirm there are no runtime logs referencing legacy buses or adapters.

Done criteria
- No legacy code paths remain for buses, adapters, wires, or default sources.
- IR compiler is the single authoritative path.
