# Control Surface

A **Control Surface** is a curated set of high-leverage controls that bind to parameters and/or ports in the underlying patch. It provides a "playable layer" over the node graph - think of it as an instrument panel for animations.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Control Surface                           │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │  TIME   │  │ MOTION  │  │  STYLE  │  │  CHAOS  │        │
│  │ ─────── │  │ ─────── │  │ ─────── │  │ ─────── │        │
│  │ Speed   │  │ Origin  │  │ Color   │  │ Seed    │        │
│  │ Duration│  │ Spread  │  │ Size    │  │ Jitter  │        │
│  │ Stagger │  │         │  │ Glow    │  │         │        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│       │            │            │            │              │
│       ▼            ▼            ▼            ▼              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Bindings                          │   │
│  │  Control.value → transform → Block.param            │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                │
└────────────────────────────┼────────────────────────────────┘
                             ▼
              ┌──────────────────────────────┐
              │      Patch (Node Graph)       │
              │  ┌──────┐  ┌──────┐  ┌──────┐│
              │  │Scene │→│Fields│→│Render││
              │  └──────┘  └──────┘  └──────┘│
              └──────────────────────────────┘
```

## Key Principles

1. **Controls emit values, Bindings decide where they go**
   - Controls don't know about blocks - they just emit typed values
   - Bindings map those values to specific block parameters
   - This decouples the UI from the graph topology

2. **Surface never changes topology**
   - Can't add/remove blocks or wires through controls
   - Only modifies parameter values
   - Structure comes from Macros, surface just exposes "knobs"

3. **Fixed canonical sections**
   - TIME → MOTION → STYLE → CHAOS (always in this order)
   - Users build muscle memory across different animations
   - Different archetypes feel like "presets on the same instrument"

4. **Explicit combine rules**
   - When multiple controls bind to the same target, behavior is explicit
   - Options: add, multiply, lerp, min, max, override

## Directory Structure

```
controlSurface/
├── types.ts              # Core type definitions
├── store.ts              # MobX state management
├── generators.ts         # Surface generators for macros
├── ControlSurfacePanel.tsx  # Main UI component
├── ControlSurface.css    # Styles
├── controls/
│   ├── NumberControlUI.tsx
│   ├── EnumControlUI.tsx
│   ├── ToggleControlUI.tsx
│   ├── XYControlUI.tsx
│   └── ColorControlUI.tsx
└── index.ts              # Public exports
```

## Control Types

### NumberControl
The workhorse - sliders with response curves.

```typescript
createNumberControl(
  'Duration',
  { min: 0.5, max: 10, default: 2.5, unit: 's', curve: 'exp' },
  [{ target: { blockId: 'phase-1', paramKey: 'entranceDuration' } }]
)
```

Options:
- `min`, `max`: Value range
- `default`: Initial value
- `unit`: Display suffix (ms, px, %, deg, x, s)
- `curve`: Response curve (linear, exp, log, sCurve)
- `step`: Discrete stepping

### EnumControl
Mode selection without magic strings.

```typescript
createEnumControl(
  'Mode',
  { options: ['radial', 'cascade', 'diagonal'], default: 'radial', presentation: 'segmented' },
  [{ target: { blockId: 'origin-1', paramKey: 'mode' } }]
)
```

Presentations:
- `segmented`: Button row (best for 2-4 options)
- `dropdown`: Select menu (5+ options)
- `radio`: Radio button list

### ToggleControl
Boolean switches.

```typescript
createToggleControl('Glow', true, [
  { target: { blockId: 'render-1', paramKey: 'glow' } }
])
```

### XYControl
2D position/vector input.

```typescript
createXYControl(
  'Origin',
  {
    x: { min: 0, max: 800, default: 400 },
    y: { min: 0, max: 600, default: 300 },
    boundsHint: 'viewport'
  },
  [
    { target: { blockId: 'origin-1', paramKey: 'centerX' } },
    { target: { blockId: 'origin-1', paramKey: 'centerY' } }
  ]
)
```

The binding system auto-detects X/Y params by name:
- Keys ending in 'X' or containing 'centerx' use control.x.value
- Keys ending in 'Y' or containing 'centery' use control.y.value

### ColorControl
Visual color picker with palette.

```typescript
createColorControl(
  'Particle Color',
  { default: '#ffffff', allowAlpha: false },
  [{ target: { blockId: 'render-1', paramKey: 'fill' } }]
)
```

## Bindings

A binding maps a control's output to a block parameter:

```typescript
interface BindParam {
  target: { blockId: string; paramKey: string };
  map?: ValueMap;      // Transform the value
  combine?: Combine;   // How to merge with existing value
}
```

### Value Mapping

Transform values before applying:

```typescript
{
  target: { blockId: 'stagger-1', paramKey: 'jitter' },
  map: {
    scale: 0.5,      // Multiply by 0.5
    offset: 0.1,     // Add 0.1
    clamp: [0, 1]    // Clamp to range
  }
}
```

### Combine Operations

When multiple controls bind to the same param:

```typescript
{ combine: { op: 'add' } }        // result = existing + incoming
{ combine: { op: 'multiply' } }   // result = existing * incoming
{ combine: { op: 'lerp', t: 0.5 } }  // result = lerp(existing, incoming, 0.5)
{ combine: { op: 'min' } }        // result = min(existing, incoming)
{ combine: { op: 'max' } }        // result = max(existing, incoming)
{ combine: { op: 'override' } }   // result = incoming (default)
```

## Surface Generators

When a macro is dropped, a surface generator creates an appropriate control surface:

```typescript
// Register a generator for a macro type
registerGenerator('radialBurst', (blockIds) => {
  return createSurface('Radial Burst', [
    createSection('time', 'TIME', [
      createNumberControl('Speed', { ... }, findPhaseBindings(blockIds, 'timeScale')),
      // ... more controls
    ]),
    createSection('motion', 'MOTION', [ /* ... */ ]),
    createSection('style', 'STYLE', [ /* ... */ ]),
    createSection('chaos', 'CHAOS', [ /* ... */ ]),
  ]);
});
```

The `blockIds` map provides IDs for all blocks created by the macro expansion.

## Usage in Editor

```tsx
import { ControlSurfaceStore, ControlSurfacePanel, generateSurfaceForMacro } from './controlSurface';

