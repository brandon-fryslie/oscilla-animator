## **2) Overview of the system as a whole**

  

This is the “one mental model” view: how phase/looping/infinite animation works across **runtime**, **signals**, **fields**, **buses**, **state**, **UI modes**, and **live editing**—as a single coherent system.

---

# **A. What “an animation” is in Loom**

  

An animation is not a timeline. It is:

  

> **A patch that evaluates into a RenderTree for any time t, forever.**

  

Looping is not repeating a clip. It is choosing to **drive visible motion from phase coordinates** (0..1 repeating signals), optionally layered at multiple scales.

---

# **B. The runtime stack (top to bottom)**

  

## **B1) Time engine produces** 

## **TimeCtx**

  

Every frame, the engine produces exactly one input to the whole system:

- TimeCtx = { t, dt, frame, mode }
    

  

Where:

- mode is "performance" (evolving) or "scrub" (reconstructable)
    

  

No other time source exists.

---

## **B2) Compiler turns patch into evaluators**

  

Compilation yields a deterministic set of evaluators:

- **Signal evaluators**: Signal<T> := (TimeCtx, EvalCtx) -> T
    
- **Field evaluators**: Field<T> := (Domain, TimeCtx, EvalCtx) -> buffer<T>
    
- **Programs**: Program<RenderTree> := (TimeCtx, EvalCtx) -> RenderTree
    

  

Buses sit between these: they compile to either a Signal or a Field evaluator depending on bus world.

---

## **B3) Buses create a shared “influence ecology”**

  

The patch is fundamentally:

- blocks that **publish** into named buses
    
- blocks/params that **consume** buses through explicit interpretation boundaries
    

  

This is the send/return model for visuals:

- shared causes
    
- many interpretations
    

---

# **C. The phase/looping layer: what it actually is**

  

## **C1) Loops are not engine features; they are bus-producing systems**

  

A “Loop” is simply a system that publishes:

- phaseX (0..1 repeating Signal)
    
- wrapX (trigger on phase wrap)
    
- cycleX (integer-ish Signal, optional)
    

  

They can be derived from t (scrub-perfect) or stateful (performance-evolving), but both are explicit.

---

## **C2) Ambient is “multi-scale phase + slow state”**

  

Infinite, non-repeating feel comes from layering:

- multiple phase clocks at different periods
    
- slow-evolving buses derived from integrators/delays
    
- occasional events from thresholding, peak detection, regime switching
    

  

Still deterministic, still inspectable.

---

# **D. How this affects Signals vs Fields (conceptually)**

  

## **D1) Signals: global, continuous influence**

  

Signals are the “instrument control voltages”:

- phase
    
- energy
    
- palette
    
- tension
    
- pulse
    

  

They are cheap to compute and easy to visualize in the Bus Board.

  

Signals are where most “looping UX” lives.

---

## **D2) Fields: per-element variation over a domain**

  

Fields are “how each element experiences the world”:

- per-particle velocity
    
- per-point phase offset
    
- per-letter grain
    
- per-stroke turbulence
    

  

Fields always evaluate against an explicit Element Domain.

  

Looping affects fields in two ways:

1. fields can consume phase signals and interpret them per element
    
2. fields can create their own per-element phase offsets or per-element triggers derived from phase buses
    

---

# **E. Scrub vs performance: what changes and what doesn’t**

  

## **E1) What never changes**

- The patch graph
    
- Bus semantics
    
- Type system
    
- Phase math for derived clocks
    
- Deterministic results for derived (scrub-safe) systems
    

  

## **E2) What changes**

  

Only stateful blocks change behavior depending on mode:

- In **performance**, state evolves incrementally with dt
    
- In **scrub**, state is either:
    
    - reconstructed deterministically (reintegration), or
        
    - declared “transport-only” and visibly marked
        
    

  

The user can always tell which is which.

---

# **F. Live editing without jank (system-wide story)**

  

When the user changes the patch:

1. the editor compiles a new evaluator set
    
2. the runtime keeps running the previous evaluators until the new ones are valid
    
3. on swap:
    
    - stateless parts switch instantly
        
    - stateful parts either:
        
        - map old state into new state (when compatible), or
            
        - crossfade outputs over a short window, or
            
        - restart state explicitly (if user chooses)
            
        
    

  

This means the system is always playable during construction.

---

# **G. What “Loop Mode” is in the product**

  

Loop Mode is primarily:

- a **UI presentation** of time as cycles (phase rings, wrap ticks, bar markers)
    
- a **default patch scaffold** that includes loop buses (phaseA, phaseB, macroPhase)
    
- a **set of recommended bindings** and perception transforms that turn phase into motion
    

  

It is not a separate runtime and not a clip container.

---

# **H. The user’s lived experience (one sentence)**

  

> “I create shapes, create a few clock-like buses, and then patch influences into them and out of them—so the system develops its own rhythm and character.”

---

When you say **Next**, I’ll deliver:

  

## **3) How this impacts patches (data model, authoring workflow, compatibility, and what a “looping patch” structurally looks like).**