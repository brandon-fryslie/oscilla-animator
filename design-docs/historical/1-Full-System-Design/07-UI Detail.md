## **7) Detailed UI: exact panels, controls, and interactions for phase, looping, and infinite animation**

  

This section specifies **what is on screen, where it lives, how it behaves, and why**.

The goal is not visual polish—it’s **structural clarity under infinite time**.

---

# **A. High-level layout (always-visible structure)**

  

The UI is organized around **three permanent anchors**:

1. **Patch Canvas (center)**
    
2. **Bus Board (right, dominant)**
    
3. **Inspector / Detail Panel (right, contextual, below Bus Board)**
    

  

There is **no lane system**. Spatial layout is freeform and semantic.

---

# **B. Patch Canvas (system construction space)**

  

### **Purpose**

- Structural thinking
    
- System topology
    
- Local reasoning
    

  

### **Characteristics**

- Infinite canvas
    
- Blocks grouped spatially by _concept_, not execution
    
- No left-to-right implication
    
- No time axis
    

  

### **Visual language**

- Blocks are quiet, neutral
    
- Emphasis is intentionally low compared to Bus Board
    
- Movement previews are subtle or disabled by default
    

  

### **Phase-specific affordances**

- Phase-producing blocks show:
    
    - period
        
    - waveform
        
    - tiny wrap indicator
        
    
- Stateful blocks show:
    
    - memory icon
        
    - transport-only badge if applicable
        
    

---

# **C. Bus Board (the heart of looping UX)**

  

The Bus Board replaces lanes, timelines, and global modulation panels.

  

### **Placement**

- Right side
    
- Always visible
    
- Above Inspector
    
- Resizable, but never hidden
    

---

## **C1) Bus row anatomy (Signal buses)**

  

Each bus row contains:

1. **Bus Name**
    
    - Editable inline
        
    - Color-coded by domain (phase, energy, color, etc.)
        
    
2. **Type Badge**
    
    - Signal / Field
        
    - Domain icon (phase ring, lightning, palette, etc.)
        
    
3. **Live Visualization**
    
    - Phase: rotating ring
        
    - Number/Energy: sparkline
        
    - Color: animated swatch
        
    - Trigger: pulse flashes
        
    
4. **Publisher Stack Indicator**
    
    - Count
        
    - Expandable
        
    - Ordered by sortKey
        
    
5. **Combine Mode Selector**
    
    - Inline dropdown (sum / last / max / etc.)
        
    - Disabled when irrelevant
        
    
6. **Silent Value Indicator**
    
    - Shown when no publishers active
        
    - Editable for core domains
        
    

---

## **C2) Expanded bus view (on click)**

  

Expanding a bus reveals:

- Full publisher list:
    
    - source block
        
    - adapter chain preview
        
    - gain/weight (if applicable)
        
    - mute/solo
        
    - drag handle for sortKey
        
    
- Optional diagnostics:
    
    - domain mismatch warnings
        
    - performance cost estimate
        
    - cycle participation indicator
        
    

  

This is where _why something moves_ becomes obvious.

---

# **D. Binding UI (how users connect to phase & loops)**

  

### **Input ports (consumers)**

- Each bindable parameter shows a **binding dot**
    
- Clicking opens:
    
    - compatible buses (filtered by TypeDesc)
        
    - preview of live values
        
    
- Binding immediately animates parameter
    

  

### **Interpretation stack affordance**

- A small **lens icon** appears after binding
    
- Clicking opens the interpretation stack
    

---

## **D1) Interpretation stack panel**

  

This is where looping becomes expressive.

- Vertical stack of transforms
    
- Identity is visible and removable
    
- Common transforms are one-click:
    
    - map range
        
    - ease
        
    - quantize
        
    - slew
        
    - gate
        
    - wrap / fold
        
    

  

Crucially:

- This panel uses _feel-based language_
    
- No math jargon unless expanded
    

---

# **E. Phase-specific UI affordances**

  

### **Phase-aware parameters show:**

- mini phase scrub preview
    
- loop count hints
    
- optional wrap markers
    

  

### **Phase buses show:**

- ring visualization
    
- wrap ticks
    
- optional cycle counter
    

  

Users _see_ loops, not just infer them.

---

# **F. Transport & Mode Controls (bottom bar)**

  

The transport does **not** control time directly. It controls _how time is treated_.

  

### **Modes:**

- **Scrub**
    
- **Loop**
    
- **Performance**
    

---

## **F1) Scrub mode**

- Time scrubber appears
    
- Phase rings scrub perfectly
    
- Stateful blocks show reconstruction badge
    

---

## **F2) Loop mode**

- Timeline replaced by cycle visualizations
    
- Phase buses emphasized
    
- Wrap triggers visible
    
- Focus on structure
    

---

## **F3) Performance mode**

- Patch canvas deemphasized
    
- Bus Board becomes mixer-like
    
- Larger controls
    
- Designed for play
    

---

# **G. UI feedback during live edits (no jank)**

  

When the patch changes:

1. UI responds immediately (highlight, spinner, toast)
    
2. Old system keeps running
    
3. New system compiles in background
    
4. On success:
    
    - swap evaluators
        
    - optionally crossfade outputs
        
    
5. On failure:
    
    - error localized
        
    - system keeps running
        
    

  

The user never sees a frozen or broken visual.

---

# **H. Discoverability without overwhelm**

  

Key rules:

- Identity mappings are default
    
- Advanced transforms are discoverable, not mandatory
    
- Phase is introduced by usage, not explanation
    

  

The UI never asks:

  

> “Do you want this to loop?”

  

It asks:

  

> “What should this listen to?”

---

# **I. Why this UI makes infinite animation** 

# **fun**

  

Because:

- rhythm is visible
    
- influence is tangible
    
- changes feel immediate
    
- nothing explodes when you experiment
    

  

The system invites play, not planning.

---

When you say **Next**, I’ll continue with:

  

## **8) Preventing visual jank during edits to the patch (exact mechanisms: compile/swap, state transfer, crossfades, failure modes).**