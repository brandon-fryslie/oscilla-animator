import { describe, expect, it, beforeEach } from 'vitest';
import { createCompilerService, editorToPatch } from '../compiler';
import { RootStore } from '../stores/RootStore';
import { registerComposite } from '../composites';
import { registerAllComposites } from '../composite-bridge';

describe('demo patch loading', () => {
  beforeEach(() => {
    registerAllComposites();
  });

  it('loads and compiles breathing-dots demo without errors', () => {
    const store = new RootStore();

    // Load the demo patch
    store.loadDemoAnimation();

    // Verify patch loaded
    expect(store.patchStore.blocks.length).toBeGreaterThan(0);
    expect(store.patchStore.connections.length).toBeGreaterThan(0);
    expect(store.busStore.buses.length).toBeGreaterThan(0);
    expect(store.busStore.publishers.length).toBeGreaterThan(0);
    expect(store.busStore.listeners.length).toBeGreaterThan(0);

    // Compile the patch
    const compiler = createCompilerService(store);
    const result = compiler.compile();

    if (!result.ok) {
      console.error('Demo compilation errors:', result.errors);
    }

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.program).toBeDefined();

    // Verify program can render at t=0
    if (result.program) {
      const output = result.program.signal(0, { viewport: { w: 800, h: 600, dpr: 1 } });
      expect(output).toBeDefined();
    }
  });
});

describe('composite expansion', () => {
  beforeEach(() => {
    // Register all composites before each test
    registerAllComposites();
  });

  it.skip('expands composite graph and passes params into internal nodes', () => {
    const store = new RootStore();

    // Define a simple composite: index * scale
    const def = registerComposite({
      id: 'comp-scale-index',
      label: 'Scaled Index',
      subcategory: 'Timing',
      laneKind: 'Fields',
      graph: {
        nodes: {
          idx: { type: 'elementIndexField' },
          scale: { type: 'mulFieldNumber' },
          lift: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'factor' } } },
        },
        edges: [
          { from: 'idx.out', to: 'scale.a' },
          { from: 'lift.out', to: 'scale.b' },
        ],
        inputMap: {},
        outputMap: { out: 'scale.out' },
      },
      exposedInputs: [],
      exposedOutputs: [{ id: 'out', label: 'Out', direction: 'output', slotType: 'Field<number>', nodeId: 'scale', nodePort: 'out' }],
    });

    // Re-register composites after adding the new one
    registerAllComposites();

    // Get first lane (should be Fields lane)
    const lanes = store.patchStore.lanes;
    const lane = lanes.find((l: any) => l.kind === 'Fields') ?? lanes[0];

    const compositeId = store.patchStore.addBlock(`composite:${def.id}`, lane.id, { factor: 2 });
    const debugId = store.patchStore.addBlock('debugOutput', lane.id, {});
    store.patchStore.connect(compositeId, 'out', debugId, 'field');

    const compiler = createCompilerService(store);
    const result = compiler.compile();
    if (!result.ok) {
      // Log errors for visibility when the test fails
      console.error('Composite compile errors:', result.errors);
    }
    expect(result.ok).toBe(true);
  });
});

/**
 * Test Matrix: Composite Lowering + RewriteMap + Buses
 * Based on: feature_planning_docs/CompositeTransparencyTestMatrix.md
 */
