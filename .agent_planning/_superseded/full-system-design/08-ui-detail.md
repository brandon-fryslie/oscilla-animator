# UI Detail

Exact panels, controls, and interactions for phase, looping, and infinite animation.
The goal is not visual polish—it's structural clarity under infinite time.

---

## High-Level Layout (Always-Visible Structure)

The UI is organized around **three permanent anchors**:

1. **Patch Canvas** (center)
2. **Bus Board** (right, dominant)
3. **Inspector / Detail Panel** (right, contextual, below Bus Board)

There is **no lane system**. Spatial layout is freeform and semantic.

---

## Patch Canvas (System Construction Space)

### Purpose
- Structural thinking
- System topology
- Local reasoning

### Characteristics
- Infinite canvas
- Blocks grouped spatially by concept, not execution
- No left-to-right implication
- No time axis

### Visual Language
- Blocks are quiet, neutral
- Emphasis is intentionally low compared to Bus Board
- Movement previews are subtle or disabled by default

### Phase-Specific Affordances

**Phase-producing blocks show:**
- period
- waveform
- tiny wrap indicator

**Stateful blocks show:**
- memory icon
- transport-only badge if applicable

---

## Bus Board (The Heart of Looping UX)

The Bus Board replaces lanes, timelines, and global modulation panels.

### Placement
- Right side
- Always visible
- Above Inspector
- Resizable, but never hidden

---

### Bus Row Anatomy (Signal Buses)

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

### Expanded Bus View (On Click)

Expanding a bus reveals:

**Full publisher list:**
- source block
- adapter chain preview
- gain/weight (if applicable)
- mute/solo
- drag handle for sortKey

**Optional diagnostics:**
- domain mismatch warnings
- performance cost estimate
- cycle participation indicator

This is where "why something moves" becomes obvious.

---

## Binding UI (How Users Connect to Phase & Loops)

### Input Ports (Consumers)

- Each bindable parameter shows a **binding dot**
- Clicking opens: compatible buses (filtered by TypeDesc), preview of live values
- Binding immediately animates parameter

### Interpretation Stack Affordance

- A small **lens icon** appears after binding
- Clicking opens the interpretation stack

---

### Interpretation Stack Panel

This is where looping becomes expressive.

- Vertical stack of transforms
- Identity is visible and removable
- Common transforms are one-click: map range, ease, quantize, slew, gate, wrap/fold

Crucially:
- This panel uses feel-based language
- No math jargon unless expanded

---

## Phase-Specific UI Affordances

### Phase-Aware Parameters Show:
- mini phase scrub preview
- loop count hints
- optional wrap markers

### Phase Buses Show:
- ring visualization
- wrap ticks
- optional cycle counter

Users see loops, not just infer them.

---

## Transport & Mode Controls (Bottom Bar)

The transport does **not** control time directly. It controls how time is treated.

### Modes:
- **Scrub**
- **Loop**
- **Performance**

---

### Scrub Mode
- Time scrubber appears
- Phase rings scrub perfectly
- Stateful blocks show reconstruction badge

### Loop Mode
- Timeline replaced by cycle visualizations
- Phase buses emphasized
- Wrap triggers visible
- Focus on structure

### Performance Mode
- Patch canvas deemphasized
- Bus Board becomes mixer-like
- Larger controls
- Designed for play

---

## UI Feedback During Live Edits (No Jank)

When the patch changes:
1. UI responds immediately (highlight, spinner, toast)
2. Old system keeps running
3. New system compiles in background
4. On success: swap evaluators, optionally crossfade outputs
5. On failure: error localized, system keeps running

The user never sees a frozen or broken visual.

---

## Discoverability Without Overwhelm

Key rules:
- Identity mappings are default
- Advanced transforms are discoverable, not mandatory
- Phase is introduced by usage, not explanation

The UI never asks:
> "Do you want this to loop?"

It asks:
> "What should this listen to?"

---

## Why This UI Makes Infinite Animation Fun

Because:
- rhythm is visible
- influence is tangible
- changes feel immediate
- nothing explodes when you experiment

The system invites play, not planning.
