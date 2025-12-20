## **1) Foundational architecture for phase, looping, and infinite animation**

  

This is the bedrock: the exact conceptual model that makes “infinite, deterministic, multi-scale looping” real _without_ timelines, and that integrates cleanly with buses, lazy Fields, and scrub/performance modes.

---

# **A. The Core Idea**

  

You do **not** build “an animation that lasts 5s.”

You build a **system** that is evaluated at any time t, forever.

  

Looping and phase aren’t special cases—they are **first-class time coordinate systems** that live alongside absolute time.

  

So the architecture provides:

- **Canonical time** (seconds) for determinism and state
    
- **Derived loop clocks** (phase signals) for rhythmic structure
    
- **Multi-scale phase** for “infinite but rhyming”
    
- **Explicit state** only where you mean it
    

---

# **B. Time primitives: the minimum set**

  

## **B1) Canonical time context (the only true clock)**

  

Every evaluation receives a TimeCtx:

- t: absolute time in seconds (double)
    
- dt: delta time in seconds (double)
    
- frame: integer tick (monotonic)
    
- mode: "scrub" or "performance"
    

  

**Rule:** No block reads wall-clock or global time. Only TimeCtx.

---

## **B2) Loop clocks are Programs, not global engine features**

  

A “loop” is not an engine state. It is a **block/system** that produces buses:

- phase: 0..1 repeating coordinate
    
- optional wrapTrigger: a trigger on wrap
    
- optional cycleIndex: integer count of wraps (useful for macro variation)
    

  

This means you can have:

- many loops
    
- nested loops
    
- interacting loops
    
- loops inside composites
    

  

All deterministic, because they’re derived from t or explicit state.

---

# **C. Two categories of loop clocks**

  

## **C1) Derived (scrub-perfect) clocks**

  

These are computed directly from t:

- phase = fract((t + offset) / period)
    
- cycleIndex = floor((t + offset) / period)
    

  

Properties:

- perfect scrubbing
    
- no drift
    
- no state
    
- deterministic across sessions
    

  

This is the default and should cover most looping behaviors.

---

## **C2) Stateful (performance-first) clocks**

  

These evolve via explicit state blocks (Integrate / PhaseAccumulator).

  

Properties:

- can drift, wander, respond to input
    
- supports “human” timing, swing, elastic tempo, feedback
    
- in scrub mode: must define reintegration policy (deterministic)
    

  

These are how you get **ambient evolution** without randomness.

---

# **D. Multi-scale looping: “infinite but rhyming”**

  

This is achieved by layering **several loop clocks** at different time scales:

- micro loop: 2–8 seconds (visible motion)
    
- meso loop: 20–60 seconds (phrase)
    
- macro loop: 2–10 minutes (regime shifts)
    

  

Technically this is trivial once loops are buses:

- phaseA, phaseB, phaseC
    
- derived relationships: phaseC = phaseB warped by tension, etc.
    

  

The architecture supports this by:

- making phase a first-class Signal domain
    
- making phase transforms cheap and composable
    

---

# **E. Phase as a coordinate system (not just a number)**

  

Phase isn’t just “0..1.” It is a _time coordinate_ that supports operations:

- wrap / fold
    
- ease curves
    
- quantize to steps
    
- gating windows
    
- phase offset per element (Field phase offset)
    
- phase warp (nonlinear mapping)
    

  

**Key architectural rule:**

Phase operations are pure and composable; they never imply hidden timing.

---

# **F. How phase interacts with state (the exact boundary)**

  

State is only allowed through explicit memory blocks. Therefore:

- Derived phase clocks can never create feedback loops
    
- Stateful clocks can participate in legal feedback only if they cross memory boundaries
    
- Cycle legality is determined by SCC detection, as already planned
    

  

This makes phase safe as a ubiquitous tool.

---

# **G. The “three time spaces” model**

  

To keep the system coherent, treat time as having three spaces:

1. **Absolute time** (t)
    
2. **Loop time** (phase, cycleIndex)
    
3. **State time** (values evolved by integrators/delays)
    

  

Most patches use (1) and (2).

Ambient evolution comes from controlled use of (3).

---

# **H. Why this architecture is WASM-ready**

  

Because evaluation reduces to:

- batch evaluation of Signals at t
    
- batch evaluation of Fields over an explicit element domain at t
    
- with state blocks as explicit memory stores
    

  

No hidden engine behavior. No UI-dependent time logic. No timeline coupling.

---

# **I. What “looping mode” means architecturally**

  

Looping is not “the engine repeats the animation.”

Looping means:

- you are driving most visible behavior from **phase buses**
    
- and optionally using cycleIndex + slow state to evolve across cycles
    

  

So “Loop Mode” in UI is just a **preset of time buses and visualizations**, not a different runtime.

---

When you say **Next**, I’ll deliver the next section in a coherent order:

  

## **2) Overview of the system as a whole (how all pieces—UI, buses, signals, fields, state, performance/scrub—fit together into one mental model).**