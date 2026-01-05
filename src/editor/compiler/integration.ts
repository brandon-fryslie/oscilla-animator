import type { RootStore } from '../stores/RootStore';
import type { Block, Edge } from '../types';
import { compilePatch } from './compile';
import { createCompileCtx } from './context';
import { registerCompilerBlocks } from './blocks';
import type {
  BlockInstance,
  CompileResult,
  CompiledProgram,
  CompilerPatch,
  CompileError,
  Seed,
} from './types';
import { buildDecorations, emptyDecorations, type DecorationSet } from './error-decorations';
import { getBlockDefinition } from '../blocks';
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
// Default Source Provider Injection (Sprint 9-11)
// =============================================================================


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
 *
 * NOTE: This function is deprecated. GraphNormalizer now handles all structural
 * block creation. This remains for advanced providers (System 1) but will be
 * removed once System 1 is migrated to GraphNormalizer.
 */
export function injectDefaultSourceProviders(
  store: RootStore,
  patch: CompilerPatch
): CompilerPatch {
  // NOTE: This function is now a no-op since GraphNormalizer handles all
  // structural blocks. Advanced providers (System 1) will be migrated later.
  void store;
  return patch;
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
 * - NOTE: toCompilerGraph() not used yet - CompilerPatch still expects Edge with role field
 * - Default source providers are injected by GraphNormalizer, not by pass0-materialize
 */
export function editorToPatch(store: RootStore): CompilerPatch {
  // Get normalized graph with structural blocks already materialized
  const normalizedGraph = store.patchStore.getNormalizedGraph();


  // Build a lookup map for default sources: blockId:slotId -> value
  // This allows the compiler to look up runtime-edited values
  // Format: "blockId:slotId" -> value (extracted from DefaultSourceStore)
  const defaultSourceValues: Record<string, unknown> = {};

  // Iterate through DefaultSourceStore sources to build the values map
  // Default sources for inputs have IDs in the format "ds:input:${blockId}:${slotId}"
  for (const [sourceId, source] of store.defaultSourceStore.sources.entries()) {
    // Extract blockId and slotId from default source ID
    const match = sourceId.match(/^ds:input:(.+):(.+)$/);
    if (match) {
      const blockId = match[1];
      const slotId = match[2];
      const key = `${blockId}:${slotId}`;
      defaultSourceValues[key] = source.value;
    }
  }

  return {
    blocks: convertBlocks(normalizedGraph.blocks),
    edges: normalizedGraph.edges, // TODO: Use toCompilerGraph() when CompilerPatch is updated to accept CompilerEdge[]
    buses: [], // Buses derived from BusBlocks in patchStore.blocks during compilation
    defaultSources: Object.fromEntries(store.defaultSourceStore.sources.entries()),
    defaultSourceValues,
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

  /** Get error decorations for UI display */
  getDecorations(): DecorationSet;

  /** Get viewport dimensions from Canvas block (or defaults) */
  getViewport(): Viewport;
}

/**
 * Create a compiler service for an EditorStore.
 */
export function createCompilerService(store: RootStore): CompilerService {
  registerCompilerBlocks();
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
                const patch = editorToPatch(store);

        store.logStore.debug(
          'compiler',
          `Patch has ${patch.blocks.length} blocks and ${patch.edges.length} edges`
        );

        const seed: Seed = store.uiStore.settings.seed;
        const result = compilePatch(patch, seed, ctx, { emitIR: true });

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
