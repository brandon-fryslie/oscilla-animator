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
  Artifact,
  BlockId,
  BlockInstance,
  BlockRegistry,
  CompileCtx,
  CompileError,
  CompileResult,
  CompilerConnection,
  CompilerPatch,
  DrawNode,
  PortRef,
  Program,
  RenderTree,
  RuntimeCtx,
  Seed,
  TimeModel,
} from './types';
import { compileBusAwarePatch, isBusAwarePatch } from './compileBusAware';
import { getFeatureFlags } from './featureFlags';
import { getBlockDefinition } from '../blocks';

import { arePortTypesCompatible, areValueKindsCompatible, Validator } from '../semantic';
// =============================================================================
// Main Compiler Entry Point
// =============================================================================

export function compilePatch(
  patch: CompilerPatch,
  registry: BlockRegistry,
  seed: Seed,
  ctx: CompileCtx
): CompileResult {
  // Route to bus-aware compiler if patch has buses
  if (isBusAwarePatch(patch)) {
    return compileBusAwarePatch(patch, registry, seed, ctx);
  }

  // Wire-only compilation (Phase 1 logic)
  return compilePatchWireOnly(patch, registry, seed, ctx);
}

/**
 * Convert CompilerPatch to PatchDocument for validation.
 * This bridges the compiler's Map-based format to the Validator's array-based format.
 */
function compilerPatchToPatchDocument(patch: CompilerPatch): import('../semantic/types').PatchDocument {
  const blocks = Array.from(patch.blocks.values()).map(block => ({
    id: block.id,
    type: block.type,
    inputs: [], // CompilerPatch doesn't store slots - they come from registry
    outputs: [],
  }));

  // Resolve inputs/outputs from registry
  const getBlockDef = (type: string) => getBlockDefinition(type);

  for (const block of blocks) {
    const def = getBlockDef(block.type);
    if (def) {
      (block as any).inputs = def.inputs.map(slot => ({ id: slot.id, type: slot.type }));
      (block as any).outputs = def.outputs.map(slot => ({ id: slot.id, type: slot.type }));
    }
  }

  return {
    blocks,
    connections: Array.from(patch.connections).map(conn => ({
      id: `conn-${conn.from.blockId}-${conn.from.port}-${conn.to.blockId}-${conn.to.port}`,
      from: { blockId: conn.from.blockId, slotId: conn.from.port },
      to: { blockId: conn.to.blockId, slotId: conn.to.port },
    })),
    buses: patch.buses ?? [],
    publishers: patch.publishers ?? [],
    listeners: patch.listeners ?? [],
  };
}

/**
 * Wire-only compilation (original Phase 1 implementation).
 * Used for backward compatibility with non-bus patches.
 */
