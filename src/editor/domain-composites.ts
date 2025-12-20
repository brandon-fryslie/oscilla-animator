/**
 * Domain Composites - Pre-built compound blocks for domain-based workflows.
 *
 * These composites combine domain primitives into common patterns.
 */

import { registerComposite } from './composites';

/**
 * GridPoints - Combines DomainN + PositionMapGrid into a single block.
 *
 * This composite creates a grid of points in one step, hiding the internal
 * Domain → PositionMapGrid pipeline from the user.
 */
export const GridPoints = registerComposite({
  id: 'GridPoints',
  label: 'Grid Points',
  description: 'Create a grid of positioned elements',
  color: '#8B5CF6',
  subcategory: 'Sources',
  laneKind: 'Fields',
  tags: {
    origin: 'domain-composites',
    form: 'composite',
  },
  graph: {
    nodes: {
      domain: {
        type: 'DomainN',
        params: {
          n: { __fromParam: 'count' },
          seed: { __fromParam: 'seed' },
        },
      },
      grid: {
        type: 'PositionMapGrid',
        params: {
          rows: { __fromParam: 'rows' },
          cols: { __fromParam: 'cols' },
          spacing: { __fromParam: 'spacing' },
          originX: { __fromParam: 'originX' },
          originY: { __fromParam: 'originY' },
          order: { __fromParam: 'order' },
        },
      },
    },
    edges: [
      { from: 'domain.domain', to: 'grid.domain' },
    ],
    inputMap: {},
    outputMap: {
      domain: 'domain.domain',
      positions: 'grid.pos',
    },
  },
  exposedInputs: [],
  exposedOutputs: [
    {
      id: 'domain',
      label: 'Domain',
      direction: 'output',
      slotType: 'Domain',
      nodeId: 'domain',
      nodePort: 'domain',
    },
    {
      id: 'positions',
      label: 'Positions',
      direction: 'output',
      slotType: 'Field<vec2>',
      nodeId: 'grid',
      nodePort: 'pos',
    },
  ],
});

/**
 * CirclePoints - Combines DomainN + PositionMapCircle into a single block.
 *
 * Creates elements arranged in a circle.
 */
export const CirclePoints = registerComposite({
  id: 'CirclePoints',
  label: 'Circle Points',
  description: 'Create elements arranged in a circle',
  color: '#8B5CF6',
  subcategory: 'Sources',
  laneKind: 'Fields',
  tags: {
    origin: 'domain-composites',
    form: 'composite',
  },
  graph: {
    nodes: {
      domain: {
        type: 'DomainN',
        params: {
          n: { __fromParam: 'count' },
          seed: { __fromParam: 'seed' },
        },
      },
      circle: {
        type: 'PositionMapCircle',
        params: {
          centerX: { __fromParam: 'centerX' },
          centerY: { __fromParam: 'centerY' },
          radius: { __fromParam: 'radius' },
          startAngle: { __fromParam: 'startAngle' },
          winding: { __fromParam: 'winding' },
          distribution: { __fromParam: 'distribution' },
        },
      },
    },
    edges: [
      { from: 'domain.domain', to: 'circle.domain' },
    ],
    inputMap: {},
    outputMap: {
      domain: 'domain.domain',
      positions: 'circle.pos',
    },
  },
  exposedInputs: [],
  exposedOutputs: [
    {
      id: 'domain',
      label: 'Domain',
      direction: 'output',
      slotType: 'Domain',
      nodeId: 'domain',
      nodePort: 'domain',
    },
    {
      id: 'positions',
      label: 'Positions',
      direction: 'output',
      slotType: 'Field<vec2>',
      nodeId: 'circle',
      nodePort: 'pos',
    },
  ],
});

/**
 * LinePoints - Combines DomainN + PositionMapLine into a single block.
 *
 * Creates elements arranged along a line segment.
 */
