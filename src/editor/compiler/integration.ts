import type { RootStore } from '../stores/RootStore';
import type { Block, Connection, Publisher, Listener, PortRef } from '../types';
import { compilePatch } from './compile';
import { createCompileCtx } from './context';
import { createBlockRegistry, registerDynamicBlock } from './blocks';
import type {
  BlockInstance,
  BlockRegistry,
  CompileResult,
  CompiledProgram,
  CompilerConnection,
  CompilerPatch,
  CompileError,
  Seed,
} from './types';
import { buildDecorations, emptyDecorations, type DecorationSet } from './error-decorations';
import { getBlockDefinition } from '../blocks';
import { registerAllComposites, getCompositeCompilers } from '../composite-bridge';
import { createDiagnostic, type Diagnostic, type DiagnosticCode, type TargetRef } from '../diagnostics/types';

// =============================================================================
// Diagnostic Conversion
// =============================================================================

/**
 * Convert CompileError to Diagnostic for event emission.
 */
function compileErrorToDiagnostic(
  error: CompileError,
  patchRevision: number
): Diagnostic {
  // Map CompileErrorCode to DiagnosticCode
  const codeMappings: Record<string, { code: DiagnosticCode; severity: 'error' | 'fatal' | 'warn' }> = {
    MissingTimeRoot: { code: 'E_TIME_ROOT_MISSING', severity: 'error' },
    MultipleTimeRoots: { code: 'E_TIME_ROOT_MULTIPLE', severity: 'error' },
    PortTypeMismatch: { code: 'E_TYPE_MISMATCH', severity: 'error' },
    WorldMismatch: { code: 'E_WORLD_MISMATCH', severity: 'error' },
    DomainMismatch: { code: 'E_DOMAIN_MISMATCH', severity: 'error' },
    CycleDetected: { code: 'E_CYCLE_DETECTED', severity: 'error' },
    MissingInput: { code: 'E_MISSING_INPUT', severity: 'error' },
    InvalidConnection: { code: 'E_INVALID_CONNECTION', severity: 'error' },
    // Bus & Adapter errors
    BusEvaluationError: { code: 'E_VALIDATION_FAILED', severity: 'error' },
    AdapterError: { code: 'E_TYPE_MISMATCH', severity: 'error' },
    BusTypeError: { code: 'E_RESERVED_BUS_TYPE_MISMATCH', severity: 'error' },
    UnsupportedCombineMode: { code: 'E_BUS_COMBINE_MODE_INCOMPATIBLE', severity: 'error' },
  };

  const mapping = codeMappings[error.code];
  const diagnosticCode = mapping?.code ?? 'E_TYPE_MISMATCH'; // Fallback to type mismatch for unknown errors
  const severity = mapping?.severity ?? 'error';

  // Create primary target from error location
  let primaryTarget: TargetRef;
  let affectedTargets: TargetRef[] | undefined;

  if (error.code === 'CycleDetected') {
    const cycleMatch = error.message.match(/Blocks in cycle: ([\w, ]+)/);
    const blockIds = cycleMatch !== null ? cycleMatch[1].split(', ').filter(Boolean) : [];
    primaryTarget = { kind: 'graphSpan', blockIds, spanKind: 'cycle' };
  } else if (error.code === 'MissingTimeRoot') {
    // No specific target for missing TimeRoot - use a synthetic graph span
    primaryTarget = { kind: 'graphSpan', blockIds: [], spanKind: 'subgraph' };
  } else if (
    error.code === 'MultipleTimeRoots' &&
    error.where !== null &&
    error.where !== undefined &&
    error.where.blockId !== null &&
    error.where.blockId !== undefined
  ) {
    primaryTarget = { kind: 'timeRoot', blockId: error.where.blockId };
  } else if (
    error.where !== null &&
    error.where !== undefined &&
    error.where.connection !== null &&
    error.where.connection !== undefined
  ) {
    // Connection error - target both ends
    const conn = error.where.connection;
    primaryTarget = {
      kind: 'port',
      portRef: { blockId: conn.from.block, slotId: conn.from.port, direction: 'output' },
    };
    affectedTargets = [
      { kind: 'port', portRef: { blockId: conn.to.block, slotId: conn.to.port, direction: 'input' } },
    ];
  } else if (
    error.where !== null &&
    error.where !== undefined &&
    error.where.blockId !== null &&
    error.where.blockId !== undefined &&
    error.where.port !== null &&
    error.where.port !== undefined &&
    error.where.port !== ''
  ) {
    primaryTarget = { kind: 'port', portRef: { blockId: error.where.blockId, slotId: error.where.port, direction: 'input' } };
  } else if (
    error.where !== null &&
    error.where !== undefined &&
    error.where.blockId !== null &&
    error.where.blockId !== undefined
  ) {
    primaryTarget = { kind: 'block', blockId: error.where.blockId };
  } else if (
    error.where !== null &&
    error.where !== undefined &&
    error.where.busId !== null &&
    error.where.busId !== undefined &&
    error.where.busId !== ''
  ) {
    primaryTarget = { kind: 'bus', busId: error.where.busId };
  } else {
    // No location - use synthetic graph span
    primaryTarget = { kind: 'graphSpan', blockIds: [], spanKind: 'subgraph' };
  }

  // Extract type mismatch details if available
  let payload: Diagnostic['payload'] | undefined;
  let message = error.message;

  if (error.code === 'PortTypeMismatch' && error.message !== null && error.message !== undefined && error.message !== '') {
    // New, more robust regex to capture block/port info
    const match = error.message.match(
      /([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\s\(([^)]+)\)\s→\s([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\s\(([^)]+)\)/
    );
    if (match !== null) {
      payload = {
        kind: 'typeMismatch',
        expected: (match[6] ?? '') !== '' ? match[6] : 'unknown',
        actual: (match[3] ?? '') !== '' ? match[3] : 'unknown',
      };
      // Keep the detailed message
      const fromBlock = match[1] ?? 'unknown';
      const fromPort = match[2] ?? 'unknown';
      const fromType = match[3] ?? 'unknown';
      const toBlock = match[4] ?? 'unknown';
      const toPort = match[5] ?? 'unknown';
      const toType = match[6] ?? 'unknown';
      message = `Type mismatch from ${fromBlock}.${fromPort} (${fromType}) to ${toBlock}.${toPort} (${toType})`;
    }
  }

  return createDiagnostic({
    code: diagnosticCode,
    severity,
    domain: 'compile',
    primaryTarget,
    affectedTargets,
    title: `Compilation Error: ${error.code}`,
    message,
    payload,
    patchRevision,
  });
}

// =============================================================================
// Bus Diagnostics
// =============================================================================

/**
 * Generate bus-related diagnostics for successful compilations.
 * Produces W_BUS_EMPTY and W_GRAPH_UNUSED_OUTPUT warnings.
 */
function generateBusDiagnostics(
  patch: CompilerPatch,
  _store: RootStore,
  patchRevision: number
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // W_BUS_EMPTY: Buses with 0 listeners
  if (patch.buses && patch.listeners) {
    const busListenerCounts = new Map<string, number>();

    // Count listeners per bus
    for (const listener of patch.listeners) {
      busListenerCounts.set(listener.busId, (busListenerCounts.get(listener.busId) ?? 0) + 1);
    }

    // Find buses with 0 listeners
    for (const bus of patch.buses) {
      const listenerCount = busListenerCounts.get(bus.id) ?? 0;

      // Find publishers for this bus
      const publishers = (patch.publishers ?? []).filter(p => p.busId === bus.id);

      // Only warn if there are publishers but no listeners
      // (Don't warn about buses that aren't being used at all)
      if (listenerCount === 0 && publishers.length > 0) {
        const affectedTargets: TargetRef[] = publishers.map(p => ({
          kind: 'block',
          blockId: p.from.blockId,
        }));

        diagnostics.push(
          createDiagnostic({
            code: 'W_BUS_EMPTY',
            severity: 'warn',
            domain: 'compile',
            primaryTarget: { kind: 'bus', busId: bus.id },
            affectedTargets: affectedTargets.length > 0 ? affectedTargets : undefined,
            title: 'Empty Bus',
            message: `Bus "${bus.name}" has no listeners. Published values are not being used.`,
            patchRevision,
          })
        );
      }
    }
  }

  // W_GRAPH_UNUSED_OUTPUT: Block outputs not connected and not published to bus
  const connectedOutputs = new Set<string>();
  const publishedOutputs = new Set<string>();

  // Track connected outputs
  for (const conn of patch.connections) {
    connectedOutputs.add(`${conn.from.block}.${conn.from.port}`);
  }

  // Track published outputs
  if (patch.publishers) {
    for (const pub of patch.publishers) {
      publishedOutputs.add(`${pub.from.blockId}.${pub.from.slotId}`);
    }
  }

  // Check each block's outputs
  // Render output types are terminal sinks - they don't need downstream connections
  const terminalOutputTypes = ['Render', 'RenderTree', 'RenderTreeProgram'];

  for (const block of patch.blocks) {
    const blockId = block.id;
    // Skip TimeRoot blocks - they auto-publish to buses
    if (block.type === 'FiniteTimeRoot' || block.type === 'CycleTimeRoot' || block.type === 'InfiniteTimeRoot') {
      continue;
    }

    const def = getBlockDefinition(block.type);
    if (!def?.outputs) continue;

    for (const output of def.outputs) {
      // Skip terminal outputs (render sinks) - they don't need connections
      const slotType = typeof output.type === 'string' ? output.type : output.type;
      const typeStr = typeof slotType === 'string' ? slotType : '';
      if (terminalOutputTypes.some(t => typeStr.includes(t))) {
        continue;
      }

      const outputKey = `${blockId}.${output.id}`;
      const isConnected = connectedOutputs.has(outputKey);
      const isPublished = publishedOutputs.has(outputKey);

      if (!isConnected && !isPublished) {
        diagnostics.push(
          createDiagnostic({
            code: 'W_GRAPH_UNUSED_OUTPUT',
            severity: 'warn',
            domain: 'compile',
            primaryTarget: {
              kind: 'port',
              portRef: { blockId, slotId: output.id, direction: 'output' },
            },
            title: 'Unused Output',
            message: `Output "${output.label ?? output.id}" on block is not connected or published to a bus.`,
            patchRevision,
          })
        );
      }
    }
  }

  return diagnostics;
}

// =============================================================================
// PortRef Rewrite Map (per Design Doc Section 7)
// =============================================================================

/**
 * PortRefRewriteMap rewrites port references from composite boundary ports
 * to their internal primitive ports after composite expansion.
 *
 * Design: CompositeTransparencyDesign.md Section 7
 */
export interface PortRefRewriteMap {
  /**
   * Rewrite a port reference. Returns:
   * - The rewritten PortRef if the input targets a composite boundary
   * - The same PortRef unchanged if it targets a primitive
   * - null if the port reference is invalid (e.g., unmapped port)
   */
  rewrite(ref: PortRef): PortRef | null;

  /**
   * Check if a block ID was a composite that was expanded
   */
  wasComposite(blockId: string): boolean;

  /**
   * Get all mappings for debugging/testing
   */
  getAllMappings(): ReadonlyMap<string, PortRef>;
}

/**
 * Create a mutable builder for PortRefRewriteMap.
 */
function createRewriteMapBuilder(): {
  addMapping(compositeId: string, boundaryPort: string, internalRef: PortRef): void;
  markComposite(compositeId: string): void;
  build(): PortRefRewriteMap;
} {
  const mappings = new Map<string, PortRef>();
  const expandedComposites = new Set<string>();

  return {
    addMapping(compositeId: string, boundaryPort: string, internalRef: PortRef) {
      const key = `${compositeId}.${boundaryPort}`;
      mappings.set(key, internalRef);
    },

    markComposite(compositeId: string) {
      expandedComposites.add(compositeId);
    },

    build(): PortRefRewriteMap {
      // Freeze the maps
      const frozenMappings = new Map(mappings);
      const frozenComposites = new Set(expandedComposites);

      return {
        rewrite(ref: PortRef): PortRef | null {
          // If the block was not a composite, return ref unchanged
          if (!frozenComposites.has(ref.blockId)) {
            return ref;
          }

          // Look up the mapping
          const key = `${ref.blockId}.${ref.slotId}`;
          const mapped = frozenMappings.get(key);

          if (mapped == null) {
            // Composite exists but port not mapped - this is an error
            return null;
          }

          return mapped;
        },

        wasComposite(blockId: string): boolean {
          return frozenComposites.has(blockId);
        },

        getAllMappings(): ReadonlyMap<string, PortRef> {
          return frozenMappings;
        },
      };
    },
  };
}

/**
 * Result of composite expansion including the rewrite map.
 */
export interface CompositeExpansionResult {
  expandedPatch: CompilerPatch;
  rewriteMap: PortRefRewriteMap;
  newPublishers: Publisher[];
  newListeners: Listener[];
}

// =============================================================================
// Patch Conversion
// =============================================================================

/**
 * Convert EditorStore blocks to compiler BlockInstance map.
 */
function convertBlocks(blocks: Block[]): BlockInstance[] {
  return blocks.map((block) => ({
    id: block.id,
    type: block.type,
    params: { ...block.params },
  }));
}

/**
 * Convert EditorStore connections to compiler format.
 * Preserves lens stacks, adapter chains, and enabled state for wire transformations.
 */
function convertConnections(connections: Connection[]): CompilerConnection[] {
  return connections.map((c: Connection) => ({
    from: { block: c.from.blockId, port: c.from.slotId },
    to: { block: c.to.blockId, port: c.to.slotId },
  }));
}

/**
 * Convert EditorStore to CompilerPatch.
 */
export function editorToPatch(store: RootStore): CompilerPatch {
  // Build a lookup map for default sources: blockId:slotId -> value
  // This allows the compiler to look up runtime-edited values
  const defaultSourceValues: Record<string, unknown> = {};
  for (const block of store.patchStore.blocks) {
    for (const input of block.inputs) {
      const ds = store.defaultSourceStore.getDefaultSourceForInput(block.id, input.id);
      if (ds) {
        defaultSourceValues[`${block.id}:${input.id}`] = ds.value;
      }
    }
  }

  return {
    blocks: convertBlocks(store.patchStore.blocks),
    connections: convertConnections(store.patchStore.connections),
    // Include bus routing from BusStore
    buses: store.busStore.buses,
    publishers: store.busStore.publishers,
    listeners: store.busStore.listeners,
    defaultSources: Object.fromEntries(store.defaultSourceStore.sources.entries()),
    defaultSourceValues, // NEW: lookup-friendly map for runtime values
    // output is auto-inferred
  };
}

// =============================================================================
// Composite Expansion (per Design Doc Section 7)
// =============================================================================

function resolveParamValue(value: unknown, parentParams: Record<string, unknown>): unknown {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    const marker = (value as { __fromParam?: string }).__fromParam;
    if (typeof marker === 'string') {
      return parentParams[marker];
    }
  }
  return value;
}

/** Generate unique ID for auto-created bus publishers/listeners */
let busBindingIdCounter = 0;
function generateBusBindingId(compositeId: string, type: 'pub' | 'sub', port: string): string {
  return `${compositeId}::${type}::${port}::${busBindingIdCounter++}`;
}

/**
 * Expand blocks that declare primitiveGraph into their internal nodes/edges.
 * External connections are rewired to exposed input/output maps.
 *
 * Additionally handles bus subscriptions/publications defined in composite graphs.
 *
 * Returns both the expanded patch and a PortRefRewriteMap that can be used
 * to remap bus publishers/listeners that target composite boundary ports.
 *
 * Design: CompositeTransparencyDesign.md Section 7
 */
function expandComposites(patch: CompilerPatch): CompositeExpansionResult {
  const queue: Array<[string, BlockInstance]> = patch.blocks.map(b => [b.id, b]);
  let connections = [...patch.connections];
  const newBlocks = new Map<string, BlockInstance>();
  const newConnections: CompilerConnection[] = [];
  const newPublishers: Publisher[] = [];
  const newListeners: Listener[] = [];

  // Build the rewrite map as we expand composites
  const rewriteBuilder = createRewriteMapBuilder();

  while (queue.length > 0) {
    const [blockId, block] = queue.shift()!;
    const definition = getBlockDefinition(block.type);
    let graph = definition?.primitiveGraph ?? null;
    let compositeDef = definition?.compositeDefinition ?? null;

    // Handle composite blocks (composite: prefix)
    if (block.type.startsWith('composite:') && definition?.compositeDefinition != null) {
      // Convert composite definition to primitive graph - use the stored primitiveGraph
      graph = definition.primitiveGraph ?? null;
      compositeDef = definition.compositeDefinition ?? null;
    }

    if (graph != null) {
      // Mark this block as a composite that was expanded
      rewriteBuilder.markComposite(blockId);

      const idMap = new Map<string, string>();

      // Create internal blocks
      for (const [nodeId, nodeDef] of Object.entries(graph.nodes)) {
        const newId = `${blockId}::${nodeId}`;
        idMap.set(nodeId, newId);
        const resolvedParams: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(nodeDef.params ?? {})) {
          resolvedParams[k] = resolveParamValue(v, block.params);
        }
        const internalBlock: BlockInstance = {
          id: newId,
          type: nodeDef.type,
          params: resolvedParams,
        };
        queue.push([newId, internalBlock]);
      }

      // Build rewrite mappings for INPUT ports (listeners target these)
      for (const [boundaryPort, internalRef] of Object.entries(graph.inputMap)) {
        const [node, slotId] = internalRef.split('.');
        const internalBlockId = idMap.get(node);
        if (internalBlockId != null) {
          rewriteBuilder.addMapping(blockId, boundaryPort, {
            blockId: internalBlockId,
            slotId,
            direction: 'input',
          });
        }
      }

      // Build rewrite mappings for OUTPUT ports (publishers target these)
      for (const [boundaryPort, internalRef] of Object.entries(graph.outputMap)) {
        const [node, slotId] = internalRef.split('.');
        const internalBlockId = idMap.get(node);
        if (internalBlockId != null) {
          rewriteBuilder.addMapping(blockId, boundaryPort, {
            blockId: internalBlockId,
            slotId,
            direction: 'output',
          });
        }
      }

      // Handle bus subscriptions (composite inputs auto-subscribed to buses)
      if (compositeDef?.graph.busSubscriptions != null) {
        for (const [inputPort, busNameValue] of Object.entries(compositeDef.graph.busSubscriptions)) {
          const busName = busNameValue;
          const internalRef = graph.inputMap[inputPort];
          if (internalRef != null && internalRef !== '') {
            const [node, port] = internalRef.split('.');
            const internalBlockId = idMap.get(node);
            if (internalBlockId != null) {
              const listener: Listener = {
                id: generateBusBindingId(blockId, 'sub', inputPort),
                busId: busName,
                to: {
                  blockId: internalBlockId,
                  slotId: port,
                  direction: 'input',
                },
                enabled: true,
              };
              newListeners.push(listener);
            }
          }
        }
      }

      // Handle bus publications (composite outputs auto-published to buses)
      if (compositeDef?.graph.busPublications != null) {
        for (const [outputPort, busNameValue] of Object.entries(compositeDef.graph.busPublications)) {
          const busName = busNameValue;
          const internalRef = graph.outputMap[outputPort];
          if (internalRef != null && internalRef !== '') {
            const [node, port] = internalRef.split('.');
            const internalBlockId = idMap.get(node);
            if (internalBlockId != null) {
              const publisher: Publisher = {
                id: generateBusBindingId(blockId, 'pub', outputPort),
                busId: busName,
                from: {
                  blockId: internalBlockId,
                  slotId: port,
                  direction: 'output',
                },
                enabled: true,
                sortKey: 0, // Default sort key, can be customized if needed
              };
              newPublishers.push(publisher);
            }
          }
        }
      }

      // Internal edges
      for (const edge of graph.edges) {
        const [fromNode, fromPort] = edge.from.split('.');
        const [toNode, toPort] = edge.to.split('.');
        const fromId = idMap.get(fromNode);
        const toId = idMap.get(toNode);
        if (fromId != null && toId != null) {
          newConnections.push({
            from: { block: fromId, port: fromPort },
            to: { block: toId, port: toPort },
          });
        }
      }

      // Rewire incoming connections - check both original connections and already-rewired ones
      const incoming = connections.filter((c) => c.to.block === blockId);
      const incomingFromNew = newConnections.filter((c) => c.to.block === blockId);
      const outgoing = connections.filter((c) => c.from.block === blockId);
      const outgoingFromNew = newConnections.filter((c) => c.from.block === blockId);

      connections = connections.filter(
        (c) => c.to.block !== blockId && c.from.block !== blockId
      );

      // Remove connections targeting this composite from newConnections (will be rewired)
      const connectionsToRemove = new Set<CompilerConnection>();
      incomingFromNew.forEach((c) => connectionsToRemove.add(c));
      outgoingFromNew.forEach((c) => connectionsToRemove.add(c));

      for (const conn of [...incoming, ...incomingFromNew]) {
        const internalRef = graph.inputMap[conn.to.port];
        if (internalRef == null || internalRef === '') continue;
        const [node, port] = internalRef.split('.');
        const toId = idMap.get(node);
        if (toId != null) {
          newConnections.push({
            from: conn.from,
            to: { block: toId, port },
          });
        }
      }

      for (const conn of [...outgoing, ...outgoingFromNew]) {
        const internalRef = graph.outputMap[conn.from.port];
        if (internalRef == null || internalRef === '') continue;
        const [node, port] = internalRef.split('.');
        const fromId = idMap.get(node);
        if (fromId != null) {
          newConnections.push({
            from: { block: fromId, port },
            to: conn.to,
          });
        }
      }

      // Remove the connections that were rewired from newConnections
      for (let i = newConnections.length - 1; i >= 0; i--) {
        if (connectionsToRemove.has(newConnections[i])) {
          newConnections.splice(i, 1);
        }
      }
    } else {
      newBlocks.set(blockId, block);
    }
  }

  // Add any untouched connections
  for (const conn of connections) {
    newConnections.push(conn);
  }

  return {
    expandedPatch: {
      blocks: Array.from(newBlocks.values()),
      connections: newConnections,
      buses: patch.buses,
      publishers: [], // Will be merged with newPublishers by caller
      listeners: [], // Will be merged with newListeners by caller
    },
    rewriteMap: rewriteBuilder.build(),
    newPublishers,
    newListeners,
  };
}

