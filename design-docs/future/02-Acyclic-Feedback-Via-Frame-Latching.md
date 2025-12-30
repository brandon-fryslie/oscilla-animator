NOTE: AT A HIGH LEVEL, THIS IS CANONICAL.  INCIDENTAL IMPLEMENTATION DETAILS MAY VARY
BUT THE STRATEGY AND FRAME LATCHING IMPLEMENTATION IS AUTHORITATIVE AND CANONICAL

Below is the canonical spec for feedback / cycles in Oscilla via frame-latching (a.k.a. t-1) using explicit memory. This is written to be implementable in your new compiler/runtime (IR + schedule + ValueStore), deterministic, debuggable, export-exact, and Rust/WASM friendly.

⸻

Feedback & Cycles via Latching (Memory) — Canonical Spec

0) Design goals (non-negotiable)
    1.	Acyclic schedule, always. The runtime evaluation graph for a frame is a DAG. Cycles are represented only via explicit memory reads of previous-frame values.
    2.	All feedback is explicit. A feedback loop exists iff a Memory* block is present in the loop path.
    3.	Deterministic across play/export/scrub. Same patch + same inputs + same time sample sequence ⇒ same outputs.
    4.	Works for signals, fields, and render inputs. (Except global time / TimeRoot, which is monotonic authority and cannot be fed back.)
    5.	Debuggable. Every memory read/write is a traceable event with stable identities and well-defined timing.

⸻

1) Terminology
   •	Frame: one scheduler tick at simulation time tSim[k] producing a render frame k.
   •	Signal: value varying over time; evaluated once per frame.
   •	Field: per-domain value; may be lazily evaluated, but any evaluation within a frame observes a consistent snapshot.
   •	Memory / Latch: storage that produces previous frame’s value(s) at frame k and commits new value(s) at end of frame k.

We use x[k] for “value of x at frame k”. A latch yields x[k-1] when read during frame k.

⸻

2) User-facing model

2.1 Allowed feedback semantics

A patch may contain cycles visually/structurally, but the compiler must enforce:
•	Any strongly connected component (SCC) must contain at least one Memory block along every cycle path such that the evaluation schedule is acyclic when edges through Memory are treated as cross-frame edges.

Practical user description:

“If you want feedback, you must insert a Memory block. Without it, cycles are invalid.”

2.2 What “memory” means

Memory blocks make the program compute using the previous frame:
•	y[k] = f( x[k-1], … ) where x[k-1] comes from a Memory output.

This is not wall time. It is simulation-step time.

⸻

3) Canonical Memory blocks (required set)

You need a minimal, principled set, all built on the same runtime primitive.

3.1 LatchSignal<T>
•	Inputs
•	in: Signal<T>
•	reset?: Event<trigger> (optional)
•	seed?: Scalar<number> (optional; for deterministic init variation)
•	Outputs
•	out: Signal<T> where out[k] = state[k-1]
•	Params
•	init: T (or provided via Default Source once parameters are removed)
•	resetMode: 'toInit' | 'toInputNow' (default toInit)
•	Commit rule
•	At end of frame k: state[k] = in[k] (unless reset triggers at k)

3.2 LatchField<T>

Same semantics, but stores per-element buffers (or a “Field handle” plus materialized buffers depending on your IR). Two supported modes:
•	Buffer mode (recommended for determinism/perf):
•	state is a typed array of length N (domain size) for each channel.
•	Expr mode (allowed only if safe):
•	storing an expr ID is insufficient for t-1 because expr re-eval would observe current upstream; so expr mode must snapshot outputs or be forbidden.

Canonical requirement: LatchField must latch materialized results, not an expression reference, unless you also snapshot upstream dependencies. Keep it simple: latch buffers.

3.3 DelayN<T> (composite, built from Latch*)
•	A chain of N latches.
•	Not a primitive; it exists for UX.

3.4 Integrate<T> / “State blocks”

Any stateful operator (integrate, history, envelope, counters, physics stepper) is either:
•	implemented as its own stateful step (see §7), or
•	compiled as pure ops + latches.
Either way it obeys the same “read prev, commit end” contract.

⸻

4) Type/world constraints

Memory blocks operate on:
•	Signal<T> for any T that is storable.
•	Field<T> for any T that is storable in buffers.

Global time is exempt:
•	The reserved time rail/bus cannot be fed into Memory to re-author TimeRoot or create time loops.
•	You can store derived phase/values from time, but it does not affect TimeRoot.

⸻

5) Compiler validity rules (must enforce)

5.1 No instantaneous cycles

Build a dependency graph using same-frame edges only:
•	Wire edges are same-frame.
•	Publisher/listener/adapters are same-frame.
•	Memory edges:
•	Input to memory is same-frame dependency (to produce commit value).
•	Memory output to consumers is cross-frame edge and must be treated as a source available at frame start.

Then:
•	The graph of same-frame edges must be acyclic.
•	If cycle detected in same-frame graph ⇒ CompileError: InstantCycle with SCC details and “insert latch” hint.

5.2 SCC rule (stronger and clearer)

Compute SCCs on the full graph including memory output edges as normal edges.
A cycle is allowed iff every cycle has at least one memory edge designated cross-frame.
Operationally easiest: use the same-frame graph cycle check above; if it passes, cycles are “broken” by memory.

