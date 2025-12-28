Lens Parameters as Default Sources

This spec formalizes how every lens parameter becomes an animatable input via Default Sources, without reintroducing “parameters” as a separate concept.

Core principle

A lens is not a little opaque config blob. A lens is a mini-block with inputs.

But we do not materialize it as a normal graph block. Instead we give it a port-local micrograph that is evaluated with the same machinery as everything else.

⸻

1) Data model

1.1 LensDefinition becomes LensInstance

Each binding (Publisher or Listener) may have lensStack: LensInstance[].

A LensInstance contains:
	•	lensId: string (registry id)
	•	params: Record<string, LensParamBinding> (one entry per lens param)
	•	enabled: boolean
	•	sortKey?: number (optional for deterministic ordering inside stack; otherwise array order)

1.2 LensParamBinding

Each lens param is always a binding, never a raw constant.

type LensParamBinding =
  | { kind: 'default'; defaultSourceId: string }        // implicit per param
  | { kind: 'wire'; from: BindingEndpoint; adapters?: AdapterStep[]; lenses?: LensInstance[] } // optional but allowed
  | { kind: 'bus';  busId: string; adapterChain?: AdapterStep[]; lensStack?: LensInstance[] }; // allows modulating lens params via buses

Notes:
	•	default references an implicit Default Source instance (see below).
	•	wire and bus are allowed because lens params are just inputs.
	•	Lens-on-lens-param is allowed (stacked shaping), but you should impose a recursion limit (see safety rules).

1.3 Default Sources for lens params

Default Sources are implicit per param. They are not blocks in Patch.blocks.

They live in a separate table keyed by stable ids:
	•	defaultSourceId = "ds:<bindingId>:<lensIndex>:<paramKey>"

Store shape:

interface DefaultSourceState {
  id: string
  type: TypeDesc
  value: unknown                 // JSON serializable
  uiHint?: { kind: 'knob'|'slider'|'xy'|'toggle'|'color'|'enum'; ... }
  rangeHint?: { min?: number; max?: number; step?: number; log?: boolean }
}

This makes Default Sources:
	•	persistent
	•	individually editable
	•	uniformly animatable later (because they’re still “sources”)

⸻

2) Evaluation semantics

2.1 Binding stack compilation

When compiling a Publisher or Listener binding:
	1.	compile upstream value (artifact)
	2.	apply adapterChain (compatibility)
	3.	apply lensStack (expression)

Now for each LensInstance in the stack:
	•	Evaluate each param binding to a value of the param’s TypeDesc
	•	Apply lens function with those param values

2.2 Param binding evaluation is just “resolve input”

Every lens param uses the same resolver pattern as block ports:

resolveParam(binding): Artifact
	•	if kind: default: return ConstArtifact(value)
	•	if kind: bus: compile bus artifact and apply adapterChain + lensStack (if specified)
	•	if kind: wire: compile referenced output artifact and apply adapters/lenses

Important invariant: a lens param must evaluate to a Scalar or Signal (and sometimes vec2/color). Avoid Field params for lenses unless you explicitly support per-element lens params (rare, expensive). This is a spec decision:

Lens params are restricted to signal and scalar worlds.
If a user tries to bind a field into a lens param, it must go through an explicit adapter Reduce<Field→Signal> (heavy warning).

2.3 Determinism

All param resolution and lens evaluation is deterministic because:
	•	Default sources are constant values
	•	bus ordering is deterministic (sortKey)
	•	lens stacks are ordered lists
	•	any randomness is seeded and explicit (if you allow deterministic noise lenses)

⸻

3) UI behavior

3.1 Where lens params appear

A lens always renders as a “chip” with an expandable “drawer”.

Example:
	•	Scale lens chip: shows primary param inline (e.g., gain=1.25)
	•	expand shows:
	•	each param row: name, current source, inline control if default
	•	“Drive…” action per param (bind to bus / wire / insert modulator)

3.2 Default vs driven UI

Each param row has 3 states:
	•	Default: show control (knob/slider/toggle) directly
	•	Driven by bus: show BusName chip + mini lens badge(s)
	•	Driven by wire: show Block.out chip

Clicking the source chip opens:
	•	swap source (bus/wire/default)
	•	view adapters
	•	view lens stack for the param itself (optional advanced)

3.3 No-parameter promise

There is no “Parameters” section anywhere. Lens params are just inputs that happen to be local to the binding.

⸻

4) Safety rules (prevent runaway complexity)

4.1 Recursion limits

You must prevent infinite meta-binding graphs:
	•	A lens param may not depend (directly or indirectly) on the same binding it is configuring.
	•	error: LensParamCycle
	•	Limit lens-on-lens-param nesting depth (e.g. 3).
	•	error: LensParamNestingTooDeep

4.2 Performance constraints
	•	Lens param bindings are evaluated at signal rate, not per element.
	•	UI displays at a decimated rate (e.g. 15Hz) and never drives compilation.

4.3 Hot swap stability

Changing a default source value for a lens param must be:
	•	scrub-safe if the lens is scrub-safe
	•	transport-only if the lens is stateful (slew, debounce)
This is enforced by lens registry metadata (stabilityHint).

⸻

5) Implementation contract (what engineers build)

You will need:
	1.	LensRegistry that declares:
	•	lens id, label
	•	input TypeDesc and output TypeDesc (must be equal)
	•	param specs (TypeDesc + defaults + UI hints)
	•	compile function signature (conceptually):
	•	apply(valueArtifact, paramArtifacts, ctx) -> valueArtifact
	2.	DefaultSourceStore (or integrated into RootStore) holding DefaultSourceState by id
	3.	resolveBindingInput() used by:
	•	block input resolution
	•	listener input resolution
	•	publisher output shaping
	•	lens param resolution (recursive, with guards)

⸻

Why this is the “correct” long-term structure
	•	It preserves your “no parameters” philosophy without losing usability.
	•	It keeps defaults local, editable, persistent, and animatable.
	•	It makes lens behavior composable and consistent with the rest of the system.
	•	It does not explode patch graphs with hidden blocks.

When you say Next, I’ll give the final bullet: the canonical auto-adapter algorithm + canonical adapter table (what gets auto-inserted where, which ones are allowed, and which ones must be explicit with warnings).