function compilePatchWireOnly(
  patch: CompilerPatch,
  registry: BlockRegistry,
  _seed: Seed,
  ctx: CompileCtx
): CompileResult {
  const errors: CompileError[] = [];

  // 0) Handle empty patch gracefully - nothing to compile
  if (patch.blocks.size === 0) {
    return {
      ok: false,
      errors: [{ code: 'EmptyPatch', message: 'Patch is empty - add some blocks to compile.' }],
    };
  }

  // 0.5) Semantic validation using the Validator (warn-only for wire-only mode)
  // Wire-only mode is for backward compatibility with simple test patches.
  // Full validation is enforced in the bus-aware compiler.
  try {
    const patchDoc = compilerPatchToPatchDocument(patch);
    const validator = new Validator(patchDoc, 0);
    const validationResult = validator.validateAll(patchDoc);

    if (!validationResult.ok) {
      // Log warnings but don't fail - wire-only mode is lenient
      for (const diag of validationResult.errors) {
        console.warn(`[Compiler] Validation warning: ${diag.code} - ${diag.message}`);
      }
    }
  } catch (e) {
    // Validation errors should not crash compilation
    console.warn('[Compiler] Validation error:', e);
  }

  // 0.6) Validate TimeRoot constraint (if feature flag enabled)
  const timeRootErrors = validateTimeRootConstraint(patch);
  if (timeRootErrors.length > 0) {
    return { ok: false, errors: timeRootErrors };
  }

  // 1) Validate block types exist in registry
  for (const [id, b] of patch.blocks.entries()) {
    if (!registry[b.type]) {
      errors.push({
        code: 'CompilerMissing',
        message: `No compiler registered for block type "${b.type}"`,
        where: { blockId: id },
      });
    }
  }
  if (errors.length) return { ok: false, errors };

  // 2) Build connection indices (detect multiple writers to same input)
  const incoming = indexIncoming(patch.connections);

  for (const [toKey, conns] of incoming.entries()) {
    if (conns.length > 1) {
      errors.push({
        code: 'MultipleWriters',
        message: `Input port has multiple incoming connections: ${toKey}`,
        where: { connection: conns[0] },
      });
    }
  }
  if (errors.length) return { ok: false, errors };

  // 3) Type-check connections against declared port types
  for (const c of patch.connections) {
    const fromBlock = patch.blocks.get(c.from.blockId);
    const toBlock = patch.blocks.get(c.to.blockId);

    if (!fromBlock) {
      errors.push({
        code: 'BlockMissing',
        message: `Missing from-block ${c.from.blockId}`,
        where: { connection: c },
      });
      continue;
    }
    if (!toBlock) {
      errors.push({
        code: 'BlockMissing',
        message: `Missing to-block ${c.to.blockId}`,
        where: { connection: c },
      });
      continue;
    }

    const fromComp = registry[fromBlock.type]!;
    const toComp = registry[toBlock.type]!;

    const fromPort = fromComp.outputs.find((p) => p.name === c.from.port);
    const toPort = toComp.inputs.find((p) => p.name === c.to.port);

    if (!fromPort) {
      errors.push({
        code: 'PortMissing',
        message: `Missing output port ${c.from.blockId}.${c.from.port}`,
        where: { connection: c },
      });
      continue;
    }
    if (!toPort) {
      errors.push({
        code: 'PortMissing',
        message: `Missing input port ${c.to.blockId}.${c.to.port}`,
        where: { connection: c },
      });
      continue;
    }

    if (!arePortTypesCompatible(fromPort.type, toPort.type)) {
      errors.push({
        code: 'PortTypeMismatch',
        message: `Type mismatch: ${c.from.blockId}.${c.from.port} (${fromPort.type.kind}) → ${c.to.blockId}.${c.to.port} (${toPort.type.kind})`,
        where: { connection: c },
      });
    }
  }
  if (errors.length) return { ok: false, errors };

  // 4) Topological order by blocks (dependency graph from connections)
  const order = topoSortBlocks(patch, errors);
  if (errors.length) return { ok: false, errors };

  // 5) Compile blocks in topo order to artifacts per output port
  const compiledPortMap = new Map<string, Artifact>();

  for (const blockId of order) {
    const block = patch.blocks.get(blockId);
    if (!block) {
      errors.push({
        code: 'BlockMissing',
        message: `Block not found: ${blockId}`,
        where: { blockId },
      });
      continue;
    }

    const compiler = registry[block.type];
    if (!compiler) {
      errors.push({
        code: 'CompilerMissing',
        message: `Compiler missing for: ${block.type}`,
        where: { blockId },
      });
      continue;
    }

    // Resolve inputs
    const inputs: Record<string, Artifact> = {};
    for (const p of compiler.inputs) {
      const conn = incoming.get(keyOf(blockId, p.name))?.[0];
      if (conn) {
        const srcKey = keyOf(conn.from.blockId, conn.from.port);
        const src = compiledPortMap.get(srcKey);
        inputs[p.name] = src ?? {
          kind: 'Error',
          message: `Missing upstream artifact for ${srcKey}`,
          where: { blockId: conn.from.blockId, port: conn.from.port },
        };
      } else {
        // No connection: either optional or provide default scalar constant from params.
        if (p.required) {
          inputs[p.name] = {
            kind: 'Error',
            message: `Missing required input ${blockId}.${p.name}`,
            where: { blockId, port: p.name },
          };
        } else {
          // Optional inputs get a placeholder Error - block compiler handles defaults
          inputs[p.name] = {
            kind: 'Error',
            message: `Unwired optional input ${blockId}.${p.name}`,
            where: { blockId, port: p.name },
          };
        }
      }
    }

    // If any required input is an Error, record it
    for (const [name, art] of Object.entries(inputs)) {
      if (art.kind === 'Error') {
        const def = compiler.inputs.find((x) => x.name === name);
        if (def?.required) {
          errors.push({
            code: 'UpstreamError',
            message: art.message,
            where: { blockId, port: name },
          });
        }
      }
    }
    if (errors.length) return { ok: false, errors };

    const outs = compiler.compile({ id: blockId, params: block.params, inputs, ctx });

    // Validate outputs and store
    for (const outDef of compiler.outputs) {
      const produced = outs[outDef.name];
      if (!produced) {
        errors.push({
          code: 'PortMissing',
          message: `Compiler did not produce required output port ${blockId}.${outDef.name}`,
          where: { blockId, port: outDef.name },
        });
        continue;
      }
      if (produced.kind === 'Error') {
        errors.push({
          code: 'UpstreamError',
          message: produced.message,
          where: produced.where ?? { blockId, port: outDef.name },
        });
        continue;
      }
      if (!areValueKindsCompatible(produced.kind, outDef.type.kind)) {
        errors.push({
          code: 'PortTypeMismatch',
          message: `Compiler produced wrong kind for ${blockId}.${outDef.name}: got ${produced.kind}, expected ${outDef.type.kind}`,
          where: { blockId, port: outDef.name },
        });
        continue;
      }
      compiledPortMap.set(keyOf(blockId, outDef.name), produced);
    }

    if (errors.length) return { ok: false, errors };
  }

  // 6) Resolve final output port
  const outputRef = patch.output ?? inferOutputPort(patch, registry, compiledPortMap, errors);
  if (!outputRef) {
    errors.push({
      code: 'OutputMissing',
      message: 'No output port specified and could not infer one.',
    });
    return { ok: false, errors };
  }

  const outArt = compiledPortMap.get(keyOf(outputRef.blockId, outputRef.port));
  if (!outArt) {
    errors.push({
      code: 'OutputMissing',
      message: `Output artifact not found for ${outputRef.blockId}.${outputRef.port}`,
    });
    return { ok: false, errors };
  }

  // Infer TimeModel from the patch
  const timeModel = inferTimeModel(patch);

  // Accept both RenderTreeProgram and RenderTree (wrap RenderTree into a Program)
  if (outArt.kind === 'RenderTreeProgram') {
    return { ok: true, program: outArt.value, timeModel, errors: [], compiledPortMap };
  }

  if (outArt.kind === 'RenderTree') {
    // Wrap RenderTree function into a Program structure
    const renderFn = outArt.value as (tMs: number, ctx: RuntimeCtx) => DrawNode;
    const program: Program<RenderTree> = {
      signal: renderFn,
      event: () => [],
    };
    return { ok: true, program, timeModel, errors: [], compiledPortMap };
  }

  errors.push({
    code: 'OutputWrongType',
    message: `Patch output must be RenderTreeProgram or RenderTree, got ${outArt.kind}`,
    where: { blockId: outputRef.blockId, port: outputRef.port },
  });
  return { ok: false, errors };
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
    if (blockDef?.category === 'TimeRoot') {
      timeRootBlocks.push(block);
    }
  }

  return timeRootBlocks;
}