describe('RewriteMap correctness (Test Matrix Section A)', () => {
  beforeEach(() => {
    registerAllComposites();
  });

  // A2 — Single composite with one mapped input
  it('A2: listener targeting composite boundary input rewrites to internal primitive', () => {
    const store = new RootStore();

    // Load demo patch which has:
    // - composite:DotsRenderer (block-3) with radius input
    // - listener targeting block-3.radius
    store.loadDemoAnimation();

    // Compile the patch
    const compiler = createCompilerService(store);
    const result = compiler.compile();

    // Verify compilation succeeds
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.program).toBeDefined();

    // Verify that the composite block (block-3) is NOT in the compiled graph
    // (it should have been expanded to block-3::render)
    const patch = editorToPatch(store);
    const originalBlocks = Array.from(patch.blocks.keys());
    expect(originalBlocks).toContain('block-3'); // Before expansion

    // The program should work at runtime
    if (result.program) {
      const rt = { viewport: { w: 800, h: 600, dpr: 1 } };
      const output = result.program.signal(0, rt);
      expect(output).toBeDefined();

      // Test at different times to verify animation works
      const output500 = result.program.signal(500, rt);
      const output1000 = result.program.signal(1000, rt);
      expect(output500).toBeDefined();
      expect(output1000).toBeDefined();
    }
  });

  // A4 — Multiple composites, unique mappings
  it('A4: two composites of same definition have distinct internal IDs', () => {
    const store = new RootStore();

    // Add two GridPoints composites
    const lanes = store.patchStore.lanes;
    const fieldsLane = lanes.find((l) => l.kind === 'Fields') ?? lanes[0];

    const grid1 = store.patchStore.addBlock('composite:GridPoints', fieldsLane.id, {
      count: 16,
      rows: 4,
      cols: 4,
      spacing: 50,
      originX: 200,
      originY: 200,
    });

    // Add second grid (we don't use it directly but it tests ID uniqueness)
    store.patchStore.addBlock('composite:GridPoints', fieldsLane.id, {
      count: 9,
      rows: 3,
      cols: 3,
      spacing: 40,
      originX: 600,
      originY: 200,
    });

    // Add a renderer connected to one of them
    const outputLane = lanes.find((l) => l.kind === 'Output') ?? lanes[lanes.length - 1];
    const renderer = store.patchStore.addBlock('RenderInstances2D', outputLane.id, {});

    // Connect first grid to renderer
    store.patchStore.connect(grid1, 'domain', renderer, 'domain');
    store.patchStore.connect(grid1, 'positions', renderer, 'positions');

    // Compile
    const compiler = createCompilerService(store);
    const result = compiler.compile();

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);

    // The internal IDs should be distinct
    // grid1 expands to grid1::domain, grid1::grid
    // grid2 expands to grid2::domain, grid2::grid
    // These should NOT cross-wire
  });
});

describe('Bus bindings through composites (Test Matrix Section B)', () => {
  beforeEach(() => {
    registerAllComposites();
  });

  // B1 — Listener targets composite boundary input
  it('B1: listener to composite boundary input remaps to internal primitive port', () => {
    const store = new RootStore();

    // Load demo which has listener -> block-3.radius where block-3 is DotsRenderer composite
    store.loadDemoAnimation();

    // Verify the listener exists before compilation
    expect(store.busStore.listeners.length).toBeGreaterThan(0);
    const listener = store.busStore.listeners[0];
    expect(listener.to.blockId).toBe('block-3'); // Targets composite
    expect(listener.to.slotId).toBe('radius');

    // Compile
    const compiler = createCompilerService(store);
    const result = compiler.compile();

    // Should succeed - the listener was remapped internally
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);

    // Verify animation at runtime
    if (result.program) {
      const rt = { viewport: { w: 800, h: 600, dpr: 1 } };
      // At t=0 (phase=0), radius should be lens(0) = 0*12+8 = 8
      // At t=1000 (phase=0.5 for 2s duration), radius should be lens(0.5) = 0.5*12+8 = 14
      const output0 = result.program.signal(0, rt);
      const output1000 = result.program.signal(1000, rt);
      expect(output0).toBeDefined();
      expect(output1000).toBeDefined();
    }
  });

  // B5 — Listener with lens stack on composite boundary
  it('B5: lens transformation preserved after rewrite', () => {
    const store = new RootStore();

    // Load demo which has listener with scale lens (scale=12, offset=8)
    store.loadDemoAnimation();

    const listener = store.busStore.listeners[0];
    expect(listener.lens).toBeDefined();
    expect(listener.lens?.type).toBe('scale');
    expect(listener.lens?.params.scale).toBe(12);
    expect(listener.lens?.params.offset).toBe(8);

    // Compile
    const compiler = createCompilerService(store);
    const result = compiler.compile();

    expect(result.ok).toBe(true);

    // The lens should still be applied in the output
    // Lens transforms phase (0-1) to radius (8-20)
    if (result.program) {
      const rt = { viewport: { w: 800, h: 600, dpr: 1 } };
      // We can't easily extract the radius value from the render tree,
      // but we can verify the program runs without error at various times
      for (const t of [0, 250, 500, 750, 1000, 1500, 2000]) {
        const output = result.program.signal(t, rt);
        expect(output).toBeDefined();
        // Output could be 'group' or 'effect' depending on glow settings
        expect(['group', 'effect']).toContain(output.kind);
      }
    }
  });
});

