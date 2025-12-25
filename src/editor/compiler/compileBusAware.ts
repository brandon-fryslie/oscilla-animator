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
  BlockRegistry,
  CompileCtx,
  CompileError,
  CompileResult,
  CompilerPatch,
  DrawNode,
  PortRef,
  Program,
  RenderTree,
  RuntimeCtx,
  Seed,
  TimeModel,
} from './types';
import type { Bus, Publisher, Listener } from '../types';
import { validateTimeRootConstraint } from './compile';
import { extractTimeRootAutoPublications } from './blocks/domain/TimeRoot';
// CRITICAL: Use busSemantics for ordering - single source of truth for UI and compiler
import { getSortedPublishers, combineSignalArtifacts, combineFieldArtifacts } from '../semantic/busSemantics';
import {
  validateReservedBus,
  isReservedBusName,
} from '../semantic/busContracts';
import { getBlockDefinition } from '../blocks/registry';

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


/**
 * Type guard to check if patch has buses.
 */
export function isBusAwarePatch(patch: CompilerPatch): boolean {
  return (patch.buses && patch.buses.length > 0) || false;
}

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
  _blocks: Map<string, any>
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
  ctx: CompileCtx
): CompileResult {
  const errors: CompileError[] = [];
  const buses = patch.buses ?? [];
  let publishers = patch.publishers ?? [];
  const listeners = patch.listeners ?? [];

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
      if (!compiler) {
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
        if (!targetBus) {
          // Bus doesn't exist in patch - skip auto-publication silently
          continue;
        }

        autoPublications.push({
          id: `auto-${blockId}-${autoPub.busName}`,
          enabled: true,
          busId: targetBus.id,
          from: { blockId, slotId: autoPub.artifactKey, dir: 'output' },
          sortKey: autoPub.sortKey,
        });
      }
    }
  }

  if (errors.length) return { ok: false, errors };

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
  if (errors.length) return { ok: false, errors };

  // =============================================================================
  // 4. Validate block types exist in registry
  // =============================================================================
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
  if (errors.length) return { ok: false, errors };

  // =============================================================================
  // 5.5. Validate port existence (fail fast before compilation)
  // =============================================================================
  // Validate wire connection source ports
  for (const conn of patch.connections) {
    const fromBlock = patch.blocks.get(conn.from.blockId);
    if (!fromBlock) continue; // Block existence already validated in step 2

    const compiler = registry[fromBlock.type];
    if (!compiler) continue; // Compiler existence already validated in step 2

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
    if (!fromBlock) continue; // Block existence already validated

    const compiler = registry[fromBlock.type];
    if (!compiler) continue; // Compiler existence already validated

    const portExists = compiler.outputs.some(p => p.name === pub.from.slotId);
    if (!portExists) {
      errors.push({
        code: 'PortMissing',
        message: `Block ${pub.from.blockId} (${fromBlock.type}) does not have output port '${pub.from.slotId}' (referenced by publisher to bus '${pub.busId}')`,
        where: { blockId: pub.from.blockId, port: pub.from.slotId },
      });
    }
  }

  if (errors.length) return { ok: false, errors };

  // =============================================================================
  // 6. Topological sort blocks (wire AND bus dependencies)
  // =============================================================================
  const order = topoSortBlocksWithBuses(patch, publishers, listeners, errors);
  if (errors.length) return { ok: false, errors };

  // =============================================================================
  // 7. Compile blocks in topo order
  // =============================================================================
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

    // Resolve inputs (from wires AND buses)
    const inputs: Record<string, Artifact> = {};

    for (const p of compiler.inputs) {
      // First check for wire connection
      const wireConn = incoming.get(keyOf(blockId, p.name))?.[0];

      if (wireConn) {
        // Wire takes precedence over bus
        const srcKey = keyOf(wireConn.from.blockId, wireConn.from.port);
        const src = compiledPortMap.get(srcKey);
        inputs[p.name] = src ?? {
          kind: 'Error',
          message: `Missing upstream artifact for ${srcKey}`,
          where: { blockId: wireConn.from.blockId, port: wireConn.from.slotId },
        };
      } else {
        // Check for bus listener
        const busListener = listeners.find(
          l => l.enabled && l.to.blockId === blockId && l.to.slotId === p.name
        );

        if (busListener) {
          // Input comes from a bus - get the bus value
          const busArtifact = getBusValue(busListener.busId, buses, publishers, compiledPortMap, errors);
          // Lens stack application would go here (Phase 2)
          inputs[p.name] = busArtifact;
        } else {
          // Check for Default Source (fallback)
          const defaultArtifact = resolveDefaultSource(block.type, p.name, p.type.kind);
          
          if (defaultArtifact) {
            inputs[p.name] = defaultArtifact;
          } else if (p.required) {
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

    // Compile the block
    const outs = compiler.compile({ id: blockId, params: block.params, inputs, ctx });

    // Validate and store outputs
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
      compiledPortMap.set(keyOf(blockId, outDef.name), produced);
    }

    if (errors.length) return { ok: false, errors };
  }

  // =============================================================================
  // 8. Resolve final output port
  // =============================================================================
  const outputRef = patch.output ?? inferOutputPort(patch, registry, compiledPortMap);
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
// TimeModel Inference
// =============================================================================

/**
 * Infer TimeModel from the compiled patch.
 *
 * IMPORTANT: Every patch MUST have exactly one TimeRoot block.
 * The requireTimeRoot flag enforces this at validation time.
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
      const mode = String(block.params.mode ?? 'loop') as 'loop' | 'pingpong';
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

  // No TimeRoot found - this should be caught by validation (requireTimeRoot flag).
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
  errors: CompileError[]
): Artifact {
  const bus = buses.find(b => b.id === busId);
  if (!bus) {
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

    if (!artifact) {
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

    artifacts.push(artifact);
  }

  // Combine artifacts using bus's combine mode - dispatch based on bus world
  if (isFieldBus(bus)) {
    return combineFieldArtifacts(artifacts, bus.combineMode, bus.defaultValue);
  } else {
    return combineSignalArtifacts(artifacts, bus.combineMode, bus.defaultValue);
  }
}

// =============================================================================
// Helpers
// =============================================================================

function keyOf(blockId: string, port: string): string {
  return `${blockId}:${port}`;
}

function indexIncoming(
  conns: readonly any[]
): Map<string, any[]> {
  const m = new Map<string, any[]>();
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

// =============================================================================
// Default Source Resolution
// =============================================================================

function resolveDefaultSource(
  blockType: string,
  portName: string,
  kind: string // ValueKind
): Artifact | null {
  const def = getBlockDefinition(blockType);
  if (!def) return null;

  const slot = def.inputs?.find(s => s.id === portName);
  if (slot?.defaultSource) {
    return createDefaultArtifact(slot.defaultSource.value, kind);
  }
  return null;
}

function createDefaultArtifact(value: unknown, kind: string): Artifact {
  switch (kind) {
    case 'Signal:number':
    case 'Signal:Unit':
    case 'Signal:phase':
      return { kind: kind as any, value: () => Number(value) };
    case 'Signal:Time':
      return { kind: kind as any, value: () => Number(value) };
    case 'Scalar:number':
      return { kind: kind as any, value: Number(value) };
    case 'Scalar:boolean':
      return { kind: kind as any, value: Boolean(value) };
    case 'Scalar:string':
      return { kind: kind as any, value: String(value) };
    case 'Signal:boolean':
      return { kind: kind as any, value: () => Boolean(value) };
    case 'Signal:vec2':
      return { kind: kind as any, value: () => (value as any) };
    case 'Signal:color':
      return { kind: kind as any, value: () => String(value) };
    case 'Signal:string':
      return { kind: kind as any, value: () => String(value) };
    case 'Field:number':
      // Broadcast scalar to field
      const num = Number(value);
      return { kind: kind as any, value: (_s: any, n: number) => new Array(n).fill(num) };
    default:
      // Try best effort for scalars
      if (kind.startsWith('Scalar:')) {
         return { kind: kind as any, value: value as any };
      }
      return { kind: 'Error', message: `Default source not supported for ${kind}` };
  }
}