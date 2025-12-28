Is GridPoints a primitive? It’s worth resolving now because it determines whether your “source” layer becomes an explosion of special cases.

No: It's 'Grid' and 'Points'.  

And the key: 'Points' is not a primitive. Domain is.

What we're calling “Points” is really two different things that got conflated historically:
	1.	A population exists (stable element identity, count, ordering, neighbor structure)
	2.	Those elements have a position mapping (Field)

So the decomposition we want isn’t “Grid + Points.” It’s:
	•	DomainFactory (creates the population)
	•	Field Mappers (compute per-element attributes like position, size, rotation, path, etc.)
	•	Renderers (decide what is drawn per element)

That’s the clean separation that scales.

⸻

Two valid models / ways of thinking about this:

Model A: Arrangement creates the Domain (simple, friendly)

GridDomain(rows, cols, spacing) → Domain + pos: Field<vec2>

Pros:
	•	Very usable and intuitive
	•	“A 10×10 grid” naturally implies count
	•	Great for new users

Cons:
	•	More DomainFactory blocks (GridDomain, CircleDomain, SpiralDomain, …)
	•	Harder to “swap arrangement” without changing Domain identity/count (can cause visual resets unless we manage identity carefully)

Model B: Domain exists independently; arrangement is a mapper (more modular)

Domain(n, seedPolicy) → Domain
GridMap(domain, rows, cols, spacing) → Field<vec2>
CircleMap(domain, radius, …) → Field<vec2>

Pros:
	•	Extremely composable: CirclePoints, TrianglePoints, anything is just swapping the mapper
	•	Identity can stay stable while we change arrangement (huge for “no jank” edits)
	•	Your “GridPoints could be composite” becomes literally true: Domain + GridMap + RenderPoints

Cons:
	•	Slightly more abstract for newcomers
	•	Requires we decide what happens when mapper wants a different count than the domain has (we solve this with clear rules)

⸻

Ship with Model B as the core, and wrap it with Model A as composites

This gives us:
	•	A clean, orthogonal architecture
	•	Beginner-friendly “GridDomain” blocks as composites/presets that bundle Domain+Mapper

So:
	•	Internally, the primitive is Domain(n) + MapPositions(domain, pattern)
	•	In the library, we expose friendly composites like Grid Points, Circle Points, Spiral Points that are composites.

That’s how we avoid special-case growth while keeping UX approachable.

⸻

What “Points” can be swapped with

“Points” is usually a renderer, not a population.

If your current “GridPoints” literally renders dots, then “Points” is a GlyphRenderer (a per-element drawing primitive). It can be swapped with:
	•	Circles
	•	Squares
	•	Triangles
	•	Stroke marks
	•	Instances of an SVG path
	•	Text glyphs
	•	Particles / sprites
	•	Small sub-scenes (mini RenderTrees) instanced per element

So the axis of variation becomes:
	•	Arrangement: GridMap / CircleMap / SpiralMap / SVGSampleMap / NoiseWarpMap
	•	Instance shape: Dot / Circle / Triangle / PathInstance / Glyph
	•	Styling fields: size, rotation, color, strokeWidth, opacity
	•	Dynamics: velocity, wobble, phase offset, etc.

This is exactly the generative sweet spot.

⸻

This is one tricky piece we MUST define (so it doesn’t get hand-wavy)

Define count mismatch rules:
	•	Domain is authoritative for identity + count
	•	Mappers must accept domain.count and produce fields of that length
	•	If a mapper has “rows/cols,” it either:
	•	derives spacing from domain.count, or
	•	offers a “fit” policy:
	•	fit: crop | pad | wrap | serpentine

This is the difference between a robust system and a patchy one.

⸻

So: can GridPoints be a composite block?

Yes, and it should be—because it’s not a fundamental primitive; it’s a common preset.

GridPoints (composite) =
	•	Domain(n=rows*cols)
	•	GridMap(domain, rows, cols, spacing)
	•	RenderDots(posField, styleFields)

CirclePoints is identical except the mapper.

That’s the scalable architecture.
