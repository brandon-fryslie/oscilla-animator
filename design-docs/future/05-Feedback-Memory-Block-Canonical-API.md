Canonical state-block authoring contract (Latch-powered), so every state primitive is structurally identical

This is the single pattern all stateful primitives must follow in IR. If a block can’t be expressed in this pattern, it isn’t a “state primitive” in Oscilla—it’s either (a) pure, or (b) a higher-level composite that expands into these primitives.

⸻

1) State blocks are compiled into an explicit 2-phase state machine

Every state primitive lowers into:
1.	ReadPrev: read prior state from a latch (t-1)
2.	ComputeNext: compute next state using current inputs + pulse/dt
3.	Commit: write next state back into the latch (t becomes t-1 next frame)

There is no other allowed source of hidden state.

⸻

2) Standard IR entities you must have (minimal, sufficient)

2.1 A StateCell<T> abstraction (compile-time object)

This is a lowering-time helper that ties together:
•	a latch id
•	prevSlot (outSlot from LatchRead)
•	nextSlot (inSlot to LatchCommit)
•	optional domainSlot (for fields)

type StateCellKind = "signal" | "field"; // later "event"

interface StateCell<TDesc extends TypeDesc = TypeDesc> {
kind: StateCellKind;
latchId: string;
type: TDesc;

// prev = value visible this frame (from latch read)
prevSlot: ValueSlotId;

// next = value computed this frame to be committed
nextSlot: ValueSlotId;

// for field cells only
domainSlot?: ValueSlotId;
}

2.2 Schedule steps (already from prior spec)
•	StepLatchRead
•	StepLatchCommit

2.3 A stable “tick contract”

State blocks must consume one of these (pick one, but be consistent):

Option A (recommended): dtMs: Signal<number> and tick: Event<trigger>
Option B: dtMs: Signal<number> only, and “tick” is implied each frame

Given your earlier conclusion (“pulse is simulation tick”), the clean long-term path is:
•	pulse: Event<trigger> = emitted once per simulation step
•	dtMs: Signal<number> = time delta for that step

(If you aren’t ready to add event world yet, keep the conceptual split anyway; you can represent pulse as a Signal<boolean> temporarily, but don’t let that leak into docs long term.)

⸻

3) The canonical lowering helper API (what your compiler should expose)

This is the API that makes state blocks impossible to implement “weirdly”:

interface IRBuilder {
// Allocate value slots
allocValueSlot(type: TypeDesc): ValueSlotId;

// Emit steps
addStep(step: StepIR): void;

// Declare a latch and get a StateCell back
declareStateCell(args: {
kind: "signal" | "field";
type: TypeDesc;
domainSlot?: ValueSlotId;        // required for field
init?: unknown;                  // optional override; otherwise defaultForType(type)
debugName?: string;              // used in debugger labeling
}): StateCell;

// Convenience for wiring commit
commitState(cell: StateCell, inSlot: ValueSlotId): void;

// Convenience for producing prev value
readState(cell: StateCell): ValueSlotId;
}

Required compiler invariants enforced by this API
•	A StateCell cannot exist without a latch declaration.
•	A field StateCell cannot exist without domainSlot.
•	The only way to write persistent state is commitState() (which emits LatchCommit).

If you enforce this, you won’t get “random closures with hidden state”.

⸻

4) Standard state-block template (use this for every state primitive)

A state primitive lowering function must follow this skeleton verbatim:

function lowerStatePrimitive(ctx: LowerCtx) {
// 1) Inputs (all come from slots / default sources)
const tickSlot = ctx.in("pulse");     // Event<trigger> or Signal<boolean>
const dtSlot   = ctx.in("dtMs");      // Signal<number>
const xSlot    = ctx.in("x");         // payload input(s)
// ... other inputs

// 2) Declare state cell(s)
const state = ctx.b.declareStateCell({
kind: "signal",                     // or "field"
type: ctx.type("number"),           // type desc of state payload
debugName: `${ctx.blockId}.state`,
});

// 3) Read prev
const prevSlot = ctx.b.readState(state);

// 4) Compute next (pure compute steps; no hidden state)
// next = f(prev, x, dt, tick)
const nextSlot = ctx.b.allocValueSlot(state.type);
ctx.b.addStep({
kind: "Op",                         // whatever your compute step is
op: "IntegrateEuler",               // example
inputs: { prev: prevSlot, x: xSlot, dt: dtSlot, tick: tickSlot },
out: nextSlot,
});

// 5) Commit
ctx.b.commitState(state, nextSlot);

// 6) Outputs: usually the new state (or both new and prev if you want)
return { out: nextSlot };
}

Rule: outputs exposed to downstream blocks should be the current-frame computed value (nextSlot), not the prev.
If you want a “lagged” output, provide a separate block (or a “tap prev” output explicitly).

⸻

5) How this looks for the core primitives (concrete contracts)

5.1 Integrate (Euler)

Purpose: y(t) = y(t-1) + x(t) * dt

Inputs:
•	x: Signal<number> (or Field for per-element integration)
•	dtMs: Signal<number> (from time system)
•	pulse: Event<trigger> (tick)
•	y0: DefaultSource<number> (initial)

State:
•	y_prev: number (or Field)

Compute:
•	if tick fired: y_next = y_prev + x * (dtMs / 1000)
•	else: y_next = y_prev (important for paused/step modes)

Outputs:
•	y: Signal<number> (or Field)

5.2 Delay (by N frames) / History

Delay is just a ring of state cells or one cell plus a buffer depending on representation.

For N-frame discrete delay:

State:
•	buf[0..N-1]

Compute on tick:
•	shift, insert current input at head

Outputs:
•	buf[N-1]

Canonical requirement: Delay must declare exactly N cells or one “ring buffer cell” with an internal buffer in StateStore. Pick one approach globally.

5.3 Envelope (AD / ADSR)

State:
•	phase: number (0..1) or level: number
•	plus gate tracking (if you have events)

Compute:
•	update level based on dt and mode (attack/decay)

Outputs:
•	env: Signal<number>

This stays deterministic and exportable because it’s dt-driven.

⸻

6) Field state blocks: the extra rules (domain alignment)

For any Field-state primitive (e.g., physics, particle velocity), the state must be keyed by DomainKey, and you must decide what happens when the domain changes.

Canonical behavior (safe, deterministic):
•	If DomainKey mismatches, state resets to init for all elements.

Lowering differences:
•	declareStateCell({ kind:"field", type: Field<number>, domainSlot })
•	prevSlot is a FieldHandle referencing buffer(s)
•	nextSlot should be a buffer-backed FieldHandle (computed via StepMaterializeNumber/Vec2/etc if needed)
•	commit uses domainSlot to store into StateStore under the correct DomainKey

Strong recommendation: for field-state blocks, don’t allow “expr-backed commit”. Require materialization before commit. This avoids accidentally committing closures/expr graphs into state.

⸻

7) The one hard prohibition

A state primitive may not:
•	allocate JS arrays as implicit storage
•	close over mutable locals in closures
•	mutate global singletons
•	read wall time

If a block needs any of that, it isn’t a primitive. Make it a composite that expands to primitives (or a runtime system feature, but then it’s not patch-authored).

⸻

8) Why this is the “baked-in” foundation

With this contract:
•	cycles are explicit and safe (they only exist through latches)
•	runtime is schedulable and deterministic
•	debugger can trace state read/commit cleanly
•	offline export becomes exact (replay tick/dt sequence)
•	Rust/WASM becomes straightforward (StateStore is a typed table; no closures)

⸻

If you say Next, I’ll give you the compile-time cycle detection + auto-fix algorithm that:
•	detects illegal same-frame cycles
•	identifies insertion points
•	can optionally propose “insert latch here” in the UI
•	and produces deterministic diagnostics (no heuristics that change run-to-run).