/**
 * Compositor Middleware Tests
 */

import { describe, it, expect } from 'vitest';
import {
  // Selection
  find,
  hasTag,
  byId,
  byKind,
  and,
  or,
  not,
  all,

  // Rewrite
  drawNodeRewrite,
  drawNodeAdapter,

  // Compositor
  createCompositor,
  applyStack,
  createStack,
  scoped,
  opacityCompositor,

  // Resources
  emptyRegistry,
  addResource,
  glowFilter,
} from '../index';

import { group, path, withOpacity, type DrawNode } from '../../runtime/renderTree';

// =============================================================================
// Test Fixtures
// =============================================================================

function makeTestTree(): DrawNode {
  return group('root', [
    path('stroke-1', 'M0,0 L100,100', { stroke: '#fff' }, { tags: ['stroke', 'animated'] }),
    path('stroke-2', 'M0,100 L100,0', { stroke: '#fff' }, { tags: ['stroke'] }),
    group('particles', [
      path('p-1', 'M50,50 L51,51', { fill: '#f00' }, { tags: ['particle'] }),
      path('p-2', 'M60,60 L61,61', { fill: '#0f0' }, { tags: ['particle'] }),
      path('p-3', 'M70,70 L71,71', { fill: '#00f' }, { tags: ['particle'] }),
    ], { tags: ['particles-group'] }),
  ]);
}

// =============================================================================
// Selection Tests
// =============================================================================

describe('Selection API', () => {
  it('finds all nodes', () => {
    const tree = makeTestTree();
    const refs = find(tree, { selector: all }, {}, drawNodeAdapter.getChildren);

    expect(refs.length).toBe(7); // root + 2 strokes + particles group + 3 particles
    expect(refs[0].id).toBe('root');
    expect(refs[0].path).toEqual([]);
  });

  it('finds nodes by tag', () => {
    const tree = makeTestTree();
    const refs = find(tree, { selector: hasTag('stroke') }, {}, drawNodeAdapter.getChildren);

    expect(refs.length).toBe(2);
    expect(refs.map(r => r.id)).toEqual(['stroke-1', 'stroke-2']);
  });

  it('finds nodes by id', () => {
    const tree = makeTestTree();
    const refs = find(tree, { selector: byId('p-2') }, {}, drawNodeAdapter.getChildren);

    expect(refs.length).toBe(1);
    expect(refs[0].id).toBe('p-2');
    expect(refs[0].path).toEqual([2, 1]); // root -> particles(2) -> p-2(1)
  });

  it('combines selectors with and/or/not', () => {
    const tree = makeTestTree();

    // stroke AND animated
    const animated = find(
      tree,
      { selector: and(hasTag('stroke'), hasTag('animated')) },
      {},
      drawNodeAdapter.getChildren
    );
    expect(animated.length).toBe(1);
    expect(animated[0].id).toBe('stroke-1');

    // particle OR stroke
    const particleOrStroke = find(
      tree,
      { selector: or(hasTag('particle'), hasTag('stroke')) },
      {},
      drawNodeAdapter.getChildren
    );
    expect(particleOrStroke.length).toBe(5);

    // NOT group
    const notGroups = find(
      tree,
      { selector: not(byKind('group')) },
      {},
      drawNodeAdapter.getChildren
    );
    expect(notGroups.length).toBe(5); // 2 strokes + 3 particles
  });
});

// =============================================================================
// TreeRewrite Tests
// =============================================================================

describe('TreeRewrite', () => {
  it('gets node at path', () => {
    const tree = makeTestTree();

    const root = drawNodeRewrite.getAt(tree, []);
    expect(root.id).toBe('root');

    const stroke1 = drawNodeRewrite.getAt(tree, [0]);
    expect(stroke1.id).toBe('stroke-1');

    const p2 = drawNodeRewrite.getAt(tree, [2, 1]);
    expect(p2.id).toBe('p-2');
  });

  it('replaces node at path', () => {
    const tree = makeTestTree();
    const newNode = path('replaced', 'M0,0', { fill: '#000' });

    const result = drawNodeRewrite.replaceAt(tree, [0], newNode);

    // Original unchanged
    expect((tree as any).children[0].id).toBe('stroke-1');

    // New tree has replacement
    expect((result as any).children[0].id).toBe('replaced');

    // Structural sharing: particles group unchanged
    expect((result as any).children[2]).toBe((tree as any).children[2]);
  });

  it('wraps nodes', () => {
    const tree = makeTestTree();
    const refs = find(tree, { selector: hasTag('particle') }, {}, drawNodeAdapter.getChildren);

    const result = drawNodeRewrite.wrap(
      tree,
      refs,
      (children) => group('particle-wrapper', [...children], { tags: ['wrapper'] })
    );

    // Find the wrapper
    const wrapperRefs = find(result, { selector: hasTag('wrapper') }, {}, drawNodeAdapter.getChildren);
    expect(wrapperRefs.length).toBe(1);

    // Wrapper should contain particles
    const wrapper = drawNodeRewrite.getAt(result, wrapperRefs[0].path) as any;
    expect(wrapper.children.length).toBe(3);
    expect(wrapper.children.map((c: any) => c.id)).toEqual(['p-1', 'p-2', 'p-3']);
  });

  it('maps over all nodes', () => {
    const tree = makeTestTree();
    const visited: string[] = [];

    const result = drawNodeRewrite.mapNodes(tree, (node, _path) => {
      visited.push(node.id);
      return node;
    });

    // All nodes visited: root + stroke-1 + stroke-2 + particles + p-1 + p-2 + p-3 = 7
    expect(visited).toContain('root');
    expect(visited).toContain('stroke-1');
    expect(visited).toContain('p-3');
    expect(visited.length).toBe(7);

    // Tree unchanged (identity map)
    expect(result).toBe(tree);
  });

  it('updates nodes matching predicate', () => {
    const tree = makeTestTree();

    const result = drawNodeRewrite.updateWhere(
      tree,
      (node) => node.tags?.includes('particle') ?? false,
      (node) => ({ ...node, meta: { ...node.meta, transformed: true } })
    );

    // Check particles have meta
    const p1 = drawNodeRewrite.getAt(result, [2, 0]);
    expect((p1 as any).meta?.transformed).toBe(true);

    // Check non-particles unchanged
    const stroke = drawNodeRewrite.getAt(result, [0]);
    expect((stroke as any).meta?.transformed).toBeUndefined();
  });
});

