Canonical lowering + runtime contract for feedback via Latch (t-1)

This is the implementation-grade spec for how “memory blocks” work in the IR compiler + scheduled runtime + ValueStore. It’s written so a junior can implement it without inventing semantics.

⸻

0) Terminology
   •	Latch = the canonical memory primitive that converts an instantaneous dependency into a cross-frame dependency.
   •	t-1 = “previous simulation tick”, not wall time.
   •	Frame = one scheduler execution at simulation tick k producing outputs for tick k.

There are no “magic feedback loops.” Feedback exists only if a latch exists.

⸻

1) Canonical primitives (what exists)

You need exactly these IR-visible primitives for “memory”:

1.1 LatchSignal<T>
•	Purpose: store one scalar/signal value per frame.
•	Type: Signal<T> in, Signal<T> out (but out is “previous-frame value”).

1.2 LatchField<T>
•	Purpose: store one per-element field buffer across frames, keyed by a Domain handle.
•	Type: Field<T> in, Field<T> out (out is “previous-frame field” aligned to current domain).

1.3 LatchEvent<E> (optional, but recommended)
•	Purpose: store event-latched state (e.g., “did trigger happen last frame”).
•	If you already have event world, it’s the correct place for “edge detectors”.

If you don’t implement events yet, skip 1.3, but do not “fake it” with signals long term.

⸻

2) IR schema additions

2.1 ValueStore slots

You need slot kinds that can reference both the current-frame computed value and previous-frame stored value.

Canonical: ValueSlot always holds “current-frame value”, and latches read/write from a separate StateStore owned by runtime.

So:
•	ValueStore: per-frame ephemeral values (computed this frame)
•	StateStore: persistent values across frames (latched memory)

2.2 Latch declarations from lowering

Every latch block lowers to:
•	a normal output ValueSlot that produces the latched output for this frame
•	a LatchDecl that tells schedule builder to create:
•	StepLatchRead (runs early in frame; writes output ValueSlot from StateStore)
•	StepLatchCommit (runs late; reads input ValueSlot and writes StateStore)

Canonical IR:

type LatchId = string;

type LatchKind = "signal" | "field"; // (add "event" later)

interface LatchDecl {
latchId: LatchId;
kind: LatchKind;
valueType: TypeDesc;         // exact payload type (number, vec2, color, ...)
inSlot: ValueSlotId;         // value computed this frame (to be committed)
outSlot: ValueSlotId;        // value available this frame (from prior state)
// Field-only:
domainSlot?: ValueSlotId;    // Domain handle slot for alignment / sizing
}

2.3 Schedule step types

interface StepLatchRead {
kind: "LatchRead";
latchId: LatchId;
outSlot: ValueSlotId;
// Field-only:
domainSlot?: ValueSlotId;
// Cache: read is “free”; no cache key needed
}

interface StepLatchCommit {
kind: "LatchCommit";
latchId: LatchId;
inSlot: ValueSlotId;
// Field-only:
domainSlot?: ValueSlotId;
// Cache key: optional; commit can skip if input unchanged, but not required
}


⸻

3) Lowering contract (compiler responsibility)

3.1 Latch block lowering (Signal)

When lowering LatchSignal<T>:
•	Allocate:
•	outSlot (Type = Signal<T> or Scalar<T> depending on your IR conventions)
•	inSlot comes from the input connection/default source (normal slot)
•	Emit a LatchDecl:
•	kind="signal"
•	valueType = T
•	inSlot, outSlot

Important: outSlot is not computed from inSlot in the graph. There is no edge inSlot -> outSlot in G_same.

3.2 Latch block lowering (Field)

LatchField<T> must also carry the Domain context so the runtime can size/align buffers.

Lowering must provide:
•	domainSlot: the domain handle slot used by the field this frame.
•	inSlot: the FieldExprId or field handle that represents the field-to-be-committed.
•	outSlot: a field handle representing “latched output field” for consumers.

This implies your IR must support a “Field value” that can be either:
•	an expression handle (FieldExprId) evaluated via materialize steps, OR
•	a “direct buffer-backed field handle” provided by latch read.

Canonical choice: represent latch out as a special FieldExprId variant FieldExpr::FromSlot(slot) or FieldExpr::Latched(latchId).

But the simplest runtime is:
•	LatchRead materializes the latched field into StateStore buffers
•	outSlot is a ValueStore slot containing a FieldHandle pointing to those buffers for the current frame.

So you need:

type FieldHandle =
| { kind: "expr"; exprId: FieldExprId }
| { kind: "buffer"; bufferSlot: BufferSlotId; elemType: TypeDesc };

Then:
•	latch read writes {kind:"buffer", bufferSlot: <ephemeral slot>} into outSlot.

3.3 Default initial value requirement

Every latch must have a deterministic init value.

Rule:
•	If the latch input is ultimately derived from a Default Source, use that as init.
•	Otherwise, latch block definition must provide init:
•	number: 0
•	vec2: (0,0)
•	color: (0,0,0,1)
•	etc.

Compiler must attach init metadata into LatchDecl OR the runtime must have a global defaultForType(TypeDesc) that is stable.

No “undefined on first frame”. Ever.

⸻

4) Schedule building contract

Given a compiled program with:
•	normal dependency steps (ops, materialize, render assemble, etc.)
•	a set of LatchDecls

The scheduler must insert latch steps with strict ordering:

