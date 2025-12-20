## **3) How this impacts patches**

  

This section defines **what a patch structurally is** in a phase-driven, infinite system—and how authoring, saving, editing, and evolving patches changes as a result.

  

This is not cosmetic. Phase/looping fundamentally redefines what a “finished” patch means.

---

# **A. What a patch represents now**

  

A patch is no longer:

  

> “a graph that produces a result over a fixed time span.”

  

A patch is:

  

> **a persistent system definition that can be evaluated at any time t, forever.**

  

This has several immediate consequences.

---

# **B. Patch structure at rest (data model implications)**

  

A patch now consists of:

1. **Block graph**
    
    - Stateless blocks
        
    - Explicit state blocks
        
    
2. **Bus definitions**
    
    - World (Signal / Field)
        
    - Domain (phase, number, color, etc.)
        
    - Combine mode
        
    - Silent value
        
    
3. **Publishers**
    
    - Block output → bus
        
    - sortKey
        
    
4. **Listeners**
    
    - Bus → block input
        
    - Per-port interpretation stacks
        
    
5. **Optional composite definitions**
    
6. **No notion of “start” or “end”**
    

  

Critically:

- There is **no canonical “duration”** for the patch
    
- Any notion of looping is encoded in phase buses and state, not metadata
    

---

# **C. What a “looping patch” looks like structurally**

  

A looping patch is not marked as looping.

  

Instead, it **contains**:

- one or more phase buses
    
- one or more systems publishing into them
    
- consumers that bind to phase
    

  

Example (conceptual):

- Bus: phaseA (Signal)
    
- Publisher: Oscillator(period=6s) → phaseA
    
- Consumer: Geometry rotation ← phaseA
    
- Consumer: Stroke dash offset ← phaseA
    

  

Nothing special. No flags. No modes.

  

The _presence_ of phase-driven influence is what makes it loop.

---

# **D. Multi-scale looping inside one patch**

  

Because loops are just buses, a single patch may include:

- phaseFast (2s)
    
- phaseMedium (18s)
    
- phaseSlow (180s)
    
- cycleSlow (cycle index of phaseSlow)
    

  

Each one:

- can drive different attributes
    
- can interact with others
    
- can be modified by slow state (Integrate, Delay)
    

  

This means a patch naturally develops:

- phrases
    
- motifs
    
- long-term evolution
    

  

Without any timeline constructs.

---

# **E. Patch editing lifecycle (authoring reality)**

  

## **E1) There is no “final frame”**

  

Users do not author a patch to end at a moment.

  

Instead they:

- tune behaviors
    
- balance influence strengths
    
- listen to the system over time
    
- adjust until it _feels right_
    

  

The patch is “done” when:

  

> it remains interesting under observation, not when it finishes.

---

## **E2) Saving a patch saves a** 

## **system**

## **, not an animation**

  

Saved patches contain:

- no cached frames
    
- no baked time
    
- no recorded state (unless explicitly snapshotted)
    

  

Opening a patch means:

- evaluating it at current t
    
- optionally restoring user-chosen state snapshots
    

---

# **F. Patch evolution & versioning**

  

Phase-driven patches tend to be _continuously refined_.

  

Therefore:

- patches are expected to evolve
    
- small edits should not cause catastrophic behavior changes
    

  

This is why:

- derived phase clocks are preferred by default
    
- state blocks are opt-in and visible
    
- live edits preserve or crossfade state when possible
    

---

# **G. Impact on patch migration & compatibility**

  

Older patches (wire-based, duration-oriented):

- remain valid
    
- load unchanged
    
- can be explicitly migrated
    

  

Migration tools may:

- introduce a default phase bus
    
- rebind time-based parameters to phase
    
- warn where semantics change
    

  

But migration is always **explicit**, never silent.

---

# **H. What patches are now** 

# **good**

#  **at**

  

This architecture makes patches especially strong for:

- ambient visuals
    
- generative branding
    
- installations
    
- music-reactive systems
    
- long-running backgrounds
    
- visual instruments
    

  

And intentionally weaker at:

- precise narrative timing
    
- one-off cinematic edits
    
- frame-perfect choreography
    

  

That’s a feature, not a limitation.

---

# **I. How this changes how users think**

  

Users stop thinking:

  

> “How long is this animation?”

  

They start thinking:

  

> “What rhythms exist here?”

> “What evolves?”

> “What responds to what?”

> “What happens over minutes vs seconds?”

  

That mental shift is the entire point of the phase system.

---

When you say **Next**, I’ll continue in order with:

  

## **4) How this impacts Signals (domains, evaluation, phase semantics, performance implications)**