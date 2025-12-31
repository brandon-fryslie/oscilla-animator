# UI Specification

## Guiding Principle

**The UI is driven exclusively by `CompiledProgram.timeModel`.**

No inference from blocks. No heuristics. No player-side looping.

## Global Player UI (Always Present)

### Run State
- RUN / FREEZE button pair
- Live indicator: `● RUNNING` / `○ FROZEN`
- Freeze preserves state exactly

### Speed
- Speed control (multiplier, default 1.0)
- Applies to dt scaling
- Does not change topology

### Seed
- Seed display + edit
- Changing seed triggers explicit "Reinitialize" with confirmation

### Compile Status
- Status pill: `OK` / `Compiling...` / `Error`
- Preview continues old program until swap

### Mode Badge
Prominent badge reflecting TimeRoot:
- `FINITE`
- `INFINITE`

No `CYCLE` badge. Cycles are authored in Time Console.

## FINITE Mode UI

### Visual Form
Bounded progress bar:
- `0.00s` on left, duration on right
- Playhead moves left to right

### Controls
- Scrub (drag playhead)
- Jump to start/end

### Readouts
- Time: `1.23s / 4.50s`
- Progress: `27%`

### View Playback Policy
Transport supports (view-time only):
- **Once**: no looping
- **Loop**: repeat continuously
- **Ping-pong**: forward then backward

## INFINITE Mode UI

### Visual Form
Sliding window scope:
- Horizontal strip as observation window
- `Window: 10s` label
- "now" marker at right edge
- Scrolls when RUN

### Controls
- Window size editor
- View scrub (shifts timeOffset)
- "Hold View" toggle

### Readouts
- `Now: 12m 34s`
- `View Offset: -2.3s` (if scrubbed)

## Time Console (Modulation Rack)

Produces Global Rails via lanes:

### Lanes
- **Cycle A**: period, mode, phase offset → phaseA, pulse
- **Cycle B**: period, mode, phase offset → phaseB
- **Energy**: envelope → energy
- **Palette**: modulator → palette

### Rail Drive Policy
Per rail source selector:
- **Internal**: Modulation Rack (default)
- **Bus**: External bus
- **Both**: Combined

### Phase Ring
In Cycle lane editing:
- Circular ring with moving indicator
- Period editor, mode toggle, phase scrub

## Bus Board UI

### Layout
- Reserved buses pinned at top ("system" badge)

### Row Contents
- Type badge
- Publisher/listener counts
- Live scope visualization

### Binding UI
- Source bus
- Adapter chain (editable)
- Type before/after each adapter

## Scheduled Change UI

### Class A (Param-only)
- Subtle "Compiling..." pill
- Swap on next frame

### Class B (Structural)
- "Change scheduled" banner
- Options: Apply now / On next pulse / On freeze

### Class C (Topology)
Modal dialog:
- What changes
- Whether state resets
- When applicable
- Buttons: Apply now / On pulse / On freeze / Cancel

## Interaction Rules

### Scrub Never Resets State
Changes view transforms only, not system time.

### Structural Changes Require Intent
Topology changes while RUNNING need explicit choice.

### Player Never Loops Topology
Player only: advances time, freezes, scales dt.
Cycles come from Time Console.

## TimeRoot Picker

In editor header:
```
Time Topology
  ○ Finite
  ● Infinite
```

No Cycle option. Cycles authored in Time Console.
