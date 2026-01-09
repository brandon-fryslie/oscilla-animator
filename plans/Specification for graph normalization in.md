Specification for graph normalization in editor.  Note that this was designed by an architect WITHOUT our exact codebase, and therefore certain names or references may need to be adapted.  However, the core architecture should not be compromised

It should live in the editor graph layer, as a canonical “normalized patch graph” that the compiler consumes. The compiler should never see “bus UI”, “wire sidecar state”, “default-source badge” — it should only see ordinary blocks + edges + roles (for debug only).

Where it lives

Create one module that owns all structural behavior:
	•	GraphModel (raw user intent + UI layout)
	•	GraphNormalizer (deterministic rewrite to a NormalizedGraph)
	•	StructuralManager (the policy engine that decides what structural objects must exist)

In practice:
	1.	RawGraph (UI graph)
What the user edits: blocks, edges, plus role metadata. This graph may contain “attached” concepts (wire-state, default-source) that are not represented as explicit nodes yet.
	2.	NormalizedGraph (compiler graph)
A fully explicit graph:
	•	every default-source is an actual BlockInstance + Edge
	•	every bus tap / publish is an actual block + edges (or explicit junction nodes)
	•	every wire-state sidecar is an actual state block + edges
	•	no implicit attachments remain

This is what you compile.

How to manage it

1) Make normalization a pure, deterministic rewrite
You want:

normalized = normalize(raw, previousNormalized?)

Key properties:
	•	Id-stable: structural nodes/wires get stable IDs derived from anchors (not from creation order).
	•	Deterministic: same raw input → same normalized output.
	•	Incremental: can reuse previous normalized mapping to avoid churn, but correctness must not depend on it.

2) Introduce “anchors” (the trick that makes it sane)
Structural things must be keyed by what they attach to.

Examples:
	•	Default source anchored to (blockId, portName, direction)
Anchor: defaultSource:<blockId>:<portName>:<in|out>
	•	Wire-state anchored to wireId
Anchor: wireState:<wireId>
	•	Bus junction anchored to busId + port (or busId alone)
Anchor: bus:<busId>:<pub|sub>:<typeKey>

Then structural IDs become:

structNodeId = hash("structNode", anchor)
structEdgeId = hash("structEdge", anchor, localEdgeName)

Now your structural objects stop thrashing when the user rearranges things.

3) Make the structural manager the only writer of structural artifacts
Adopt a hard rule:
	•	User actions can create/remove/edit user blocks/edges
	•	Structural artifacts are derived, not directly edited (even if they’re visible in UI)

So your store does:
	•	user edits → mutate RawGraph
	•	run normalization → produce NormalizedGraph
	•	compile NormalizedGraph

4) Treat structural artifacts like “derived state” with strong invariants
You need a validator that runs after normalization:
	•	every structural node has a valid anchor target
	•	every default-source edge points to the correct port
	•	no cycles unless mediated by allowed memory blocks (except your time rails, etc.)
	•	role kinds are consistent (no “wireState” node not connected to its wire)

If validation fails: the editor, not the compiler, throws.

5) Keep history stable: store user intent, derive the rest
Undo/redo should operate on RawGraph user intent, not on the expanded normalized artifacts.

For debugging and selection, maintain a bidirectional mapping:
	•	structuralId -> anchor
	•	anchor -> structuralId(s)

So UI can click a little badge and you can select the structural node that represents it.

Minimal architecture you should implement
	•	RawGraphStore (authoritative, undoable)
	•	GraphNormalizer (pure function, produces NormalizedGraph + Mapping)
	•	StructuralMapping (anchor ↔ ids, for UI selection + incremental stability)
	•	Compiler consumes only NormalizedGraph

What you avoid
	•	Compiler inserting anything “helpful”
	•	Runtime repairing missing structural pieces
	•	Multiple “writers” of structural artifacts (guaranteed drift)

If you want, I can write the exact type shapes for RawGraph, NormalizedGraph, Anchor, and StructuralMapping, plus the normalization passes in strict order (default sources → bus junctions → wire-state → final type-check).