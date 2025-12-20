/**
 * Bus-Aware Patch Compiler
 *
 * Compiles patches that contain buses as well as wires.
 * Phase 3 implementation: Signal AND Field buses.
 *
 * Key differences from wire-only compilation:
 * 1. Buses are first-class graph nodes
 * 2. Multi-pass compilation (blocks → buses → blocks using buses)
 * 3. Publisher ordering by sortKey for deterministic results
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
  Field,
  PortRef,
  Program,
  RenderTree,
  RuntimeCtx,
  Seed,
  TimeModel,
  Vec2,
} from './types';
import type { Bus, Publisher, Listener } from '../types';
import { applyLens } from '../lenses';
import { validateTimeRootConstraint } from './compile';

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

/**
 * Sort publishers by (sortKey, id) for deterministic ordering.
 * Per SORTKEY-CONTRACT.md, this ensures identical results regardless of:
 * - Canvas layout changes
 * - Array insertion order
 * - Compilation order
 */
function sortPublishers(publishers: Publisher[]): Publisher[] {
  return [...publishers].sort((a, b) => {
    if (a.sortKey !== b.sortKey) {
      return a.sortKey - b.sortKey;
    }
    // Stable tie-breaker using locale compare
    return a.id.localeCompare(b.id);
  });
}

// =============================================================================
// Signal Combination
// =============================================================================

/**
 * Combine Signal artifacts using the bus's combine mode.
 * Phase 2 supports: 'last' and 'sum'
 */
function combineSignalArtifacts(
  artifacts: Artifact[],
  mode: string,
  defaultValue: unknown
): Artifact {
  // No publishers: return default value
  if (artifacts.length === 0) {
    // Infer kind from default value type
    if (typeof defaultValue === 'number') {
      return { kind: 'Signal:number', value: () => defaultValue };
    }
    if (typeof defaultValue === 'object' && defaultValue !== null && 'x' in defaultValue) {
      return { kind: 'Signal:vec2', value: () => defaultValue as Vec2 };
    }
    // Fallback: return as scalar
    return { kind: 'Scalar:number', value: 0 };
  }

  // Single publisher: return as-is
  if (artifacts.length === 1) {
    return artifacts[0]!;
  }

  // Multiple publishers: combine based on mode
  if (mode === 'last') {
    // Highest sortKey wins (last in sorted array)
    return artifacts[artifacts.length - 1]!;
  }

  if (mode === 'sum') {
    // Sum all values - works for number and vec2
    const first = artifacts[0]!;

    if (first.kind === 'Signal:number') {
      const signals = artifacts.map(a => (a as typeof first).value);
      return {
        kind: 'Signal:number',
        value: (t: number, ctx: RuntimeCtx) => {
          let sum = 0;
          for (const sig of signals) {
            sum += sig(t, ctx);
          }
          return sum;
        },
      };
    }

    if (first.kind === 'Signal:vec2') {
      const signals = artifacts.map(a => (a as typeof first).value);
      return {
        kind: 'Signal:vec2',
        value: (t: number, ctx: RuntimeCtx) => {
          let sumX = 0;
          let sumY = 0;
          for (const sig of signals) {
            const v = sig(t, ctx);
            sumX += v.x;
            sumY += v.y;
          }
          return { x: sumX, y: sumY };
        },
      };
    }

    // For scalars, convert to signals and sum
    if (first.kind === 'Scalar:number') {
      const sum = artifacts.reduce((acc, a) => acc + ((a as typeof first).value ?? 0), 0);
      return { kind: 'Scalar:number', value: sum };
    }

    if (first.kind === 'Scalar:vec2') {
      const sum = artifacts.reduce(
        (acc, a) => {
          const v = (a as typeof first).value;
          return { x: acc.x + v.x, y: acc.y + v.y };
        },
        { x: 0, y: 0 }
      );
      return { kind: 'Scalar:vec2', value: sum };
    }

    // Unsupported type for sum
    return {
      kind: 'Error',
      message: `Sum mode not supported for type ${first.kind}`,
    };
  }

  // Unsupported combine mode
  return {
    kind: 'Error',
    message: `Unsupported combine mode: ${mode}. Signal buses support: last, sum`,
  };
}

