Deep dive 4: Shared validation layer (edit-time correctness without UI/compile drift)

Right now your system is split like this:
	•	The UI allows almost anything (multiple writers, cycles, type mismatches).
	•	The compiler enforces invariants and fails later.

That creates the worst kind of UX: “it looks connected, but it doesn’t run,” and it’s also poison for multi-UI: each UI will end up re-implementing partial rules, and they’ll disagree.

The fix is to introduce a single, canonical Patch Semantics + Validation module that sits between stores and compiler, and is used by both.

⸻

1) The end-state principle

Principle A: One ruleset, three consumers

There must be exactly one implementation of:
	•	port compatibility
	•	uniqueness constraints (single writer)
	•	time-root constraints
	•	cycle legality (memory boundaries)
	•	bus binding validity (type + adapters + ordering)
	•	composite boundary constraints

And it must be used by:
	1.	Editor mutation layer (to prevent/guide)
	2.	Compiler (to enforce)
	3.	Diagnostics UI (to explain)

Principle B: Validation is incremental and local where possible

Most edit actions should validate only what they touched:
	•	adding a wire validates that input slot
	•	adding a listener validates that bus + that input slot
	•	replacing a block validates its neighborhood

Full validation still exists, but it is not the common case.

⸻

2) Separate “document validity” from “runtime correctness”

A key conceptual mistake is treating all problems as compile errors.

You want two strata:

Stratum 1: Structural validity (document constraints)

These should be prevented at edit time (or corrected automatically):
	•	referencing a missing block/slot/bus
	•	multiple writers to a single input (if you keep wires)
	•	listener to incompatible bus type with no valid adapter chain
	•	publisher missing required output slot
	•	illegal TimeRoot count

These are things the user can’t “partially” do meaningfully.

Stratum 2: Runtime semantics warnings (allowed but warned)

These can exist in the document but are flagged:
	•	expensive adapters (reduce field→signal)
	•	cycles that are legal but likely unstable
	•	buses with no publishers (silent value used)
	•	unused blocks
	•	fields materialized too often per frame

This keeps exploration fun but safe.

⸻

3) Canonical “Semantics Graph” as the shared substrate

Your compiler already builds a dependency graph. The UI needs the same model, but not codegen.

Define a shared internal representation:

SemanticGraph
	•	Nodes:
	•	BlockNode(blockId)
	•	PortNode(PortKey)
	•	BusNode(busId)
	•	Edges:
	•	wire edges (port→port)
	•	publisher edges (port→bus)
	•	listener edges (bus→port)

And a set of indices:
	•	incoming edges per input port
	•	outgoing edges per output port
	•	publishers per bus (sorted by sortKey)
	•	listeners per bus
	•	adjacency for cycle detection

This graph is derived from PatchDocument and is the canonical object both UI and compiler consult.

Important: the UI should never reconstruct these rules by scanning arrays ad-hoc. It asks the SemanticGraph.

⸻

4) Define a single Validation API (what every caller uses)

You want an API that supports:
	•	“Can I do this?” (preflight)
	•	“I did this; what broke?” (post-apply diagnostics)
	•	“What should I do instead?” (guided UX)

Validation output format

Use a strict taxonomy with machine-readable codes.

Example result:
	•	ok: true/false
	•	errors: Diagnostic[]
	•	warnings: Diagnostic[]
	•	fixes: SuggestedFix[] (optional)

A Diagnostic should include:
	•	code (stable identifier)
	•	severity (error/warn/info)
	•	message (human)
	•	where (PortKey, blockId, busId, edge id)
	•	related (other nodes/ports to highlight)
	•	hint (UI string)
	•	quickFixes (optional actions)

This becomes the shared language between compiler and UI.

⸻

5) How it changes editor behavior (without “a thousand conditionals”)

Right now the UI probably does:
	•	mutate store
	•	compile
	•	show errors

Instead, it does:

Mutation pipeline
	1.	preflight: validator.canApply(op, patch)
	2.	if allowed → apply op
	3.	validate neighborhood: validator.validateDelta(delta)
	4.	emit diagnostics event

This means:
	•	UI doesn’t contain rule logic
	•	UI contains only policy: block invalid operations vs allow with warning

For example:
	•	adding a second wire into an input:
	•	validator returns MultipleWriters error with related connections
	•	UI prevents the op, and shows “Replace existing connection?” quickfix

Same validator result is used by compiler later—no divergence.

⸻

6) The most important invariant to decide: does UI prevent invalid states?

You’ve been clear that you want “impossible to break.”

So yes: the editor should prevent structural invalidity.

That yields a clean policy table:

Prevent (hard)
	•	invalid endpoints
	•	incompatible types with no adapter chain
	•	multiple TimeRoots
	•	multiple writers
	•	cycles without memory boundary (if cycles are enabled)

Allow (warn)
	•	expensive adapters
	•	unused blocks
	•	empty bus (silent)
	•	potential perf hotspots

