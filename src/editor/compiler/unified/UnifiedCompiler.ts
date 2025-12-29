/**
 * @file UnifiedCompiler - Main compiler for the unified architecture
 * @description Compiles patch definition to evaluators with proper dependency ordering.
 *
 * Architecture principles:
 * - Build unified dependency graph (blocks + buses)
 * - Detect illegal instantaneous cycles
 * - Enforce state boundaries
 * - Produce stable evaluation order
 * - Generate Signal evaluators for buses
 * - Handle state block lifecycle
 *
 * The compiler must fail loudly when invariants are violated.
 * No fallbacks. No magic.
 */

import { DependencyGraph } from './DependencyGraph';
import { stateBlockRegistry } from './StateBlock';
import type { StateMemory, StateBlock } from './StateBlock';
import type { TimeCtx } from './TimeCtx';

/**
 * Block instance in the patch.
 */
export interface BlockInstance {
  readonly id: string;
  readonly type: string;
  readonly params: Record<string, unknown>;
}

/**
 * Connection between blocks.
 */
export interface ConnectionDef {
  readonly from: { blockId: string; port: string };
  readonly to: { blockId: string; port: string };
}

/**
 * Bus definition.
 */
export interface BusDef {
  readonly id: string;
  readonly name?: string;
  readonly type: string | { world: string; domain: string };
  readonly combineMode?: string;
  readonly defaultValue?: unknown;
  readonly sortKey?: number;
}

/**
 * Publisher (block output to bus).
 */
export interface PublisherDef {
  readonly id?: string;
  readonly blockId: string;
  readonly busId: string;
  readonly port: string;
  readonly sortKey: number;
  readonly disabled?: boolean;
}

/**
 * Listener (bus to block input).
 */
export interface ListenerDef {
  readonly id?: string;
  readonly blockId: string;
  readonly busId: string;
  readonly port: string;
  readonly disabled?: boolean;
}

/**
 * Patch definition (input to compiler).
 */
export interface PatchDefinition {
  readonly blocks: Map<string, BlockInstance>;
  readonly connections: ConnectionDef[];
  readonly buses?: Map<string, BusDef> | BusDef[];
  readonly publishers?: PublisherDef[];
  readonly listeners?: ListenerDef[];
}

/**
 * Evaluator function - evaluates a block/bus for a frame.
 */
export type Evaluator = (
  inputs: Record<string, unknown>,
  state: StateMemory | null,
  ctx: TimeCtx
) => Record<string, unknown>;

/**
 * Compiled block - ready for runtime evaluation.
 */
export interface CompiledBlock {
  readonly id: string;
  readonly type: string;
  readonly evaluator: Evaluator;
  readonly isStateBlock: boolean;
  readonly stateMemory: StateMemory | null;
}

/**
 * Compiled bus - aggregates publisher outputs.
 */
export interface CompiledBus {
  readonly id: string;
  readonly type: { world: string; domain: string } | string;
  readonly combineMode?: string;
  readonly defaultValue?: unknown;
  readonly evaluator: Evaluator;
  readonly publishers: Array<{ blockId: string; port: string }>;
  readonly listeners: Array<{ blockId: string; port: string }>;
}

/**
 * Compilation result.
 */
export interface CompilationResult {
  /** Compiled blocks in evaluation order */
  readonly blocks: CompiledBlock[];

  /** Compiled buses in evaluation order */
  readonly buses: CompiledBus[];

  /** Evaluation order (interleaved blocks and buses) */
  readonly evaluationOrder: string[];

  /** Dependency graph (for inspection) */
  readonly graph: DependencyGraph;

  /** State memory map */
  readonly stateMemory: Map<string, StateMemory>;

  /** Errors (if any) */
  readonly errors: CompilationError[];
}

/**
 * Compilation error.
 */
export interface CompilationError {
  readonly type: 'cycle' | 'missing-block' | 'missing-bus' | 'state-violation';
  readonly message: string;
  readonly nodes?: string[];
}

/**
 * UnifiedCompiler - compiles patches to executable programs.
 *
 * Responsibilities:
 * - Build dependency graph
 * - Detect cycles
 * - Validate state boundaries
 * - Generate evaluators
 * - Produce stable ordering
 *
 * Does NOT:
 * - Manage runtime state
 * - Know about UI concepts
 * - Handle playback control
 */
export class UnifiedCompiler {
  private readonly graph: DependencyGraph;
  private errors: CompilationError[] = [];

  constructor() {
    this.graph = new DependencyGraph();
  }

  /**
   * Compile a patch definition to executable form.
   *
   * @param patch - Patch definition
   * @returns Compilation result
   */
  compile(patch: PatchDefinition): CompilationResult {
    this.errors = [];
    this.graph.clear();

    // Phase 1: Build dependency graph
    this.buildGraph(patch);

    // Phase 2: Detect cycles
    const cycles = this.graph.detectCycles();
    const instantaneousCycles = cycles.filter((c) => c.isInstantaneous);

    if (instantaneousCycles.length > 0) {
      for (const cycle of instantaneousCycles) {
        this.errors.push({
          type: 'cycle',
          message: `Illegal instantaneous cycle: ${cycle.nodes.join(' -> ')}`,
          nodes: cycle.nodes,
        });
      }

      // Return partial result with errors
      return {
        blocks: [],
        buses: [],
        evaluationOrder: [],
        graph: this.graph,
        stateMemory: new Map(),
        errors: this.errors,
      };
    }

    // Phase 3: Compute evaluation order
    let evaluationOrder: string[];
    try {
      evaluationOrder = this.graph.topologicalSort();
    } catch (err) {
      this.errors.push({
        type: 'cycle',
        message: err instanceof Error ? err.message : 'Unknown cycle error',
      });
      return {
        blocks: [],
        buses: [],
        evaluationOrder: [],
        graph: this.graph,
        stateMemory: new Map(),
        errors: this.errors,
      };
    }

    // Phase 4: Compile blocks and buses
    const compiledBlocks = this.compileBlocks(patch, evaluationOrder);
    const compiledBuses = this.compileBuses(patch, evaluationOrder);

    // Collect state memory
    const stateMemory = new Map<string, StateMemory>();
    for (const block of compiledBlocks) {
      if (block.stateMemory != null) {
        stateMemory.set(block.id, block.stateMemory);
      }
    }

    return {
      blocks: compiledBlocks,
      buses: compiledBuses,
      evaluationOrder,
      graph: this.graph,
      stateMemory,
      errors: this.errors,
    };
  }

