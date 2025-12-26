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
  CompilerConnection,
  CompilerPatch,
  DrawNode,
  PortRef,
  Program,
  RenderTree,
  RuntimeCtx,
  Seed,
  TimeModel,
  Vec2,
} from './types';
import type { Bus, Publisher, Listener, LensInstance, AdapterStep, DefaultSourceState } from '../types';
import { validateTimeRootConstraint } from './compile';
import { extractTimeRootAutoPublications } from './blocks/domain/TimeRoot';
// CRITICAL: Use busSemantics for ordering - single source of truth for UI and compiler
import { getSortedPublishers, combineSignalArtifacts, combineFieldArtifacts } from '../semantic/busSemantics';
import {
  validateReservedBus,
  isReservedBusName,
} from '../semantic/busContracts';
import { getBlockDefinition } from '../blocks/registry';
import { getLens } from '../lenses/LensRegistry';
import { resolveLensParam } from '../lenses/lensResolution';
// Sprint 2, P0-4: Dual-Emit IR Compilation passes
import { validateIR, irErrorToCompileError } from './ir/validator';
import {
  pass1Normalize,
  pass2TypeGraph,
  pass3TimeTopology,
  pass4DepGraph,
  pass5CycleValidation,
  pass6BlockLowering,
  pass7BusLowering,
  pass8LinkResolution,
} from './passes';


// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a bus is a Field bus.
 */
function isFieldBus(bus: Bus): boolean {
  return bus.type.world === 'field';
}

/**
 * Supported combine modes for Signal buses.
 */
const SIGNAL_COMBINE_MODES = ['last', 'sum'] as const;

/**
 * Supported combine modes for Field buses.
 * Fields support additional modes because per-element combination is natural.
 */
const FIELD_COMBINE_MODES = ['last', 'sum', 'average', 'max', 'min'] as const;


// =============================================================================
// Default Values
// =============================================================================
// =============================================================================
// Publisher Sorting
// =============================================================================
// REMOVED: Local sortPublishers() function - use canonical getSortedPublishers() from busSemantics

// =============================================================================
// Signal Combination
// =============================================================================
// REMOVED: Local combineSignalArtifacts() function - use canonical version from busSemantics

// =============================================================================
// Field Combination
// =============================================================================
// REMOVED: Local combineFieldArtifacts() function - use canonical version from busSemantics

// =============================================================================
// Topological Sort with Bus Dependencies
// =============================================================================

/**
 * Topological sort that considers both wire AND bus dependencies.
 * A block B depends on block A if:
 * 1. A has a wire output connected to B's input, OR
 * 2. A publishes to a bus that B listens to
 *
 * This ensures publisher blocks compile before listener blocks.
 */
