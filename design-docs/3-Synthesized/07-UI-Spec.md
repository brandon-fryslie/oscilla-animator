# UI Specification

## Guiding Principle

**The UI is driven exclusively by `CompiledProgram.timeModel`.**

No inference from PhaseClock. No heuristics. No player-side looping.

The current timeline player is replaced with a **Time Console**: a single area that changes structure depending on the TimeModel.

## Global Player UI (Always Present)

### Run State
- RUN / FREEZE button pair
- Live indicator:
  - `● RUNNING` when evaluating
  - `○ FROZEN` when frozen
- Freeze preserves state exactly

### Speed
- Speed control (multiplier, default 1.0)
- Applies to system time advance (dt scaling)
- Does not change topology

### Seed / Re-seed
- Seed display + edit
- Changing seed triggers explicit "Reinitialize" action with confirmation
- No implicit resets

### Compile Status
- Small status pill: `OK` / `Compiling...` / `Error`
- On compile, preview continues rendering old program until swap

### Mode Badge (Time Topology)
Prominent badge reflecting the TimeRoot:
- `FINITE`
- `CYCLE`
- `INFINITE`

This is the user's "what kind of thing am I building?" anchor.

## FINITE Mode UI

### Visual Form: Bounded Progress Bar
- `0.00s` on left
- Duration on right
- Playhead moves left to right and stops

### Controls
- Scrub (drag playhead): sets localT
- Jump to start/end

### Readouts
- Time: `1.23s / 4.50s`
- Progress: `27%`

### Behavior
- If RUN and reaches end: holds at end, shows `ENDED`
- FREEZE freezes at current local time

### Not Shown
- No infinity symbol
- No phase ring
- No wrap indicators
- No "cycle" labeling
- No "Loop View" option - if user wants looping, use CycleTimeRoot

## CYCLE Mode UI

### Visual Form: Phase Ring
Cycle mode is not a timeline. It is a phase instrument.

**Primary visualization: a phase ring (circular scrubber)**

Elements:
- Circular ring with moving indicator dot
- Wrap seam visible but subtle (tick mark at top)
- Displays `Period: 4.50s`
- Shows `Mode: Loop` or `Mode: Pingpong`

The circle prevents the "start/end" mental model.

### Primary Controls
- **Phase Scrub**: dragging around ring sets phaseOffset (does not reset state)
- **Period editor**: `Period 4.50s` (click to edit)
- **Mode toggle**: Loop/Pingpong (structural change; may require confirmation)

### Secondary Phase Lanes (Optional)
Below the main ring, optional mini-strips for:
- Phase B (if present/published)
- Other declared phases

These are read-only unless explicitly designated as scrubbable.

### Readouts
- `Phase A: 0.37`
- `Cycle #: 128`
- Wrap indicator flashes on wrap event

### Not Shown
- No "end"
- No "duration"
- No time range slider
- No global loop toggle (looping is inherent)

## INFINITE Mode UI

### Visual Form: Sliding Window Scope
Communicates: "This runs forever; you are viewing a window into it."

**Primary visualization: a scope window strip**

Elements:
- Horizontal strip representing observation window
- Labeled: `Window: 10s`
- "now" marker at right edge
- Window scrolls continuously when RUN

### Primary Controls
- **Window size editor**: `Window 10s` (click to edit)
- **View scrub**: dragging shifts timeOffset (view transform, not system time)
- **Optional "Hold View" toggle**: freezes view offset while system continues

### Readouts
- `Now: 12m 34s` (time since start)
- `View Offset: -2.3s` if user scrubs away from "now"

### Not Shown
- No loop icon
- No phase ring by default
- No suggestion of repetition
- No "Cycles Detected" inference from PhaseClocks

## Interaction Rules (All Modes)

### Scrub Never Resets State
Scrubbing changes view transforms:
- Finite: local time mapping
- Cycle: phase offset mapping
- Infinite: timeOffset mapping

NOT:
- System time resets
- State reinitialization

### Structural Changes Require Explicit Intent
Topology-changing edits (TimeRoot kind, period, duration, mode) while RUNNING:

Modal choice:
- Apply now (may reinitialize time mapping)
- Apply on next wrap (Cycle only)
- Apply when frozen

No silent application.

### Player Never Loops Time
No `loopMode` in player UI anymore.

Player only:
- Advances system time
- Freezes system time
- Scales dt

Looping lives entirely in CycleTimeRoot/phases.

## TimeRoot Picker

TimeRoot is first-class in the editor header:

```
Time Topology
  ○ Finite
  ● Cycle
  ○ Infinite
```

Selecting changes which TimeRoot block exists (single instance).

## Bus Board UI

### Layout
Reserved buses pinned at top with "system" badge.

### Row Contents
- Type badge
- Publisher count
- Listener count
- Live scope visualization:
  - phase: ring sweep
  - pulse: tick flashes
  - energy: meter/sparkline
  - progress: bounded meter

### Binding UI
Shows:
- Source bus
- Adapter chain (editable)
- Type before/after each adapter

## Scheduled Change UI

### Class A Changes
- No UI interruption
- Subtle "Compiling..." pill
- Swap on next frame

### Class B Changes
- Small banner: "Change scheduled"
- Selector:
  - "Apply now" (if safe)
  - "On next pulse" (if available)
  - "On freeze" (always)

Defaults:
- Cycle patches: "On next pulse"
- Infinite patches: "Apply now"

### Class C Changes
Modal dialog (blocking, explicit):

**Title:** "Time topology change"

**Body:**
- What will change (mode badge)
- Whether state will reset
- When it can be applied

**Buttons:**
- Apply now
- Apply on next pulse (if available)
- Apply when frozen
- Cancel

No hidden "don't show again."

## Acceptance Criteria

1. Player never shows linear timeline in Cycle or Infinite
2. Looping is visually obvious in Cycle mode without words
3. Infinite mode never implies repetition
4. Scrubbing never causes a reset
5. UI state is derived from timeModel only
6. No "loop toggle" anywhere in player
7. PhaseClock looping does not change player UI mode
