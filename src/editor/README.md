# Loom Editor - Visual Animation System

The Loom Editor is a node-based visual programming environment for creating procedural SVG animations. Instead of keyframes and timelines, you build animations by connecting functional blocks that describe data sources, transformations, and rendering.

## Quick Start

```bash
# Start the dev server
cd gallery && pnpm dev

# Open the editor
open http://localhost:5173/#/editor
```

1. **Load the Demo**: Click "Load Demo" in the toolbar to see a working "Breathing Dots" example
2. **Explore the Blocks**: The left panel shows available blocks organized by category
3. **Edit Parameters**: Click any block to see its parameters in the Inspector
4. **Watch it Animate**: The Preview panel shows your animation in real-time

## Interface Overview

```
+------------------+------------------------+----------+----------+
|                  |                        |          |          |
|  Block Library   |       Patch Bay        | Preview  | Inspector|
|                  |                        |          |          |
|                  |                        |          |          |
+------------------+------------------------+----------+----------+
|                         Transport                               |
+-----------------------------------------------------------------+
```

- **Block Library** (left): Drag blocks from here into the Patch Bay
- **Patch Bay** (center): Where you build the animation graph
- **Preview** (right): Live animation preview
- **Inspector** (far right): Edit parameters and configure bus routing
- **Transport** (bottom): Playback controls, seed, speed

## Architecture Overview

The editor is built around three core concepts:

### 1. Blocks

Blocks are functional units that transform data. There are three types:

- **Primitives**: Atomic operations implemented in TypeScript (e.g., `DomainN`, `FieldMapNumber`, `PhaseClock`)
- **Composites**: Pre-built combinations of primitives that appear as single blocks (e.g., `GridPoints`, `DotsRenderer`)
- **Macros**: Recipe starters that expand into multiple visible blocks when dropped

### 2. Buses

Buses are typed signal distributors that enable modular routing. They support:

- **Multiple publishers**: Combine values from many sources using configurable modes (sum, average, max, etc.)
- **Multiple listeners**: Any block can subscribe to a bus
- **Lenses**: Transform bus values at the listener side (easing, quantization, scaling, etc.)
- **Default buses**: Five buses auto-created on each patch (`phaseA`, `phaseB`, `energy`, `pulse`, `palette`)

### 3. Patch Bay View

The Patch Bay is the primary view for wiring blocks into a graph. It organizes blocks visually by value domain, but the graph is
the source of truth. Port types determine what can connect to what.

## Available Primitives

### Domain Primitives (13 total)

#### Domain Creation
- **DomainN**: Create N elements with unique IDs

#### Position Mapping
- **PositionMapGrid**: Arrange elements in a grid (rows × cols)
- **PositionMapCircle**: Arrange elements in a circle
- **PositionMapLine**: Arrange elements along a line segment
- **PositionMapRandom**: Scatter elements randomly

#### Field Creation
- **FieldConstNumber**: Uniform numeric value for all elements
- **FieldConstColor**: Uniform color for all elements
- **FieldHash01ById**: Per-element random values in [0, 1)
- **FieldMapNumber**: Apply function to number field (scale, offset, sin, etc.)
- **FieldMapVec2**: Apply transformation to vec2 field (rotate, scale, translate)

#### Time/Phase
- **PhaseClock**: Generate looping/once/pingpong phase signals
- **LinearPhase**: Simple linear progression

#### Rendering
- **RenderInstances2D**: Materialize domain + fields into visual circles with optional glow

## Available Composites (9 total)

### Arrangement Composites
- **GridPoints**: DomainN + PositionMapGrid → (domain, positions)
- **CirclePoints**: DomainN + PositionMapCircle → (domain, positions)
- **LinePoints**: DomainN + PositionMapLine → (domain, positions)

### Variation Composites
- **PerElementRandom**: Wrapper around FieldHash01ById for convenience
- **PerElementPhaseOffset**: Hash + scale → staggered animation offsets
- **SizeScatter**: Random size variation → Field<float> in [min, max]

### Motion Composites
- **OrbitMotion**: Rotate positions around a center point
- **WaveDisplace**: Sine-based wave displacement values

### Rendering Composites
- **DotsRenderer**: Complete renderer with size variation, color, and glow

## Buses and Lenses

### Bus System

Buses enable modular signal routing without direct connections. A typical pattern:

```
PhaseClock → publishes to phaseA bus
DotsRenderer radius input ← listens to phaseA bus (with "breathing" lens)
```

This allows you to drive multiple parameters from a single phase source without spaghetti wiring.

### Lens Types

Lenses transform bus values before they reach their destination:

1. **ease**: Apply easing curve (easeInOutSine, easeOutBounce, etc.)
2. **slew**: Rate-limited smoothing for gradual changes
3. **quantize**: Snap to discrete steps (for rhythmic effects)
4. **scale**: Linear gain + offset transformation
5. **clamp**: Clamp values to a min/max range
6. **deadzone**: Zero small values near 0
7. **mapRange**: Remap input range to output range

### Lens Presets

12 pre-configured lenses available in the Inspector:

**Easing**: breathing, bounce, elastic, slow-start, slow-end
**Timing**: smooth
**Quantize**: snap (4 steps), fine-steps (8), on-off (2)
**Scaling**: double (2x), half (0.5x), invert (flip 0-1)

## Building a Simple Patch

### Example: "Breathing Dots"