/**
 * Apply the rewrite map to bus publishers and listeners.
 * This rewrites port references from composite boundary ports to internal primitive ports.
 *
 * Design: CompositeTransparencyDesign.md Section 8
 */
function rewriteBusBindings(
  patch: CompilerPatch,
  rewriteMap: PortRefRewriteMap
): { patch: CompilerPatch; errors: CompileError[] } {
  const errors: CompileError[] = [];

  // Rewrite publishers
  const rewrittenPublishers = patch.publishers.map((pub) => {
    const ref: PortRef = { blockId: pub.from.blockId, slotId: pub.from.slotId, direction: 'output' };
    const rewritten = rewriteMap.rewrite(ref);

    if (rewritten === null) {
      // Port not exposed by composite boundary
      errors.push({
        code: 'PortMissing',
        message: `Publisher port not exposed by composite boundary: ${pub.from.blockId}.${pub.from.slotId}`,
        where: { blockId: pub.from.blockId, port: pub.from.slotId },
      });
      return pub; // Return unchanged, error will prevent compilation
    }

    // Return publisher with rewritten port reference
    return {
      ...pub,
      from: { blockId: rewritten.blockId, slotId: rewritten.slotId, direction: 'output' as const },
    };
  });

  // Rewrite listeners
  const rewrittenListeners = patch.listeners.map((listener) => {
    const ref: PortRef = { blockId: listener.to.blockId, slotId: listener.to.slotId, direction: 'input' };
    const rewritten = rewriteMap.rewrite(ref);

    if (rewritten === null) {
      // Port not exposed by composite boundary
      errors.push({
        code: 'PortMissing',
        message: `Listener port not exposed by composite boundary: ${listener.to.blockId}.${listener.to.slotId}`,
        where: { blockId: listener.to.blockId, port: listener.to.slotId },
      });
      return listener; // Return unchanged, error will prevent compilation
    }

    // Return listener with rewritten port reference
    return {
      ...listener,
      to: { blockId: rewritten.blockId, slotId: rewritten.slotId, direction: 'input' as const },
    };
  });

  return {
    patch: {
      ...patch,
      publishers: rewrittenPublishers,
      listeners: rewrittenListeners,
    },
    errors,
  };
}

