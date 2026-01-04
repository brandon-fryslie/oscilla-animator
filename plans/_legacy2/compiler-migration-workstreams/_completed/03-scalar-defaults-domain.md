Workstream 03: Scalar Handling and Domain Defaults (P0)

Goal
- Preserve scalar inputs as scalarConst in IR (no fake signal nodes).
- Ensure domain inputs get structural defaults (DomainN) instead of DSConstSignalFloat.

Scope
- src/editor/compiler/passes/pass6-block-lowering.ts
- src/editor/compiler/passes/resolveWriters.ts
- src/editor/compiler/passes/pass0-materialize.ts

Out of scope
- Slot typing in lowerers (Workstream 02).
- Render sink policy (Workstream 04).

Why this is P0
- Scalar inputs currently miscompile and cause lowerers to throw (DomainN, Oscillator).
- Domain defaults currently map to signal constants and break render sinks unless wired manually.

Parallel safety
- Isolated to pass6, resolveWriters, and pass0-materialize.
- Avoid touching block lowerers and schedule logic.

Implementation steps
1. Pass 6 artifactToValueRef:
   - Map Scalar:* artifacts to { k: "scalarConst", constId } using builder.allocConstId.
   - Remove the scalar->signal placeholder mapping.
2. Writer default handling:
   - In getWriterValueRef, if writer.type.world === "scalar", return scalarConst.
   - Use builder.allocConstId(value) for default source values.
3. Materialize domain defaults:
   - In pass0-materialize, detect inputs with type.world === "config" and type.domain === "domain".
   - Create a DomainN provider block instead of DSConst*.
   - Wire DomainN.out -> target domain input.
   - Feed defaultSource.value into DomainN.n (params or a DSConstScalarInt edge).
4. Validate domain defaults:
   - Clamp N to >= 1 and document behavior when value is invalid.
5. Remove any fallback that coerces config/domain defaults to signal constants.

Verification (DevTools, no tests)
- RenderInstances2D with default domain input should compile and render.
- DomainN lowerer should receive scalarConst for n/seed inputs.
- No "expected scalarConst" errors in console for DomainN or Oscillator.

Done criteria
- Scalar inputs remain scalarConst in IR.
- Domain default inputs are satisfied via structural blocks.
