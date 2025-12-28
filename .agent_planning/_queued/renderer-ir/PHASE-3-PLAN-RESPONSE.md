This plan is close, but there are 3 structural problems that will bite you unless you fix them before implementation.

1) The biggest issue: “color-only” is not a viable end-to-end milestone

You cannot truthfully claim “IR rendering pipeline wired end-to-end” if you still depend on legacy plumbing (or stubs) for positions and radii, because:
•	Instances2DPassIR needs a complete instance buffer contract: at minimum pos(x,y) and radius (or size) in addition to color.
•	If you stub position/radius inside executeRenderAssemble, you’ve created a hidden renderer-side default that contradicts your larger architectural goal (“renderer is dumb; patch is responsible”). That will metastasize.

Fix: Make the sprint’s minimal end-to-end goal be:
•	materialize posXY (2× f32) and radius (f32) and color (4× f32)

You can still keep it “Instances2D only” and “circles only”, but don’t ship an instance pipeline that cannot carry the instance essentials.

Concrete change to scope

Replace “Focus only on color materialization” with:
•	StepMaterializeVec2 for positions
•	StepMaterializeF32 for radius
•	StepMaterializeColor for color

(Or one generic StepMaterializeField with a format discriminator, if you already have that pattern.)

⸻

2) Slot allocation decision is inconsistent across the plan

Your plan assumes slots are allocated in block lowering (P0-3) but later hand-waves “IRBuilder.allocSlot() may not exist” and suggests schedule-time allocation in places.

If you allow schedule-time slot allocation for render materializations, you break:
•	stable slot identity across hot-swap (your non-jank rules)
•	ability to precompute dependency graph deterministically
•	ability for render sinks to “declare what they need” during lowering

Pick one (and it should be #1):

✅ Canonical decision

Allocate output slots during block lowering for all node outputs and all render-materialized buffers.

That means:
•	lowering knows every output slot (FieldExprHandleSlot, ScalarSlot, etc.)
•	lowering allocates each materialized buffer slot
•	schedule compiler only orders already-declared steps/slots; it does not invent slots

This should be written as a hard invariant.

⸻

3) “Render sink metadata” is a blocker because it’s currently underspecified

P0-3 and P0-4 depend on “render sink receives metadata with buffer slot references”, but that metadata schema is undefined, and your acceptance criteria references it without pinning it down.

If you don’t lock this first, you’ll get:
•	ad-hoc fields
•	“just for instances2d” wiring that won’t generalize to paths/3d later
•	brittle coupling between lowering and assemble

Fix: define a canonical RenderSinkDecl IR now

You want something like:

type RenderSinkDecl =
| {
kind: "instances2d";
domainSlot: ValueSlot;
posXSlot: ValueSlot;
posYSlot: ValueSlot;
radiusSlot: ValueSlot;
colorRSlot: ValueSlot;
colorGSlot: ValueSlot;
colorBSlot: ValueSlot;
colorASlot: ValueSlot;
// optional:
sortKey?: number;
blend?: BlendMode;
}
| {
kind: "paths2d";
...
};

And then:
•	lowering emits RenderSinkDecl into a render sink list slot (or into program IR meta)
•	StepRenderAssemble consumes the list and outputs RenderFrameIR

That prevents “mystery metadata”.

⸻

Targeted critique of your P0 items

P0-1 StepIR type update

Good, but incomplete. If you keep StepRenderAssemble(instance2dListSlot, pathBatchListSlot, outFrameSlot), you must specify:
•	type of those list slots (they’re not “buffers”; they’re structured lists)
•	how they’re stored in ValueStore (JS object refs are fine, but be explicit)
•	cache keys: StepRenderAssemble should key off:
•	identity of sink list (stable across frames unless topology changes)
•	and the buffer slots it will reference

P0-2 executeMaterializeColor

Mostly good. Two critical corrections:
•	If you store floats, do not call it “quantize”. It’s “materialize color channels”.
•	You must define color space in the step format. If you don’t, you’ll regret it on LEDs and palette workflows.
•	e.g. colorSpace: "linearRGBA" | "srgbRGBA"

Also: the note “handles signal broadcast” implies this step is doing a broadcast adapter. That’s fine, but then it must be canonical across all materializers (pos/radius too).

P0-3 RenderInstances2D lowering emits steps

Correct direction, but missing the “pos/radius are essential” point.
Also: lowering should not directly “add steps to schedule” if your architecture is “lowering produces step declarations; schedule builder orders them”. Either is fine, but pick one and make it consistent everywhere. Your doc currently mixes both.

P0-4 executeRenderAssemble

Good, but the “default circle material hardcoded” is fine only if:
•	material is part of sink decl (even if defaults)
•	renderer is driven by IR, not by hidden code paths

Also: “Handles empty/zero-instance case gracefully” must include:
•	still emitting a RenderFrameIR with clear spec (if clear mode isn’t none)
•	deterministic pass ordering even when some sinks empty

P0-5 PreviewPanel renderFrame wiring

Good direction. One correction:
•	Don’t “extract RenderFrameIR from program ref”. The program ref is for Player.
•	The source of truth should be the IRRuntimeAdapter runtime (or the executor output slot) as you already describe.

P0-6 IRRuntimeAdapter returns RenderFrameIR

Yes. But you need one concrete contract:
•	IRRuntimeAdapter.executeFrame(tMs, ctx) runs schedule and stores:
•	lastFrameIR (object)
•	lastValueStore (for renderer to read buffers)
•	getRenderFrame(): { frame: RenderFrameIR; values: ValueStore } | null

So PreviewPanel doesn’t need to pull two things from two places.

⸻

What I would change in the plan (minimal edits, but makes it “real”)

Add P0-0: Lock render sink decl + list slot types

Before P0-1.
•	Define RenderSinkDecl union
•	Define StepRenderAssemble input slot types (list of decls)
•	Define how lists are stored in ValueStore

Amend P0-3 / scope: materialize pos + radius too

Add:
•	StepMaterializeVec2(domainSlot, vec2ExprSlot, outXSlot, outYSlot, format?)
•	StepMaterializeF32(domainSlot, f32ExprSlot, outSlot, format?)

Then Instances2D lowering emits 3 materializers: pos, radius, color.

Add one hard invariant
•	“Renderer does not invent defaults for missing instance attributes. If a pass is missing required buffers, it is a compile error.”

That keeps you honest and prevents “toy UI that looks like it works.”

⸻

Risks you called out that I agree with (and how to defuse them)

“Render sink metadata structure unclear” (High)

Defuse by making it an explicit IR type (RenderSinkDecl), not “metadata”.

“PreviewPanel can’t access ValueStore” (Medium)

Defuse by making IRRuntimeAdapter.getRenderFrameBundle() return both frame + values.

“Buffer allocation API doesn’t exist” (Medium)

Defuse by deciding: lowering allocates slots. Then you implement exactly one API:
•	builder.allocSlot(kind: ValueKindTag, type: TypeDesc): ValueSlot

No ad-hoc slot allocation scattered.

⸻

Verdict

If you keep the plan as written, it will likely “render something” but you’ll accidentally create:
•	renderer-side defaults
•	unstable slot semantics
•	ad-hoc sink metadata
…which undermines performance, determinism, and the Rust/WASM path.

If you apply the three fixes above (pos/radius included, slot allocation in lowering, sink decl schema locked), then the plan becomes a solid Phase E.

If you want, paste your current Instances2DPassIR and RenderFrameIR TS shapes and I’ll rewrite P0-0…P0-6 as a corrected sprint plan with the same structure but no ambiguity.