/**
 * Patch → Program Compiler
 *
 * Compiles a visual patch graph into a runnable V4 Program<RenderTree>.
 *
 * Architecture (Pass-Based Pipeline):
 * 1. Pass 1: Normalize - Freeze block IDs, canonicalize edges
 * 2. Pass 2: Type Graph - Build type system, validate bus eligibility
 * 3. Pass 3: Time Topology - Find TimeRoot, establish time model
 * 4. Pass 4: Dependency Graph - Build dependency graph
 * 5. Pass 5: SCC Validation - Detect illegal cycles
 * 6. Pass 6: Block Lowering - Lower blocks to IR fragments
 * 7. Pass 8: Link Resolution - Resolve all port references (Pass 7 removed - buses are blocks)
 * 8. Build Schedule - Generate execution schedule from IR
 * 9. Create Program - Wrap in IRRuntimeAdapter for Player
 */

import type {
  BlockId,
  BlockInstance,
  BlockRegistry,
  CompileCtx,
  CompileError,
  CompileResult,
  CompilerPatch,
  Seed,
} from './types';
import { getBlockDefinition } from '../blocks';
import { pass1Normalize } from './passes/pass1-normalize';
import { pass2TypeGraph } from './passes/pass2-types';
import { pass3TimeTopology } from './passes/pass3-time';
import { pass4DepGraph } from './passes/pass4-depgraph';
import { pass5CycleValidation } from './passes/pass5-scc';
import { pass6BlockLowering } from './passes/pass6-block-lowering';
import { pass8LinkResolution } from './passes/pass8-link-resolution';
import { buildCompiledProgram } from './ir/buildSchedule';
import { IRRuntimeAdapter } from '../runtime/executor/IRRuntimeAdapter';
import type { Block, Patch, Vec2, BlockRole } from '../types';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert CompilerPatch to Patch.
 * CompilerPatch is the minimal format used during integration phase.
 * Patch is the full format expected by the pass pipeline.
 */
function compilerPatchToPatch(compilerPatch: CompilerPatch): Patch {
  // Convert BlockInstance to Block by adding required fields
  const blocks: Block[] = compilerPatch.blocks.map(b => {
    // position can be number (CompilerPatch) or Vec2 (Patch)
    let position: Vec2;
    if (typeof b.position === 'number') {
      position = { x: 0, y: 0 } as Vec2;
    } else if (b.position && typeof b.position === 'object' && 'x' in b.position && 'y' in b.position) {
      position = b.position as Vec2;
    } else {
      position = { x: 0, y: 0 } as Vec2;
    }

    const role: BlockRole = { kind: 'user' };

    return {
      id: b.id,
      type: b.type,
      label: b.type, // Use type as label for compiler-generated blocks
      params: b.params ?? {},
      position,
      form: 'primitive' as const, // All blocks from compiler are primitives
      role,
    };
  });

  return {
    id: 'patch', // TODO: Get from compilerPatch when available
    blocks,
    edges: [...compilerPatch.edges],
    buses: [...compilerPatch.buses],
    composites: [],
  };
}

// =============================================================================
// Main Compiler Entry Point
// =============================================================================

/**
 * Compile a patch using the pass-based compiler pipeline.
 *
 * This replaces the deprecated compileBusAwarePatch stub with the actual
 * IR compiler implementation (passes 1-8).
 *
 * Error Handling:
 * - Passes 2, 3, 4 THROW on errors (wrapped in try-catch)
 * - Passes 5, 6, 8 ACCUMULATE errors in result object
 * - Early return if any pass fails
 *
 * @param patch - Input patch from editor (already normalized by GraphNormalizer)
 * @param _registry - Block registry for compiling blocks (unused - blocks self-register)
 * @param seed - Random seed for deterministic compilation
 * @param _ctx - Compilation context (unused in current implementation)
 * @param options - Compilation options (emitIR flag)
 * @returns CompileResult with Program or errors
 */