// =============================================================================
// Compiler Service
// =============================================================================

export interface Viewport {
  width: number;
  height: number;
  background?: string;
}

export interface CompilerService {
  /** Compile the current patch */
  compile(): CompileResult;

  /**
   * Get the compiled program with TimeModel (if successful).
   * Returns CompiledProgram which includes both the program and its time topology.
   */
  getProgram(): CompiledProgram | null;

  /** Get the latest full compile result */
  getLatestResult(): CompileResult | null;

  /** Get the block registry */
  getRegistry(): BlockRegistry;

  /** Get error decorations for UI display */
  getDecorations(): DecorationSet;

  /** Get viewport dimensions from Canvas block (or defaults) */
  getViewport(): Viewport;
}

/**
 * Create a compiler service for an EditorStore.
 */
export function createCompilerService(store: RootStore): CompilerService {
  // Register all composite compilers from domain-composites.ts
  // This must be called before getCompositeCompilers() to populate the registry
  registerAllComposites();

  const compositeCompilers = getCompositeCompilers();
  for (const [blockType, compiler] of Object.entries(compositeCompilers)) {
    registerDynamicBlock(blockType, compiler);
  }

  const registry = createBlockRegistry();
  const ctx = createCompileCtx();

  let lastResult: CompileResult | null = null;
  let lastDecorations: DecorationSet = emptyDecorations();

  return {
    compile(): CompileResult {
      const startTime = performance.now();

      // Generate compileId
      const compileId = randomUUID();
      const patchId = store.patchStore.patchId;
      const patchRevision = store.patchStore.patchRevision;

              // Emit CompileStarted event
              store.events.emit({
                type: 'CompileStarted',
                compileId,
                patchId,
                patchRevision,
                trigger: 'graphCommitted',
              });

              store.logStore.debug('compiler', 'Starting compilation...');

              try {
                let patch = editorToPatch(store);

                // Step 1: Expand composites and build rewrite map
                const { expandedPatch, rewriteMap, newPublishers, newListeners } = expandComposites(patch);

        // Step 2: Apply rewrite map to bus publishers/listeners and merge new bus bindings
        const { patch: rewrittenPatch, errors: rewriteErrors } = rewriteBusBindings(
          {
            ...expandedPatch,
            buses: patch.buses,
            publishers: [...patch.publishers, ...newPublishers],
            listeners: [...patch.listeners, ...newListeners],
          },
          rewriteMap
        );

        // If there were rewrite errors, fail early
        if (rewriteErrors.length > 0) {
          lastResult = {
            ok: false,
            errors: rewriteErrors.map((e) => ({
              code: e.code,
              message: e.message,
              where: e.where,
            })),
          };
          lastDecorations = buildDecorations(lastResult.errors);

          // Convert errors to diagnostics and emit CompileFinished
          const diagnostics = lastResult.errors.map((err) =>
            compileErrorToDiagnostic(err, patchRevision)
          );
          const durationMs = performance.now() - startTime;

          store.events.emit({
            type: 'CompileFinished',
            compileId,
            patchId,
            patchRevision,
            status: 'failed',
            durationMs,
            diagnostics,
          });

          return lastResult;
        }

        patch = rewrittenPatch;
        store.logStore.debug(
          'compiler',
          `Patch has ${patch.blocks.length} blocks and ${patch.connections.length} connections`
        );
        // Log rewrite map stats for debugging
        const mappingCount = rewriteMap.getAllMappings().size;
        if (mappingCount > 0) {
          store.logStore.debug(
            'compiler',
            `RewriteMap: ${mappingCount} port mappings from composite expansion`
          );
        }

        // Log bus binding stats
        if (newPublishers.length > 0 || newListeners.length > 0) {
          store.logStore.debug(
            'compiler',
            `Bus bindings: ${newPublishers.length} publishers, ${newListeners.length} listeners from composite expansion`
          );
        }

        const seed: Seed = store.uiStore.settings.seed;
        const useIR = store.uiStore.settings.useNewCompiler;
        const result = compilePatch(patch, registry, seed, ctx, { emitIR: useIR });

        const durationMs = performance.now() - startTime;

        // Convert errors to diagnostics
        const errorDiagnostics = result.errors.map((err) =>
          compileErrorToDiagnostic(err, patchRevision)
        );

        // Generate bus-related diagnostics on successful compilation
        const busDiagnostics = result.ok ? generateBusDiagnostics(patch, store, patchRevision) : [];

        // Combine all diagnostics
        const diagnostics = [...errorDiagnostics, ...busDiagnostics];

        if (result.ok) {
          store.logStore.info('compiler', `Compiled successfully (${durationMs.toFixed(1)}ms)`);

          // Emit CompileFinished event with success status
          store.events.emit({
            type: 'CompileFinished',
            compileId,
            patchId,
            patchRevision,
            status: 'ok',
            durationMs,
            diagnostics,
            programMeta: {
              timeModelKind: result.timeModel?.kind ?? 'infinite',
              timeRootKind: inferTimeRootKind(patch),
              busUsageSummary: buildBusUsageSummary(patch),
            },
          });

          lastDecorations = emptyDecorations();
        } else {
          // EmptyPatch is not an error - it's expected when the patch is cleared
          const isEmptyPatch = result.errors.length === 1 && result.errors[0].code === 'EmptyPatch';

          if (isEmptyPatch) {
            // Silently clear state - no error logging for empty patch
            lastDecorations = emptyDecorations();

            // Still emit CompileFinished event (with empty diagnostics)
            store.events.emit({
              type: 'CompileFinished',
              compileId,
              patchId,
              patchRevision,
              status: 'failed',
              durationMs,
              diagnostics: [],
            });
          } else {
            // Log each error
            for (const err of result.errors) {
                          const location = err.where?.blockId != null && err.where.blockId !== ''
                            ? ` [${err.where.blockId}${err.where.port != null && err.where.port !== '' ? '.' + err.where.port : ''}]`
                            : '';
                                      store.logStore.error('compiler', `${err.code}: ${err.message}${location}`);
                                    }
                                    store.logStore.warn('compiler', `Compilation failed with ${result.errors.length} error(s)`);            // Emit CompileFinished event with failure status
            store.events.emit({
              type: 'CompileFinished',
              compileId,
              patchId,
              patchRevision,
              status: 'failed',
              durationMs,
              diagnostics,
            });

            // Build decorations for UI display
            lastDecorations = buildDecorations(result.errors);
          }
        }

        lastResult = result;
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const stack = e instanceof Error ? e.stack : undefined;

        store.logStore.error('compiler', `Unexpected error: ${message}`, stack);

        lastResult = {
          ok: false,
          errors: [{ code: 'UpstreamError', message }],
        };
        lastDecorations = buildDecorations(lastResult.errors);

        // Convert error to diagnostic and emit CompileFinished
        const diagnostics = lastResult.errors.map((err) =>
          compileErrorToDiagnostic(err, patchRevision)
        );
        const durationMs = performance.now() - startTime;

        store.events.emit({
          type: 'CompileFinished',
          compileId,
          patchId,
          patchRevision,
          status: 'failed',
          durationMs,
          diagnostics,
        });

        return lastResult;
      }
    },

    getProgram(): CompiledProgram | null {
      // Check if we have a valid program (either SVG or Canvas)
      const hasProgram = lastResult?.program != null || lastResult?.canvasProgram != null;
      if (!hasProgram || lastResult?.timeModel == null) {
        return null;
      }
      return {
        program: lastResult.program,
        canvasProgram: lastResult.canvasProgram,
        timeModel: lastResult.timeModel,
      };
    },

    getLatestResult(): CompileResult | null {
      return lastResult;
    },

    getRegistry(): BlockRegistry {
      return registry;
    },

    getDecorations(): DecorationSet {
      return lastDecorations;
    },

    getViewport(): Viewport {
      // Find Canvas block in the store and extract its viewport params
      const canvasBlock = store.patchStore.blocks.find((b) => b.type === 'canvas');
      if (canvasBlock != null) {
        return {
          width: (canvasBlock.params.width as number) ?? 800,
          height: (canvasBlock.params.height as number) ?? 600,
          background: canvasBlock.params.background as string | undefined,
        };
      }
      // Default viewport if no Canvas block
      return { width: 800, height: 600 };
    },
  };
}