  /**
   * Build dependency graph from patch definition.
   */
  private buildGraph(patch: PatchDefinition): void {
    // Add block nodes
    for (const [blockId, block] of patch.blocks) {
      const isStateBlock = stateBlockRegistry.isStateBlock(block.type);
      this.graph.addBlockNode(blockId, isStateBlock);
    }

    // Add bus nodes
    const buses = (patch.buses != null)
      ? Array.isArray(patch.buses)
        ? patch.buses
        : Array.from(patch.buses.values())
      : [];
    for (const bus of buses) {
      this.graph.addBusNode(bus.id);
    }

    // Add connection edges (block to block)
    for (const conn of patch.connections) {
      this.graph.addConnectionEdge(conn.from.blockId, conn.to.blockId);
    }

    // Add publish edges (block to bus)
    if (patch.publishers != null) {
      for (const pub of patch.publishers) {
        if (pub.disabled !== true) {
          this.graph.addPublishEdge(pub.blockId, pub.busId);
        }
      }
    }

    // Add listen edges (bus to block)
    if (patch.listeners != null) {
      for (const listener of patch.listeners) {
        if (listener.disabled !== true) {
          this.graph.addListenEdge(listener.busId, listener.blockId);
        }
      }
    }

  }

  /**
   * Compile blocks to evaluators.
   */
  private compileBlocks(
    patch: PatchDefinition,
    evaluationOrder: string[]
  ): CompiledBlock[] {
    const compiledBlocks: CompiledBlock[] = [];

    for (const nodeId of evaluationOrder) {
      const block = patch.blocks.get(nodeId);
      if (block == null) continue; // Skip buses

      const stateBlock = stateBlockRegistry.get(block.type);
      const isStateBlock = stateBlock !== undefined;

      // Initialize state memory if state block
      const stateMemory = isStateBlock ? stateBlock.initState(0) : null;

      // Create evaluator
      const evaluator: Evaluator = isStateBlock
        ? this.createStateBlockEvaluator(stateBlock)
        : this.createPrimitiveBlockEvaluator();

      compiledBlocks.push({
        id: block.id,
        type: block.type,
        evaluator,
        isStateBlock,
        stateMemory,
      });
    }

    return compiledBlocks;
  }

  /**
   * Compile buses to evaluators.
   */
  private compileBuses(
    patch: PatchDefinition,
    evaluationOrder: string[]
  ): CompiledBus[] {
    const compiledBuses: CompiledBus[] = [];

    const buses = patch.buses != null
      ? Array.isArray(patch.buses)
        ? patch.buses
        : Array.from(patch.buses.values())
      : [];

    for (const nodeId of evaluationOrder) {
      const bus = buses.find((b) => b.id === nodeId);
      if (bus == null) continue; // Skip blocks

      // Find publishers for this bus
      const publishers = (patch.publishers ?? [])
        .filter((p) => p.busId === bus.id && p.disabled !== true)
        .sort((a, b) => a.sortKey - b.sortKey)
        .map((p) => ({ blockId: p.blockId, port: p.port }));

      // Find listeners for this bus
      const listeners = (patch.listeners ?? [])
        .filter((l) => l.busId === bus.id && l.disabled !== true)
        .map((l) => ({ blockId: l.blockId, port: l.port }));

      // Create bus evaluator
      const evaluator = this.createBusEvaluator(publishers);

      compiledBuses.push({
        id: bus.id,
        type: bus.type,
        combineMode: bus.combineMode,
        defaultValue: bus.defaultValue,
        evaluator,
        publishers,
        listeners,
      });
    }

    return compiledBuses;
  }

  /**
   * Create evaluator for a state block.
   */
  private createStateBlockEvaluator(stateBlock: StateBlock): Evaluator {
    return (inputs: Record<string, unknown>, state: StateMemory | null, ctx: TimeCtx) => {
      if (state == null) {
        throw new Error(`State block ${stateBlock.type} requires state memory`);
      }

      // Update state
      stateBlock.updateState(state, inputs, ctx);

      // Compute outputs
      return stateBlock.computeOutputs(state, inputs, ctx);
    };
  }

  /**
   * Create evaluator for a primitive block.
   */
  private createPrimitiveBlockEvaluator(): Evaluator {
    return (inputs: Record<string, unknown>, _state: StateMemory | null, _ctx: TimeCtx) => {
      // Primitive blocks are stateless - just pass through inputs
      return inputs;
    };
  }

  /**
   * Create evaluator for a bus.
   */
  private createBusEvaluator(publishers: Array<{ blockId: string; port: string }>): Evaluator {
    return (inputs: Record<string, unknown>, _state: StateMemory | null, _ctx: TimeCtx) => {
      // Combine publisher outputs
      // For now, just return the first publisher's value
      if (publishers.length > 0) {
        const firstPub = publishers[0];
        return { value: inputs[`${firstPub.blockId}.${firstPub.port}`] };
      }
      return { value: undefined };
    };
  }
}