This policy is simple and stable, and it’s UI-agnostic.

⸻

7) How to keep it fast (so validation doesn’t become the bottleneck)

Two key tactics:

A) Maintain SemanticGraph incrementally

Don’t rebuild the entire graph on every hover. When ops apply:
	•	update graph indices in O(1)/O(log n) per change
	•	update only affected nodes/edges

B) Use staged validation
	•	lightweight checks at preflight:
	•	endpoint exists?
	•	type compatible / adapter exists?
	•	would this violate single-writer?
	•	heavier checks (SCC/cycle legality) only on commit or when cycles introduced

This keeps UI snappy.

⸻

8) How this connects to your upcoming undo/redo + op log work

You asked earlier for a primitive mutation API with applyOp(op).

This validation layer plugs in perfectly:
	•	every Op has a validate(op, graph) method
	•	applyOp updates PatchDocument + SemanticGraph
	•	undoOp applies inverse op with the same validation logic (but usually bypassed since it was valid before)

This makes correctness deterministic across history and across UIs.

⸻

9) Implementation boundaries (where code should live)

You want these modules, conceptually:
	•	patchDocument (pure data)
	•	semanticGraph (derived indices)
	•	validator (rules)
	•	diagnostics (format + taxonomy)
	•	editorOps (applyOp/invertOp)

Then:
	•	UI calls editorOps.transaction(...)
	•	compiler calls validator.validateAll(patch) before codegen and uses the same graph builder

No duplication.

⸻

10) The “coffin nails” tests for this layer

To ensure UI and compiler never diverge again:
	1.	For each Op type:
	•	preflight says ok → apply → validateDelta returns no new errors
	2.	Every compile error code must have an equivalent validator code
	3.	Round-trip: patch that validator marks as structurally valid must compile without structural errors (only runtime/warn-level allowed)
	4.	Quick-fix correctness:
	•	“replace connection” fix always yields a valid graph

⸻

If you say Next, we’ll deep dive issue 5: Bus semantics module (how to prevent determinism drift between BusStore sorting, compiler combination, lens/adapters, and UI metering—especially once you add lazy Fields).

Short answer: it overlaps in motivation, but it is not just a restatement.

What you’re reacting to is correct though—the problem space is the same. The solution boundary is different. Let me be very precise.

⸻

What you already had (earlier alignment discussion)

Earlier, we talked about:
	•	Editor types vs compiler types diverging
	•	Multiple representations of the same concepts
	•	The need for a single source of truth for semantics
	•	Avoiding UI logic that “guesses” what the compiler will accept

That discussion was about type alignment and data model alignment.

It answered:

“Are these two layers describing the same thing differently?”

⸻

What this deep dive adds (and why it’s not redundant)

This deep dive is about where correctness actually lives.

It introduces something new and concrete that was not previously specified:

A Shared Validation + Semantics Layer

Not just shared types, but shared rules.

This layer answers:

“What is allowed to exist at all, and why?”

That is a different axis than type alignment.

⸻

Key distinction (this is the important part)

Type alignment answers:

“If something exists, do both layers agree on what it is?”

Validation alignment answers:

“Should this thing be allowed to exist at all?”

You can have perfect type alignment and still have:
	•	UI allows illegal graphs
	•	Compiler rejects them later
	•	Users confused
	•	Multiple UIs re-implementing partial rules

That is exactly your current state.

⸻

Why this is a necessary additional layer

Right now:
	•	The compiler is the only place where many invariants are enforced
	•	The editor is permissive and optimistic
	•	Multi-UI becomes impossible without duplication

The proposal here is not “align compiler and UI again”
It is:

Extract the compiler’s structural rules into a shared, reusable semantic authority.

That authority is:
	•	Used by UI before mutation
	•	Used by compiler before codegen
	•	Used by diagnostics to explain failures
	•	Used by undo/redo to guarantee reversibility

This was not fully specified earlier.

⸻

A litmus test to see the difference

Ask yourself this:

If tomorrow you add a second UI (table view, performance view, CLI),
can it prevent illegal states without importing the compiler?

Before: ❌ No
After this layer: ✅ Yes

That’s the difference.

⸻

Why it felt repetitive

Because the intent is consistent:
	•	One source of truth
	•	No duplication
	•	No drift

But intent ≠ mechanism.

Earlier you had agreement in principle.
This spec gives you a concrete mechanism:
	•	SemanticGraph
	•	Validator
	•	Diagnostic taxonomy
	•	Preflight vs post-apply checks
	•	Edit-time enforcement policy

That’s new.

⸻

Bottom line
	•	❌ This is not a restatement
	•	✅ It is the missing mechanical layer that makes all prior alignment goals achievable
	•	🧱 Without it, every future system (buses, time roots, lazy fields, multi-UI) will leak complexity back into the UI and compiler separately

If you want, next we can:
	•	Collapse this even further into a single “Patch Semantics Kernel”
	•	Or move on to the next deep dive you queued up earlier

Just say Next.