// Create store (pass editor store for binding application)
const controlSurfaceStore = useMemo(() => new ControlSurfaceStore(editorStore), []);

// Generate surface for a macro
const surface = generateSurfaceForMacro('radialBurst', blockIds);
controlSurfaceStore.setSurface(surface);

// Render panel
<ControlSurfacePanel store={controlSurfaceStore} />
```

## Store API

```typescript
class ControlSurfaceStore {
  surface: ControlSurface | null;

  // Actions
  setSurface(surface: ControlSurface | null): void;
  updateControlValue(controlId: string, value: unknown): void;
  resetControl(controlId: string): void;
  resetSection(sectionId: string): void;
  resetAll(): void;
  toggleSection(sectionId: string): void;
  randomizeSeed(): void;

  // Computed
  get allControls(): SurfaceControl[];
  get controlsBySection(): Map<string, SurfaceControl[]>;
}
```

## CSS Customization

The control surface uses CSS custom properties for theming. Key classes:

- `.control-surface-panel` - Main container
- `.control-section` - Section wrapper
- `.section-header` - Collapsible header
- `.control-number`, `.control-enum`, etc. - Control wrappers
- `.control-slider` - Range input
- `.enum-segmented`, `.enum-dropdown` - Enum presentations
- `.toggle-switch` - Toggle button
- `.xy-pad` - XY control pad
- `.color-swatch-main` - Color button

## Future Enhancements

- [ ] Port bindings (inject values into input ports)
- [ ] Control modulation (LFOs, envelopes)
- [ ] Preset save/load
- [ ] Custom surface layouts
- [ ] Keyboard shortcuts for controls
- [ ] MIDI mapping
