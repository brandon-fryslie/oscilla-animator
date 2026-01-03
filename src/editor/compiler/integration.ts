import type { RootStore } from '../stores/RootStore';
import type { Block, Edge, PortRef } from '../types';
import { compilePatch } from './compile';
import { createCompileCtx } from './context';
import { createBlockRegistry, registerDynamicBlock } from './blocks';
import type {
  BlockInstance,
  BlockRegistry,
  CompileResult,
  CompiledProgram,
  CompilerPatch,
  CompileError,
  Seed,
} from './types';
import { buildDecorations, emptyDecorations, type DecorationSet } from './error-decorations';
import { getBlockDefinition } from '../blocks';
import { registerAllComposites, getCompositeCompilers } from '../composite-bridge';
import { createDiagnostic, type Diagnostic, type DiagnosticCode, type TargetRef } from '../diagnostics/types';
import { getFeatureFlags } from './featureFlags';

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
    error.where.edgeId !== null &&
    error.where.edgeId !== undefined
  ) {
    // Edge error - target the edge ID
    primaryTarget = {
      kind: 'block',
      blockId: error.where.edgeId,
    };
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
  // Bus-Block Unification: Check connections to/from BusBlocks
  const busBlocks = patch.blocks.filter(b => b.type === 'BusBlock');
  // busBlockIds can be used for filtering connection targets if needed
  void busBlocks; // Used in the loop below

  for (const busBlock of busBlocks) {
    // Count edges FROM BusBlock (listeners)
    const listenerCount = patch.edges.filter(e => e.from.blockId === busBlock.id).length;

    // Count edges TO BusBlock (publishers)
    const publisherEdges = patch.edges.filter(e => e.to.blockId === busBlock.id);

    // Only warn if there are publishers but no listeners
    if (listenerCount === 0 && publisherEdges.length > 0) {
      const affectedTargets: TargetRef[] = publisherEdges.map(e => ({
        kind: 'block',
        blockId: e.from.blockId,
      }));

      const busName = (busBlock.params?.name as string) ?? busBlock.id;
      diagnostics.push(
        createDiagnostic({
          code: 'W_BUS_EMPTY',
          severity: 'warn',
          domain: 'compile',
          primaryTarget: { kind: 'block', blockId: busBlock.id },
          affectedTargets: affectedTargets.length > 0 ? affectedTargets : undefined,
          title: 'Empty Bus',
          message: `Bus "${busName}" has no listeners. Published values are not being used.`,
          patchRevision,
        })
      );
    }
  }

  // W_GRAPH_UNUSED_OUTPUT: Block outputs not connected
  const connectedOutputs = new Set<string>();

  // Track connected outputs (including edges to BusBlocks)
  for (const edge of patch.edges) {
    connectedOutputs.add(`${edge.from.blockId}.${edge.from.slotId}`);
  }

  // Check each block's outputs
  // Render output types are terminal sinks - they don't need downstream connections
  const terminalOutputTypes = ['Render', 'RenderTree', 'RenderTreeProgram'];

  for (const block of patch.blocks) {
    const blockId = block.id;
    // Skip TimeRoot blocks - they auto-publish to buses
    if (block.type === 'FiniteTimeRoot' || block.type === 'InfiniteTimeRoot') {
      continue;
    }

    const def = getBlockDefinition(block.type);
    if (def == null || def.outputs == null || def.outputs.length === 0) continue;

    for (const output of def.outputs) {
      // Skip terminal outputs (render sinks) - they don't need connections
      const slotType = typeof output.type === 'string' ? output.type : output.type;
      const typeStr = typeof slotType === 'string' ? slotType : '';
      if (terminalOutputTypes.some(t => typeStr.includes(t))) {
        continue;
      }

      const outputKey = `${blockId}.${output.id}`;
      const isConnected = connectedOutputs.has(outputKey);

      // Bus-Block Unification: Connections to BusBlocks count as "published"
      if (!isConnected) {
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
            message: `Output "${output.label ?? output.id}" on block is not connected.`,
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
  // Bus-Block Unification: publishers/listeners removed - bus bindings are now connections
}

// =============================================================================
// Default Source Provider Injection (Sprint 9-11)
// =============================================================================

/**
 * Helper: Check if an input is undriven (no wire AND no active listener).
 * Only undriven inputs should get provider injection.
 */
function _isInputUndriven(
  blockId: string,
  slotId: string,
  patch: CompilerPatch
): boolean {
  // Check for wire: any edge to this input
  const hasWire = patch.edges.some(
    e => e.to.blockId === blockId && e.to.slotId === slotId
  );

  // Bus-Block Unification: Check for edge from any BusBlock to this input
  const busBlockIds = new Set(patch.blocks.filter(b => b.type === 'BusBlock').map(b => b.id));
  const hasListener = patch.edges.some(
    e => busBlockIds.has(e.from.blockId) && e.to.blockId === blockId && e.to.slotId === slotId
  );

  // Returns true only if BOTH checks are false (no wire AND no listener)
  return !hasWire && !hasListener;
}

/**
 * Helper: Generate stable ID for provider wire.
 * Format: wire:ds:${providerId}->${targetBlockId}:${targetSlotId}
 */
function _makeProviderWireId(
  providerId: string,
  targetBlockId: string,
  targetSlotId: string
): string {
  return `wire:ds:${providerId}->${targetBlockId}:${targetSlotId}`;
}

// _makeProviderListenerId removed - bus listeners replaced by connections to BusBlocks

/**
 * Inject default source provider blocks into CompilerPatch.
 *
 * For each attachment where the input is undriven:
 * - Adds provider block to patch.blocks
 * - Adds wire from provider output to target input
 * - Adds bus listeners for provider busInputs (if any)
 * - Extends defaultSourceValues with provider internal defaults
 *
 * Returns new CompilerPatch with injected primitives. Does NOT mutate input patch.
 *
 * Sprint 10: Inject provider blocks and wires
 * Sprint 11: Inject bus listeners for providers
 */
export function injectDefaultSourceProviders(
  store: RootStore,
  patch: CompilerPatch,
  registry: BlockRegistry
): CompilerPatch {
  const defaultSourceStore = store.defaultSourceStore;

  // Track which providers we've already added (for deduplication)
  const addedProviders = new Set<string>();

  // Collect injected blocks, edges, and default source values
  const injectedBlocks: BlockInstance[] = [];
  const injectedEdges: Edge[] = [];
  const extendedDefaultSourceValues: Record<string, unknown> = { ...patch.defaultSourceValues };

  // Iterate through all attachments
  for (const [_key, attachment] of defaultSourceStore.attachmentsByTarget) {
    const { target, provider } = attachment;

    // Check if this input is undriven
    if (!_isInputUndriven(target.blockId, target.slotId, patch)) {
      // Input is driven by wire or listener - skip injection
      continue;
    }

    // Check if BOTH compiler AND block definition exist
    // Provider blocks need:
    // 1. A compiler (for lowering to IR)
    // 2. A block definition (for resolving defaultSource on provider's own inputs)
    const hasCompiler = registry[provider.blockType] != null;
    const hasBlockDef = getBlockDefinition(provider.blockType) != null;

    if (!hasCompiler || !hasBlockDef) {
      // No complete implementation - skip injection
      // The target input will fall back to using its slot.defaultSource value directly
      continue;
    }

    // 1. Inject provider block (if not already added)
    if (!addedProviders.has(provider.providerId)) {
      const providerBlock: BlockInstance = {
        id: provider.providerId,
        type: provider.blockType,
        params: {},
        position: 0, // Hidden blocks have no position
      };

      injectedBlocks.push(providerBlock);
      addedProviders.add(provider.providerId);

      // 3. Extend defaultSourceValues with provider internal defaults
      for (const [inputId, sourceId] of Object.entries(provider.editableInputSourceIds)) {
        const defaultSource = defaultSourceStore.getDefaultSource(sourceId);
        if (defaultSource != null) {
          const key = `${provider.providerId}:${inputId}`;
          extendedDefaultSourceValues[key] = defaultSource.value;
        }
      }

    }

    // 2. Inject edge from provider output to target input
    const edge: Edge = {
      id: _makeProviderWireId(provider.providerId, target.blockId, target.slotId),
      from: { kind: 'port', blockId: provider.providerId, slotId: provider.outputPortId },
      to: { kind: 'port', blockId: target.blockId, slotId: target.slotId },
      enabled: true,
    role: { kind: 'user' },
    };

    injectedEdges.push(edge);
  }

  // Return new patch with injected primitives (pure function - no mutation)
  return {
    ...patch,
    blocks: [...patch.blocks, ...injectedBlocks],
    edges: [...patch.edges, ...injectedEdges],
    defaultSourceValues: extendedDefaultSourceValues,
  };
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
 * Convert EditorStore to CompilerPatch.
 *
 * Sprint: Graph Normalization Layer (2026-01-03)
 * - Uses getNormalizedGraph() to get blocks with structural artifacts already materialized
 * - Default source providers are injected by GraphNormalizer, not by pass0-materialize
 */
export function editorToPatch(store: RootStore): CompilerPatch {
  // Get normalized graph with structural blocks already materialized
  const normalizedGraph = store.patchStore.getNormalizedGraph();

  // Build a lookup map for default sources: blockId:slotId -> value
  // This allows the compiler to look up runtime-edited values
  const defaultSourceValues: Record<string, unknown> = {};

  // Iterate through all default source attachments to build the values map
  for (const [targetKey, attachment] of store.defaultSourceStore.attachmentsByTarget) {
    // targetKey is already in "blockId:slotId" format
    const sourceId = attachment.provider.editableInputSourceIds.value;
    const source = store.defaultSourceStore.getDefaultSource(sourceId);
    if (source != null) {
      defaultSourceValues[targetKey] = source.value;
    }
  }

  return {
    blocks: convertBlocks(normalizedGraph.blocks),
    edges: normalizedGraph.edges,
    buses: [], // Buses derived from BusBlocks in patchStore.blocks during compilation
    defaultSources: Object.fromEntries(store.defaultSourceStore.sources.entries()),
    defaultSourceValues,
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
  let edges = [...patch.edges];
  const newBlocks = new Map<string, BlockInstance>();
  const newEdges: Edge[] = [];

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

      // Bus-Block Unification: Convert bus subscriptions to edges FROM BusBlock TO internal block
      if (compositeDef?.graph.busSubscriptions != null) {
        for (const [inputPort, busNameValue] of Object.entries(compositeDef.graph.busSubscriptions)) {
          const busName = busNameValue;
          const internalRef = graph.inputMap[inputPort];
          if (internalRef != null && internalRef !== '') {
            const [node, port] = internalRef.split('.');
            const internalBlockId = idMap.get(node);
            if (internalBlockId != null) {
              // Find the BusBlock by name
              const busBlock = patch.blocks.find(b =>
                b.type === 'BusBlock' && (b.params?.name === busName || b.id === busName)
              );
              if (busBlock != null) {
                newEdges.push({
                  id: generateBusBindingId(blockId, 'sub', inputPort),
                  from: { kind: 'port', blockId: busBlock.id, slotId: 'out' },
                  to: { kind: 'port', blockId: internalBlockId, slotId: port },
                  enabled: true,
                role: { kind: 'user' },
                });
              }
            }
          }
        }
      }

      // Bus-Block Unification: Convert bus publications to edges FROM internal block TO BusBlock
      if (compositeDef?.graph.busPublications != null) {
        for (const [outputPort, busNameValue] of Object.entries(compositeDef.graph.busPublications)) {
          const busName = busNameValue;
          const internalRef = graph.outputMap[outputPort];
          if (internalRef != null && internalRef !== '') {
            const [node, port] = internalRef.split('.');
            const internalBlockId = idMap.get(node);
            if (internalBlockId != null) {
              // Find the BusBlock by name
              const busBlock = patch.blocks.find(b =>
                b.type === 'BusBlock' && (b.params?.name === busName || b.id === busName)
              );
              if (busBlock != null) {
                newEdges.push({
                  id: generateBusBindingId(blockId, 'pub', outputPort),
                  from: { kind: 'port', blockId: internalBlockId, slotId: port },
                  to: { kind: 'port', blockId: busBlock.id, slotId: 'in' },
                  enabled: true,
                role: { kind: 'user' },
                });
              }
            }
          }
        }
      }

      // Internal edges
      for (const graphEdge of graph.edges) {
        const [fromNode, fromPort] = graphEdge.from.split('.');
        const [toNode, toPort] = graphEdge.to.split('.');
        const fromId = idMap.get(fromNode);
        const toId = idMap.get(toNode);
        if (fromId != null && toId != null) {
          newEdges.push({
            id: `${blockId}::${fromNode}.${fromPort}->${toNode}.${toPort}`,
            from: { kind: 'port', blockId: fromId, slotId: fromPort },
            to: { kind: 'port', blockId: toId, slotId: toPort },
            enabled: true,
          role: { kind: 'user' },
          });
        }
      }

      // Rewire incoming edges - check both original edges and already-rewired ones
      const incoming = edges.filter((e) => e.to.blockId === blockId);
      const incomingFromNew = newEdges.filter((e) => e.to.blockId === blockId);
      const outgoing = edges.filter((e) => e.from.blockId === blockId);
      const outgoingFromNew = newEdges.filter((e) => e.from.blockId === blockId);

      edges = edges.filter(
        (e) => e.to.blockId !== blockId && e.from.blockId !== blockId
      );

      // Remove edges targeting this composite from newEdges (will be rewired)
      const edgesToRemove = new Set<Edge>();
      incomingFromNew.forEach((e) => edgesToRemove.add(e));
      outgoingFromNew.forEach((e) => edgesToRemove.add(e));

      for (const edge of [...incoming, ...incomingFromNew]) {
        const internalRef = graph.inputMap[edge.to.slotId];
        if (internalRef == null || internalRef === '') continue;
        const [node, port] = internalRef.split('.');
        const toId = idMap.get(node);
        if (toId != null) {
          newEdges.push({
            id: `${edge.id}::rewired`,
            from: edge.from,
            to: { kind: 'port', blockId: toId, slotId: port },
            enabled: edge.enabled,
            role: { kind: 'user' },
          });
        }
      }

      for (const edge of [...outgoing, ...outgoingFromNew]) {
        const internalRef = graph.outputMap[edge.from.slotId];
        if (internalRef == null || internalRef === '') continue;
        const [node, port] = internalRef.split('.');
        const fromId = idMap.get(node);
        if (fromId != null) {
          newEdges.push({
            id: `${edge.id}::rewired`,
            from: { kind: 'port', blockId: fromId, slotId: port },
            to: edge.to,
            enabled: edge.enabled,
            role: { kind: 'user' },
          });
        }
      }

      // Remove the edges that were rewired from newEdges
      for (let i = newEdges.length - 1; i >= 0; i--) {
        if (edgesToRemove.has(newEdges[i])) {
          newEdges.splice(i, 1);
        }
      }
    } else {
      newBlocks.set(blockId, block);
    }
  }

  // Add any untouched edges
  for (const edge of edges) {
    newEdges.push(edge);
  }

  return {
    expandedPatch: {
      blocks: Array.from(newBlocks.values()),
      edges: newEdges,
      buses: patch.buses,
    },
    rewriteMap: rewriteBuilder.build(),
  };
}

/**
 * Apply the rewrite map to bus bindings.
 * Bus-Block Unification: Publishers/listeners removed. Connections to BusBlocks
 * are now created directly in expandComposites, so this is a pass-through.
 *
 * Design: CompositeTransparencyDesign.md Section 8
 */
function rewriteBusBindings(
  patch: CompilerPatch,
  _rewriteMap: PortRefRewriteMap
): { patch: CompilerPatch; errors: CompileError[] } {
  // Bus-Block Unification: Publishers/listeners removed - nothing to rewrite
  // Bus connections are now regular connections created in expandComposites
  return { patch, errors: [] };
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
      const patchRevision = store.patchStore.patchRevision;
      console.log('[CompilerService] compile() called with', store.patchStore.blocks.length, 'blocks:', store.patchStore.blocks.map(b => b.type));

              // Emit CompileStarted event
              store.events.emit({
                type: 'CompileStarted',
                compileId,
                patchId: 'patch', // Temporary - patchId not yet on PatchStore
                patchRevision,
                trigger: 'graphCommitted',
              });

              store.logStore.debug('compiler', 'Starting compilation...');

              try {
                let patch = editorToPatch(store);

                // Step 1: Expand composites and build rewrite map
                // Bus-Block Unification: publishers/listeners removed - bus bindings are now connections
                const { expandedPatch, rewriteMap } = expandComposites(patch);

        // Step 2: Apply rewrite map (now a no-op, kept for structure)
        const { patch: rewrittenPatch, errors: rewriteErrors } = rewriteBusBindings(
          {
            ...expandedPatch,
            buses: patch.buses,
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
            patchId: 'patch', // Temporary
            patchRevision,
            status: 'failed',
            durationMs,
            diagnostics,
          });

          return lastResult;
        }

        patch = rewrittenPatch;

        // Step 3: Inject advanced default source providers from allowlist (System 1)
        // Graph normalization already materialized structural blocks (DSConst* providers)
        // This step only injects advanced providers (e.g., Oscillator) based on user configuration
        // System 1 skips inputs that already have connections (from normalization or user wires)
        patch = injectDefaultSourceProviders(store, patch, registry);

        store.logStore.debug(
          'compiler',
          `Patch has ${patch.blocks.length} blocks and ${patch.edges.length} edges`
        );
        // Log rewrite map stats for debugging
        const mappingCount = rewriteMap.getAllMappings().size;
        if (mappingCount > 0) {
          store.logStore.debug(
            'compiler',
            `RewriteMap: ${mappingCount} port mappings from composite expansion`
          );
        }

        // Bus-Block Unification: publishers/listeners removed - bus bindings are now connections

        const seed: Seed = store.uiStore.settings.seed;
        // Use feature flag to control IR emission (legacy mode when emitIR=false)
        const result = compilePatch(patch, registry, seed, ctx, { emitIR: getFeatureFlags().emitIR });

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
            patchId: 'patch', // Temporary
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
              patchId: 'patch', // Temporary
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
              patchId: 'patch', // Temporary
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
          patchId: 'patch', // Temporary
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
function inferTimeRootKind(patch: CompilerPatch): 'FiniteTimeRoot' | 'InfiniteTimeRoot' | 'none' {
  for (const block of patch.blocks.values()) {
    if (block.type === 'FiniteTimeRoot') return 'FiniteTimeRoot';
    if (block.type === 'InfiniteTimeRoot') return 'InfiniteTimeRoot';
  }
  return 'none';
}

/**
 * Build bus usage summary for program metadata.
 * Bus-Block Unification: Count connections to/from BusBlocks instead of publishers/listeners.
 */
function buildBusUsageSummary(patch: CompilerPatch): Record<string, { publishers: number; listeners: number }> {
  const summary: Record<string, { publishers: number; listeners: number }> = {};

  // Find all BusBlocks
  const busBlockIds = new Set(patch.blocks.filter(b => b.type === 'BusBlock').map(b => b.id));

  for (const busBlockId of busBlockIds) {
    // Count edges TO the BusBlock (publishers)
    const publisherCount = patch.edges.filter(e => e.to.blockId === busBlockId).length;

    // Count edges FROM the BusBlock (listeners)
    const listenerCount = patch.edges.filter(e => e.from.blockId === busBlockId).length;

    summary[busBlockId] = { publishers: publisherCount, listeners: listenerCount };
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
      edgeCount: store.patchStore.edges.length,
      edges: store.patchStore.edges.map((e: Edge) => `${e.from.blockId}:${e.from.slotId}->${e.to.blockId}:${e.to.slotId}`),
      seed: store.uiStore.settings.seed,
      // Default sources - track value changes to trigger recompilation
      // We use a revision counter because structural tracking of values in a Map is tricky
      defaultSourceRevision: store.defaultSourceStore.valueRevision,
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