function topoSortBlocksWithBuses(
  patch: CompilerPatch,
  publishers: Publisher[],
  listeners: Listener[],
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

  // Add edges from wire connections
  for (const c of patch.connections) {
    const a = c.from.blockId;
    const b = c.to.blockId;
    if (!adj.has(a) || !adj.has(b)) continue;
    if (!adj.get(a)!.has(b)) {
      adj.get(a)!.add(b);
      indeg.set(b, (indeg.get(b) ?? 0) + 1);
    }
  }

  // Add edges from bus dependencies: publisher block → listener block
  // Group publishers by busId for efficient lookup
  const publishersByBus = new Map<string, Publisher[]>();
  for (const pub of publishers) {
    if (!pub.enabled) continue;
    const list = publishersByBus.get(pub.busId) ?? [];
    list.push(pub);
    publishersByBus.set(pub.busId, list);
  }

  // For each listener, add edges from all publishers on that bus
  for (const listener of listeners) {
    if (!listener.enabled) continue;
    const listenerBlockId = listener.to.blockId;
    if (!adj.has(listenerBlockId)) continue;

    const busPublishers = publishersByBus.get(listener.busId) ?? [];
    for (const pub of busPublishers) {
      const pubBlockId = pub.from.blockId;
      if (!adj.has(pubBlockId)) continue;

      // Don't add self-loop (same block publishes and listens)
      if (pubBlockId === listenerBlockId) continue;

      // Add edge: publisher block → listener block
      if (!adj.get(pubBlockId)!.has(listenerBlockId)) {
        adj.get(pubBlockId)!.add(listenerBlockId);
        indeg.set(listenerBlockId, (indeg.get(listenerBlockId) ?? 0) + 1);
      }
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
    // Find blocks in cycle for better error message
    const inCycle = ids.filter(id => !out.includes(id));
    errors.push({
      code: 'CycleDetected',
      message: `Cycle detected in patch graph. Blocks in cycle: ${inCycle.join(', ')}`,
    });
    return [];
  }

  return out;
}

// =============================================================================
// WP0 Reserved Bus Validation
// =============================================================================

/**
 * Validate WP0 reserved bus contracts.
 * Ensures canonical buses have correct types and combine modes.
 */
function validateReservedBuses(
  buses: Bus[],
  _publishers: Publisher[],
  _blocks: Map<string, BlockInstance>
): CompileError[] {
  const errors: CompileError[] = [];

  for (const bus of buses) {
    if (!isReservedBusName(bus.name)) {
      continue; // Skip non-reserved buses
    }

    // Validate bus type and combine mode against reserved contract
    const validationErrors = validateReservedBus(
      bus.name,
      bus.type,
      bus.combineMode
    );

    for (const validationError of validationErrors) {
      errors.push({
        code: 'PortTypeMismatch', // Use existing error code for type mismatches
        message: validationError.message,
        where: { busId: bus.id },
      });
    }
  }

  return errors;
}


// =============================================================================
// Sprint 2, P0-4: Dual-Emit IR Compilation Helper
// =============================================================================

/**
 * Run IR compilation passes (Passes 1-8) after closure compilation succeeds.
 * This is Sprint 2's dual-emit strategy: closures work, IR is generated alongside.
 *
 * @param patch - The CompilerPatch that was successfully compiled
 * @param compiledPortMap - The closure artifacts from successful compilation
 * @returns LinkedGraphIR or undefined if IR compilation fails
 */
function compileIR(
  patch: CompilerPatch,
  compiledPortMap: Map<string, Artifact>
): CompileResult['ir'] {
  try {
    // Convert CompilerPatch to Patch format for Pass 1
    const blocksArray: import('../types').Block[] = Array.from(patch.blocks.values()).map((inst) => {
      const def = getBlockDefinition(inst.type);
      if (!def) {
        throw new Error(`Block definition not found for type: ${inst.type}`);
      }
      
      // Type assertion for IR compilation - structure is compatible enough for passes
      return {
        id: inst.id,
        type: inst.type,
        label: def.label,
        inputs: (def.inputs || []) as any,
        outputs: (def.outputs || []) as any,
        params: inst.params,
        category: 'internal' as any,
        description: def.description,
      } as import('../types').Block;
    });

    // Convert to CompilerConnection format (uses 'port' not 'slotId')
    const connectionsArray: import('./types').CompilerConnection[] = patch.connections.map((conn) => ({
      id: conn.id || `${conn.from.blockId}:${conn.from.port}->${conn.to.blockId}:${conn.to.port}`,
      from: { blockId: conn.from.blockId, port: conn.from.port },
      to: { blockId: conn.to.blockId, port: conn.to.port },
    }));

    // Create Connection[] for Patch (passes 1-5)
    const patchConnections: import('../types').Connection[] = patch.connections.map((conn) => ({
      id: conn.id || `${conn.from.blockId}:${conn.from.port}->${conn.to.blockId}:${conn.to.port}`,
      from: { blockId: conn.from.blockId, slotId: conn.from.port, direction: 'output' as const },
      to: { blockId: conn.to.blockId, slotId: conn.to.port, direction: 'input' as const },
    }));

    const patchForIR: import('../types').Patch = {
      version: 1,
      blocks: blocksArray,
      connections: patchConnections,
      lanes: [], // Not needed for IR passes
      buses: patch.buses,
      publishers: patch.publishers,
      listeners: patch.listeners,
      defaultSources: Object.entries(patch.defaultSources).map(([slotId, state]) => ({
        id: slotId,
        type: state.type,
        value: state.value,
        uiHint: state.uiHint,
        rangeHint: state.rangeHint,
      })),
      settings: { seed: 0, speed: 1 },
    };

    // Run Passes 1-5: Normalization → Validation
    const normalized = pass1Normalize(patchForIR);
    const typed = pass2TypeGraph(normalized);
    const timeResolved = pass3TimeTopology(typed);
    const depGraph = pass4DepGraph(timeResolved);
    const validated = pass5CycleValidation(depGraph, patchForIR.blocks);

    // Run Passes 6-8: Block Lowering → Bus Lowering → Link Resolution
    const unlinked = pass6BlockLowering(validated, patchForIR.blocks, compiledPortMap);
    const withBuses = pass7BusLowering(unlinked, patchForIR.buses, patchForIR.publishers);
    const linked = pass8LinkResolution(
      withBuses,
      patchForIR.blocks,
      connectionsArray,
      patchForIR.listeners
    );

    // P0-6: Run IR validator (always in dev builds, can be disabled via flag)
    const shouldValidate = import.meta.env?.DISABLE_IR_VALIDATION !== 'true';
    if (shouldValidate) {
      const validation = validateIR(linked);
      if (!validation.valid) {
        // Convert validation errors to CompileErrors and attach to LinkedGraphIR
        const validationCompileErrors = validation.errors.map(irErrorToCompileError);
        return {
          ...linked,
          errors: [...linked.errors, ...validationCompileErrors],
        };
      }
    }

    return linked;
  } catch (e) {
    // IR compilation failed - this is non-fatal, we still have closure
    console.warn('IR compilation failed:', e);
    return undefined;
  }
}

// =============================================================================
// Main Bus-Aware Compiler
// =============================================================================

/**
 * Compile a patch with buses.
 * Phase 3: Signal AND Field buses.
 */
export function compileBusAwarePatch(
  patch: CompilerPatch,
  registry: BlockRegistry,
  _seed: Seed,
  ctx: CompileCtx,
  options?: { emitIR?: boolean }
): CompileResult {
  const errors: CompileError[] = [];
  const buses = patch.buses;
  let publishers = patch.publishers;
  const listeners = patch.listeners;
  const defaultSources = new Map<string, DefaultSourceState>(
    Object.entries(patch.defaultSources)
  );

  // =============================================================================
  // 0. Empty patch check
  // =============================================================================
  if (patch.blocks.size === 0 && buses.length === 0) {
    return {
      ok: false,
      errors: [{ code: 'EmptyPatch', message: 'Patch is empty - add some blocks to compile.' }],
    };
  }

  // =============================================================================
  // 0.5. Validate TimeRoot constraint (if feature flag enabled)
  // =============================================================================
  const timeRootErrors = validateTimeRootConstraint(patch);
  if (timeRootErrors.length > 0) {
    return { ok: false, errors: timeRootErrors };
  }

  // =============================================================================
  // 1. WP0 Reserved Bus Validation
  // =============================================================================
  const reservedBusErrors = validateReservedBuses(buses, publishers, patch.blocks);
  if (reservedBusErrors.length > 0) {
    return { ok: false, errors: reservedBusErrors };
  }

  // =============================================================================
  // 2. Extract and inject TimeRoot auto-publications
  // =============================================================================
  const autoPublications: Publisher[] = [];

  for (const [blockId, block] of patch.blocks.entries()) {
    if (['FiniteTimeRoot', 'CycleTimeRoot', 'InfiniteTimeRoot'].includes(block.type)) {
      // Compile the TimeRoot block to get its outputs
      const compiler = registry[block.type];
      if (compiler === undefined) {
        errors.push({
          code: 'CompilerMissing',
          message: `Compiler missing for TimeRoot: ${block.type}`,
          where: { blockId },
        });
        continue;
      }

      // Compile TimeRoot to get outputs for auto-publication extraction
      const timeRootOutputs = compiler.compile({
        id: blockId,
        params: block.params,
        inputs: {},
        ctx
      });

      // Extract auto-publications from TimeRoot outputs
      const autoPubs = extractTimeRootAutoPublications(block.type, timeRootOutputs);

      // Convert AutoPublication to Publisher format
      // Note: Auto-publications are optional - if the target bus doesn't exist, skip it.
      // This allows simpler patches (and tests) that don't use all canonical buses.
      for (const autoPub of autoPubs) {
        // Find the bus ID for this auto-published bus name
        const targetBus = buses.find(b => b.name === autoPub.busName);
        if (targetBus === undefined) {
          // Bus doesn't exist in patch - skip auto-publication silently
          continue;
        }

        autoPublications.push({
          id: `auto-${blockId}-${autoPub.busName}`,
          enabled: true,
          busId: targetBus.id,
          from: { blockId, slotId: autoPub.artifactKey, direction: 'output' },
          sortKey: autoPub.sortKey,
        });
      }
    }
  }

  if (errors.length !== 0) return { ok: false, errors };

  // Merge auto-publications with existing publishers
  publishers = [...publishers, ...autoPublications];

  // =============================================================================
  // 3. Validate combine modes (different for Signal vs Field buses)
  // =============================================================================
  for (const bus of buses) {
    if (isFieldBus(bus)) {
      // Field buses support more combine modes
      if (!(FIELD_COMBINE_MODES as readonly string[]).includes(bus.combineMode)) {
        errors.push({
          code: 'UnsupportedCombineMode',
          message: `Combine mode "${bus.combineMode}" not supported for Field bus. Supported: ${FIELD_COMBINE_MODES.join(', ')}.`,
          where: { busId: bus.id },
        });
      }
    } else {
      // Signal buses only support last and sum
      if (!(SIGNAL_COMBINE_MODES as readonly string[]).includes(bus.combineMode)) {
        errors.push({
          code: 'UnsupportedCombineMode',
          message: `Combine mode "${bus.combineMode}" not supported for Signal bus. Supported: ${SIGNAL_COMBINE_MODES.join(', ')}.`,
          where: { busId: bus.id },
        });
      }
    }
  }
  if (errors.length !== 0) return { ok: false, errors };

  // =============================================================================
  // 4. Validate block types exist in registry
  // =============================================================================
  for (const [id, b] of patch.blocks.entries()) {
    if (registry[b.type] === undefined) {
      errors.push({
        code: 'CompilerMissing',
        message: `No compiler registered for block type "${b.type}"`,
        where: { blockId: id },
      });
    }
  }
  if (errors.length !== 0) return { ok: false, errors };

  // =============================================================================
  // 5. Build wire connection indices
  // =============================================================================
  const incoming = indexIncoming(patch.connections);

  // Check for multiple writers (wires only - buses allow multiple publishers)
  for (const [toKey, conns] of incoming.entries()) {
    if (conns.length > 1) {
      errors.push({
        code: 'MultipleWriters',
        message: `Input port has multiple incoming wire connections: ${toKey}`,
        where: { connection: conns[0] },
      });
    }
  }
  if (errors.length !== 0) return { ok: false, errors };

  // =============================================================================
  // 5.5. Validate port existence (fail fast before compilation)
  // =============================================================================
  // Validate wire connection source ports
  for (const conn of patch.connections) {
    const fromBlock = patch.blocks.get(conn.from.blockId);
    if (fromBlock === undefined) continue; // Block existence already validated in step 2

    const compiler = registry[fromBlock.type];
    if (compiler === undefined) continue; // Compiler existence already validated in step 2

    const portExists = compiler.outputs.some(p => p.name === conn.from.port);
    if (!portExists) {
      errors.push({
        code: 'PortMissing',
        message: `Block ${conn.from.blockId} (${fromBlock.type}) does not have output port '${conn.from.port}' (referenced by wire connection)`,
        where: { blockId: conn.from.blockId, port: conn.from.port },
      });
    }
  }

  // Validate publisher source ports
  for (const pub of publishers) {
    const fromBlock = patch.blocks.get(pub.from.blockId);
    if (fromBlock === undefined) continue; // Block existence already validated

    const compiler = registry[fromBlock.type];
    if (compiler === undefined) continue; // Compiler existence already validated

    const portExists = compiler.outputs.some(p => p.name === pub.from.slotId);
    if (!portExists) {
      errors.push({
        code: 'PortMissing',
        message: `Block ${pub.from.blockId} (${fromBlock.type}) does not have output port '${pub.from.slotId}' (referenced by publisher to bus '${pub.busId}')`,
        where: { blockId: pub.from.blockId, port: pub.from.slotId },
      });
    }
  }

  if (errors.length !== 0) return { ok: false, errors };

  // =============================================================================
  // 6. Topological sort blocks (wire AND bus dependencies)
  // =============================================================================
  const order = topoSortBlocksWithBuses(patch, publishers, listeners, errors);
  if (errors.length !== 0) return { ok: false, errors };

  // =============================================================================
  // 7. Compile blocks in topo order
  // =============================================================================
  const compiledPortMap = new Map<string, Artifact>();

  for (const blockId of order) {
    const block = patch.blocks.get(blockId);
    if (block === undefined) {
      errors.push({
        code: 'BlockMissing',
        message: `Block not found: ${blockId}`,
        where: { blockId },
      });
      continue;
    }

    const compiler = registry[block.type];
    if (compiler === undefined) {
      errors.push({
        code: 'CompilerMissing',
        message: `Compiler missing for: ${block.type}`,
        where: { blockId },
      });
      continue;
    }

    // Resolve inputs (from wires AND buses)
    const inputs: Record<string, Artifact> = {};

    for (const p of compiler.inputs) {
      // First check for wire connection
      const wireConn = incoming.get(keyOf(blockId, p.name))?.[0];

      if (wireConn !== null && wireConn !== undefined) {
        // Wire takes precedence over bus
        const srcKey = keyOf(wireConn.from.blockId, wireConn.from.port);
        const src = compiledPortMap.get(srcKey);
        const errorArtifact: Artifact = src ?? {
          kind: 'Error',
          message: `Missing upstream artifact for ${srcKey}`,
          where: { blockId: wireConn.from.blockId, port: wireConn.from.port },
        };
        inputs[p.name] = errorArtifact;
      } else {
        // Check for bus listener
        const busListener = listeners.find(
          l => l.enabled && l.to.blockId === blockId && l.to.slotId === p.name
        );

        if (busListener !== null && busListener !== undefined) {
          // Input comes from a bus - get the bus value
          const busArtifact = getBusValue(
            busListener.busId,
            buses,
            publishers,
            compiledPortMap,
            errors,
            (artifact, publisher) =>
              applyPublisherStack(artifact, publisher, ctx, defaultSources, buses, publishers, compiledPortMap, errors)
          );
          const adapted = applyAdapterChain(busArtifact, busListener.adapterChain, ctx, errors);
          const lensed = applyLensStack(
            adapted,
            busListener.lensStack,
            ctx,
            defaultSources,
            buses,
            publishers,
            compiledPortMap,
            errors
          );
          inputs[p.name] = lensed;
        } else {
          // Check for Default Source (fallback)
          const defaultArtifact = resolveDefaultSource(block, p.name, p.type.kind);

          if (defaultArtifact !== null && defaultArtifact !== undefined) {
            inputs[p.name] = defaultArtifact;
          } else if (p.required === true) {
            // No connection at all for required input
            inputs[p.name] = {
              kind: 'Error',
              message: `Missing required input ${blockId}.${p.name}`,
              where: { blockId, port: p.name },
            };
          } else {
            // Optional input with no connection
            inputs[p.name] = {
              kind: 'Error',
              message: `Unwired optional input ${blockId}.${p.name}`,
              where: { blockId, port: p.name },
            };
          }
        }
      }
    }

    // Check for required input errors
    for (const [name, art] of Object.entries(inputs)) {
      if (art.kind === 'Error') {
        const def = compiler.inputs.find((x) => x.name === name);
        if (def !== undefined && def !== null && def.required === true) {
          errors.push({
            code: 'UpstreamError',
            message: art.message,
            where: { blockId, port: name },
          });
        }
      }
    }
    if (errors.length !== 0) return { ok: false, errors };

    // Compile the block
    const outs = compiler.compile({ id: blockId, params: block.params, inputs, ctx });

    // Validate and store outputs
    for (const outDef of compiler.outputs) {
      const produced = outs[outDef.name];
      if (produced === undefined || produced === null) {
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
      compiledPortMap.set(keyOf(blockId, outDef.name), produced);
    }

    if (errors.length !== 0) return { ok: false, errors };
  }

  // =============================================================================
  // 8. Resolve final output port
  // =============================================================================
  const outputRef = patch.output ?? inferOutputPort(patch, registry, compiledPortMap);
  if (outputRef === undefined || outputRef === null) {
    errors.push({
      code: 'OutputMissing',
      message: 'No output port specified and could not infer one.',
    });
    return { ok: false, errors };
  }

  const outArt = compiledPortMap.get(keyOf(outputRef.blockId, outputRef.port));
  if (outArt === undefined || outArt === null) {
    errors.push({
      code: 'OutputMissing',
      message: `Output artifact not found for ${outputRef.blockId}.${outputRef.port}`,
    });
    return { ok: false, errors };
  }


/**
 * Helper to attach IR to a successful compile result if emitIR is enabled.
 */
function attachIR(
  result: CompileResult,
  patch: CompilerPatch,
  compiledPortMap: Map<string, Artifact>,
  emitIR: boolean
): CompileResult {
  if (!emitIR) {
    return result;
  }

  const ir = compileIR(patch, compiledPortMap);
  if (ir === undefined) {
    // IR compilation failed - add warning but keep closure success
    return {
      ...result,
      irWarnings: [
        {
          code: 'IRValidationFailed',
          message: 'IR compilation failed (see console for details)',
        },
      ],
    };
  }

  // Check for IR errors
  if (ir.errors && ir.errors.length > 0) {
    return {
      ...result,
      ir,
      irWarnings: ir.errors,
    };
  }

  return {
    ...result,
    ir,
  };
}

  // Infer TimeModel from the patch
  const timeModel = inferTimeModel(patch);

  // Accept RenderTreeProgram, RenderTree, or CanvasRender as output
  if (outArt.kind === 'RenderTreeProgram') {
    return attachIR(
      { ok: true, program: outArt.value, timeModel, errors: [], compiledPortMap },
      patch,
      compiledPortMap,
      options?.emitIR === true
    );
  }

  if (outArt.kind === 'RenderTree') {
    // Wrap RenderTree function into a Program structure
    const renderFn = outArt.value as (tMs: number, ctx: RuntimeCtx) => DrawNode;
    const program: Program<RenderTree> = {
      signal: renderFn,
      event: () => [],
    };
    return attachIR(
      { ok: true, program, timeModel, errors: [], compiledPortMap },
      patch,
      compiledPortMap,
      options?.emitIR === true
    );
  }

  // Handle Canvas render output
  if (outArt.kind === 'CanvasRender') {
    // Canvas output is a function that returns RenderTree (for Canvas2DRenderer)
    const canvasRenderFn = outArt.value;
    return attachIR(
      {
        ok: true,
        program: undefined, // No SVG program for canvas path
        canvasProgram: { signal: canvasRenderFn, event: () => [] },
        timeModel,
        errors: [],
        compiledPortMap,
      },
      patch,
      compiledPortMap,
      options?.emitIR === true
    );
  }

  errors.push({
    code: 'OutputWrongType',
    message: `Patch output must be RenderTreeProgram, RenderTree, or CanvasRender, got ${outArt.kind}`,
    where: { blockId: outputRef.blockId, port: outputRef.port },
  });
  return { ok: false, errors };
}

// =============================================================================
// TimeModel Inference
// =============================================================================

/**
 * Infer TimeModel from the compiled patch.
 *
 * IMPORTANT: Every patch MUST have exactly one TimeRoot block.
 * TimeRoot validation is enforced at compile time.
 * This function extracts the TimeModel from the TimeRoot block.
 *
 * TimeRoot types:
 * - FiniteTimeRoot → finite time model (one-shot animations)
 * - CycleTimeRoot → cyclic time model (looping animations)
 * - InfiniteTimeRoot → infinite time model (generative/evolving)
 */
function inferTimeModel(patch: CompilerPatch): TimeModel {
  for (const block of patch.blocks.values()) {
    if (block.type === 'FiniteTimeRoot') {
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

    if (block.type === 'CycleTimeRoot') {
      const periodMs = Number(block.params.periodMs ?? 3000);
      const modeParam = block.params.mode;
      const mode: 'loop' | 'pingpong' = (
        modeParam === 'loop' || modeParam === 'pingpong' ? modeParam : 'loop'
      );
      return {
        kind: 'cyclic',
        periodMs,
        phaseDomain: '0..1',
        mode,
      };
    }

    if (block.type === 'InfiniteTimeRoot') {
      const windowMs = Number(block.params.windowMs ?? 10000);
      return {
        kind: 'infinite',
        windowMs,
      };
    }
  }

  // No TimeRoot found - this should be caught by validation.
  // If we reach here, it means validation was bypassed or there's a bug.
  throw new Error(
    'E_TIME_ROOT_MISSING: No TimeRoot block found. ' +
      'Every patch must have exactly one TimeRoot (FiniteTimeRoot, CycleTimeRoot, or InfiniteTimeRoot).'
  );
}

// =============================================================================
// Bus Value Resolution
// =============================================================================

/**
 * Get the compiled value of a bus by combining all its publishers.
 */
function getBusValue(
  busId: string,
  buses: Bus[],
  publishers: Publisher[],
  compiledPortMap: Map<string, Artifact>,
  errors: CompileError[],
  applyPublisherStack?: (artifact: Artifact, publisher: Publisher) => Artifact
): Artifact {
  const bus = buses.find(b => b.id === busId);
  if (bus === undefined) {
    return {
      kind: 'Error',
      message: `Bus ${busId} not found`,
      where: { blockId: busId },
    };
  }

  // Get enabled publishers for this bus, sorted deterministically
  const sortedPublishers = getSortedPublishers(busId, publishers, false);

  // Collect artifacts from publishers
  const artifacts: Artifact[] = [];
  for (const pub of sortedPublishers) {
    const key = keyOf(pub.from.blockId, pub.from.slotId);
    const artifact = compiledPortMap.get(key);

    if (artifact === null || artifact === undefined) {
      errors.push({
        code: 'BusEvaluationError',
        message: `Publisher ${pub.id} references missing artifact ${key}`,
        where: { busId, blockId: pub.from.blockId, port: pub.from.slotId },
      });
      continue;
    }

    if (artifact.kind === 'Error') {
      errors.push({
        code: 'BusEvaluationError',
        message: `Publisher ${pub.id} has error artifact: ${artifact.message}`,
        where: { busId, blockId: pub.from.blockId, port: pub.from.slotId },
      });
      continue;
    }

    const shaped = applyPublisherStack !== null && applyPublisherStack !== undefined ? applyPublisherStack(artifact, pub) : artifact;
    artifacts.push(shaped);
  }

  // Combine artifacts using bus's combine mode - dispatch based on bus world
  if (isFieldBus(bus)) {
    return combineFieldArtifacts(artifacts, bus.combineMode, bus.defaultValue);
  } else {
    return combineSignalArtifacts(artifacts, bus.combineMode, bus.defaultValue);
  }
}

function applyPublisherStack(
  artifact: Artifact,
  publisher: Publisher,
  ctx: CompileCtx,
  defaultSources: Map<string, DefaultSourceState>,
  buses: Bus[],
  publishers: Publisher[],
  compiledPortMap: Map<string, Artifact>,
  errors: CompileError[]
): Artifact {
  const adapted = applyAdapterChain(artifact, publisher.adapterChain, ctx, errors);
  return applyLensStack(
    adapted,
    publisher.lensStack,
    ctx,
    defaultSources,
    buses,
    publishers,
    compiledPortMap,
    errors
  );
}

function applyAdapterChain(
  artifact: Artifact,
  chain: AdapterStep[] | undefined,
  ctx: CompileCtx,
  errors: CompileError[]
): Artifact {
  if (chain === null || chain === undefined || chain.length === 0) return artifact;
  let current = artifact;

  for (const step of chain) {
    const next = applyAdapterStep(current, step, ctx);
    if (next.kind === 'Error') {
      errors.push({
        code: 'AdapterError',
        message: next.message,
      });
      return next;
    }
    current = next;
  }

  return current;
}

function applyAdapterStep(artifact: Artifact, step: AdapterStep, ctx: CompileCtx): Artifact {
  const [adapterName] = step.adapterId.split(':');

  switch (adapterName) {
    case 'ConstToSignal': {
      if (artifact.kind === 'Scalar:number') {
        return { kind: 'Signal:number', value: () => artifact.value };
      }
      if (artifact.kind === 'Scalar:vec2') {
        return { kind: 'Signal:vec2', value: () => artifact.value };
      }
      if (artifact.kind === 'Scalar:color') {
        return { kind: 'Signal:color', value: () => artifact.value as string };
      }
      if (artifact.kind === 'Scalar:boolean') {
        return { kind: 'Signal:number', value: () => (artifact.value ? 1 : 0) };
      }
      return { kind: 'Error', message: `ConstToSignal unsupported for ${artifact.kind}` };
    }
    case 'BroadcastScalarToField': {
      if (artifact.kind === 'Scalar:number') {
        return {
          kind: 'Field:number',
          value: (_seed, n) => Array.from({ length: n }, () => artifact.value),
        };
      }
      if (artifact.kind === 'Scalar:vec2') {
        return {
          kind: 'Field:vec2',
          value: (_seed, n) => Array.from({ length: n }, () => artifact.value),
        };
      }
      if (artifact.kind === 'Scalar:color') {
        return {
          kind: 'Field:color',
          value: (_seed, n) => Array.from({ length: n }, () => artifact.value),
        };
      }
      if (artifact.kind === 'Scalar:boolean') {
        return {
          kind: 'Field:boolean',
          value: (_seed, n) => Array.from({ length: n }, () => artifact.value),
        };
      }
      return { kind: 'Error', message: `BroadcastScalarToField unsupported for ${artifact.kind}` };
    }
    case 'BroadcastSignalToField': {
      const t = (ctx.env as { t?: number }).t ?? 0;
      if (artifact.kind === 'Signal:number') {
        return {
          kind: 'Field:number',
          value: (_seed, n, compileCtx) => {
            const time = (compileCtx.env as { t?: number }).t ?? t;
            const v = artifact.value(time, { viewport: { w: 0, h: 0, dpr: 1 } });
            return Array.from({ length: n }, () => v);
          },
        };
      }
      if (artifact.kind === 'Signal:vec2') {
        return {
          kind: 'Field:vec2',
          value: (_seed, n, compileCtx) => {
            const time = (compileCtx.env as { t?: number }).t ?? t;
            const v = artifact.value(time, { viewport: { w: 0, h: 0, dpr: 1 } });
            return Array.from({ length: n }, () => v);
          },
        };
      }
      if (artifact.kind === 'Signal:color') {
        return {
          kind: 'Field:color',
          value: (_seed, n, compileCtx) => {
            const time = (compileCtx.env as { t?: number }).t ?? t;
            const v = artifact.value(time, { viewport: { w: 0, h: 0, dpr: 1 } });
            return Array.from({ length: n }, () => v);
          },
        };
      }
      return { kind: 'Error', message: `BroadcastSignalToField unsupported for ${artifact.kind}` };
    }
    case 'PhaseToNumber': {
      if (artifact.kind === 'Signal:phase') {
        return { kind: 'Signal:number', value: artifact.value };
      }
      if (artifact.kind === 'Scalar:number') {
        return artifact;
      }
      return { kind: 'Error', message: `PhaseToNumber unsupported for ${artifact.kind}` };
    }
    case 'NormalizeToPhase': {
      if (artifact.kind === 'Signal:number') {
        return {
          kind: 'Signal:phase',
          value: (t, runtimeCtx) => {
            const v = artifact.value(t, runtimeCtx);
            return ((v % 1) + 1) % 1;
          },
        };
      }
      if (artifact.kind === 'Scalar:number') {
        const v = artifact.value;
        return { kind: 'Scalar:number', value: ((v % 1) + 1) % 1 };
      }
      return { kind: 'Error', message: `NormalizeToPhase unsupported for ${artifact.kind}` };
    }
    case 'ReduceFieldToSignal': {
      return { kind: 'Error', message: 'ReduceFieldToSignal requires runtime reduction context' };
    }
    default:
      return { kind: 'Error', message: `Unsupported adapter: ${step.adapterId}` };
  }
}

function applyLensStack(
  artifact: Artifact,
  lensStack: LensInstance[] | undefined,
  ctx: CompileCtx,
  defaultSources: Map<string, DefaultSourceState>,
  buses: Bus[],
  publishers: Publisher[],
  compiledPortMap: Map<string, Artifact>,
  errors: CompileError[],
  depth: number = 0
): Artifact {
  if (lensStack === null || lensStack === undefined || lensStack.length === 0) return artifact;
  let current = artifact;

  for (const lens of lensStack) {
    if (lens.enabled === false) continue;
    const def = getLens(lens.lensId);
    if (def === null || def === undefined) continue;

    const type = getArtifactType(current);
    // Domain compatibility check:
    // - Exact match (e.g., number -> number, phase -> phase)
    // - Phase can use number lenses (phase is numerically 0-1)
    const domainCompatible =
      type !== null &&
      type !== undefined &&
      (type.domain === def.domain ||
        (type.domain === 'phase' && def.domain === 'number'));
    if (!domainCompatible || (type?.world === 'field' && def.domain === 'phase')) {
      errors.push({
        code: 'AdapterError',
        message: `Lens ${lens.lensId} is not type-preserving for ${current.kind}`,
      });
      return { kind: 'Error', message: `Lens type mismatch: ${lens.lensId}` };
    }

    const params: Record<string, Artifact> = {} as Record<string, Artifact>;
    for (const [paramKey, binding] of Object.entries(lens.params)) {
      params[paramKey] = resolveLensParam(binding, {
        resolveBus: (busId) =>
          getBusValue(busId, buses, publishers, compiledPortMap, errors, (art, pub) =>
            applyPublisherStack(art, pub, ctx, defaultSources, buses, publishers, compiledPortMap, errors)
          ),
        resolveWire: (blockId, slotId) =>
          compiledPortMap.get(keyOf(blockId, slotId)) ?? {
            kind: 'Error',
            message: `Missing upstream artifact for ${blockId}.${slotId}`,
            where: { blockId, port: slotId },
          },
        defaultSources,
        compileCtx: ctx,
        applyAdapterChain: (art, chain) => applyAdapterChain(art, chain, ctx, errors),
        applyLensStack: (art, stack) =>
          applyLensStack(art, stack, ctx, defaultSources, buses, publishers, compiledPortMap, errors, depth + 1),
        visited: new Set(),
        depth: depth + 1,
      });
    }

    if (def.apply !== null && def.apply !== undefined) {
      current = def.apply(current, params);
    }
  }

  return current;
}

function getArtifactType(artifact: Artifact): { world: 'signal' | 'field' | 'scalar'; domain: string } | null {
  switch (artifact.kind) {
    case 'Signal:number':
      return { world: 'signal', domain: 'number' };
    case 'Signal:vec2':
      return { world: 'signal', domain: 'vec2' };
    case 'Signal:phase':
      return { world: 'signal', domain: 'phase' };
    case 'Signal:color':
      return { world: 'signal', domain: 'color' };
    case 'Field:number':
      return { world: 'field', domain: 'number' };
    case 'Field:vec2':
      return { world: 'field', domain: 'vec2' };
    case 'Field:color':
      return { world: 'field', domain: 'color' };
    case 'Scalar:number':
      return { world: 'scalar', domain: 'number' };
    case 'Scalar:vec2':
      return { world: 'scalar', domain: 'vec2' };
    case 'Scalar:boolean':
      return { world: 'scalar', domain: 'boolean' };
    default:
      return null;
  }
}

// =============================================================================
// Helpers
// =============================================================================

function keyOf(blockId: string, port: string): string {
  return `${blockId}:${port}`;
}

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

function inferOutputPort(
  patch: CompilerPatch,
  registry: BlockRegistry,
  compiled: Map<string, Artifact>
): PortRef | null {
  const produced: PortRef[] = [];

  // Map of all ports that feed something
  const fed = new Set<string>();
  for (const c of patch.connections) fed.add(keyOf(c.from.blockId, c.from.port));

  for (const [blockId, block] of patch.blocks.entries()) {
    const comp = registry[block.type];
    if (comp === null || comp === undefined) continue;
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

  if (produced.length === 1) return produced[0];
  return null;
}

// =============================================================================
// Default Source Resolution
// =============================================================================

function resolveDefaultSource(
  block: BlockInstance,
  portName: string,
  kind: string // ValueKind
): Artifact | null {
  const def = getBlockDefinition(block.type);
  if (def === null || def === undefined) return null;

  const slot = def.inputs?.find(s => s.id === portName);
  if (slot !== null && slot !== undefined && slot.defaultSource !== null && slot.defaultSource !== undefined) {
    const override = block.params?.[portName];
    return createDefaultArtifact(override ?? slot.defaultSource.value, kind);
  }
  return null;
}

function createDefaultArtifact(value: unknown, kind: string): Artifact {
  switch (kind) {
    case 'Signal:number':
      return { kind: 'Signal:number', value: () => Number(value) };
    case 'Signal:Unit':
      return { kind: 'Signal:Unit', value: () => Number(value) };
    case 'Signal:phase':
      return { kind: 'Signal:phase', value: () => Number(value) };
    case 'Signal:Time':
      return { kind: 'Signal:Time', value: () => Number(value) };
    case 'Scalar:number':
      return { kind: 'Scalar:number', value: Number(value) };
    case 'Scalar:boolean':
      return { kind: 'Scalar:boolean', value: Boolean(value) };
    case 'Scalar:string':
      return { kind: 'Scalar:string', value: String(value) };
    case 'Scalar:color':
      return { kind: 'Scalar:color', value };
    case 'Signal:vec2':
      return { kind: 'Signal:vec2', value: () => (value as Vec2) };
    case 'Signal:color':
      return { kind: 'Signal:color', value: () => String(value) };
    case 'Field:number': {
      // Broadcast scalar to field
      const num = Number(value);
      return { kind: 'Field:number', value: (_s: Seed, n: number) => Array.from({ length: n }, () => num) };
    }
    case 'Field:color': {
      // Broadcast scalar color to field
      const color = String(value);
      return { kind: 'Field:color', value: (_s: Seed, n: number) => Array.from({ length: n }, () => color) };
    }
    case 'Field:vec2': {
      // Broadcast vec2 to field
      const vec = (value as Vec2) ?? { x: 0, y: 0 };
      return { kind: 'Field:vec2', value: (_s: Seed, n: number) => Array.from({ length: n }, () => vec) };
    }
    default:
      return { kind: 'Error', message: `Default source not supported for ${kind}` };
  }
}