export const LinePoints = registerComposite({
  id: 'LinePoints',
  label: 'Line Points',
  description: 'Create elements arranged along a line',
  color: '#8B5CF6',
  subcategory: 'Sources',
  laneKind: 'Fields',
  tags: {
    origin: 'domain-composites',
    form: 'composite',
  },
  graph: {
    nodes: {
      domain: {
        type: 'DomainN',
        params: {
          n: { __fromParam: 'count' },
          seed: { __fromParam: 'seed' },
        },
      },
      line: {
        type: 'PositionMapLine',
        params: {
          ax: { __fromParam: 'ax' },
          ay: { __fromParam: 'ay' },
          bx: { __fromParam: 'bx' },
          by: { __fromParam: 'by' },
          distribution: { __fromParam: 'distribution' },
        },
      },
    },
    edges: [
      { from: 'domain.domain', to: 'line.domain' },
    ],
    inputMap: {},
    outputMap: {
      domain: 'domain.domain',
      positions: 'line.pos',
    },
  },
  exposedInputs: [],
  exposedOutputs: [
    {
      id: 'domain',
      label: 'Domain',
      direction: 'output',
      slotType: 'Domain',
      nodeId: 'domain',
      nodePort: 'domain',
    },
    {
      id: 'positions',
      label: 'Positions',
      direction: 'output',
      slotType: 'Field<vec2>',
      nodeId: 'line',
      nodePort: 'pos',
    },
  ],
});

/**
 * SVGSamplePoints - Wrapper around SVGSampleDomain primitive.
 *
 * Samples points from an SVG path, creating a domain with positions
 * derived from the path geometry. Useful for animating along shapes.
 */
export const SVGSamplePoints = registerComposite({
  id: 'SVGSamplePoints',
  label: 'SVG Sample Points',
  description: 'Sample points from SVG path',
  color: '#8B5CF6',
  subcategory: 'Sources',
  laneKind: 'Fields',
  tags: {
    origin: 'domain-composites',
    form: 'composite',
  },
  graph: {
    nodes: {
      svg: {
        type: 'SVGSampleDomain',
        params: {
          asset: { __fromParam: 'asset' },
          sampleCount: { __fromParam: 'sampleCount' },
          seed: { __fromParam: 'seed' },
          distribution: { __fromParam: 'distribution' },
        },
      },
    },
    edges: [],
    inputMap: {},
    outputMap: {
      domain: 'svg.domain',
      positions: 'svg.pos0',
    },
  },
  exposedInputs: [],
  exposedOutputs: [
    {
      id: 'domain',
      label: 'Domain',
      direction: 'output',
      slotType: 'Domain',
      nodeId: 'svg',
      nodePort: 'domain',
    },
    {
      id: 'positions',
      label: 'Positions',
      direction: 'output',
      slotType: 'Field<vec2>',
      nodeId: 'svg',
      nodePort: 'pos0',
    },
  ],
});

/**
 * PerElementRandom - Wrapper around FieldHash01ById for convenience.
 *
 * Provides per-element random values in [0,1) with a simpler interface.
 */
export const PerElementRandom = registerComposite({
  id: 'PerElementRandom',
  label: 'Per-Element Random',
  description: 'Generate random values for each element',
  color: '#EC4899',
  subcategory: 'Fields',
  laneKind: 'Fields',
  tags: {
    origin: 'domain-composites',
    form: 'composite',
  },
  graph: {
    nodes: {
      hash: {
        type: 'FieldHash01ById',
        params: {
          seed: { __fromParam: 'seed' },
        },
      },
    },
    edges: [],
    inputMap: {
      domain: 'hash.domain',
    },
    outputMap: {
      random: 'hash.u',
    },
  },
  exposedInputs: [
    {
      id: 'domain',
      label: 'Domain',
      direction: 'input',
      slotType: 'Domain',
      nodeId: 'hash',
      nodePort: 'domain',
    },
  ],
  exposedOutputs: [
    {
      id: 'random',
      label: 'Random',
      direction: 'output',
      slotType: 'Field<number>',
      nodeId: 'hash',
      nodePort: 'u',
    },
  ],
});

/**
 * PerElementPhaseOffset - Combines FieldHash01ById + FieldMapNumber to create phase offsets.
 *
 * Useful for staggering animations across elements.
 */