export function compilePatch(
  patch: CompilerPatch,
  _registry: BlockRegistry,
  seed: Seed,
  _ctx: CompileCtx,
  options?: { emitIR?: boolean }
): CompileResult {
  try {
    // Convert CompilerPatch to Patch for pass pipeline
    // Note: Default source provider blocks are already in the patch from GraphNormalizer
    const patchForPasses = compilerPatchToPatch(patch);

    // Pass 1: Normalize
    // Freezes block IDs to indices, canonicalizes edges
    const normalized = pass1Normalize(patchForPasses);

    // Pass 2: Type Graph (THROWS on error)
    // Builds type system, validates bus eligibility
    const typed = pass2TypeGraph(normalized);

    // Pass 3: Time Topology (THROWS on error)
    // Finds TimeRoot, establishes time model
    const timeResolved = pass3TimeTopology(typed);

    // Pass 4: Dependency Graph (THROWS on error)
    // Builds dependency graph with time model
    const depGraphWithTime = pass4DepGraph(timeResolved);

    // Pass 5: SCC Validation (accumulates errors)
    // Detects illegal cycles (cycles without state boundaries)
    const validated = pass5CycleValidation(depGraphWithTime, patchForPasses.blocks);

    // Check for errors from pass 5
    if (validated.errors.length > 0) {
      // Convert IllegalCycleError to CompileError
      const cycleErrors: CompileError[] = validated.errors.map(err => ({
        code: 'CycleDetected',
        message: `Illegal cycle detected: blocks ${err.nodes.join(', ')} form a cycle without state boundary`,
        where: { blockId: String(err.nodes[0]) }, // Use first block as error location
      }));
      return {
        ok: false,
        errors: cycleErrors,
      };
    }

    // Pass 6: Block Lowering (accumulates errors)
    // Lowers blocks to IR fragments
    // compiledPortMap should be empty - blocks register their own outputs
    const compiledPortMap = new Map();
    const fragments = pass6BlockLowering(
      validated,
      patchForPasses.blocks,
      compiledPortMap,
      patchForPasses.edges
    );

    // Check for errors from pass 6
    if (fragments.errors.length > 0) {
      return {
        ok: false,
        errors: fragments.errors,
      };
    }

    // Pass 8: Link Resolution (accumulates errors)
    // Resolves all port references to concrete values
    // Note: Pass 7 (bus lowering) removed - buses are BusBlocks handled in pass 6
    const linked = pass8LinkResolution(fragments, patchForPasses.blocks, patchForPasses.edges);

    // Check for errors from pass 8
    if (linked.errors.length > 0) {
      return {
        ok: false,
        errors: linked.errors,
      };
    }

    // Build final program from linked IR
    // 1. Get BuilderProgramIR from IRBuilder
    const builderProgram = linked.builder.build();

    // 2. Build schedule and compiled program IR
    const patchId = 'patch'; // TODO: Get from patch metadata when available
    const patchRevision = 0; // Legacy param, not used in canonical schema
    const compiledProgram = buildCompiledProgram(
      builderProgram,
      patchId,
      patchRevision,
      seed
    );

    // 3. Create IR runtime adapter and program
    const adapter = new IRRuntimeAdapter(compiledProgram);
    const program = adapter.createProgram();

    // Extract time model from compiled program
    const timeModel = compiledProgram.timeModel;

    // Return successful compilation result
    return {
      ok: true,
      errors: [],
      program,
      timeModel,
      // Include IR if requested (note: this is the CompiledProgramIR, not LinkedGraphIR)
      // The CompileResult.ir field expects LinkedGraphIR, but we're using CompiledProgramIR
      // This is acceptable as it's more complete - contains full schedule
      ir: options?.emitIR ? (compiledProgram as any) : undefined,
    };

  } catch (error) {
    // Passes 2, 3, 4 throw on errors
    // Convert thrown errors to CompileError format
    const err = error as Error;
    const compileError: CompileError = {
      code: 'NotImplemented', // Use existing error code for thrown errors
      message: err.message,
    };

    return {
      ok: false,
      errors: [compileError],
    };
  }
}


// =============================================================================
// TimeRoot Detection and TimeModel Inference
// =============================================================================

/**
 * Find all TimeRoot blocks in the patch.
 */
function findTimeRootBlocks(patch: CompilerPatch): BlockInstance[] {
  const timeRootBlocks: BlockInstance[] = [];

  for (const block of patch.blocks.values()) {
    const blockDef = getBlockDefinition(block.type);
    if (blockDef?.subcategory === 'TimeRoot') {
      timeRootBlocks.push(block);
    }
  }

  return timeRootBlocks;
}

/**
 * Validate TimeRoot constraint: exactly one TimeRoot per patch.
 * Returns errors if validation fails, empty array if valid.
 *
 */
export function validateTimeRootConstraint(patch: CompilerPatch): CompileError[] {
  const timeRootBlocks = findTimeRootBlocks(patch);
  const errors: CompileError[] = [];

  if (timeRootBlocks.length === 0) {
    errors.push({
      code: 'MissingTimeRoot',
      message: 'Patch must contain exactly one TimeRoot block (FiniteTimeRoot, or InfiniteTimeRoot)',
    });
  }

  if (timeRootBlocks.length > 1) {
    errors.push({
      code: 'MultipleTimeRoots',
      message: `Patch contains ${timeRootBlocks.length} TimeRoot blocks - only one is allowed`,
      where: { blockId: timeRootBlocks[0].id },
    });
  }

  return errors;
}

// =============================================================================
// Topological Sort (block-level)
// =============================================================================

/**
 * topoSortBlocks sorts blocks so that upstream dependencies compile first.
 * Dependency graph edges: from c.from.blockId -> c.to.blockId
 *
 * - Detects cycles and emits CycleDetected error.
 * - Includes isolated blocks (no edges) in stable order.
 */
export function topoSortBlocks(
  patch: CompilerPatch,
  errors: CompileError[]
): readonly BlockId[] {
  const ids = patch.blocks.map(b => b.id);

  // Build adjacency + indegree
  const adj = new Map<BlockId, Set<BlockId>>();
  const indeg = new Map<BlockId, number>();

  for (const id of ids) {
    adj.set(id, new Set());
    indeg.set(id, 0);
  }

  for (const e of patch.edges) {
    const a = e.from.blockId;
    const b = e.to.blockId;
    if (!adj.has(a) || !adj.has(b)) {
      // Edge references non-existent block
      errors.push({
        code: 'BlockMissing',
        message: `Edge references missing block: ${a} or ${b}`,
        where: { edgeId: e.id },
      });
      continue;
    }
    if (!adj.get(a)!.has(b)) {
      adj.get(a)!.add(b);
      indeg.set(b, (indeg.get(b) ?? 0) + 1);
    }
  }

  // Kahn's algorithm
  const queue: BlockId[] = [];
  for (const id of ids) {
    if ((indeg.get(id) ?? 0) === 0) queue.push(id);
  }

  // Stable order: sort by id
  queue.sort();

  const out: BlockId[] = [];
  while (queue.length !== 0) {
    const x = queue.shift()!;
    out.push(x);
    for (const y of adj.get(x) ?? []) {
      indeg.set(y, (indeg.get(y) ?? 0) - 1);
      if ((indeg.get(y) ?? 0) === 0) queue.push(y);
    }
    queue.sort();
  }

  if (out.length !== ids.length) {
    errors.push({
      code: 'CycleDetected',
      message: 'Cycle detected in patch graph',
    });
    return [];
  }

  return out;
}