/**
 * Validate TimeRoot constraint: exactly one TimeRoot per patch.
 * Returns errors if validation fails, empty array if valid.
 *
 * Only enforced when `requireTimeRoot` feature flag is enabled.
 */
export function validateTimeRootConstraint(patch: CompilerPatch): CompileError[] {
  const flags = getFeatureFlags();
  if (!flags.requireTimeRoot) {
    return []; // Skip validation in legacy mode
  }

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
      where: { blockId: timeRootBlocks[0]!.id },
    });
  }

  return errors;
}

/**
 * Infer TimeModel from a TimeRoot block.
 */
function inferTimeModelFromTimeRoot(block: BlockInstance): TimeModel {
  switch (block.type) {
    case 'FiniteTimeRoot': {
      const durationMs = Number(block.params.durationMs ?? 5000);
      return {
        kind: 'finite',
        durationMs,
        cuePoints: [
          { tMs: 0, label: 'Start', kind: 'marker' },
          { tMs: durationMs, label: 'End', kind: 'marker' },
        ],
      };
    }
    case 'CycleTimeRoot': {
      const periodMs = Number(block.params.periodMs ?? 3000);
      const mode = String(block.params.mode ?? 'loop') as 'loop' | 'pingpong';
      return {
        kind: 'cyclic',
        periodMs,
        phaseDomain: '0..1',
        mode,
      };
    }
    case 'InfiniteTimeRoot': {
      const windowMs = Number(block.params.windowMs ?? 10000);
      return {
        kind: 'infinite',
        windowMs,
      };
    }
    default:
      // Unknown TimeRoot type - use infinite fallback
      return { kind: 'infinite', windowMs: 10000 };
  }
}