4.1 Frame phase order
1.	LatchRead phase (all reads)
2.	Compute phase (all normal steps in topo order)
3.	LatchCommit phase (all commits)
4.	RenderAssemble / Output (if your render is separate, it belongs in Compute; the important part is commits must run before end-of-frame)

Canonical ordering rule:
•	LatchRead steps have no deps except the Domain slot (field-only) must be computed before read if domain itself is computed.
•	Normal compute steps may depend on outSlot of latch read.
•	LatchCommit must depend on inSlot being computed (and domain computed for field).
•	LatchCommit must run after all compute that feeds latch inputs.

4.2 Cycle check integration

During dependency graph construction G_same:
•	Add edges:
•	domainSlot -> LatchRead (field-only)
•	LatchRead -> outSlot
•	inSlot -> LatchCommit
•	domainSlot -> LatchCommit (field-only)

Do not add outSlot -> LatchCommit or LatchCommit -> outSlot.

This is what breaks same-frame cycles.

⸻

5) Runtime execution contract

5.1 StateStore shape

StateStore is keyed by latchId.

interface StateStore {
// signal
signal: Map<LatchId, unknown>;

// field
field: Map<LatchId, {
domainKey: DomainKey;      // to detect domain shape changes
buffers: Record<string, ArrayBufferView>; // e.g. one Float32Array for number, or 2 arrays for vec2, etc.
}>;
}

Where:
•	DomainKey is stable identity describing the domain’s size and mapping identity across frames.
•	Minimal: { n: number, domainId: string }
•	Better: { n: number, idSalt: string, stableIdsHash: u64 } (if you have stable IDs)
•	You already have Domain authority primitives; use their stable identity.

5.2 StepLatchRead semantics

Signal latch read
•	If StateStore has value for latchId, write it to outSlot
•	Else write init default

Field latch read
•	Read domainHandle from domainSlot
•	Compute DomainKey
•	If StateStore has field for latchId and keys match: reuse stored buffers
•	If key mismatch:
•	Reinitialize buffers for new domain shape using init default
•	Replace stored domainKey/buffers
•	Write a FieldHandle{kind:"buffer", ...} (pointing to ephemeral buffer slots that alias the StateStore buffers or a copy)

Important: You may alias StateStore buffers for read so no copy is needed, as long as you treat them read-only until commit.

5.3 StepLatchCommit semantics

Signal commit
•	Read inSlot value
•	Store into StateStore.signal[latchId]

Field commit
•	Read domainHandle, compute DomainKey
•	Evaluate the input field handle:
•	if {kind:"expr"}: you must materialize into a temp buffer first (or require that LatchCommit depends on a materialize step—both are fine; canonical is: commit reads a buffer-backed handle)
•	if {kind:"buffer"}: copy/assign buffers
•	Store buffers into StateStore.field[latchId], keyed by DomainKey

Canonical rule for performance:
•	Commit wants buffer-backed field input. So schedule builder should ensure a Materialize<T> step exists upstream and feed its output buffer handle into the latch’s inSlot.

⸻

6) Domain change handling (the “must not be janky” rule)

If domain shape changes (N changes, or identity mapping changes):
•	Latch output for that frame becomes the init default for new elements (or all elements if mapping unknown).
•	If you can map old IDs to new IDs, you may preserve where possible, but only if it’s deterministic and cheap.

Canonical minimal rule (safe and deterministic):
•	If DomainKey differs → treat as cold reset for that latch’s field state.

This is fine for correctness and offline export. You can later add optional ID-based remapping without changing semantics.

⸻

7) How state blocks consume pulse (ties into your earlier “tick” insight)

State blocks should not implicitly step “per frame” via hidden runtime. They step off pulse.

In practice:
•	Integrate, Delay, History, Envelope, etc. should all:
•	accept pulse (or dt) explicitly OR
•	be hardwired by lowering to depend on the system pulse rail.

With latches, the canonical pattern for a stateful block is:
•	Read previous state from latch out (t-1)
•	Compute new state using current inputs and dt/pulse
•	Commit new state using latch commit

So for every stateful primitive, the IR lowering literally emits:
•	LatchDecl for its internal state
•	steps that compute next state
•	commit

This makes:
•	offline export exact
•	debugging obvious (state is explicit)
•	cycle breaking automatic

⸻

8) Compile-time diagnostics specific to latches (required)

Add these errors:
1.	InstantCycle (from prior message)
2.	MissingLatchInCycleSuggestion (only if no legal insertion points found; usually means type mismatch)
3.	LatchTypeMismatch (input type doesn’t match latch type)
4.	LatchDomainMissing (field latch without domainSlot)
5.	LatchCommitNeedsBuffer (if you choose “commit requires buffer-backed field” and schedule didn’t provide it)

Each must include:
•	involved blockIds/ports
•	a short fix instruction

⸻

9) Determinism / export guarantee (why this works)

Because:
•	the scheduler defines a strict per-frame order
•	latches are the only cross-frame state
•	state updates occur only on pulse (simulation tick)
•	all init values are deterministic

Therefore:
•	playing in editor at 60fps and exporting at 240fps (or offline fixed-step) yields the same simulation trajectory, assuming the same pulse/dt sequence.

⸻

If you say Next, I’ll give the third piece: the canonical API surface for authoring stateful primitives using latches (a template for Integrate, Delay, Envelope, etc.), so every state block becomes identical in structure and you don’t get “one-off” semantics.