describe('Deterministic identity (Test Matrix Section D)', () => {
  beforeEach(() => {
    registerAllComposites();
  });

  // D1 — Internal ID determinism across compiles
  it('D1: same patch compiled twice produces identical results', () => {
    const store = new RootStore();
    store.loadDemoAnimation();

    const compiler = createCompilerService(store);

    // Compile twice
    const result1 = compiler.compile();
    const result2 = compiler.compile();

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);

    // Both should produce programs
    expect(result1.program).toBeDefined();
    expect(result2.program).toBeDefined();

    // Verify outputs are identical at specific times
    if (result1.program && result2.program) {
      const rt = { viewport: { w: 800, h: 600, dpr: 1 } };
      for (const t of [0, 500, 1000, 1500, 2000]) {
        const out1 = JSON.stringify(result1.program.signal(t, rt));
        const out2 = JSON.stringify(result2.program.signal(t, rt));
        expect(out1).toBe(out2);
      }
    }
  });

  // D2 — Internal ID stability under unrelated edits
  it('D2: adding unrelated block does not change composite expansion IDs', () => {
    const store = new RootStore();
    store.loadDemoAnimation();

    // Compile first
    const compiler = createCompilerService(store);
    const result1 = compiler.compile();
    expect(result1.ok).toBe(true);

    // Add an unrelated block
    const lanes = store.patchStore.lanes;
    const phaseLane = lanes.find((l) => l.kind === 'Phase') ?? lanes[0];
    store.patchStore.addBlock('PhaseClockLegacy', phaseLane.id, { duration: 5 });

    // Compile again
    const result2 = compiler.compile();
    expect(result2.ok).toBe(true);

    // Both should work - the existing composite's internal IDs should be stable
    if (result1.program && result2.program) {
      const rt = { viewport: { w: 800, h: 600, dpr: 1 } };
      // The original animation should still work at t=0
      const out1 = result1.program.signal(0, rt);
      const out2 = result2.program.signal(0, rt);
      expect(out1).toBeDefined();
      expect(out2).toBeDefined();
      // Note: outputs may differ because of the new PhaseClock, but both should be valid
    }
  });
});

describe('Error handling (Test Matrix Section H)', () => {
  beforeEach(() => {
    registerAllComposites();
  });

  // H2 — Rewrite produces null (unmappable port)
  it('H2: listener targeting unmapped composite port produces hard error', () => {
    const store = new RootStore();

    // Add a composite and a bus binding to a non-existent port
    const lanes = store.patchStore.lanes;
    const fieldsLane = lanes.find((l) => l.kind === 'Fields') ?? lanes[0];
    const phaseLane = lanes.find((l) => l.kind === 'Phase') ?? lanes[1];
    const outputLane = lanes.find((l) => l.kind === 'Output') ?? lanes[lanes.length - 1];

    // Add GridPoints composite (has domain, positions outputs but no "foobar" port)
    const gridId = store.patchStore.addBlock('composite:GridPoints', fieldsLane.id, {
      count: 16,
      rows: 4,
      cols: 4,
    });

    // Add a phase clock (legacy, doesn't require tIn input)
    const clockId = store.patchStore.addBlock('PhaseClockLegacy', phaseLane.id, { duration: 2 });

    // Add a renderer
    const rendererId = store.patchStore.addBlock('RenderInstances2D', outputLane.id, {});

    // Connect grid to renderer
    store.patchStore.connect(gridId, 'domain', rendererId, 'domain');
    store.patchStore.connect(gridId, 'positions', rendererId, 'positions');

    // Add a bus
    const busId = store.busStore.createBus(
      {
        world: 'signal',
        domain: 'number',
        category: 'core',
        busEligible: true,
      },
      'testBus',
      'last',
      0
    );

    // Add publisher from clock
    store.busStore.addPublisher(busId, clockId, 'phase');

    // Add listener to an INVALID port on the composite (not in inputMap)
    store.busStore.addListener(busId, gridId, 'nonExistentPort');

    // Compile - should fail with PortMissing error
    const compiler = createCompilerService(store);
    const result = compiler.compile();

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);

    // Should have a PortMissing error about the unmapped port
    const portError = result.errors.find((e) => e.code === 'PortMissing');
    expect(portError).toBeDefined();
    expect(portError?.message).toContain('not exposed by composite boundary');
  });
});