/**
 * Infer TimeModel from the compiled patch.
 *
 * IMPORTANT: WP1 eliminates legacy inference paths. Only TimeRoot blocks
 * should determine TimeModel. This is enforced by the requireTimeRoot flag.
 *
 * Legacy inference for PhaseMachine and PhaseClock has been removed.
 * Patches without TimeRoot blocks will fail validation when requireTimeRoot is enabled.
 */
function inferTimeModel(patch: CompilerPatch): TimeModel {
  // Check for explicit TimeRoot blocks first (Phase 3: TimeRoot)
  const timeRootBlocks = findTimeRootBlocks(patch);
  if (timeRootBlocks.length === 1) {
    return inferTimeModelFromTimeRoot(timeRootBlocks[0]!);
  }

  // No TimeRoot found - this should be caught by validation (requireTimeRoot flag).
  // If we reach here, it means validation was bypassed or there's a bug.
  throw new Error(
    'E_TIME_ROOT_MISSING: No TimeRoot block found. ' +
      'Every patch must have exactly one TimeRoot (FiniteTimeRoot, CycleTimeRoot, or InfiniteTimeRoot).'
  );
}

// =============================================================================
// Port Compatibility
// =============================================================================
// NOTE: Type compatibility functions have been moved to src/editor/semantic/
// to provide a single source of truth for both UI and compiler.
// Import from '../semantic' for arePortTypesCompatible, areValueKindsCompatible.

// =============================================================================
// Connection Indexing
// =============================================================================

function indexIncoming(
  conns: readonly CompilerConnection[]
): Map<string, CompilerConnection[]> {
  const m = new Map<string, CompilerConnection[]>();
  for (const c of conns) {
    const k = keyOf(c.to.blockId, c.to.port);
    const arr = m.get(k) ?? [];
    arr.push(c);
    m.set(k, arr);
  }
  return m;
}

function keyOf(blockId: string, port: string): string {
  return `${blockId}:${port}`;
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
    if (!adj.has(a) || !adj.has(b)) continue;
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
  while (queue.length) {
    const x = queue.shift()!;
    out.push(x);
    for (const y of adj.get(x) ?? []) {
      indeg.set(y, (indeg.get(y) ?? 0) - 1);
      if ((indeg.get(y) ?? 0) === 0) queue.push(y);
    }
    queue.sort();
  }

  if (out.length !== ids.length) {
    errors.push({ code: 'CycleDetected', message: 'Cycle detected in patch graph.' });
    return [];
  }

  return out;
}

// =============================================================================
// Output Inference
// =============================================================================

function inferOutputPort(
  patch: CompilerPatch,
  registry: BlockRegistry,
  compiled: Map<string, Artifact>,
  _errors: CompileError[]
): PortRef | null {
  // Heuristic: find all produced RenderTreeProgram or RenderTree ports that are NOT used as a source.
  // If exactly one, pick it.
  const produced: PortRef[] = [];

  // Map of all ports that feed something
  const fed = new Set<string>();
  for (const c of patch.connections) fed.add(keyOf(c.from.blockId, c.from.port));

  for (const [blockId, block] of patch.blocks.entries()) {
    const comp = registry[block.type];
    if (!comp) continue;
    for (const out of comp.outputs) {
      // Accept all render output types: Render, RenderTree, RenderTreeProgram
      const renderTypes = ['Render', 'RenderTree', 'RenderTreeProgram'];
      if (!renderTypes.includes(out.type.kind)) continue;
      const k = keyOf(blockId, out.name);
      if (!compiled.has(k)) continue;
      if (fed.has(k)) continue;
      produced.push({ blockId, port: out.name });
    }
  }

  if (produced.length === 1) return produced[0]!;
  return null;
}