5.3 Memory placement rule (user-friendly diagnostic)

When rejecting, the compiler must highlight:
•	the SCC nodes
•	the exact edge that closes an instantaneous loop
•	suggest a specific Memory block insertion point

⸻

6) Runtime scheduling semantics (core of “do it right”)

Each frame k has three phases:

6.1 Phase A — FrameStart (load latched outputs)
•	For every Memory instance m:
•	publish m.outSlot from stored state state[k-1] into ValueStore
•	mark as “latched snapshot for frame k”

6.2 Phase B — Evaluate (DAG execution)
•	Run all normal steps in topological order:
•	pure ops (signals/fields)
•	adapters/lenses
•	bus combine
•	materialization
•	render assembly
•	Memory inputs (m.in) may be evaluated like any other dependency; but m.out must already be present from FrameStart.

6.3 Phase C — FrameCommit (write next state)
•	For every Memory instance m:
•	read its inSlot final value for this frame k
•	commit state[k] = in[k] (subject to reset)

No part of Phase B may observe state[k]. It only observes state[k-1].

This is the key invariant that makes everything deterministic and export-exact.

⸻

7) IR & ValueStore representation (implementation-grade)

7.1 IR nodes (canonical)

You need explicit step types; don’t “hide” memory in closures.

type StepIR =
| StepLatchLoad      // FrameStart
| StepLatchCommit    // FrameCommit
| ...other steps...;

StepLatchLoad
•	Inputs: latchId
•	Outputs: outSlot (Signal or Field buffers)
•	Cache: never cached across frames (but is O(1) and reused from state storage)

StepLatchCommit
•	Inputs: inSlot, optional resetEventSlot
•	Outputs: none (writes to latch state)
•	Runs after all steps that may affect inSlot.

7.2 Latch state storage (ValueStore-adjacent but separate)

Do not store latch state in the ephemeral per-frame ValueStore. It must persist across frames and across play/export.

Structure:

interface LatchStateStore {
// keyed by latch instance id
signal: Map<LatchId, ScalarValue>;
field:  Map<LatchId, FieldBuffers>; // typed arrays per channel
// optional: ring history for debug
}

7.3 Domain changes (Field latching)

When latching fields, domain size N might change due to upstream domain changes.

Canonical rule:
•	If domain identity changes or count changes:
•	default behavior: reinitialize latch buffers to init/default for new size, and emit a diagnostic event LatchDomainReset.
•	Optional advanced behavior: remap by stable element IDs. Only do this if you have stable Domain IDs and a mapping layer. If you don’t, don’t fake it.

⸻

8) Interaction with buses / rails

Memory works across:
•	direct wiring
•	buses (publishers/listeners)
•	rails (fixed global channels)

But preserve same-frame DAG rules:
•	Bus combine and adapter chains are same-frame steps.
•	A latch can read from a bus/rail and output latched value to bus/rail/wire.
•	A latch may not be used to “feedback into time authority.”

If you later add Event world:
•	Latches for events are typically meaningless (events are ephemeral), but you may support HoldEventAsSignal instead (turn an event into a signal “sticky until cleared”).

⸻

9) Offline export exactness

Offline export is exact if and only if:
1.	Export uses the same scheduler phases A/B/C and same step order as realtime.
2.	Export iterates through an explicit sequence of simulation times tSim[k].
3.	All Memory commits use the exact same in[k] values produced during evaluation at that tSim[k].

Thus:
•	If export is “frame stepping,” it must still run latches identically.
•	If export supports sub-frame sampling (motion blur), you must define whether memory commits occur per sample or per output frame. Canonical: per output frame unless you explicitly enable “substep simulation.”

⸻

10) Debugger requirements (must be observable)

Every latch instance must emit trace points:
•	LatchLoad(latchId, frameIndex, snapshotHash, size)
•	LatchCommit(latchId, frameIndex, inHash, size, resetApplied)
•	LatchDomainReset(latchId, oldN, newN, reason)

Power user debugger must be able to show:
•	“this value is from frame k-1”
•	which latches break which cycles (SCC mapping)

⸻

11) What to avoid (anti-spec)
    •	Implicit feedback (compiler infers feedback from cycles and “adds memory automatically”). No.
    •	Same-frame reads of newly committed state. No.
    •	Silent behavior changes when IR mode vs legacy mode. No.
    •	Storing FieldExpr IDs as “latched state” unless you also snapshot dependencies. Don’t do it.

⸻

12) Minimal implementation checklist (for your refactor)
    1.	Add LatchStateStore persisted across runtime sessions.
    2.	Add StepLatchLoad and StepLatchCommit.
    3.	Ensure schedule builder places:
          •	all LatchLoad at frame start (before any eval)
          •	all LatchCommit at frame end (after dependencies)
    4.	Update cycle checker to validate same-frame DAG (memory outputs treated as frame-start sources).
    5.	Implement LatchSignal and LatchField in lowering.
    6.	Update debugger tracing for latch events.
    7.	Ensure offline export uses identical scheduler + latch store.

⸻

If you want, I can also give you the exact cycle-check algorithm (graph construction + SCC + diagnostic extraction) and the exact lowering contract for latch blocks (what slots they allocate and what IR they emit).