/**
 * Infer TimeRootKind from the compiled patch.
 */
function inferTimeRootKind(patch: CompilerPatch): 'FiniteTimeRoot' | 'CycleTimeRoot' | 'InfiniteTimeRoot' | 'none' {
  for (const block of patch.blocks.values()) {
    if (block.type === 'FiniteTimeRoot') return 'FiniteTimeRoot';
    if (block.type === 'CycleTimeRoot') return 'CycleTimeRoot';
    if (block.type === 'InfiniteTimeRoot') return 'InfiniteTimeRoot';
  }
  return 'none';
}

/**
 * Build bus usage summary for program metadata.
 */
function buildBusUsageSummary(patch: CompilerPatch): Record<string, { publishers: number; listeners: number }> {
  const summary: Record<string, { publishers: number; listeners: number }> = {};

  // Count publishers per bus
  for (const pub of patch.publishers) {
    if (summary[pub.busId] === undefined) {
      summary[pub.busId] = { publishers: 0, listeners: 0 };
    }
    summary[pub.busId].publishers++;
  }

  // Count listeners per bus
  for (const listener of patch.listeners) {
    if (summary[listener.busId] === undefined) {
      summary[listener.busId] = { publishers: 0, listeners: 0 };
    }
    summary[listener.busId].listeners++;
  }

  return summary;
}

