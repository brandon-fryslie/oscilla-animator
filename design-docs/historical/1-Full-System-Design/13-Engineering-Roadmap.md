## **13) Engineering roadmap**

  

_(Concrete sequencing: how to build this correctly, without backtracking, to a first released product)_

  

This roadmap assumes:

- **correctness > speed**
    
- **no fallbacks**
    
- **lazy Fields from day one**
    
- **bus-centric architecture is non-negotiable**
    
- **~1 year horizon**
    

  

The goal is not a demo.

The goal is a **stable, expressive instrument** that can grow for years.

---

# **A. Guiding principles for the roadmap**

  

Before phases, three hard rules:

1. **No provisional architectures**
    
    If something will be removed later, don’t build it now.
    
2. **Structural work before UX polish**
    
    UI only lands once semantics are locked.
    
3. **Every phase must produce a shippable internal milestone**
    
    Even if not user-facing.
    

---

# **B. Phase 0 — Lock invariants (2–3 weeks)**

  

### **Goal**

  

Make it impossible to accidentally violate the system’s core truths.

  

### **Work**

- Freeze and document:
    
    - TimeCtx contract
        
    - Signal vs Field distinction
        
    - Bus immutability rules
        
    - Explicit state-only memory
        
    - Element Domain rules
        
    
- Add compile-time assertions for:
    
    - world mismatches
        
    - domain mismatches
        
    - illegal cycles
        
    
- Remove or forbid:
    
    - implicit wiring shortcuts
        
    - hidden time access
        
    - per-element eager APIs
        
    

  

### **Deliverable**

- Compiler fails loudly on invalid constructs
    
- Architecture doc becomes enforceable, not aspirational
    

---

# **C. Phase 1 — Bus-aware compiler core (6–8 weeks)**

  

### **Goal**

  

Make buses _real_ in the compiler and runtime.

  

### **Work**

- Unified dependency graph:
    
    - BlockOut nodes
        
    - BusValue nodes
        
    
- Deterministic ordering:
    
    - sortKey + stable ID
        
    
- Bus compilation pipeline:
    
    - publisher collection
        
    - adapter application
        
    - combine
        
    
- Signal buses end-to-end
    
- SCC detection + memory block registry
    
- Strict failure on illegal graphs
    

  

### **Deliverable**

- Patches compile and evaluate entirely through buses
    
- Wire-only graphs still supported but deprecated internally
    
- No UI changes yet
    

---

# **D. Phase 2 — Lazy Field foundation (8–10 weeks)**

  

### **Goal**

  

Get Field semantics _right_, permanently.

  

### **Work**

- FieldExpr DAG representation
    
- Domain abstraction:
    
    - stable IDs
        
    - ordering guarantees
        
    
- Field combinators:
    
    - map
        
    - zip
        
    - reduce (explicit only)
        
    
- Lazy evaluation model:
    
    - sink-driven materialization
        
    - dense batch evaluation
        
    
- Field bus combination semantics
    
- Domain mismatch hard errors
    

  

### **Deliverable**

- Per-element stability
    
- No eager field buffers anywhere
    
- Performance proportional to render sinks only
    

  

This is the most technically demanding phase — do not rush it.

---

# **E. Phase 3 — Phase & loop primitives (4–6 weeks)**

  

### **Goal**

  

Make looping _structural_, not a UI trick.

  

### **Work**

- Derived phase blocks (stateless)
    
- Stateful phase accumulators
    
- Phase domain operations:
    
    - wrap
        
    - quantize
        
    - fold
        
    - warp
        
    
- Phase-trigger primitives
    
- Cycle index signals
    
- Clear scrub vs performance semantics
    

  

### **Deliverable**

- Infinite, scrub-perfect looping systems
    
- Multi-scale phase interactions
    
- No timeline concepts anywhere
    

---

# **F. Phase 4 — Runtime safety & live editing (4–6 weeks)**

  

### **Goal**

  

Make the system unbreakable during play.

  

### **Work**

- Compile → validate → swap runtime
    
- Program compatibility signatures
    
- State mapping rules
    
- Output crossfade fallback (only)
    
- Error isolation and localization
    
- Zero-frame freezes
    

  

### **Deliverable**

- Live editing with no jank
    
- Systems behave like instruments
    
- Users can experiment fearlessly
    

---

# **G. Phase 5 — Bus Board UI (6–8 weeks)**

  

### **Goal**

  

Replace lanes with a musical, legible control surface.

  

### **Work**

- Bus Board layout
    
- Bus rows with live visualization
    
- Publisher inspection & ordering
    
- Combine mode UI
    
- Silent value editing
    
- Binding UI (bus picker + lens)
    
- Interpretation stack editor
    

  

### **Deliverable**

- Buses become the primary mental model
    
- Users understand “why things move”
    

---

# **H. Phase 6 — Phase-centric UX polish (4–6 weeks)**

  

### **Goal**

  

Make infinite time _feel good_.

  

### **Work**

- Phase visualizations (rings, wraps)
    
- Mode-specific UI (Scrub / Loop / Performance)
    
- Default bus scaffolds
    
- Tutorial integration
    
- Performance mode layout
    

  

### **Deliverable**

- Infinite animation feels intuitive
    
- Phase is discoverable, not intimidating
    

---

# **I. Phase 7 — Composites & reuse (4–6 weeks)**

  

### **Goal**

  

Enable scale without complexity.

  

### **Work**

- Composite authoring
    
- Internal bus exposure
    
- Scoped buses (optional, gated)
    
- Composite introspection
    
- Migration-safe expansion
    

  

### **Deliverable**

- Reusable “visual instruments”
    
- Library-ready systems
    

---

# **J. Phase 8 — First release polish (4–6 weeks)**

  

### **Goal**

  

Ship something people can live inside.

  

### **Work**

- Default patch templates
    
- Starter instruments
    
- UX refinement
    
- Documentation + tutorial polish
    
- Performance tuning (hot paths only)
    

  

### **Deliverable**

- v1.0 release:
    
    - infinite
        
    - deterministic
        
    - expressive
        
    - unbreakable
        
    

---

# **K. Explicit deferrals (intentional)**

  

These are **not** v1:

- Timeline/keyframes
    
- Automatic randomness
    
- Implicit state
    
- Per-element JS scripting
    
- Advanced exports
    
- WASM execution backend (design-ready only)
    

  

Deferring these preserves integrity.

---

# **L. What success looks like after v1**

  

You know this worked if:

- Users let patches run for hours
    
- People share systems, not clips
    
- Edits feel playful, not risky
    
- Complexity grows without collapse
    
- You don’t need to redesign time again
    

---

# **M. Final note (important)**

  

You are not building:

- an animation editor
    
- a node graph
    
- a generative toy
    

  

You are building:

  

> **A deterministic, infinite visual instrument.**

  

This roadmap protects that truth.

---

This completes the full specification you asked for.

  

If you want next steps, we can:

- translate this into **task-level engineering tickets**
    
- create a **compiler-first implementation checklist**
    
- or design **the exact minimal v1 block set**
    

  

Just say the word.