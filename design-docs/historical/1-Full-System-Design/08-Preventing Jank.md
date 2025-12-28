## **8) Preventing visual jank during edits to the patch**

  

_(Exact mechanisms, guarantees, and edge-case handling)_

  

This section defines **how the system remains visually stable, playable, and trustworthy while the user edits a running infinite system**. This is a make-or-break property for an instrument-like tool.

---

# **A. The non-negotiable guarantee**

  

> **Edits must never cause hard visual discontinuities unless the user explicitly requests one.**

  

That means:

- no sudden jumps
    
- no flicker
    
- no full resets
    
- no “everything recompiled so it restarted”
    

  

Even when the patch changes structurally.

---

# **B. The core strategy: Compile → Validate → Swap**

  

The runtime always operates with **two programs**:

1. **Active Program** (currently rendering)
    
2. **Candidate Program** (being compiled)
    

  

### **Editing flow**

1. User edits patch
    
2. Compiler runs _off the render path_
    
3. If compilation fails:
    
    - Active Program continues unchanged
        
    - Error is surfaced locally
        
    
4. If compilation succeeds:
    
    - Candidate Program is _prepared_
        
    - System performs a **controlled swap**
        
    

  

At no point is rendering blocked.

---

# **C. Program identity and compatibility**

  

Each compiled program carries:

- a **structural signature**
    
- a **state layout description**
    
- a **bus layout map**
    

  

This allows the system to decide _how safe_ a swap is.

  

### **Compatibility tiers**

1. **Fully compatible**
    
    - Same buses
        
    - Same state blocks
        
    - Same domains
        
    
2. **Partially compatible**
    
    - Some state preserved
        
    - Some state remapped
        
    
3. **Incompatible**
    
    - Requires reset or crossfade
        
    

  

This is a deterministic decision, not a guess.

---

# **D. State handling during swaps (the hard part)**

  

Stateful blocks are the primary source of jank if mishandled.

  

### **D1) State mapping**

  

When possible:

- old state is mapped into new state by:
    
    - block id
        
    - role
        
    - domain
        
    
- integrators keep accumulated values
    
- delays keep buffers
    

  

This preserves continuity.

---

### **D2) State reset (explicit and visible)**

  

If state cannot be mapped:

- the system resets only the affected state
    
- a subtle UI badge indicates “state restarted”
    
- no silent resets
    

  

This avoids confusing “why did this suddenly calm down?”

---

### **D3) Output crossfading (last resort)**

  

If outputs are incompatible:

- render output A and B simultaneously
    
- crossfade over ~100–300ms
    
- discard old program after fade
    

  

This guarantees visual continuity even in drastic edits.

---

# **E. Signals vs Fields during edits**

  

### **Signals**

- Cheap to recompute
    
- Usually swapped instantly
    
- Phase signals are especially safe (derived from t)
    

  

### **Fields**

- Lazy evaluation prevents mid-edit recomputation storms
    
- FieldExpr DAGs can be swapped atomically
    
- Materialization only occurs after swap
    

  

Result:

- No partial per-element updates
    
- No half-applied changes
    

---

# **F. Buses as stability anchors**

  

Because buses are **named, persistent structures**:

- bindings survive block rearrangements
    
- changing a producer doesn’t invalidate consumers
    
- many edits don’t affect output at all
    

  

This is a huge stability win over wire-based graphs.

---

# **G. UI feedback loop (psychological jank prevention)**

  

Even when nothing breaks visually, the _user must feel safe_.

  

Therefore:

- Immediate visual acknowledgement on edit
    
- Clear compile-in-progress indicator
    
- Explicit error localization
    
- Never a frozen or blank canvas
    

  

The user always knows:

  

> “The system is still alive.”

---

# **H. Scrub vs performance considerations**

  

### **Scrub mode**

- Derived phase systems re-evaluate deterministically
    
- State blocks show reconstruction markers
    
- Scrubbing never corrupts state
    

  

### **Performance mode**

- State evolves continuously
    
- Edits preserve state when possible
    
- Swaps are seamless
    

  

The mode difference is visible and predictable.

---

# **I. What we explicitly do** 

# **not**

#  **allow**

  

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

# **J. Why this enables play, not fear**

  

Because:

- nothing breaks catastrophically
    
- mistakes are reversible
    
- experimentation is rewarded
    
- systems feel _alive_, not fragile
    

  

This is what allows users to treat patches as **living instruments**, not brittle constructions.

---

When you say **Next**, I’ll continue with:

  

## **9) How this makes the system intuitive, fun, engaging (why people want to** 

## **stay**

##  **inside infinite time rather than “finish” an animation).**