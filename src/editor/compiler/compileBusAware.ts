/**
 * Bus-Aware Patch Compiler
 *
 * Compiles patches that contain buses as well as wires.
 * Phase 3 implementation: Signal AND Field buses.
 *
 * Key differences from wire-only compilation:
 * 1. Buses are first-class graph nodes
 * 2. Multi-pass compilation (blocks → buses → blocks using buses)
 *  3. Publisher ordering by sortKey for deterministic results
 * 4. Default values when buses have no publishers
 * 5. Field buses support per-element combination (sum, average, max, min, last)
 */

import type {
  Artifact,
  BlockId,
  BlockInstance,
  BlockRegistry,
  CompileCtx,
  CompileError,
  CompileResult,
  CompilerPatch,
  DrawNode,
  Program,
  RenderTree,
  RuntimeCtx,
  Seed,
  TimeModel,
  Vec2,
} from './types';

import type { Bus, LensInstance, AdapterStep } from '../types';
import { getBlockDefinition } from '../blocks';

// Re-export bus types for external consumers
export type { Bus, LensInstance, AdapterStep };

// Import IR passes
import { pass1Normalize } from './passes/pass1-normalize';
import { pass2TypeGraph } from './passes/pass2-type-graph';
import { pass3TimeTopology } from './passes/pass3-time-topology';
import { pass4DepGraph } from './passes/pass4-dep-graph';
import { pass5Validate } from './passes/pass5-validate';

/**
 * Compile a patch with bus support.
 *
 * This is the entry point for compiling patches that may contain buses.
 * It handles all three phases:
 * - Frontend compilation (closure analysis)
 * - IR generation (graph passes)
 * - Schedule generation (execution ordering)
 *
 * @param patch - The patch to compile
 * @param registry - Block compilers and metadata
 * @returns Compilation result (program + diagnostics)
 */
export function compileBusAware(
  patch: CompilerPatch,
  registry: BlockRegistry
): CompileResult {
  const errors: CompileError[] = [];

  // Phase 1: Compile blocks to closures (frontend compilation)
  const compiledPortMap = compileBlocks(patch, registry, errors);
  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Phase 2: Generate IR (compiler passes)
  const ir = compileIR(patch, compiledPortMap);
  if (!ir) {
    errors.push({
      blockId: undefined,
      slotId: undefined,
      message: 'IR compilation failed',
      phase: 'ir-generation',
    });
    return { success: false, errors };
  }

  // Phase 3: Generate schedule from IR
  const program = generateProgramFromIR(patch, ir, compiledPortMap);

  return {
    success: true,
    program,
    ir,
  };
}

/**
 * Phase 1: Compile all blocks to closures.
 * Returns a map of portId → Artifact.
 */
function compileBlocks(
  patch: CompilerPatch,
  registry: BlockRegistry,
  errors: CompileError[]
): Map<string, Artifact> {
  const compiledPortMap = new Map<string, Artifact>();

  for (const block of patch.blocks) {
    const compiler = registry.compilers[block.type];
    if (!compiler) {
      errors.push({
        blockId: block.id,
        slotId: undefined,
        message: `Unknown block type: ${block.type}`,
        phase: 'frontend',
      });
      continue;
    }

    // Compile the block
    const result = compiler(block.params);
    if (!result) {
      errors.push({
        blockId: block.id,
        slotId: undefined,
        message: `Block compilation returned null/undefined`,
        phase: 'frontend',
      });
      continue;
    }

    // Store artifacts in port map (portId = `blockId:slotId`)
    const def = getBlockDefinition(block.type);
    if (!def) {
      errors.push({
        blockId: block.id,
        slotId: undefined,
        message: `Block definition not found for type: ${block.type}`,
        phase: 'frontend',
      });
      continue;
    }

    // Map output slots to artifacts
    const outputSlots = def.slots.filter(s => s.direction === 'output');
    for (const slot of outputSlots) {
      const artifact = (result as Record<string, Artifact>)[slot.id];
      if (artifact) {
        compiledPortMap.set(`${block.id}:${slot.id}`, artifact);
      }
    }
  }

  return compiledPortMap;
}

/**
 * Phase 2: Generate IR from patch and compiled artifacts.
 * Runs passes 1-5 to produce a validated graph IR.
 *
 * @param patch - The compiler patch (blocks + edges)
 * @param compiledPortMap - The closure artifacts from successful compilation
 * @returns LinkedGraphIR or undefined if IR compilation fails
 */
