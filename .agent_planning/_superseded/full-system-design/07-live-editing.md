# Live Editing and Jank Prevention

How the system remains visually stable, playable, and trustworthy while the user edits a running infinite system.
This is a make-or-break property for an instrument-like tool.

---

## The Non-Negotiable Guarantee

> **Edits must never cause hard visual discontinuities unless the user explicitly requests one.**

That means:
- no sudden jumps
- no flicker
- no full resets
- no "everything recompiled so it restarted"

Even when the patch changes structurally.

---

## The Core Strategy: Compile → Validate → Swap

The runtime always operates with **two programs**:
1. **Active Program** (currently rendering)
2. **Candidate Program** (being compiled)

### Editing Flow

1. User edits patch
2. Compiler runs off the render path
3. If compilation fails:
   - Active Program continues unchanged
   - Error is surfaced locally
4. If compilation succeeds:
   - Candidate Program is prepared
   - System performs a **controlled swap**

**At no point is rendering blocked.**

---

## Program Identity and Compatibility

Each compiled program carries:
- a **structural signature**
- a **state layout description**
- a **bus layout map**

This allows the system to decide how safe a swap is.

### Compatibility Tiers

1. **Fully compatible**
   - Same buses, same state blocks, same domains

2. **Partially compatible**
   - Some state preserved, some state remapped

3. **Incompatible**
   - Requires reset or crossfade

This is a deterministic decision, not a guess.

---

## State Handling During Swaps (The Hard Part)

Stateful blocks are the primary source of jank if mishandled.

### State Mapping

When possible:
- old state is mapped into new state by: block id, role, domain
- integrators keep accumulated values
- delays keep buffers

This preserves continuity.

### State Reset (Explicit and Visible)

If state cannot be mapped:
- the system resets only the affected state
- a subtle UI badge indicates "state restarted"
- no silent resets

This avoids confusing "why did this suddenly calm down?"

### Output Crossfading (Last Resort)

If outputs are incompatible:
- render output A and B simultaneously
- crossfade over ~100–300ms
- discard old program after fade

This guarantees visual continuity even in drastic edits.

---

## Signals vs Fields During Edits

### Signals
- Cheap to recompute
- Usually swapped instantly
- Phase signals are especially safe (derived from t)

### Fields
- Lazy evaluation prevents mid-edit recomputation storms
- FieldExpr DAGs can be swapped atomically
- Materialization only occurs after swap

Result:
- No partial per-element updates
- No half-applied changes

---

## Buses as Stability Anchors

Because buses are **named, persistent structures**:
- bindings survive block rearrangements
- changing a producer doesn't invalidate consumers
- many edits don't affect output at all

This is a huge stability win over wire-based graphs.

---

## UI Feedback Loop (Psychological Jank Prevention)

Even when nothing breaks visually, the user must feel safe.

Therefore:
- Immediate visual acknowledgement on edit
- Clear compile-in-progress indicator
- Explicit error localization
- Never a frozen or blank canvas

The user always knows:
> "The system is still alive."

---

## Scrub vs Performance Considerations

### Scrub Mode
- Derived phase systems re-evaluate deterministically
- State blocks show reconstruction markers
- Scrubbing never corrupts state

### Performance Mode
- State evolves continuously
- Edits preserve state when possible
- Swaps are seamless

The mode difference is visible and predictable.

---

## What We Explicitly Do Not Allow

To prevent jank, we forbid:
- implicit state creation
- hidden randomness
- engine-level time jumps
- automatic global resets
- silent fallbacks

Every discontinuity is either:
- prevented
- smoothed
- or explicitly communicated

---

## No-Jank Live Edits: The Exact Alignment Points

### 1) Stable identity originates in Domain

As long as Domain instance remains:
- Fields stay aligned
- per-element hash stays stable
- render instances stay consistent

### 2) Mappers do not create/kill identity

GridMap/CircleMap only map IDs to positions.
Changing mapper settings moves things; it doesn't reorder who is who.

### 3) Runtime swap preserves state by instance IDs

State blocks keyed by:
- block instance ID
- internal state layout
- domain IDs where relevant

### 4) Graph edits are atomic

Compile new plan → validate → swap.
Keep old running until new ready.
Optional crossfade on renderer output if major topology changed.

### 5) Avoid coupling count changes to performance-critical signals

Let count changes be:
- explicit
- slow
- deliberate

Count changes are the largest source of unavoidable jank; treat them as special.

---

## Why This Enables Play, Not Fear

Because:
- nothing breaks catastrophically
- mistakes are reversible
- experimentation is rewarded
- systems feel alive, not fragile

This is what allows users to treat patches as **living instruments**, not brittle constructions.