// =============================================================================
// Field Combination
// =============================================================================

/**
 * Combine Field artifacts using the bus's combine mode.
 * Fields support: 'last', 'sum', 'average', 'max', 'min'
 *
 * Field combination is lazy: we return a new Field that evaluates
 * all source fields and combines them per-element at evaluation time.
 */
function combineFieldArtifacts(
  artifacts: Artifact[],
  mode: string,
  defaultValue: unknown
): Artifact {
  // No publishers: return constant field with default value
  if (artifacts.length === 0) {
    if (typeof defaultValue === 'number') {
      const constField: Field<number> = (_seed, n, _ctx) => {
        const result: number[] = [];
        for (let i = 0; i < n; i++) {
          result.push(defaultValue);
        }
        return result;
      };
      return { kind: 'Field:number', value: constField };
    }
    // Fallback for non-number defaults
    return {
      kind: 'Error',
      message: `Default value type not supported for Field bus: ${typeof defaultValue}`,
    };
  }

  // Single publisher: return as-is
  if (artifacts.length === 1) {
    return artifacts[0]!;
  }

  // Multiple publishers: combine based on mode
  const first = artifacts[0]!;

  // Ensure all artifacts are Field:number
  if (first.kind !== 'Field:number') {
    return {
      kind: 'Error',
      message: `Field combination only supports Field:number, got ${first.kind}`,
    };
  }

  const fields = artifacts.map(a => (a as { kind: 'Field:number'; value: Field<number> }).value);

  if (mode === 'last') {
    // Highest sortKey wins (last in sorted array)
    return artifacts[artifacts.length - 1]!;
  }

  if (mode === 'sum') {
    const combined: Field<number> = (seed, n, ctx) => {
      const allValues = fields.map(f => f(seed, n, ctx));
      const result: number[] = [];
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (const vals of allValues) {
          sum += vals[i] ?? 0;
        }
        result.push(sum);
      }
      return result;
    };
    return { kind: 'Field:number', value: combined };
  }

  if (mode === 'average') {
    const combined: Field<number> = (seed, n, ctx) => {
      const allValues = fields.map(f => f(seed, n, ctx));
      const result: number[] = [];
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (const vals of allValues) {
          sum += vals[i] ?? 0;
        }
        result.push(sum / fields.length);
      }
      return result;
    };
    return { kind: 'Field:number', value: combined };
  }

  if (mode === 'max') {
    const combined: Field<number> = (seed, n, ctx) => {
      const allValues = fields.map(f => f(seed, n, ctx));
      const result: number[] = [];
      for (let i = 0; i < n; i++) {
        let maxVal = -Infinity;
        for (const vals of allValues) {
          const v = vals[i] ?? -Infinity;
          if (v > maxVal) maxVal = v;
        }
        result.push(maxVal);
      }
      return result;
    };
    return { kind: 'Field:number', value: combined };
  }

  if (mode === 'min') {
    const combined: Field<number> = (seed, n, ctx) => {
      const allValues = fields.map(f => f(seed, n, ctx));
      const result: number[] = [];
      for (let i = 0; i < n; i++) {
        let minVal = Infinity;
        for (const vals of allValues) {
          const v = vals[i] ?? Infinity;
          if (v < minVal) minVal = v;
        }
        result.push(minVal);
      }
      return result;
    };
    return { kind: 'Field:number', value: combined };
  }

  // Unsupported combine mode
  return {
    kind: 'Error',
    message: `Unsupported combine mode: ${mode}. Field buses support: last, sum, average, max, min`,
  };
}

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
  const publishers = patch.publishers ?? [];
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
  // 1. Validate combine modes (different for Signal vs Field buses)
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
  // 2. Validate block types exist in registry
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
  // 3. Build wire connection indices
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
  // 4. Topological sort blocks (wire AND bus dependencies)
  // =============================================================================
  const order = topoSortBlocksWithBuses(patch, publishers, listeners, errors);
  if (errors.length) return { ok: false, errors };

  // =============================================================================
  // 5. Compile blocks in topo order
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
          where: { blockId: wireConn.from.blockId, port: wireConn.from.port },
        };
      } else {
        // Check for bus listener
        const busListener = listeners.find(
          l => l.enabled && l.to.blockId === blockId && l.to.port === p.name
        );

        if (busListener) {
          // Input comes from a bus - get the bus value
          let busArtifact = getBusValue(busListener.busId, buses, publishers, compiledPortMap, errors);


          // Apply lens stack transformations if configured
          // Support both legacy single lens and new lens stack
          const lensStack = busListener.lensStack || (busListener.lens ? [busListener.lens] : undefined);
          if (lensStack && lensStack.length > 0 && busArtifact.kind !== 'Error') {
            for (const lens of lensStack) {
              if (busArtifact.kind !== 'Error') {
                busArtifact = applyLens(busArtifact, lens);
              }
            }
          }

          inputs[p.name] = busArtifact;
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
  // 6. Resolve final output port
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
 * Inference rules (per PLAN-2024-12-19.md):
 * 1. If patch has PhaseClock with mode='loop' → CyclicTimeModel
 * 2. If patch has PhaseMachine → FiniteTimeModel with computed duration
 * 3. Otherwise → InfiniteTimeModel with 10s default window
 *
 * This is a simple heuristic until explicit TimeRoot blocks are implemented.
 */
function inferTimeModel(patch: CompilerPatch): TimeModel {
  // Check for PhaseMachine first (implies finite duration)
  for (const block of patch.blocks.values()) {
    if (block.type === 'PhaseMachine') {
      const entranceDuration = Number(block.params.entranceDuration ?? 2.5) * 1000;
      const holdDuration = Number(block.params.holdDuration ?? 2.0) * 1000;
      const exitDuration = Number(block.params.exitDuration ?? 0.5) * 1000;
      const totalDuration = entranceDuration + holdDuration + exitDuration;

      return {
        kind: 'finite',
        durationMs: totalDuration,
        cuePoints: [
          { tMs: 0, label: 'Entrance Start', kind: 'phase' },
          { tMs: entranceDuration, label: 'Hold Start', kind: 'phase' },
          { tMs: entranceDuration + holdDuration, label: 'Exit Start', kind: 'phase' },
          { tMs: totalDuration, label: 'End', kind: 'phase' },
        ],
      };
    }
  }

  // Check for PhaseClock with loop mode (implies cyclic time)
  for (const block of patch.blocks.values()) {
    if (block.type === 'PhaseClock') {
      const mode = String(block.params.mode ?? 'loop');
      const durationSec = Number(block.params.duration ?? 3.0);
      const periodMs = durationSec * 1000;

      if (mode === 'loop' || mode === 'pingpong') {
        return {
          kind: 'cyclic',
          periodMs,
          phaseDomain: '0..1',
          mode: mode as 'loop' | 'pingpong',
        };
      }
    }
  }

  // Default: infinite time model
  return {
    kind: 'infinite',
    windowMs: 10000, // 10 second default preview window
  };
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

  // Get enabled publishers for this bus
  const busPublishers = publishers.filter(p => p.busId === busId && p.enabled);

  // Sort by (sortKey, id) for deterministic ordering
  const sortedPublishers = sortPublishers(busPublishers);

  // Collect artifacts from publishers
  const artifacts: Artifact[] = [];
  for (const pub of sortedPublishers) {
    const key = keyOf(pub.from.blockId, pub.from.port);
    const artifact = compiledPortMap.get(key);

    if (!artifact) {
      errors.push({
        code: 'BusEvaluationError',
        message: `Publisher ${pub.id} references missing artifact ${key}`,
        where: { busId, blockId: pub.from.blockId, port: pub.from.port },
      });
      continue;
    }

    if (artifact.kind === 'Error') {
      errors.push({
        code: 'BusEvaluationError',
        message: `Publisher ${pub.id} has error artifact: ${artifact.message}`,
        where: { busId, blockId: pub.from.blockId, port: pub.from.port },
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