// =============================================================================
// Compositor Tests
// =============================================================================

describe('Compositor', () => {
  it('creates and applies a simple compositor', () => {
    const tree = makeTestTree();

    // Compositor that adds meta to all nodes
    const addMeta = createCompositor<DrawNode>(
      'add-meta',
      (t, ctx) => drawNodeRewrite.mapNodes(t, (node) => ({
        ...node,
        meta: { ...node.meta, time: ctx.timeMs },
      }))
    );

    const result = addMeta.apply(tree, { timeMs: 1000, seed: 42 });

    const root = result as any;
    expect(root.meta?.time).toBe(1000);

    const stroke1 = root.children[0];
    expect(stroke1.meta?.time).toBe(1000);
  });

  it('applies compositor stack in order', () => {
    const tree = makeTestTree();
    const order: string[] = [];

    const first = createCompositor<DrawNode>('first', (t) => {
      order.push('first');
      return t;
    });

    const second = createCompositor<DrawNode>('second', (t) => {
      order.push('second');
      return t;
    });

    applyStack(tree, [first, second], { timeMs: 0, seed: 0 });

    expect(order).toEqual(['first', 'second']);
  });

  it('scoped compositor only affects selected nodes', () => {
    const tree = makeTestTree();

    const fadeParticles = scoped(
      'fade-particles',
      { selector: hasTag('particle') },
      (node, _ctx) => withOpacity(`${node.id}:fade`, 0.5, node)
    );

    const result = fadeParticles.apply(tree, { timeMs: 0, seed: 0 });

    // Particles should be wrapped in opacity effect
    const p1Path = [2, 0]; // Updated path after potential tree changes
    const p1 = drawNodeRewrite.getAt(result, p1Path);
    expect(p1.kind).toBe('effect');
    expect((p1 as any).effect.kind).toBe('opacityMul');
    expect((p1 as any).effect.mul).toBe(0.5);

    // Strokes should NOT be wrapped
    const stroke1 = drawNodeRewrite.getAt(result, [0]);
    expect(stroke1.kind).toBe('shape');
  });

  it('opacity compositor helper works', () => {
    const tree = makeTestTree();

    const fadeAnimated = opacityCompositor(
      'fade-animated',
      { selector: hasTag('animated') },
      (_node, ctx) => ctx.timeMs / 2000 // 0 at t=0, 0.5 at t=1000, 1 at t=2000
    );

    const result = fadeAnimated.apply(tree, { timeMs: 1000, seed: 0 });

    // stroke-1 has 'animated' tag, should be wrapped
    const stroke1 = drawNodeRewrite.getAt(result, [0]);
    expect(stroke1.kind).toBe('effect');
    expect((stroke1 as any).effect.kind).toBe('opacityMul');
    expect((stroke1 as any).effect.mul).toBe(0.5);
  });
});

// =============================================================================
// Resources Tests
// =============================================================================

describe('Resources', () => {
  it('adds resources to registry', () => {
    let reg = emptyRegistry;

    reg = addResource(reg, glowFilter('glow-1', 5));
    reg = addResource(reg, glowFilter('glow-2', 10));

    expect(reg.filters.size).toBe(2);
    expect(reg.filters.get('glow-1')!.effects[0].type).toBe('gaussianBlur');
  });

  it('deduplicates by id', () => {
    let reg = emptyRegistry;

    reg = addResource(reg, glowFilter('glow', 5));
    reg = addResource(reg, glowFilter('glow', 10)); // Same id, ignored

    expect(reg.filters.size).toBe(1);
    // First one wins
    expect((reg.filters.get('glow')!.effects[0] as any).stdDeviation).toBe(5);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration', () => {
  it('full pipeline: select -> transform -> stack', () => {
    const tree = makeTestTree();

    // Stack of compositors
    const stack = createStack([
      // Fade all strokes
      opacityCompositor(
        'fade-strokes',
        { selector: hasTag('stroke') },
        () => 0.7
      ),
      // Add meta to particles
      scoped(
        'mark-particles',
        { selector: hasTag('particle') },
        (node) => ({ ...node, meta: { ...node.meta, particle: true } })
      ),
    ]);

    const result = applyStack(tree, stack.compositors, { timeMs: 500, seed: 42 });

    // Strokes are faded
    const stroke1 = drawNodeRewrite.getAt(result, [0]);
    expect(stroke1.kind).toBe('effect');
    expect((stroke1 as any).effect.mul).toBe(0.7);

    // Particles have meta
    // Need to find particles in the modified tree
    const particleRefs = find(result, { selector: hasTag('particle') }, {}, drawNodeAdapter.getChildren);
    expect(particleRefs.length).toBe(3);

    for (const ref of particleRefs) {
      const node = drawNodeRewrite.getAt(result, ref.path);
      expect((node as any).meta?.particle).toBe(true);
    }
  });
});