function compileIR(
  patch: CompilerPatch,
  compiledPortMap: Map<string, Artifact>
): CompileResult['ir'] {
  try {
    // Convert CompilerPatch to Patch format for Pass 1
    // Note: patch.blocks is already an array (BlockInstance[]), not a Map
    const blocksArray: import('../types').Block[] = patch.blocks.map((inst) => {
      const def = getBlockDefinition(inst.type);
      if (def == null) {
        throw new Error(`Block definition not found for type: ${inst.type}`);
      }

      // Create proper Block instance with all required fields
      return {
        id: inst.id,
        type: inst.type,
        label: def.label,
        position: { x: 0, y: 0 }, // Position not needed for compilation
        params: inst.params,
        form: def.form,
        role: { kind: 'user' }, // Default role for user blocks
      };
    });

    // Use edges directly from CompilerPatch (Edge-based architecture)
    const patchEdges: import('../types').Edge[] = patch.edges as import('../types').Edge[];

    const patchForIR: import('../types').Patch = {
      version: 1,
      blocks: blocksArray,
      edges: patchEdges,
      // Bus-Block Unification: buses are now BusBlocks in blocks, publishers/listeners are connections
      defaultSources: Object.entries(patch.defaultSources ?? {}).map(([slotId, state]) => {
        const s = state as { type?: unknown; value?: unknown; uiHint?: unknown; rangeHint?: unknown };
        return {
          id: slotId,
          type: (s.type ?? { world: 'signal', domain: 'float', category: 'core' }) as import('../types').TypeDesc,
          value: s.value,
          uiHint: s.uiHint as import('../types').UIControlHint | undefined,
          rangeHint: s.rangeHint as { min?: number; max?: number; step?: number; log?: boolean } | undefined,
        };
      }),
      settings: { seed: 0, speed: 1 },
    };

    // Run Passes 1-5: Normalization → Validation
    const normalized = pass1Normalize(patchForIR);
    const typed = pass2TypeGraph(normalized);
    const timeResolved = pass3TimeTopology(typed);
    const depGraphWithTime = pass4DepGraph(timeResolved);
    const validated = pass5Validate(depGraphWithTime);

    return validated;
  } catch (err) {
    console.error('IR compilation failed:', err);
    return undefined;
  }
}

/**
 * Phase 3: Generate executable program from IR.
 * Uses the schedule from IR to construct a Program with init/update/render functions.
 *
 * @param patch - The compiler patch (for metadata)
 * @param ir - The validated IR graph
 * @param compiledPortMap - Compiled block outputs
 * @returns Executable program
 */
function generateProgramFromIR(
  patch: CompilerPatch,
  ir: NonNullable<CompileResult['ir']>,
  compiledPortMap: Map<string, Artifact>
): Program {
  // Extract the schedule from IR
  const schedule = ir.schedule ?? [];

  // Build init function: call all block init closures in schedule order
  const init = (seed: Seed): RuntimeCtx => {
    const ctx: RuntimeCtx = {
      seed,
      random: () => Math.random(), // TODO: Seed-based PRNG
      time: 0,
      frame: 0,
    };

    for (const nodeId of schedule) {
      const artifact = compiledPortMap.get(nodeId);
      if (artifact && typeof artifact === 'object' && 'init' in artifact) {
        const initFn = (artifact as { init?: (s: Seed) => void }).init;
        if (initFn) initFn(seed);
      }
    }

    return ctx;
  };

  // Build update function: evaluate all blocks in schedule order
  const update = (ctx: RuntimeCtx, dt: number): void => {
    ctx.time += dt;
    ctx.frame += 1;

    for (const nodeId of schedule) {
      const artifact = compiledPortMap.get(nodeId);
      if (artifact && typeof artifact === 'function') {
        // Signal artifacts are functions: evaluate them
        artifact(ctx.time, ctx);
      }
    }
  };

  // Build render tree from draw nodes in IR
  const renderTree: RenderTree = {
    nodes: (ir.drawNodes ?? []).map((drawNode: DrawNode) => ({
      type: drawNode.type,
      params: drawNode.params,
    })),
  };

  return {
    init,
    update,
    render: renderTree,
    timeModel: ir.timeModel ?? { kind: 'unbounded' },
  };
}

/**
 * Stub: Get bus combine mode from Bus object.
 * This will be removed when buses are unified with blocks.
 */
function getBusCombineMode(bus: Bus): 'last' | 'sum' | 'average' | 'max' | 'min' {
  // Bus.combine is a CombinePolicy, extract the mode
  if (typeof bus.combine === 'object' && bus.combine !== null && 'mode' in bus.combine) {
    return (bus.combine as { mode: 'last' | 'sum' | 'average' | 'max' | 'min' }).mode;
  }
  return 'last'; // fallback
}

// Re-export for consumers
export { getBusCombineMode };
