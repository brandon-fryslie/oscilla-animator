2) FieldExpr materialization

Yes—RenderInstances2D should batch-evaluate all fields it actually uses into typed buffers once per frame (per domain), and then render from those buffers. That’s the right default architecture.

Why this is the correct “sink boundary”:
	•	A renderer is a natural materialization sink: it’s where lazy per-element expressions must become concrete numbers.
	•	If you let fields materialize ad-hoc upstream, you’ll duplicate work and blow cache locality.
	•	If you evaluate per element via callbacks, you’ll get GC pressure and death-by-dispatch.

What exactly to batch-evaluate
RenderInstances2D should request a field evaluation plan for each required attribute:
	•	pos: vec2 (required)
	•	size: number
	•	rot: number
	•	fill: color
	•	opacity: number

Then in one renderer tick:
	1.	Ensure a DomainRuntime exists for that domain (stable ids, count, optional scratch buffers).
	2.	Evaluate each required FieldExpr into a typed buffer:
	•	number → Float32Array/Float64Array
	•	vec2 → two arrays or interleaved
	•	color → packed Uint32Array (recommended) or 4 floats
	3.	Run render logic over those buffers.

Caching / invalidation (the performance killer if you get it wrong)
	•	Cache by (FieldExprId, DomainId, frameStamp) or by (FieldExprStructuralHash, DomainVersion, timeStamp).
	•	Most importantly: do not reallocate buffers every frame. Keep arenas per renderer+domain and reuse.
	•	Fields that are static w.r.t time (pure from id + constants) can be cached across frames until inputs change.

“Once per frame” is a good default, but allow refinement later:
	•	Evaluate only on demand (if renderer can early-out)
	•	Partial evaluation (only visible subset)
	•	Multi-rate (slow fields updated every N frames)

But start with batched, typed, reused buffers at the sink.

⸻

3) Default buses

Yes—auto-create a small default bus set on new patch init. You want a patch to “do something” immediately, and buses are part of the instrument’s chassis.

Recommended v1 default buses (Signal world only):
	•	phaseA: signal:phase combine=last silent=0
	•	phaseB: signal:phase combine=last silent=0
	•	energy: signal:number combine=sum silent=0
	•	pulse: signal:trigger combine=or silent=false/none
	•	palette: signal:color combine=layer or mix silent=black (or a neutral base)

Why this is correct:
	•	It establishes the mental model: “these are the shared channels everything riffs off.”
	•	It makes starter macros trivial.
	•	It reduces blank-canvas paralysis.

Policy details (important):
	•	Defaults should only be created for new patches (or when a patch has no buses).
	•	Never silently inject them into existing patches unless the user accepts a “Add defaults” action.
	•	Mark them as origin: built-in so users can delete/rename but you can treat them specially in UI (pin at top, etc.).

⸻

4) Composite expansion

Do composite expansion in the unified compiler, not in editorToPatch(). Keep editor serialization structural, and do expansion as a compile-time lowering pass.

Why:
	•	editorToPatch() should be a faithful snapshot of what the user authored, not a transformed program.
	•	You need a single place where all lowering happens (composites, adapters, lenses-to-ops, bus resolution, etc.) to preserve determinism and reduce “why does saving change my patch?” confusion.
	•	Compilation needs to support:
	•	recursive composites
	•	shared definition caching
	•	stable node identity mapping (for no-jank state preservation)
Those are compiler responsibilities.

Exception (the only one worth allowing):
	•	If you want an “Expand Composite” editing action, that’s an explicit user command that mutates the authored patch. That expansion happens in the editor layer as an operation, not automatically during export/compile.

So:
	•	Authoring format: composites remain references
	•	Compiler: expands to a lowered IR with stable identity mapping
	•	Editor “Expand” command: optional destructive transform of authored graph

⸻

If you want my strongest opinion on the highest-risk one: #2 is where performance lives or dies. Put materialization at the renderer sink with typed-buffer reuse and you’ll be in a good place.