export const PerElementPhaseOffset = registerComposite({
  id: 'PerElementPhaseOffset',
  label: 'Per-Element Phase Offset',
  description: 'Generate phase offsets for staggered animations',
  color: '#EC4899',
  subcategory: 'Fields',
  laneKind: 'Fields',
  tags: {
    origin: 'domain-composites',
    form: 'composite',
  },
  graph: {
    nodes: {
      hash: {
        type: 'FieldHash01ById',
        params: {
          seed: { __fromParam: 'seed' },
        },
      },
      scale: {
        type: 'FieldMapNumber',
        params: {
          fn: 'scale',
          k: { __fromParam: 'maxOffset' },
        },
      },
    },
    edges: [
      { from: 'hash.u', to: 'scale.x' },
    ],
    inputMap: {
      domain: 'hash.domain',
    },
    outputMap: {
      offset: 'scale.y',
    },
  },
  exposedInputs: [
    {
      id: 'domain',
      label: 'Domain',
      direction: 'input',
      slotType: 'Domain',
      nodeId: 'hash',
      nodePort: 'domain',
    },
  ],
  exposedOutputs: [
    {
      id: 'offset',
      label: 'Offset',
      direction: 'output',
      slotType: 'Field<number>',
      nodeId: 'scale',
      nodePort: 'y',
    },
  ],
});

/**
 * SizeScatter - Random size variation using hash + map to range [min, max].
 *
 * Produces per-element radius values with controlled variation.
 */
export const SizeScatter = registerComposite({
  id: 'SizeScatter',
  label: 'Size Scatter',
  description: 'Random size variation per element',
  color: '#EC4899',
  subcategory: 'Fields',
  laneKind: 'Fields',
  tags: {
    origin: 'domain-composites',
    form: 'composite',
  },
  graph: {
    nodes: {
      hash: {
        type: 'FieldHash01ById',
        params: {
          seed: { __fromParam: 'seed' },
        },
      },
      mapToRange: {
        type: 'FieldMapNumber',
        params: {
          fn: 'scale',
          k: { __fromParam: 'range' }, // Will be (max - min)
          a: { __fromParam: 'min' },
          b: { __fromParam: 'max' },
        },
      },
      addMin: {
        type: 'FieldMapNumber',
        params: {
          fn: 'offset',
          k: { __fromParam: 'min' },
        },
      },
    },
    edges: [
      { from: 'hash.u', to: 'mapToRange.x' },
      { from: 'mapToRange.y', to: 'addMin.x' },
    ],
    inputMap: {
      domain: 'hash.domain',
    },
    outputMap: {
      size: 'addMin.y',
    },
  },
  exposedInputs: [
    {
      id: 'domain',
      label: 'Domain',
      direction: 'input',
      slotType: 'Domain',
      nodeId: 'hash',
      nodePort: 'domain',
    },
  ],
  exposedOutputs: [
    {
      id: 'size',
      label: 'Size',
      direction: 'output',
      slotType: 'Field<number>',
      nodeId: 'addMin',
      nodePort: 'y',
    },
  ],
});

/**
 * OrbitMotion - Uses FieldMapVec2 for rotation around a center point.
 *
 * Takes input positions and rotates them, useful for orbital animations.
 */
export const OrbitMotion = registerComposite({
  id: 'OrbitMotion',
  label: 'Orbit Motion',
  description: 'Rotate positions around a center point',
  color: '#A855F7',
  subcategory: 'Math',
  laneKind: 'Fields',
  tags: {
    origin: 'domain-composites',
    form: 'composite',
  },
  graph: {
    nodes: {
      rotate: {
        type: 'FieldMapVec2',
        params: {
          fn: 'rotate',
          angle: { __fromParam: 'angle' },
          centerX: { __fromParam: 'centerX' },
          centerY: { __fromParam: 'centerY' },
        },
      },
    },
    edges: [],
    inputMap: {
      positions: 'rotate.vec',
    },
    outputMap: {
      rotated: 'rotate.out',
    },
  },
  exposedInputs: [
    {
      id: 'positions',
      label: 'Positions',
      direction: 'input',
      slotType: 'Field<vec2>',
      nodeId: 'rotate',
      nodePort: 'vec',
    },
  ],
  exposedOutputs: [
    {
      id: 'rotated',
      label: 'Rotated',
      direction: 'output',
      slotType: 'Field<vec2>',
      nodeId: 'rotate',
      nodePort: 'out',
    },
  ],
});

