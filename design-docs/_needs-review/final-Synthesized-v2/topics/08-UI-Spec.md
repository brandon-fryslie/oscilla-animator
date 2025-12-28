# UI Spec

## Source: 07-UI-Spec.md

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
- `INFINITE`

**Note:** There is NO `CYCLE` badge. CycleTimeRoot does not exist. Cycles are produced by Time Console Global Rails. View looping for finite patches is a transport policy, not a topology.

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

### View Playback Policy
For finite patches, transport supports:
- **Once**: play from 0 to duration without looping
- **Loop**: repeat playback continuously (view-time only)
- **Ping-pong**: play forward then backward repeatedly

These affect only view-time mapping, never the underlying monotonic time.

### Not Shown
- No infinity symbol
- No phase ring
- No wrap indicators
- No "cycle" labeling

## Time Console (Modulation Rack)

**Note:** CYCLE mode UI is removed. There is no CycleTimeRoot.

Cycles are authored in the **Time Console** (Modulation Rack), which produces Global Rails:

### Modulation Rack Lanes
- **Cycle A**: period, mode (loop/pingpong/once), phase offset, rate → phaseA, pulse rails
- **Cycle B**: same → phaseB rail
- **Energy**: envelope generator → energy rail
- **Palette**: palette modulator → palette rail

### Rail Drive Policy UI
For each rail, show source selector:
- **Internal**: Modulation Rack drives the rail (default)
- **Bus**: External bus drives the rail
- **Both**: Combined with rail combine rule

### Phase Ring (in Time Console)
When editing Cycle lanes:
- Circular ring with moving indicator
- Period editor
- Mode toggle
- Phase offset scrub

This is **authoring** UI, not player topology.

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

### Player Never Loops Topology Time
No `loopMode` that changes topology.

Player only:
- Advances system time
- Freezes system time
- Scales dt
- View-time mapping for finite patches (once/loop/pingpong as transport policy)

Cycles are produced by Time Console rails, not by TimeRoot or player.

## TimeRoot Picker

TimeRoot is first-class in the editor header:

```
Time Topology
  ○ Finite
  ● Infinite
```

**Note:** No Cycle option. Cycles are authored in Time Console, not by TimeRoot selection.

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
- Patches with active pulse rail: "On next pulse"
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

1. Player never shows linear timeline in Infinite mode
2. Cycles are authored in Time Console, not as TimeRoot selection
3. Infinite mode never implies repetition
4. Scrubbing never causes a reset
5. UI state is derived from timeModel only
6. No topology loop toggle in player (view-time loop for finite is OK)
7. Time Console Modulation Rack is the only place to author cycles
