/**
 * @file RuntimeAdapter - Bridges UnifiedCompiler to Player runtime
 * @description Creates a Program<RenderTree> from CompilationResult.
 *
 * Architecture:
 * - Pull-based evaluation: runtime calls evaluators in dependency order
 * - State memory management: holds Map<blockId, StateMemory>
 * - TimeCtx propagation: creates TimeCtx from (tMs, mode) on each frame
 * - No semantic interpretation: just evaluates and passes data
 *
 * The adapter is the boundary between compile-time and run-time.
 * It must preserve determinism and respect state block scrub policies.
 */

import type { CompilationResult, CompiledBlock, CompiledBus } from './UnifiedCompiler';
import type { StateMemory } from './StateBlock';
import type { TimeCtx } from './TimeCtx';
import { TimeCtxFactory } from './TimeCtx';
import type { Program, RenderTree, RuntimeCtx } from '../types';

/**
 * RuntimeAdapter wraps a CompilationResult and produces a Program<RenderTree>.
 *
 * Responsibilities:
 * - Create TimeCtx from wall-clock time
 * - Evaluate blocks/buses in dependency order
 * - Manage state memory lifecycle
 * - Extract final RenderTree from output block
 *
 * Does NOT:
 * - Interpret block semantics
 * - Manage playback control
 * - Handle user interaction
 */
export class RuntimeAdapter {
  private readonly compilation: CompilationResult;
  private stateMemory: Map<string, StateMemory>;
  private readonly blockOutputs: Map<string, Record<string, unknown>>;
  private readonly busOutputs: Map<string, unknown>;
  private frameCounter: number = 0;
  private lastTime: number = 0;

  constructor(compilation: CompilationResult) {
    if (compilation.errors.length > 0) {
      throw new Error(
        `Cannot create RuntimeAdapter from failed compilation: ${compilation.errors.map((e) => e.message).join(', ')}`
      );
    }

    this.compilation = compilation;
    this.stateMemory = new Map(compilation.stateMemory);
    this.blockOutputs = new Map();
    this.busOutputs = new Map();
  }

  /**
   * Create a Program<RenderTree> compatible with the Player.
   */
  createProgram(): Program<RenderTree> {
    return {
      signal: (tMs: number, _runtimeCtx: RuntimeCtx) => {
        return this.evaluate(tMs);
      },
      event: () => [],
    };
  }

  /**
   * Evaluate the patch for a single frame.
   *
   * @param tMs - Time in milliseconds
   * @returns RenderTree for this frame
   */
  private evaluate(tMs: number): RenderTree {
    // Create TimeCtx for this frame
    const t = tMs / 1000; // Convert to seconds
    const dt = this.frameCounter === 0 ? 0 : t - this.lastTime;
    const ctx = TimeCtxFactory.forPerformance(t, dt, this.frameCounter);

    // Clear outputs from previous frame
    this.blockOutputs.clear();
    this.busOutputs.clear();

    // Evaluate in dependency order
    for (const nodeId of this.compilation.evaluationOrder) {
      const block = this.compilation.blocks.find((b) => b.id === nodeId);
      if (block) {
        this.evaluateBlock(block, ctx);
        continue;
      }

      const bus = this.compilation.buses.find((b) => b.id === nodeId);
      if (bus) {
        this.evaluateBus(bus, ctx);
      }
    }

    // Update frame state
    this.frameCounter++;
    this.lastTime = t;

    // Extract RenderTree from output block
    return this.extractRenderTree();
  }

  /**
   * Evaluate a single block.
   */
  private evaluateBlock(block: CompiledBlock, ctx: TimeCtx): void {
    // Collect inputs for this block
    const inputs = this.collectBlockInputs(block.id);

    // Get state memory if state block
    const state = block.isStateBlock ? this.stateMemory.get(block.id) ?? null : null;

    // Call evaluator
    const outputs = block.evaluator(inputs, state, ctx);

    // Store outputs for downstream blocks
    this.blockOutputs.set(block.id, outputs);
  }

  /**
   * Evaluate a single bus.
   */
  private evaluateBus(bus: CompiledBus, ctx: TimeCtx): void {
    // Collect publisher outputs
    const inputs: Record<string, unknown> = {};

    for (const pub of bus.publishers) {
      const blockOutputs = this.blockOutputs.get(pub.blockId);
      if (blockOutputs) {
        const key = `${pub.blockId}.${pub.port}`;
        inputs[key] = blockOutputs[pub.port];
      }
    }

    // Call bus evaluator
    const output = bus.evaluator(inputs, null, ctx);

    // Store bus output
    this.busOutputs.set(bus.id, output.value);
  }

  /**
   * Collect inputs for a block from connection sources.
   */
  private collectBlockInputs(blockId: string): Record<string, unknown> {
    const inputs: Record<string, unknown> = {};

    // Find connections targeting this block
    const graph = this.compilation.graph;
    const edges = graph.getAllEdges();

    // Collect from block-to-block connections
    for (const edge of edges) {
      if (edge.to === blockId && edge.type === 'connection') {
        const sourceOutputs = this.blockOutputs.get(edge.from);
        if (sourceOutputs) {
          // For now, assume single output port or standard naming
          // In a full implementation, we'd track port names in edges
          Object.assign(inputs, sourceOutputs);
        }
      }
    }

    // Collect from bus listeners
    for (const bus of this.compilation.buses) {
      for (const listener of bus.listeners) {
        if (listener.blockId === blockId) {
          const busValue = this.busOutputs.get(bus.id);
          if (busValue !== undefined) {
            inputs[listener.port] = busValue;
          }
        }
      }
    }

    return inputs;
  }

  /**
   * Extract RenderTree from the output block.
   *
   * Looks for a block with 'output' or 'renderTree' output.
   * If none found, returns empty render tree.
   */
  private extractRenderTree(): RenderTree {
    // Find the last block in evaluation order (likely the output)
    for (let i = this.compilation.evaluationOrder.length - 1; i >= 0; i--) {
      const nodeId = this.compilation.evaluationOrder[i];
      const outputs = this.blockOutputs.get(nodeId);

      if (outputs) {
        // Try common output port names
        const tree =
          outputs.renderTree ?? outputs.output ?? outputs.tree ?? outputs.result;

        if (tree && this.isRenderTree(tree)) {
          return tree as RenderTree;
        }
      }
    }

    // Return empty group if no output found
    return {
      kind: 'group',
      id: 'empty',
      children: [],
    };
  }

  /**
   * Type guard for RenderTree.
   */
  private isRenderTree(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const node = value as any;
    return (
      (node.kind === 'group' || node.kind === 'shape' || node.kind === 'effect') &&
      typeof node.id === 'string'
    );
  }

  /**
   * Reset adapter state (for testing or restart).
   */
  reset(): void {
    this.frameCounter = 0;
    this.lastTime = 0;
    this.blockOutputs.clear();
    this.busOutputs.clear();

    // Reinitialize state memory from compilation
    this.stateMemory = new Map(this.compilation.stateMemory);
  }
}
