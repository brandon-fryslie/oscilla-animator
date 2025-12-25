/**
 * Composite Library Test Suite
 *
 * Comprehensive tests for the composite library system, including:
 * - Registration and validation
 * - Graph structure validation
 * - Bus-aware composite tests
 * - SVGSampleDomain primitive tests
 * - Macro expansion tests
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { listCompositeDefinitions } from '../composites';
import { registerAllComposites, getCompositeBlockDefinitions } from '../composite-bridge';
import { MACRO_REGISTRY, getMacroKey, getMacroExpansion } from '../macros';
import { RootStore } from '../stores/RootStore';
import { createCompilerService } from '../compiler';
import { getBlockForm } from '../blocks/types';

describe('Composite Registration', () => {
  beforeEach(() => {
    registerAllComposites();
  });

  it('registers all composites correctly', () => {
    const composites = listCompositeDefinitions();
    expect(composites.length).toBeGreaterThan(0);
  });

  it('has no duplicate composite IDs', () => {
    const composites = listCompositeDefinitions();
    const ids = composites.map(c => c.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('each composite has valid id, label, and graph', () => {
    const composites = listCompositeDefinitions();
    for (const comp of composites) {
      expect(comp.id).toBeTruthy();
      expect(comp.label).toBeTruthy();
      expect(comp.graph).toBeDefined();
      expect(comp.graph.nodes).toBeDefined();
      expect(comp.graph.edges).toBeDefined();
      expect(comp.graph.inputMap).toBeDefined();
      expect(comp.graph.outputMap).toBeDefined();
    }
  });

  it('each composite has valid lane kind and subcategory', () => {
    const composites = listCompositeDefinitions();
    const validLaneKinds = ['Scene', 'Phase', 'Fields', 'Spec', 'Program', 'Output'];

    for (const comp of composites) {
      expect(validLaneKinds).toContain(comp.laneKind);
      expect(comp.subcategory).toBeTruthy();
    }
  });

  it('composites appear in block definitions', () => {
    const blockDefs = getCompositeBlockDefinitions();
    expect(blockDefs.length).toBeGreaterThan(0);

    for (const def of blockDefs) {
      expect(def.type).toMatch(/^composite:/);
      // form is derived from compositeDefinition, not stored
      expect(getBlockForm(def)).toBe('composite');
    }
  });
});

describe('Composite Graph Validation', () => {
  beforeEach(() => {
    registerAllComposites();
  });

  it('internal edges connect valid node IDs', () => {
    const composites = listCompositeDefinitions();

    for (const comp of composites) {
      const nodeIds = Object.keys(comp.graph.nodes);

      for (const edge of comp.graph.edges) {
        const [fromNode] = edge.from.split('.');
        const [toNode] = edge.to.split('.');

        expect(nodeIds).toContain(fromNode);
        expect(nodeIds).toContain(toNode);
      }
    }
  });

  it('exposed inputs map to valid internal nodes', () => {
    const composites = listCompositeDefinitions();

    for (const comp of composites) {
      const nodeIds = Object.keys(comp.graph.nodes);

      for (const input of comp.exposedInputs) {
        expect(nodeIds).toContain(input.nodeId);
      }
    }
  });

  it('exposed outputs map to valid internal nodes', () => {
    const composites = listCompositeDefinitions();

    for (const comp of composites) {
      const nodeIds = Object.keys(comp.graph.nodes);

      for (const output of comp.exposedOutputs) {
        expect(nodeIds).toContain(output.nodeId);
      }
    }
  });

  it('inputMap references are either exposed inputs or bus-subscribed', () => {
    const composites = listCompositeDefinitions();

    for (const comp of composites) {
      const exposedInputIds = comp.exposedInputs.map(i => i.id);
      const busSubscribedPorts = Object.keys(comp.graph.busSubscriptions || {});
      const inputMapKeys = Object.keys(comp.graph.inputMap);

      // Every key in inputMap should be either an exposed input or a bus subscription
      for (const key of inputMapKeys) {
        const isExposed = exposedInputIds.includes(key);
        const isBusSubscribed = busSubscribedPorts.includes(key);
        expect(isExposed || isBusSubscribed).toBe(true);
      }
    }
  });

  it('outputMap references are either exposed outputs or bus-published', () => {
    const composites = listCompositeDefinitions();

    for (const comp of composites) {
      const exposedOutputIds = comp.exposedOutputs.map(o => o.id);
      const busPublishedPorts = Object.keys(comp.graph.busPublications || {});
      const outputMapKeys = Object.keys(comp.graph.outputMap);

      // Every key in outputMap should be either an exposed output or a bus publication
      for (const key of outputMapKeys) {
        const isExposed = exposedOutputIds.includes(key);
        const isBusPublished = busPublishedPorts.includes(key);
        expect(isExposed || isBusPublished).toBe(true);
      }
    }
  });

  it('parameter forwarding (__fromParam) is well-formed', () => {
    const composites = listCompositeDefinitions();

    for (const comp of composites) {
      for (const [_nodeId, nodeSpec] of Object.entries(comp.graph.nodes)) {
        if (nodeSpec.params) {
          for (const [_paramKey, paramValue] of Object.entries(nodeSpec.params)) {
            if (typeof paramValue === 'object' && paramValue !== null && '__fromParam' in paramValue) {
              expect(typeof (paramValue as any).__fromParam).toBe('string');
            }
          }
        }
      }
    }
  });
});

describe('Bus-Aware Composites', () => {
  beforeEach(() => {
    registerAllComposites();
  });

  it('composites with busSubscriptions reference valid inputs', () => {
    const composites = listCompositeDefinitions();

    for (const comp of composites) {
      if (comp.graph.busSubscriptions) {
        const inputMapKeys = Object.keys(comp.graph.inputMap);

        for (const inputPort of Object.keys(comp.graph.busSubscriptions)) {
          expect(inputMapKeys).toContain(inputPort);
        }
      }
    }
  });

  it('composites with busPublications reference valid outputs', () => {
    const composites = listCompositeDefinitions();

    for (const comp of composites) {
      if (comp.graph.busPublications) {
        const outputMapKeys = Object.keys(comp.graph.outputMap);

        for (const outputPort of Object.keys(comp.graph.busPublications)) {
          expect(outputMapKeys).toContain(outputPort);
        }
      }
    }
  });

  it('bus names are valid canonical names', () => {
    const composites = listCompositeDefinitions();
    const validBusNames = ['phaseA', 'phaseB', 'pulse', 'energy', 'palette', 'progress'];

    for (const comp of composites) {
      if (comp.graph.busSubscriptions) {
        for (const busName of Object.values(comp.graph.busSubscriptions)) {
          expect(validBusNames).toContain(busName);
        }
      }

      if (comp.graph.busPublications) {
        for (const busName of Object.values(comp.graph.busPublications)) {
          expect(validBusNames).toContain(busName);
        }
      }
    }
  });

  it('BreathingScale composite has correct bus bindings', () => {
    const composites = listCompositeDefinitions();
    const breathingScale = composites.find(c => c.id === 'BreathingScale');

    expect(breathingScale).toBeDefined();
    expect(breathingScale?.graph.busSubscriptions).toEqual({ phase: 'phaseA' });
    expect(breathingScale?.graph.busPublications).toEqual({ out: 'energy' });
  });

  it('PaletteDrift composite has correct bus bindings', () => {
    const composites = listCompositeDefinitions();
    const paletteDrift = composites.find(c => c.id === 'PaletteDrift');

    expect(paletteDrift).toBeDefined();
    expect(paletteDrift?.graph.busSubscriptions).toEqual({ phase: 'phaseB' });
    expect(paletteDrift?.graph.busPublications).toEqual({ color: 'palette' });
  });

  it('PulseToEnvelope composite has correct bus bindings', () => {
    const composites = listCompositeDefinitions();
    const pulseToEnvelope = composites.find(c => c.id === 'PulseToEnvelope');

    expect(pulseToEnvelope).toBeDefined();
    expect(pulseToEnvelope?.graph.busSubscriptions).toEqual({ trigger: 'pulse' });
    expect(pulseToEnvelope?.graph.busPublications).toEqual({ env: 'energy' });
  });

  it('PhaseWrapPulse composite has correct bus bindings', () => {
    const composites = listCompositeDefinitions();
    const phaseWrapPulse = composites.find(c => c.id === 'PhaseWrapPulse');

    expect(phaseWrapPulse).toBeDefined();
    expect(phaseWrapPulse?.graph.busSubscriptions).toEqual({ phase: 'phaseA' });
    expect(phaseWrapPulse?.graph.busPublications).toEqual({ tick: 'pulse' });
  });
});

describe('Domain Composites', () => {
  beforeEach(() => {
    registerAllComposites();
  });

  it('GridPoints composite exists with correct structure', () => {
    const composites = listCompositeDefinitions();
    const gridPoints = composites.find(c => c.id === 'GridPoints');

    expect(gridPoints).toBeDefined();
    expect(gridPoints?.laneKind).toBe('Fields');
    expect(gridPoints?.subcategory).toBe('Sources');

    // Should have domain and grid nodes
    expect(gridPoints?.graph.nodes.domain).toBeDefined();
    expect(gridPoints?.graph.nodes.grid).toBeDefined();
    expect(gridPoints?.graph.nodes.domain.type).toBe('DomainN');
    expect(gridPoints?.graph.nodes.grid.type).toBe('PositionMapGrid');

    // Should expose domain and positions outputs
    expect(gridPoints?.exposedOutputs.some(o => o.id === 'domain')).toBe(true);
    expect(gridPoints?.exposedOutputs.some(o => o.id === 'positions')).toBe(true);
  });

  it('CirclePoints composite exists with correct structure', () => {
    const composites = listCompositeDefinitions();
    const circlePoints = composites.find(c => c.id === 'CirclePoints');

    expect(circlePoints).toBeDefined();
    expect(circlePoints?.graph.nodes.domain.type).toBe('DomainN');
    expect(circlePoints?.graph.nodes.circle.type).toBe('PositionMapCircle');
  });

  it('SVGSamplePoints composite wraps SVGSampleDomain', () => {
    const composites = listCompositeDefinitions();
    const svgSample = composites.find(c => c.id === 'SVGSamplePoints');

    expect(svgSample).toBeDefined();
    expect(svgSample?.graph.nodes.svg).toBeDefined();
    expect(svgSample?.graph.nodes.svg.type).toBe('SVGSampleDomain');

    // Should expose domain and positions from SVG block
    expect(svgSample?.exposedOutputs.some(o => o.id === 'domain')).toBe(true);
    expect(svgSample?.exposedOutputs.some(o => o.id === 'positions')).toBe(true);
  });

  it('DotsRenderer composite has correct render pipeline', () => {
    const composites = listCompositeDefinitions();
    const dotsRenderer = composites.find(c => c.id === 'DotsRenderer');

    expect(dotsRenderer).toBeDefined();
    expect(dotsRenderer?.laneKind).toBe('Output');
    expect(dotsRenderer?.subcategory).toBe('Render');

    // Should have RenderInstances2D node
    expect(dotsRenderer?.graph.nodes.render).toBeDefined();
    expect(dotsRenderer?.graph.nodes.render.type).toBe('RenderInstances2D');

    // Should accept domain, positions, radius inputs
    expect(dotsRenderer?.exposedInputs.some(i => i.id === 'domain')).toBe(true);
    expect(dotsRenderer?.exposedInputs.some(i => i.id === 'positions')).toBe(true);
    expect(dotsRenderer?.exposedInputs.some(i => i.id === 'radius')).toBe(true);
  });
});

describe('Signal Composites', () => {
  beforeEach(() => {
    registerAllComposites();
  });

  it('RotationScatter composite exists', () => {
    const composites = listCompositeDefinitions();
    const rotationScatter = composites.find(c => c.id === 'RotationScatter');

    expect(rotationScatter).toBeDefined();
    expect(rotationScatter?.laneKind).toBe('Fields');
    expect(rotationScatter?.subcategory).toBe('Fields');
  });

  it('PerElementColorScatter composite exists', () => {
    const composites = listCompositeDefinitions();
    const colorScatter = composites.find(c => c.id === 'PerElementColorScatter');

    expect(colorScatter).toBeDefined();
    expect(colorScatter?.subcategory).toBe('Style');
  });

  it('JitterMotion composite has phase input', () => {
    const composites = listCompositeDefinitions();
    const jitterMotion = composites.find(c => c.id === 'JitterMotion');

    expect(jitterMotion).toBeDefined();
    expect(jitterMotion?.exposedInputs.some(i => i.id === 'phase')).toBe(true);
    expect(jitterMotion?.exposedInputs.some(i => i.id === 'domain')).toBe(true);
  });

  it('GlyphRenderer composite exists', () => {
    const composites = listCompositeDefinitions();
    const glyphRenderer = composites.find(c => c.id === 'GlyphRenderer');

    expect(glyphRenderer).toBeDefined();
    expect(glyphRenderer?.laneKind).toBe('Output');
    expect(glyphRenderer?.subcategory).toBe('Render');
  });
});

describe('Macro Registry', () => {
  it('has expected macro entries', () => {
    expect(MACRO_REGISTRY).toBeDefined();
    expect(Object.keys(MACRO_REGISTRY).length).toBeGreaterThan(0);
  });

  it('all macros have valid structure', () => {
    for (const [_macroKey, macro] of Object.entries(MACRO_REGISTRY)) {
      expect(macro.blocks).toBeDefined();
      expect(Array.isArray(macro.blocks)).toBe(true);
      expect(macro.connections).toBeDefined();
      expect(Array.isArray(macro.connections)).toBe(true);

      // Each block has required fields
      for (const block of macro.blocks) {
        expect(block.ref).toBeTruthy();
        expect(block.type).toBeTruthy();
        expect(block.laneKind).toBeTruthy();
      }

      // Each connection references valid refs
      const blockRefs = new Set(macro.blocks.map(b => b.ref));
      for (const conn of macro.connections) {
        expect(blockRefs.has(conn.fromRef)).toBe(true);
        expect(blockRefs.has(conn.toRef)).toBe(true);
      }
    }
  });

  it('breathingDots macro has correct structure', () => {
    const macro = MACRO_REGISTRY['macro:breathingDots'];

    expect(macro).toBeDefined();
    expect(macro.blocks.length).toBeGreaterThan(0);
    expect(macro.connections.length).toBeGreaterThan(0);

    // breathingDots has no publishers, only listeners
    expect(macro.listeners).toBeDefined();
    expect((macro.listeners || []).length).toBeGreaterThan(0);

    // Should listen to phaseA bus (not publish to it)
    expect((macro.listeners || []).some(l => l.busName === 'phaseA')).toBe(true);
    expect(macro.publishers?.length || 0).toBe(0);  // No publishers
  });

  it('goldenPatch macro has complete structure', () => {
    const macro = MACRO_REGISTRY['macro:goldenPatch'];

    expect(macro).toBeDefined();

    // Should have multiple blocks for complete golden patch
    const blockTypes = macro.blocks.map(b => b.type);
    expect(blockTypes).toContain('GridDomain');
    expect(blockTypes).toContain('RenderInstances2D');
    const publishedBuses = new Set(macro.publishers?.map(p => p.busName) || []);
    // Should publish to all major buses
    // phaseA is listened to, not published
    expect(publishedBuses.has('phaseA')).toBe(false);
    // pulse is not published by goldenPatch
    expect(publishedBuses.has('pulse')).toBe(false);
    expect(publishedBuses.has('palette')).toBe(true);
  });

  it('getMacroKey identifies macro types correctly', () => {
    expect(getMacroKey('macro:breathingDots')).toBe('macro:breathingDots');
    expect(getMacroKey('macro:goldenPatch')).toBe('macro:goldenPatch');
    expect(getMacroKey('notAMacro')).toBeNull();
  });

  it('getMacroExpansion retrieves macro correctly', () => {
    const expansion = getMacroExpansion('macro:breathingDots');
    expect(expansion).toBeDefined();
    expect(expansion?.blocks).toBeDefined();
  });
});

describe('Macro Expansion Integration', () => {
  beforeEach(() => {
    registerAllComposites();
  });

  it('macro publishers reference valid block refs', () => {
    for (const [_key, macro] of Object.entries(MACRO_REGISTRY)) {
      if (!macro.publishers) continue;

      const blockRefs = new Set(macro.blocks.map(b => b.ref));
      for (const pub of macro.publishers) {
        expect(blockRefs.has(pub.fromRef)).toBe(true);
        expect(pub.fromSlot).toBeTruthy();
        expect(pub.busName).toBeTruthy();
      }
    }
  });

  it('macro listeners reference valid block refs', () => {
    for (const [_key, macro] of Object.entries(MACRO_REGISTRY)) {
      if (!macro.listeners) continue;

      const blockRefs = new Set(macro.blocks.map(b => b.ref));
      for (const listener of macro.listeners) {
        expect(blockRefs.has(listener.toRef)).toBe(true);
        expect(listener.toSlot).toBeTruthy();
        expect(listener.busName).toBeTruthy();
      }
    }
  });

  it('macro listeners with lenses have valid lens types', () => {
    for (const [_key, macro] of Object.entries(MACRO_REGISTRY)) {
      if (!macro.listeners) continue;

      for (const listener of macro.listeners) {
        if (listener.lens) {
          expect(listener.lens.type).toBeTruthy();
          expect(listener.lens.params).toBeDefined();
        }
      }
    }
  });
});

describe('Composite Compilation', () => {
  beforeEach(() => {
    registerAllComposites();
  });

  it('GridPoints composite compiles successfully', () => {
    const store = new RootStore();

    // Add CycleTimeRoot - required for all patches
    store.patchStore.addBlock('CycleTimeRoot', { periodMs: 3000 });

    // Add GridPoints composite
    const gridId = store.patchStore.addBlock('composite:GridPoints', {
      count: 16,
      rows: 4,
      cols: 4,
      spacing: 50,
      originX: 200,
      originY: 200,
    });

    // Add renderer
    const renderId = store.patchStore.addBlock('RenderInstances2D');

    // Connect grid to renderer
    store.patchStore.connect(gridId, 'domain', renderId, 'domain');
    store.patchStore.connect(gridId, 'positions', renderId, 'positions');

    // Add a constant radius field
    const radiusId = store.patchStore.addBlock('FieldConstNumber', { value: 5 });
    store.patchStore.connect(gridId, 'domain', radiusId, 'domain');
    store.patchStore.connect(radiusId, 'out', renderId, 'radius');

    // Compile
    const compiler = createCompilerService(store);
    const result = compiler.compile();

    if (!result.ok) {
      console.error('Compilation errors:', result.errors);
    }

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.program).toBeDefined();
  });

  it('CirclePoints composite compiles successfully', () => {
    const store = new RootStore();

    // Add CycleTimeRoot - required for all patches
    store.patchStore.addBlock('CycleTimeRoot', { periodMs: 3000 });

    // Add CirclePoints composite
    const circleId = store.patchStore.addBlock('composite:CirclePoints', {
      count: 12,
      centerX: 400,
      centerY: 300,
      radius: 150,
    });

    // Add renderer
    const renderId = store.patchStore.addBlock('RenderInstances2D');

    // Connect circle to renderer
    store.patchStore.connect(circleId, 'domain', renderId, 'domain');
    store.patchStore.connect(circleId, 'positions', renderId, 'positions');

    // Add constant radius
    const radiusId = store.patchStore.addBlock('FieldConstNumber', { value: 8 });
    store.patchStore.connect(circleId, 'domain', radiusId, 'domain');
    store.patchStore.connect(radiusId, 'out', renderId, 'radius');

    // Compile
    const compiler = createCompilerService(store);
    const result = compiler.compile();

    expect(result.ok).toBe(true);
    expect(result.program).toBeDefined();
  });

  it('DotsRenderer composite with bus-driven radius compiles', () => {
    const store = new RootStore();

    // Add CycleTimeRoot - required for all patches
    store.patchStore.addBlock('CycleTimeRoot', { periodMs: 3000 });

    // Add domain
    const domainId = store.patchStore.addBlock('DomainN', { n: 25, seed: 42 });

    // Add grid layout
    const gridId = store.patchStore.addBlock('PositionMapGrid', {
      rows: 5,
      cols: 5,
      spacing: 60,
    });

    // Add phase clock
    const clockId = store.patchStore.addBlock('PhaseClockLegacy', { duration: 2 });

    // Add DotsRenderer composite
    const renderId = store.patchStore.addBlock('composite:DotsRenderer');

    // Connect domain and positions
    store.patchStore.connect(domainId, 'domain', gridId, 'domain');
    store.patchStore.connect(domainId, 'domain', renderId, 'domain');
    store.patchStore.connect(gridId, 'pos', renderId, 'positions');

    // Find or create phaseA bus (it may already exist from other tests)
    let busId = store.busStore.buses.find(b => b.name === 'phaseA')?.id;
    if (!busId) {
      busId = store.busStore.createBus(
        {
          world: 'signal',
          domain: 'phase',
          category: 'core',
          busEligible: true,
        },
        'phaseA',
        'last',
        0
      );
    }

    // Publish clock phase to bus
    store.busStore.addPublisher(busId, clockId, 'phase');

    // Listen on renderer radius with scale lens
    store.busStore.addListener(busId, renderId, 'radius', undefined, {
      type: 'scale',
      params: { scale: 12, offset: 8 },
    });

    // Compile
    const compiler = createCompilerService(store);
    const result = compiler.compile();

    if (!result.ok) {
      console.error('Compilation errors:', result.errors);
    }

    expect(result.ok).toBe(true);
    expect(result.program).toBeDefined();

    // Test runtime
    if (result.program) {
      const rt = { viewport: { w: 800, h: 600, dpr: 1 } };
      const output = result.program.signal(0, rt);
      expect(output).toBeDefined();
    }
  });
});

describe('Expected Composite Count', () => {
  beforeEach(() => {
    registerAllComposites();
  });

  it('has the expected number of domain composites', () => {
    const composites = listCompositeDefinitions();

    // Domain composites: GridPoints, CirclePoints, LinePoints, SVGSamplePoints,
    // PerElementRandom, PerElementPhaseOffset, SizeScatter, OrbitMotion,
    // WaveDisplace, DotsRenderer
    const domainComposites = composites.filter(c =>
      c.id === 'GridPoints' ||
      c.id === 'CirclePoints' ||
      c.id === 'LinePoints' ||
      c.id === 'SVGSamplePoints' ||
      c.id === 'PerElementRandom' ||
      c.id === 'PerElementPhaseOffset' ||
      c.id === 'SizeScatter' ||
      c.id === 'OrbitMotion' ||
      c.id === 'WaveDisplace' ||
      c.id === 'DotsRenderer'
    );

    expect(domainComposites.length).toBe(10);
  });

  it('has the expected number of signal composites', () => {
    const composites = listCompositeDefinitions();

    // Signal composites: RotationScatter, BreathingScale, PaletteDrift,
    // PerElementColorScatter, PulseToEnvelope, PhaseWrapPulse,
    // GlyphRenderer, JitterMotion
    const signalComposites = composites.filter(c =>
      c.id === 'RotationScatter' ||
      c.id === 'BreathingScale' ||
      c.id === 'PaletteDrift' ||
      c.id === 'PerElementColorScatter' ||
      c.id === 'PulseToEnvelope' ||
      c.id === 'PhaseWrapPulse' ||
      c.id === 'GlyphRenderer' ||
      c.id === 'JitterMotion'
    );

    expect(signalComposites.length).toBe(8);
  });
});
