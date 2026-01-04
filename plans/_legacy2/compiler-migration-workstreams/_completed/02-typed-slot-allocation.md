Workstream 02: Typed Slot Allocation in Lowerers (P0)

Goal
- Ensure every signal/field output slot is allocated with a TypeDesc so slotMeta is complete.
- Fix bundle arity (vec2, vec3, color) and reduce runtime slot errors.

Scope
- Block lowerers in src/editor/compiler/blocks/**.
- Combine node creation in src/editor/compiler/passes/combine-utils.ts.
- Default source providers in src/editor/compiler/blocks/defaultSources/**.

Out of scope
- Schedule slot allocation (handled in Workstream 01).
- Scalar default handling (Workstream 03).

Why this is P0
- Missing TypeDesc leads to missing slotMeta and incorrect bundle arity.
- Runtime uses slotMeta to route writes; incomplete meta breaks execution.

Parallel safety
- Only touches block lowerers and combine-utils.
- Avoid edits to pass6/pass8 or buildSchedule to prevent conflicts with other streams.

Implementation steps
1. Add a helper to reduce repetitive allocation:
   - Option A: add IRBuilder helper allocSigSlot(sigId, type, debugName) and allocFieldSlot(fieldId, type, debugName).
   - Option B: local helper per block to call ctx.b.allocValueSlot(type, debugName) and register slots.
2. Update combine-utils createCombineNode:
   - Use builder.allocValueSlot(type) instead of allocValueSlot() with no type.
3. Update minimal steel-thread lowerers first:
   - TimeRoot, DomainN, GridDomain, PositionMapCircle, FieldConstNumber, FieldConstColor, RenderInstances2D (if it emits slots).
4. Expand to core signal and field blocks:
   - AddSignal, MulSignal, Oscillator, Clamp, Min/Max, FieldZip/Map, FieldFromSignalBroadcast, etc.
5. Update DSConst* lowerers to pass TypeDesc:
   - DSConstSignalFloat/Int/Color/Point, DSConstFieldFloat/Vec2/Color, DSConstScalar*.
6. Add a small lint-style check or debug assertion:
   - If a ValueRefPacked has k "sig" or "field" but the slot has no slotMeta entry, emit a compile-time warning.

Verification (DevTools, no tests)
- Build the steel-thread patch and confirm no slotMeta errors in console.
- Check that vec2 outputs allocate consecutive slots (debug Schedule panel or slotMeta logs).

Done criteria
- All signal/field outputs from the curated block set allocate typed slots.
- Combine nodes allocate typed slots for their outputs.