1. **Create Domain + Positions**
   - Drop `GridPoints` composite into the Patch Bay
   - Set params: `count: 25`, `rows: 5`, `cols: 5`, `spacing: 60`

2. **Add Time Source**
   - Drop `PhaseClock` into the Patch Bay
   - Set params: `duration: 2`, `mode: loop`

3. **Render Output**
   - Drop `DotsRenderer` into the Patch Bay
   - Wire `GridPoints.domain` → `DotsRenderer.domain`
   - Wire `GridPoints.positions` → `DotsRenderer.positions`

4. **Add Bus-Driven Breathing**
   - `PhaseClock` auto-publishes to `phaseA` bus
   - In Inspector, click `DotsRenderer.radius` port
   - Click "Listen to Bus" → select `phaseA`
   - Choose lens preset: "breathing" (easeInOutSine)

5. **Result**: 25 dots in a grid that smoothly grow and shrink

## Basic Workflow

### 1. Add Blocks

Drag blocks from the library into the patch bay. Use connection filtering to focus on compatible blocks.

### 2. Connect Blocks

Blocks have **ports** (connection points):
- **Inputs** on the left side
- **Outputs** on the right side

To connect blocks:
1. Click an output port (it gets selected)
2. Click a compatible input port on another block
3. A wire appears connecting them

Right-click a port for more options (disconnect, wire to bus, etc.).

### 3. Configure Parameters

Click any block to select it. The Inspector panel shows its parameters. Adjust values using sliders, dropdowns, or text inputs.

### 4. Use Buses

Instead of direct wiring, you can route signals through buses:
- Right-click an output port → "Publish to Bus"
- Right-click an input port → "Listen to Bus"
- Select a lens to transform the signal

### 5. Preview

The preview panel shows your animation in real time. Use the transport bar to:
- Play/pause the animation
- Scrub through time
- Change the random seed
- Adjust playback speed

## Port Types

Ports have types that determine what can connect to what. Common types:

| Type | Description |
|------|-------------|
| `Domain` | Per-element identity (for Field operations) |
| `Field<vec2>` | Per-element 2D positions |
| `Field<float>` | Per-element numeric values |
| `Field<color>` | Per-element colors |
| `Signal<float>` | Time-varying numeric signal |
| `Signal<PhaseSample>` | Phase machine output |
| `RenderTree` | Final render output |

Compatible ports highlight when you're making connections.

## How Compilation Works

When you build a patch, the editor:

1. **Expands Composites**: Internal graphs are compiled into their constituent primitives
2. **Resolves Buses**: Publishers/listeners are compiled into signal combinators
3. **Applies Lenses**: Lens transformations wrap bus signals
4. **Produces RenderTree**: Final output is a time-indexed render function

The result is a purely functional animation: `(time, context) => RenderTree`.

## Type System

The editor has a two-tier type system:

### Core Domains (bus-eligible, user-facing)
- `number`, `vec2`, `color`, `boolean`
- `time`, `phase`, `rate`, `trigger`

### Internal Domains (engine plumbing)
- `point`, `duration`, `path`, `program`, `renderTree`
- `domain`, `scene`, `event`

**Key Rule**: Only core domain types can be routed through buses. Internal types use direct connections.

## Settings

Click the dropdowns in the toolbar to access settings:

- **Connections**: Show type hints, highlight compatible ports
- **Palette**: Filter blocks by connection compatibility

## Tips and Best Practices

1. **Start with Composites**: Use `GridPoints` + `DotsRenderer` before diving into primitives
2. **Use Default Buses**: `phaseA` and `phaseB` are ready for time-driven effects
3. **Lens Everything**: Applying lenses to bus listeners immediately makes motion more interesting
4. **Experiment with Seeds**: Most randomization blocks have a `seed` param for controlled variation
5. **Check the Inspector**: Selected blocks show all parameters and port wiring options

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Delete` / `Backspace` | Delete selected block |
| `Escape` | Deselect / close menus |

## Troubleshooting

**Editor shows blank screen:**
- Check browser console for errors
- Verify route is `/#/editor` (hash-based routing)
- Run `pnpm exec tsc --noEmit` to check for TypeScript errors

**Can't connect two ports:**
- Port types must be compatible
- Make sure you're connecting output → input (not input → input)
- Check the log window at the bottom for error messages

**Animation not updating:**
- Ensure blocks are connected to a render output
- Check that all required inputs are connected
- Look for error decorations (red highlights) on blocks

**Styles not loading:**
- Hard refresh the browser (Cmd+Shift+R / Ctrl+Shift+R)
- Restart the dev server

## What's Next

This system is the foundation for:

- **Starter Composite Library**: Pre-built common patterns (spiral layouts, color palettes, etc.)
- **More Renderers**: Path instances, glyph rendering, stroke effects
- **Advanced Buses**: Multi-bus compositions, bus modulation, trigger buses
- **Export**: Generate standalone SVG animations from patches

## Technical Details

**Stack**: React + MobX + TypeScript + Vite
**Testing**: Vitest with 385 passing tests
**Architecture**: Functional core, imperative shell (stores are MobX, compilation is pure functions)

For deeper technical documentation, see:
- `/feature_planning_docs/Full-System-Design/` - Complete system specifications
- `.agent_planning/` - Implementation plans and status docs
- `/gallery/src/editor/compiler/` - Compilation logic
- `/gallery/src/editor/__tests__/` - Test suite showing expected behavior
