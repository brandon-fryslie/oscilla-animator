It’s a medium-to-large problem architecturally, but it’s not a crisis if you draw the boundary cleanly. Right now, the divergence is costing you in three places:
	1.	Type rules live in multiple places

	•	Editor uses SlotType (41-ish string unions) and TypeDesc mapping.
	•	Compiler uses ValueKind + its own compatibility rules (isPortTypeAssignable with hardcoded sets).
Result: the UI can claim “compatible” while the compiler rejects (or worse, accepts with different meaning).

	2.	Identity of ports differs (“slotId” vs “port”)

	•	Editor connections reference {blockId, slotId}.
	•	Compiler connections reference {blockId, port} (inferred from your report).
Result: every integration step needs fragile mapping glue, and composite/macro expansion bugs (like the bus listener issue you hit) become inevitable.

	3.	You can’t build reliable multi-UI projections without a single canonical semantic model
If UIs are projecting editor-graph semantics but runtime is compiling a different representation, you’ll keep getting “UI looks right, output is wrong” class bugs.

⸻

How big is it, really?

If you continue as-is:
	•	It will slow every feature that touches typing, ports, adapters, buses, composites, and time.
	•	It will create heisenbugs (seems fine in UI, fails in compile).
	•	It will make “multi-UI” much harder because each UI will accidentally depend on the editor’s type universe.

If you fix it properly:
	•	Type compatibility becomes one place.
	•	Adapters become one place.
	•	Ports become stable identifiers end-to-end.
	•	Composite/macro expansion becomes much safer.

So: worth fixing early.

⸻

The best long-term fix: a single shared semantic type system

Goal

Make the editor and compiler share one set of:
	•	type descriptors
	•	compatibility checks
	•	adapter/lens conversion paths
	•	port identity scheme

Concrete plan (one path, no forks)

1) Define a single “SemanticType” that both layers use

You already have TypeDesc. That should become canonical.
	•	TypeDesc = { world, domain, semantics?, unit?, category, busEligible }
	•	Compiler artifacts should be keyed by TypeDesc, not ValueKind.

Then ValueKind becomes either:
	•	deleted, or
	•	a thin internal tag derived from TypeDesc (for optimization), never used for rules.

Rule: If the editor can connect/bind it, the compiler must agree, by calling the same isAssignable(from,to).

2) Standardize port identity: everything references “PortKey”

Stop using “slotId vs port name” ambiguity.

Add a canonical identifier:

type PortKey = `${BlockId}:${'in'|'out'}:${string}`; // or structured object

And define that “string” component as the slot ID, always.
	•	The compiler should compile using the same slot IDs the editor uses.
	•	Block compilers should produce artifacts keyed by slotId.

This alone prevents 50% of integration pain.

3) Move compatibility and conversion into one module

Create src/editor/semantic/ (or similar) with:
	•	typeDescFromSlotType(slotType): TypeDesc
	•	isAssignable(from: TypeDesc, to: TypeDesc): boolean
	•	getConvertiblePaths(from,to): AdapterChain[]
	•	defaultValueFor(typeDesc): unknown

Both:
	•	UI wire/bus menus
	•	compile-time checks
must call these.

Delete compiler-local compatibility tables once migrated.

4) Make “compiler patch” a view over the document, not a parallel schema

Right now you effectively have:
	•	Editor Patch schema
	•	CompilerPatch schema

Instead: compiler takes the document and a resolved index:

compile(doc: PatchDocument, index: PatchIndex, registry, seed, ctx)

The compiler does not need its own competing connection type—just use PortKeys and resolved slot info from the index.

5) Registry must be the authority on ports and types

Today Block carries inputs/outputs slots. Good.

Compiler should not infer port names separately. It should:
	•	read slots from registry/editor model
	•	validate based on slots

If a block definition changes its slot IDs/types, both UI and compiler change together.

⸻

What not to do
	•	Don’t try to “keep them in sync” with mapping layers forever.
	•	Don’t keep SlotType as UI-facing and ValueKind as compile-facing with separate rules.
That guarantees drift.

⸻

A pragmatic way to execute the fix (without rewriting everything at once)
	1.	Introduce the shared semantic module and make the compiler call it for assignability checks.
	•	Keep ValueKind temporarily, but base decisions on TypeDesc.
	2.	Switch compiler internal wiring to slotId-based port refs.
	•	Your compile phase that indexes connections should work on {blockId, slotId}.
	3.	Update artifact production in compilers to emit { typeDesc, value } consistently.
	•	This makes adapters/lenses uniform and WASM-friendly later.
	4.	Remove compiler-specific compatibility tables once nothing depends on them.

⸻

Bottom line
	•	Divergence is already causing real bugs (your composite expansion + bus routing issue is a symptom).
	•	The correct fix is to make TypeDesc + slotId-based PortRefs the single truth across editor and compiler.
	•	Once you do that, multi-UI becomes dramatically easier because every UI can trust the same semantic layer the compiler uses.

If you want, I can write the exact “target end state” set of types/interfaces for:
	•	PortRef/PortKey
	•	TypeDesc canonicalization
	•	Artifact shape
	•	and the minimal compiler function signatures that eliminate CompilerPatch entirely.