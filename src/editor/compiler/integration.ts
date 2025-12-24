import type { RootStore } from '../stores/RootStore';
import type { Block, Connection, Publisher, Listener } from '../types';
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
  PortRef,
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
      portRef: { blockId: conn.from.blockId, slotId: conn.from.port, direction: 'output' },
    };
    affectedTargets = [
      { kind: 'port', portRef: { blockId: conn.to.blockId, slotId: conn.to.port, direction: 'input' } },
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
          const key = `${ref.blockId}.${ref.port}`;
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
function convertBlocks(blocks: Block[]): Map<string, BlockInstance> {
  const map = new Map<string, BlockInstance>();
  for (const block of blocks) {
    map.set(block.id, {
      id: block.id,
      type: block.type,
      params: { ...block.params },
    });
  }
  return map;
}

/**
 * Convert EditorStore connections to compiler format.
 */
function convertConnections(connections: Connection[]): CompilerConnection[] {
  return connections.map((c: Connection) => ({
    from: { blockId: c.from.blockId, port: c.from.slotId },
    to: { blockId: c.to.blockId, port: c.to.slotId },
  }));
}

/**
 * Convert EditorStore to CompilerPatch.
 */
export function editorToPatch(store: RootStore): CompilerPatch {
  return {
    blocks: convertBlocks(store.patchStore.blocks),
    connections: convertConnections(store.patchStore.connections),
    // Include bus routing from BusStore
    buses: store.busStore.buses,
    publishers: store.busStore.publishers,
    listeners: store.busStore.listeners,
    defaultSources: Object.fromEntries(store.defaultSourceStore.sources.entries()),
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
  const queue: Array<[string, BlockInstance]> = Array.from(patch.blocks.entries());
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
        const [node, port] = internalRef.split('.');
        const internalBlockId = idMap.get(node);
        if (internalBlockId != null) {
          rewriteBuilder.addMapping(blockId, boundaryPort, {
            blockId: internalBlockId,
            port,
          });
        }
      }

      // Build rewrite mappings for OUTPUT ports (publishers target these)
      for (const [boundaryPort, internalRef] of Object.entries(graph.outputMap)) {
        const [node, port] = internalRef.split('.');
        const internalBlockId = idMap.get(node);
        if (internalBlockId != null) {
          rewriteBuilder.addMapping(blockId, boundaryPort, {
            blockId: internalBlockId,
            port,
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
            from: { blockId: fromId, port: fromPort },
            to: { blockId: toId, port: toPort },
          });
        }
      }

      // Rewire incoming connections - check both original connections and already-rewired ones
      const incoming = connections.filter((c) => c.to.blockId === blockId);
      const incomingFromNew = newConnections.filter((c) => c.to.blockId === blockId);
      const outgoing = connections.filter((c) => c.from.blockId === blockId);
      const outgoingFromNew = newConnections.filter((c) => c.from.blockId === blockId);

      connections = connections.filter(
        (c) => c.to.blockId !== blockId && c.from.blockId !== blockId
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
            to: { blockId: toId, port },
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
            from: { blockId: fromId, port },
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
      blocks: newBlocks,
      connections: newConnections,
      buses: patch.buses,
      publishers: [], // Will be merged with newPublishers by caller
      listeners: [], // Will be merged with newListeners by caller
      defaultSources: patch.defaultSources,
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
    const ref: PortRef = { blockId: pub.from.blockId, port: pub.from.slotId };
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
      from: { blockId: rewritten.blockId, slotId: rewritten.port, direction: 'output' as const },
    };
  });

  // Rewrite listeners
  const rewrittenListeners = patch.listeners.map((listener) => {
    const ref: PortRef = { blockId: listener.to.blockId, port: listener.to.slotId };
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
      to: { blockId: rewritten.blockId, slotId: rewritten.port, direction: 'input' as const },
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
      const compileId = crypto.randomUUID();
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
          `Patch has ${patch.blocks.size} blocks and ${patch.connections.length} connections`
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
        const result = compilePatch(patch, registry, seed, ctx);

        const durationMs = performance.now() - startTime;

        // Convert errors to diagnostics
        const diagnostics = result.errors.map((err) =>
          compileErrorToDiagnostic(err, patchRevision)
        );

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
      if (lastResult?.program == null || lastResult?.timeModel == null) {
        return null;
      }
      return {
        program: lastResult.program,
        timeModel: lastResult.timeModel,
      };
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
