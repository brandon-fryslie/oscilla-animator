## **4) How this impacts** 

## **Signals**

  

This section goes deep on **Signals as the primary carrier of phase, looping, rhythm, and “instrument-ness.”**

If Fields are the texture of the image, Signals are the _music_.

---

# **A. Signals become the dominant temporal abstraction**

  

In a phase-driven, infinite system:

- **Signals** are how time is _felt_
    
- **Fields** are how time is _expressed per element_
    

  

This is a deliberate inversion from typical node systems where everything becomes per-element too early.

  

Signals now carry:

- phase
    
- rhythm
    
- energy
    
- regime
    
- palette intent
    
- global tension
    
- events / pulses
    

  

Most looping behavior lives entirely in the Signal world.

---

# **B. Signals are evaluated once per frame, per bus**

  

Architecturally:

- Each Signal bus compiles to **one evaluator**
    
- That evaluator is called **once per frame**
    
- All consumers read the same value
    

  

This has three major consequences:

1. **Performance**
    
    - Signals are cheap
        
    - Loop clocks are effectively free
        
    
2. **Coherence**
    
    - Everything “moves together” unless explicitly desynchronized
        
    
3. **Musicality**
    
    - Signals behave like shared control voltages
        
    

---

# **C. Phase is a first-class Signal domain**

  

Phase is not just number.

  

It has:

- wrap semantics
    
- cyclical meaning
    
- interpretation affordances in UI
    

  

### **Phase signals guarantee:**

- value ∈ [0, 1)
    
- wrap detection is well-defined
    
- composability with phase-aware operators
    

  

### **Phase operations include:**

- offset
    
- scale (tempo)
    
- fold
    
- quantize
    
- gate windows
    
- nonlinear warp
    

  

All are **pure Signal → Signal transforms**.

---

# **D. Looping is just phase reuse**

  

Once phase is a Signal, looping “just happens”:

- If a visual attribute listens to phase → it loops
    
- If multiple attributes listen to the same phase → they loop together
    
- If attributes listen to related phases → polyrhythm
    

  

There is no special “looping engine.”

---

# **E. Signals define** 

# **global structure**

  

Signals are where you encode:

- when things happen
    
- how often
    
- how intense
    
- which regime is active
    

  

Fields should almost never be responsible for:

- timing
    
- pacing
    
- rhythm
    
- global transitions
    

  

That separation is what keeps systems legible.

---

# **F. Events are Signals with sparse semantics**

  

Event / trigger signals are Signals with special combination rules:

- boolean-ish
    
- edge-based
    
- often derived from phase or energy
    

  

Examples:

- wrapTrigger from phase
    
- threshold crossings
    
- peak detectors
    
- quantized rhythm ticks
    

  

These are still Signals, not Fields.

---

# **G. Signal buses encourage** 

# **shared causality**

  

Because Signals are global:

- multiple blocks can publish to energy
    
- multiple attributes can interpret energy differently
    

  

This creates:

- cohesion without uniformity
    
- variation without chaos
    
- musical dynamics
    

  

This is the visual analog of:

  

> “one drum groove, many instruments responding.”

---

# **H. Adapter chains are perception, not mutation**

  

When a Signal is consumed:

- the bus value is never mutated
    
- interpretation happens at the **listener port**
    

  

This keeps Signals:

- pure
    
- reusable
    
- debuggable
    

  

It also means:

- two consumers can “feel” the same signal very differently
    
- without affecting each other
    

---

# **I. Signals and state: the only legal interaction**

  

Signals themselves are stateless _unless_:

- they are produced by a stateful block
    
- or depend on a stateful bus
    

  

This makes the flow explicit:

```
t → phase → threshold → trigger → Integrate → tension → warp phase
```

Every memory boundary is visible.

---

# **J. UX implications for Signals**

  

Because Signals matter so much, the UI must:

- always show Signal buses
    
- visualize them clearly (sparklines, rings)
    
- make it trivial to bind to them
    
- make interpretation stacks obvious
    

  

Users should _feel_ that:

  

> “Signals are the rhythm section of my system.”

---

# **K. Why this makes the system feel like a music visualizer**

  

Music visualizers work because:

- audio is a shared signal
    
- visuals interpret it differently
    
- timing coherence is global
    

  

By elevating Signals to this role, Loom:

- behaves musically
    
- encourages exploration
    
- remains infinite without repetition
    

---

When you say **Next**, I’ll continue with:

  

## **5) How this impacts** 

## **Fields**

##  **(lazy evaluation, per-element phase, identity, and how looping propagates into texture without exploding complexity)**