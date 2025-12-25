Renderer: what it is

A deterministic, stateless-ish Canvas runtime that takes a compiled RenderTree (or RenderCmds) plus frame context and produces pixels. It is not a simulation engine, not a scheduler, not an animation system, not a graph evaluator.

Think: “GPU-less scene compositor + draw command executor + resource cache”.

⸻

Hard responsibilities (renderer MUST do)

1) Canvas lifecycle + frame orchestration
	•	Own the HTMLCanvasElement and CanvasRenderingContext2D.
	•	Handle resize, DPR, viewport mapping.
	•	Provide a single entrypoint: render(frame: RenderFrame): void
	•	where RenderFrame contains tAbsMs, viewport, and the compiled draw payload (already evaluated as needed by the VM).

2) Execute draw commands deterministically
	•	Consume a fully-resolved draw list:
	•	stable ordering already chosen by compiler/runtime (no “sort by z” inside renderer unless z is explicit in commands).
	•	Execute a minimal set of primitives:
	•	transforms (save/restore, setTransform)
	•	paths
	•	fills/strokes
	•	text (optional)
	•	images (optional)
	•	masks/clips (bounded)
	•	globalCompositeOperation (bounded set)
	•	filters (careful—Canvas filter is expensive; gate it)

3) Resource management (images, gradients, patterns, paths)
	•	Cache immutable resources by stable keys:
	•	Path2D from path specs
	•	decoded ImageBitmap
	•	gradients/patterns
	•	Enforce explicit ownership: resources are referenced by IDs in render commands; renderer resolves via cache.
	•	Provide eviction policy (LRU) and “frame pinned” resources.

4) Materialization boundary enforcement

Renderer should be the main consumer that forces materialization of Fields into buffers only if the draw commands require it.
	•	Example: DrawInstances2D may reference buffer handles for pos, radius, color.
	•	Renderer can accept either:
	•	already-materialized typed buffers (preferred), or
	•	a handle that can be materialized via runtime callback (acceptable if you already architected that boundary).

But: the renderer should not be evaluating FieldExpr itself if you want a Rust/WASM path cleanly. Keep eval in VM; renderer sees buffers/handles.

5) Minimal debug overlays (not the debugger)

Renderer can draw overlays when asked:
	•	bounding boxes, instance count, paint timing bars, overdraw heatmap (optional)
	•	but only from explicit debug draw commands (so determinism stays intact).

⸻

Soft responsibilities (renderer MAY do, but keep disciplined)

A) Batching / instancing on Canvas

Canvas is not a GPU, but you can still reduce overhead:
	•	group consecutive commands with same paint state
	•	avoid redundant ctx.* state changes
	•	prebuild Path2D for repeated shapes
	•	for circles/points: prefer arc loops with minimal state flips

B) Clipping + masking (strict subset)

Allow:
	•	clip paths
	•	rectangular scissor-like clip (fast path)
Avoid:
	•	nested complex clips everywhere
	•	per-instance clip

C) Filters (tight sandbox)
	•	If you support ctx.filter, apply at group level, not per-instance.
	•	Treat filters like effects nodes that create offscreen passes (see below), and keep count low.

D) Offscreen passes (compositor)

If you do effects, you need:
	•	OffscreenCanvas or in-memory canvas pooling
	•	render-to-texture style pipeline:
	•	render group into buffer
	•	apply effect (blur, color matrix, blend)
	•	composite onto main
This is where performance can die—keep it explicit and measurable in the command graph.

⸻

What the renderer MUST NOT do (belongs in patch/compiler/runtime)

1) No time, no looping, no phase

Renderer never computes:
	•	phase, pulse, energy
	•	“loop” or “pingpong”
	•	envelope or oscillators
If it’s time-varying, it arrives as values in draw commands or buffers.

2) No graph evaluation, no adapters/lenses

Renderer must not:
	•	resolve buses
	•	apply lens stacks
	•	run adapter chains
	•	evaluate SignalExpr/FieldExpr
That’s VM/compiler territory. Renderer is a consumer.

3) No domain semantics / identity logic

Renderer shouldn’t know what an “element” is.
	•	It draws instances given arrays/buffers.
	•	Domain identity, stable ordering, filtering masks: handled upstream.
If you need per-element filtering, you pass:
	•	a mask buffer (boolean/unit01) OR
	•	a compacted instance buffer already filtered.

4) No automatic sorting heuristics

No “helpful” sorting by:
	•	y position
	•	z inferred from scale
	•	alpha
Sort order must be explicit in the command stream. Otherwise determinism and debugging die.

5) No “layout” or “camera” invention

If you support 2D camera:
	•	it’s a transform in render commands.
If you support 3D later:
	•	renderer shouldn’t pretend; you’ll need a WebGL/WebGPU backend or a 3D-to-2D projection stage in VM.

6) No stateful accumulation unless explicitly commanded

Avoid “trails” or feedback by default. If you want trails:
	•	patch emits commands like “don’t clear” or “fade previous frame by alpha” as an explicit pass.
Renderer can support “framebuffer persistence” as a mode, but it must be driven by commands, not hidden state.

⸻

Concrete “Canvas renderer contract” that keeps you honest

Inputs
	•	RenderFrame:
	•	viewport { w,h,dpr }
	•	tAbsMs (for labeling only; not used for animation)
	•	cmds: RenderCmd[] or RenderTree lowered to cmds
	•	resources: ResourceTableRef (optional)
	•	buffers: BufferTableRef (typed arrays / handles)

Output
	•	Pixels on canvas
	•	Optional RenderStats (counts, timings)

Core command vocabulary (minimal but future-proof)
	•	BeginFrame { clear: ClearMode }
	•	SetTransform { mat3 }
	•	PushState / PopState
	•	SetPaint { fill?, stroke?, lineWidth?, blendMode?, alpha?, filter? }
	•	DrawPath { pathId, mode: fill|stroke|both }
	•	DrawInstances2D { geom: circle|rect|glyph|path, buffers: {pos, size, color, rot, alpha}, count }
	•	BeginPass { target: main|offscreen(id), clear }
	•	EndPass
	•	CompositePass { srcOffscreenId, blendMode, alpha }

That’s enough to do almost everything if the patch/runtime is doing the interesting work.

⸻

Performance-critical boundaries (Canvas reality)

If you’re already seeing perf issues, the renderer must be ruthless about:
	•	state changes: minimize ctx.fillStyle/strokeStyle/globalAlpha/globalCompositeOperation/filter
	•	path creation: cache Path2D, never rebuild per frame
	•	per-instance draw calls: avoid beginPath per instance unless you must
	•	text: expensive; treat as cached glyph atlas later or limit it

The biggest win is usually: move variability into typed buffers and keep command structure stable. If the VM produces a stable command list and only buffers change each frame, you get predictable perf.

⸻

Immediate implementation guidance (so engineers don’t wander)
	1.	Define RenderCmd union + strict “no time logic” rule.
	2.	Lower whatever RenderTree you have into a flat RenderCmd[] during compile or VM, not inside renderer.
	3.	Renderer implements only:
	•	resource cache
	•	offscreen pool (optional)
	•	command execution
	4.	Add a RenderStats hook so you can see:
	•	draw call count
	•	state changes
	•	offscreen passes
	•	time spent in render

If you want, paste your current RenderTree/RenderNode types and the current RenderInstances2D implementation shape, and I’ll map them exactly into a command set and an execution strategy that preserves your future Rust/WASM path.