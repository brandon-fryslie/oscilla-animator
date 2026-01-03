Assessment
- Confirmed: The IR path flow and emitIR gating in src/editor/compiler/compileBusAware.ts match the description (pass1–6, pass8, buildCompiledProgram).
- Incorrect: renderSink() is implemented and stored on the builder; render sinks are already tracked (src/editor/compiler/ir/IRBuilderImpl.ts, src/editor/compiler/ir/__tests__/builder.test.ts).
- Incorrect: Registered lowerers are invoked in pass 6; registerBlockType is not a no-op (src/editor/compiler/passes/pass6-block-lowering.ts).

Missing/understated blockers
- Slot typing/arity: Many allocValueSlot() calls are untyped, so slotMeta is incomplete and vec2/vec3 arity is wrong; ValueStore.write will throw for signal outputs (src/editor/compiler/blocks/signal/AddSignal.ts, src/editor/compiler/blocks/defaultSources/DSConstSignalFloat.ts, src/editor/compiler/passes/combine-utils.ts).
- Schedule slots lack meta: buildSchedule() allocates buffer + frame slots but never appends slotMeta; runtime writes to these slots and will fail (src/editor/compiler/ir/buildSchedule.ts, src/editor/runtime/executor/steps/executeMaterialize.ts, src/editor/runtime/executor/steps/executeRenderAssemble.ts).
- Scalar input resolution: Scalar artifacts are coerced to signals and scalar defaults are unsupported, so lowerers that expect scalarConst (DomainN/Oscillator/etc.) will throw (src/editor/compiler/passes/pass6-block-lowering.ts, src/editor/compiler/passes/resolveWriters.ts, src/editor/compiler/blocks/domain/DomainN.ts).
- Default domain inputs: Config/domain defaults fall back to DSConstSignalFloat, which breaks domain inputs unless explicitly wired (src/editor/compiler/passes/pass0-materialize.ts).
- Render sink duplication risk: Render blocks are lowered in pass6 and again in pass8, so sinks can be double-registered (src/editor/compiler/passes/pass8-link-resolution.ts).

Steel Thread Plan
- Fix scalar handling: Map Scalar artifacts/defaults to scalarConst, and support scalar defaults in writer resolution so lowerers receive correct input kinds (src/editor/compiler/passes/pass6-block-lowering.ts, src/editor/compiler/passes/resolveWriters.ts).
- Make slots typed: Update all signal/field output allocations to call allocValueSlot(type) (or add a helper that derives type from expr id), and ensure combine nodes do the same.
- Add slotMeta for schedule-allocated slots (materialization buffers + frame output) with an internal TypeDesc so ValueStore can write them safely (src/editor/compiler/ir/buildSchedule.ts).
- Pick one render-lowering stage (pass6 or pass8) and prevent duplicate sink emission.
- Build the minimal patch (TimeRoot + DomainN/GridDomain -> PositionMapCircle -> FieldConstColor/FieldConstNumber -> RenderInstances2D) and verify in the preview via Chrome DevTools, not tests.

Secure Footing Plan
- Normalize slot allocation across core blocks (TimeRoot, Oscillator, Add/Mul, PositionMap*, FieldConst*, Render*) and add a validator that asserts every slot used by schedule steps exists in slotMeta.
- Choose and document internal types for buffer/frame slots in the IR contract, then enforce them in buildSchedule and runtime.
- Implement the few transforms needed for common graphs (signal->field broadcast, scalar->signal) with compileToIR.
- Expand the "playable" block set to a small, coherent bundle (time, basic signals, basic fields, domain + render) and verify with a couple of curated patches in DevTools.

Migrations to 100%
- Buses -> blocks: Remove legacy bus/publisher/listener plumbing from compiler + stores and rely solely on BusBlocks + edges.
- Lens/adapter -> transform: Migrate edge data to transforms-only, implement compileToIR for active transforms, and delete applyAdapterChain/applyLensStack paths.
- Bus connections/wires -> edges: Delete legacy CompilerConnection/wire handling and enforce edges-only in patch + compiler.
- Default sources -> structural blocks: Make materializeDefaultSources authoritative, remove fallback default resolution, and add proper default providers for config/domain types.

After Migrations
- Build out the block library by category (time/signal/field/domain/render) with IR-only lowerers and typed slots.
- Clean up UI: PatchBay/Inspector/TimeConsole/BusBoard to match the TypeDesc + transform model and remove legacy UI affordances.
