Workstream 05: Transform IR Coverage for Critical Adapters (P1)

Goal
- Implement compileToIR for the minimal set of transforms needed by common graphs.
- Make transform failures explicit and actionable in IR mode.

Scope
- src/editor/transforms/definitions/** (adapters, lenses)
- src/editor/transforms/catalog.ts (if needed to expose compileToIR)

Out of scope
- Edge schema changes (handled in migrations workstream).
- Block lowerers.

Why this is P1
- Steel thread can avoid transforms initially, but real patches will need signal->field and scalar->signal transforms.

Parallel safety
- Touches only transform definitions and registry.
- No overlap with compiler passes or block lowerers.

Implementation steps
1. BroadcastSignal adapters:
   - Add compileToIR for BroadcastSignal:float and BroadcastSignal:color.
   - Use builder.broadcastSigToField(sigId, domainSlot, outputType).
   - Allocate output slot with proper TypeDesc.
2. ConstToSignal adapter:
   - Add compileToIR to lift scalarConst to sigConst.
   - Ensure it returns a signal ValueRefPacked with typed slot.
3. Add compileToIR to any lens used by default patches (scale/offset if applicable).
4. Update validation messaging:
   - When compileToIR is missing, emit an error that points to transform id and suggests alternatives.

Verification (DevTools, no tests)
- Build a patch that relies on signal->field broadcast (e.g., radius signal to field radius).
- Confirm IR compilation succeeds and render output matches expectations.

Done criteria
- Transform chains used by the curated patches compile to IR without fallback.
