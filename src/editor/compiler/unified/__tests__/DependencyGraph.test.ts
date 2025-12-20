/**
 * @file DependencyGraph tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { DependencyGraph } from '../DependencyGraph';

describe('DependencyGraph', () => {
  let graph: DependencyGraph;

  beforeEach(() => {
    graph = new DependencyGraph();
  });

  it('adds block nodes', () => {
    graph.addBlockNode('block1');
    graph.addBlockNode('block2');

    const node1 = graph.getNode('block1');
    const node2 = graph.getNode('block2');

    expect(node1).toBeDefined();
    expect(node1?.type).toBe('block');
    expect(node2).toBeDefined();
  });

  it('adds bus nodes', () => {
    graph.addBusNode('bus1');

    const node = graph.getNode('bus1');
    expect(node).toBeDefined();
    expect(node?.type).toBe('bus');
  });

  it('tracks state blocks', () => {
    graph.addBlockNode('delay1', true);
    graph.addBlockNode('regular1', false);

    const nodes = graph.getAllNodes();
    expect(nodes).toHaveLength(2);
  });

  it('adds connection edges', () => {
    graph.addBlockNode('block1');
    graph.addBlockNode('block2');
    graph.addConnectionEdge('block1', 'block2');

    const edges = graph.getAllEdges();
    expect(edges).toHaveLength(1);
    expect(edges[0]?.type).toBe('connection');
    expect(edges[0]?.from).toBe('block1');
    expect(edges[0]?.to).toBe('block2');
  });

  it('adds publish/listen edges', () => {
    graph.addBlockNode('block1');
    graph.addBusNode('bus1');
    graph.addBlockNode('block2');

    graph.addPublishEdge('block1', 'bus1');
    graph.addListenEdge('bus1', 'block2');

    const edges = graph.getAllEdges();
    expect(edges).toHaveLength(2);

    const publishEdge = edges.find((e) => e.type === 'publish');
    const listenEdge = edges.find((e) => e.type === 'listen');

    expect(publishEdge).toBeDefined();
    expect(publishEdge?.from).toBe('block1');
    expect(publishEdge?.to).toBe('bus1');

    expect(listenEdge).toBeDefined();
    expect(listenEdge?.from).toBe('bus1');
    expect(listenEdge?.to).toBe('block2');
  });

  it('detects simple cycle', () => {
    graph.addBlockNode('block1');
    graph.addBlockNode('block2');
    graph.addConnectionEdge('block1', 'block2');
    graph.addConnectionEdge('block2', 'block1');

    const cycles = graph.detectCycles();
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0]?.isInstantaneous).toBe(true);
  });

  it('allows cycle through state block', () => {
    graph.addBlockNode('block1');
    graph.addBlockNode('delay1', true); // State block
    graph.addConnectionEdge('block1', 'delay1');
    graph.addConnectionEdge('delay1', 'block1');

    const cycles = graph.detectCycles();
    const instantaneousCycles = cycles.filter((c) => c.isInstantaneous);

    // Cycle exists but is not instantaneous
    expect(cycles.length).toBeGreaterThan(0);
    expect(instantaneousCycles.length).toBe(0);
  });

  it('performs topological sort', () => {
    graph.addBlockNode('block1');
    graph.addBlockNode('block2');
    graph.addBlockNode('block3');

    graph.addConnectionEdge('block1', 'block2');
    graph.addConnectionEdge('block2', 'block3');

    const order = graph.topologicalSort();

    expect(order).toHaveLength(3);
    expect(order.indexOf('block1')).toBeLessThan(order.indexOf('block2'));
    expect(order.indexOf('block2')).toBeLessThan(order.indexOf('block3'));
  });

  it('throws on topological sort with instantaneous cycle', () => {
    graph.addBlockNode('block1');
    graph.addBlockNode('block2');
    graph.addConnectionEdge('block1', 'block2');
    graph.addConnectionEdge('block2', 'block1');

    expect(() => graph.topologicalSort()).toThrow('instantaneous cycle');
  });

  it('computes transitive dependencies', () => {
    graph.addBlockNode('block1');
    graph.addBlockNode('block2');
    graph.addBlockNode('block3');

    graph.addConnectionEdge('block1', 'block2');
    graph.addConnectionEdge('block2', 'block3');

    const deps = graph.getDependencies('block3');

    expect(deps.has('block2')).toBe(true);
    expect(deps.has('block1')).toBe(true);
  });

  it('computes dependents', () => {
    graph.addBlockNode('block1');
    graph.addBlockNode('block2');
    graph.addBlockNode('block3');

    graph.addConnectionEdge('block1', 'block2');
    graph.addConnectionEdge('block1', 'block3');

    const dependents = graph.getDependents('block1');

    expect(dependents.has('block2')).toBe(true);
    expect(dependents.has('block3')).toBe(true);
  });

  it('handles bus-based routing', () => {
    graph.addBlockNode('source1');
    graph.addBlockNode('source2');
    graph.addBusNode('bus1');
    graph.addBlockNode('sink1');

    graph.addPublishEdge('source1', 'bus1');
    graph.addPublishEdge('source2', 'bus1');
    graph.addListenEdge('bus1', 'sink1');

    const order = graph.topologicalSort();

    // Sources must come before bus, bus must come before sink
    expect(order.indexOf('source1')).toBeLessThan(order.indexOf('bus1'));
    expect(order.indexOf('source2')).toBeLessThan(order.indexOf('bus1'));
    expect(order.indexOf('bus1')).toBeLessThan(order.indexOf('sink1'));
  });

  it('clears graph', () => {
    graph.addBlockNode('block1');
    graph.addBlockNode('block2');
    graph.addConnectionEdge('block1', 'block2');

    expect(graph.getAllNodes()).toHaveLength(2);
    expect(graph.getAllEdges()).toHaveLength(1);

    graph.clear();

    expect(graph.getAllNodes()).toHaveLength(0);
    expect(graph.getAllEdges()).toHaveLength(0);
  });
});