// =============================================================================
// Auto-Compile Hook (MobX reaction)
// =============================================================================

import { reaction } from 'mobx';
import {randomUUID} from "../crypto.ts";

export interface AutoCompileOptions {
  /** Debounce delay in ms (default: 300) */
  debounce?: number;
  /** Callback when compilation completes */
  onCompile?: (result: CompileResult) => void;
}

/**
 * Set up auto-compilation that triggers when the patch changes.
 * Returns a dispose function to stop watching.
 */
export function setupAutoCompile(
  store: RootStore,
  service: CompilerService,
  options: AutoCompileOptions = {}
): () => void {
  const { debounce = 300, onCompile } = options;

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const dispose = reaction(
    // Track these observables
    () => ({
      blockCount: store.patchStore.blocks.length,
      blocks: store.patchStore.blocks.map((b: Block) => ({ id: b.id, type: b.type, params: JSON.stringify(b.params) })),
      connectionCount: store.patchStore.connections.length,
      connections: store.patchStore.connections.map((c: Connection) => `${c.from.blockId}:${c.from.slotId}->${c.to.blockId}:${c.to.slotId}`),
      seed: store.uiStore.settings.seed,
      // Default sources - track value changes to trigger recompilation
      // We use a revision counter because structural tracking of values in a Map is tricky
      defaultSourceRevision: store.defaultSourceStore.valueRevision,
      // Bus system - track publishers and listeners
      busCount: store.busStore.buses.length,
      buses: store.busStore.buses.map(b => `${b.id}:${b.name}`),
      publisherCount: store.busStore.publishers.length,
      publishers: store.busStore.publishers.map(p => `${p.id}:${p.from.blockId}.${p.from.slotId}->${p.busId}:${p.enabled}`),
      listenerCount: store.busStore.listeners.length,
      listeners: store.busStore.listeners.map(l => `${l.id}:${l.busId}->${l.to.blockId}.${l.to.slotId}:${l.enabled}`),
    }),
    // React to changes
    () => {
      // Clear pending compile
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      // Schedule new compile
      timeoutId = setTimeout(() => {
        store.logStore.debug('compiler', 'Auto-compile triggered');
        const result = service.compile();
        onCompile?.(result);
      }, debounce);
    },
    {
      // Don't fire immediately on setup
      fireImmediately: false,
    }
  );

  // Return dispose function that also clears pending timeout
  return () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    dispose();
  };
}