/**
 * WaveDisplace - Creates wave displacement using sin transformation.
 *
 * Generates oscillating values for wave motion effects.
 */
export const WaveDisplace = registerComposite({
  id: 'WaveDisplace',
  label: 'Wave Displace',
  description: 'Generate wave displacement values',
  color: '#A855F7',
  subcategory: 'Math',
  laneKind: 'Fields',
  tags: {
    origin: 'domain-composites',
    form: 'composite',
  },
  graph: {
    nodes: {
      hash: {
        type: 'FieldHash01ById',
        params: {
          seed: { __fromParam: 'seed' },
        },
      },
      toRadians: {
        type: 'FieldMapNumber',
        params: {
          fn: 'scale',
          k: 6.28318530718, // 2 * PI
        },
      },
      sin: {
        type: 'FieldMapNumber',
        params: {
          fn: 'sin',
        },
      },
      amplitude: {
        type: 'FieldMapNumber',
        params: {
          fn: 'scale',
          k: { __fromParam: 'amplitude' },
        },
      },
    },
    edges: [
      { from: 'hash.u', to: 'toRadians.x' },
      { from: 'toRadians.y', to: 'sin.x' },
      { from: 'sin.y', to: 'amplitude.x' },
    ],
    inputMap: {
      domain: 'hash.domain',
    },
    outputMap: {
      displacement: 'amplitude.y',
    },
  },
  exposedInputs: [
    {
      id: 'domain',
      label: 'Domain',
      direction: 'input',
      slotType: 'Domain',
      nodeId: 'hash',
      nodePort: 'domain',
    },
  ],
  exposedOutputs: [
    {
      id: 'displacement',
      label: 'Displacement',
      direction: 'output',
      slotType: 'Field<number>',
      nodeId: 'amplitude',
      nodePort: 'y',
    },
  ],
});

/**
 * DotsRenderer - Full rendering pipeline: size scatter + color + RenderInstances2D.
 *
 * Combines multiple fields into a complete dots visualization.
 * Now supports optional radius input for bus-driven animation.
 */
export const DotsRenderer = registerComposite({
  id: 'DotsRenderer',
  label: 'Dots Renderer',
  description: 'Complete renderer with size and color variation',
  color: '#EF4444',
  subcategory: 'Render',
  laneKind: 'Output',
  tags: {
    origin: 'domain-composites',
    form: 'composite',
  },
  graph: {
    nodes: {
      // RenderInstances2D handles everything - domain, positions, radius
      // Color defaults to white since it's an input slot, not a param
      render: {
        type: 'RenderInstances2D',
        params: {
          opacity: { __fromParam: 'opacity' },
          glow: { __fromParam: 'glow' },
          glowIntensity: { __fromParam: 'glowIntensity' },
        },
      },
    },
    edges: [],
    inputMap: {
      domain: 'render.domain',
      positions: 'render.positions',
      radius: 'render.radius',
    },
    outputMap: {
      render: 'render.render',
    },
  },
  exposedInputs: [
    {
      id: 'domain',
      label: 'Domain',
      direction: 'input',
      slotType: 'Domain',
      nodeId: 'render',
      nodePort: 'domain',
    },
    {
      id: 'positions',
      label: 'Positions',
      direction: 'input',
      slotType: 'Field<vec2>',
      nodeId: 'render',
      nodePort: 'positions',
    },
    {
      id: 'radius',
      label: 'Radius',
      direction: 'input',
      slotType: 'Field<number>',
      nodeId: 'render',
      nodePort: 'radius',
    },
  ],
  exposedOutputs: [
    {
      id: 'render',
      label: 'Render',
      direction: 'output',
      slotType: 'Render',
      nodeId: 'render',
      nodePort: 'render',
    },
  ],
});

/**
 * Register all domain composites.
 * Called during editor initialization.
 */
export function registerDomainComposites(): void {
  // Composites are registered on module load via registerComposite() calls above
  // This function exists for explicit initialization if needed
}
