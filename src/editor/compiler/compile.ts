/**
 * Patch → Program Compiler
 *
 * Compiles a visual patch graph into a runnable V4 Program<RenderTree>.
 *
 * Architecture:
 * 1. Validate block types exist in registry
 * 2. Build connection indices, detect multiple writers
 * 3. Type-check connections against declared port types
 * 4. Topological sort blocks by dependency
 * 5. Compile blocks in order, producing Artifacts per output port
 * 6. Resolve and return final RenderTreeProgram output
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
import { compileBusAwarePatch } from './compileBusAware';
import { getBlockDefinition } from '../blocks';
// =============================================================================
// Main Compiler Entry Point
// =============================================================================

export function compilePatch(
  patch: CompilerPatch,
  registry: BlockRegistry,
  seed: Seed,
  ctx: CompileCtx,
  options?: { emitIR?: boolean }
): CompileResult {
 return compileBusAwarePatch(patch, registry, seed, ctx, options);
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
      message: 'Patch must contain exactly one TimeRoot block (FiniteTimeRoot, CycleTimeRoot, or InfiniteTimeRoot)',
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
  const ids = Array.from(patch.blocks.keys());

  // Build adjacency + indegree
  const adj = new Map<BlockId, Set<BlockId>>();
  const indeg = new Map<BlockId, number>();

  for (const id of ids) {
    adj.set(id, new Set());
    indeg.set(id, 0);
  }

  for (const c of patch.connections) {
    const a = c.from.blockId;
    const b = c.to.blockId;
    if (!adj.has(a) || !adj.has(b)) {
      // Connection references non-existent block
      errors.push({
        code: 'BlockMissing',
        message: `Connection references missing block: ${a} or ${b}`,
        where: { connection: c },
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
