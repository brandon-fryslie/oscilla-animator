/**
 * @file Event Type Definitions
 * @description Typed event system for editor lifecycle coordination.
 *
 * Design principles:
 * - Events are discriminated unions (compile-time type safety)
 * - Events are emitted AFTER state changes committed
 * - Event payloads are minimal data objects (no methods)
 * - Events are scoped per RootStore instance
 */

import type { TypeDesc, PortRef } from '../types';
import type { Diagnostic } from '../diagnostics/types';

/**
 * MacroExpanded event.
 *
 * Emitted when a macro is expanded into blocks.
 * Emitted by: PatchStore.expandMacro()
 * When: After all blocks/connections created
 */
export interface MacroExpandedEvent {
  type: 'MacroExpanded';
  /** Type of the first block in the macro (or 'unknown' if empty) */
  macroType: string;
  /** IDs of all blocks created during expansion */
  createdBlockIds: string[];
}

/**
 * PatchLoaded event.
 *
 * Emitted when a patch is loaded from JSON.
 * Emitted by: RootStore.loadPatch()
 * When: After all stores updated with patch data
 */
export interface PatchLoadedEvent {
  type: 'PatchLoaded';
  /** Number of blocks loaded */
  blockCount: number;
  /** Number of connections loaded */
  connectionCount: number;
}

/**
 * PatchCleared event.
 *
 * Emitted when the patch is reset to empty state.
 * Emitted by: RootStore.clearPatch()
 * When: After all state cleared
 */
export interface PatchClearedEvent {
  type: 'PatchCleared';
}

/**
 * BlockAdded event.
 *
 * Emitted when a block is added to the patch.
 * Emitted by: PatchStore.addBlock()
 * When: After block created and added to store
 */
export interface BlockAddedEvent {
  type: 'BlockAdded';
  /** ID of the added block */
  blockId: string;
  /** Type of the added block */
  blockType: string;
  /** ID of the lane containing the block */
  laneId: string;
}

/**
 * BlockRemoved event.
 *
 * Emitted when a block is removed from the patch.
 * Emitted by: PatchStore.removeBlock()
 * When: After block removed and connections cleaned up
 */
export interface BlockRemovedEvent {
  type: 'BlockRemoved';
  /** ID of the removed block */
  blockId: string;
  /** Type of the removed block */
  blockType: string;
}

/**
 * BlockReplaced event.
 *
 * Emitted when a block is replaced with a different block type while preserving compatible connections.
 * Emitted by: PatchStore.replaceBlock()
 * When: After new block created, old block removed, and compatible connections re-wired
 *
 * Payload structure:
 * - oldBlockId/oldBlockType: The block that was removed
 * - newBlockId/newBlockType: The replacement block that was created
 * - preservedConnections: Number of connections successfully re-wired to the new block
 * - droppedConnections: Connections that could not be preserved with their IDs and reasons
 */
export interface BlockReplacedEvent {
  type: 'BlockReplaced';
  /** ID of the block that was replaced */
  oldBlockId: string;
  /** Type of the block that was replaced */
  oldBlockType: string;
  /** ID of the newly created replacement block */
  newBlockId: string;
  /** Type of the newly created replacement block */
  newBlockType: string;
  /** Number of connections successfully preserved and re-wired to the new block */
  preservedConnections: number;
  /** Connections that were dropped (incompatible or slots not present on new block) with reasons */
  droppedConnections: Array<{ connectionId: string; reason: string }>;
}

/**
 * WireAdded event.
 *
 * Emitted when a wire connection is created between two blocks.
 * Emitted by: PatchStore.connect()
 * When: After connection added to store
 */
export interface WireAddedEvent {
  type: 'WireAdded';
  /** ID of the wire connection */
  wireId: string;
  /** Source block and port */
  from: PortRef;
  /** Target block and port */
  to: PortRef;
}

/**
 * WireRemoved event.
 *
 * Emitted when a wire connection is removed.
 * Emitted by: PatchStore.disconnect(), PatchStore.removeBlock() (cascade deletion)
 * When: After connection removed from store
 */
export interface WireRemovedEvent {
  type: 'WireRemoved';
  /** ID of the wire connection */
  wireId: string;
  /** Source block and port */
  from: PortRef;
  /** Target block and port */
  to: PortRef;
}

/**
 * BindingAdded event.
 *
 * Emitted when a bus binding is added (publisher or listener).
 * Emitted by: BusStore.addPublisher() or BusStore.addListener()
 * When: After binding created and added to store
 */
export interface BindingAddedEvent {
  type: 'BindingAdded';
  /** ID of the binding (publisher or listener) */
  bindingId: string;
  /** ID of the bus */
  busId: string;
  /** ID of the block being connected */
  blockId: string;
  /** Port name on the block */
  port: string;
  /** Direction of binding: 'publish' for publishers, 'subscribe' for listeners */
  direction: 'publish' | 'subscribe';
}

/**
 * BindingRemoved event.
 *
 * Emitted when a bus binding is removed (publisher or listener).
 * Emitted by: BusStore.removePublisher() or BusStore.removeListener()
 * When: After binding removed from store
 */
export interface BindingRemovedEvent {
  type: 'BindingRemoved';
  /** ID of the binding (publisher or listener) */
  bindingId: string;
  /** ID of the bus */
  busId: string;
  /** ID of the block being disconnected */
  blockId: string;
  /** Port name on the block */
  port: string;
  /** Direction of binding: 'publish' for publishers, 'subscribe' for listeners */
  direction: 'publish' | 'subscribe';
}

/**
 * BusCreated event.
 *
 * Emitted when a new bus is created.
 * Emitted by: BusStore.createBus()
 * When: After bus added to store
 */
export interface BusCreatedEvent {
  type: 'BusCreated';
  /** ID of the created bus */
  busId: string;
  /** Name of the bus */
  name: string;
  /** Type descriptor of the bus */
  busType: TypeDesc;
}

/**
 * BusDeleted event.
 *
 * Emitted when a bus is deleted.
 * Emitted by: BusStore.deleteBus()
 * When: BEFORE bus removed from store (so event contains bus data)
 */
export interface BusDeletedEvent {
  type: 'BusDeleted';
  /** ID of the deleted bus */
  busId: string;
  /** Name of the bus */
  name: string;
}

// ============================================================================
// DIAGNOSTIC LIFECYCLE EVENTS
// These events provide clean boundaries for diagnostic state updates.
// Reference: design-docs/4-Event-System/3.5-Events-and-Payloads-Schema.md
// ============================================================================

/**
 * Reason for a graph mutation.
 * Helps diagnostics and UX understand why the graph changed.
 */
export type GraphCommitReason =
  | 'userEdit'
  | 'macroExpand'
  | 'compositeSave'
  | 'migration'
  | 'import'
  | 'undo'
  | 'redo';

/**
 * Summary of changes in a graph mutation.
 */
export interface GraphDiffSummary {
  /** Number of blocks added in this mutation */
  blocksAdded: number;
  /** Number of blocks removed in this mutation */
  blocksRemoved: number;
  /** Number of buses added in this mutation */
  busesAdded: number;
  /** Number of buses removed in this mutation */
  busesRemoved: number;
  /** Number of bindings changed (added or removed) */
  bindingsChanged: number;
  /** Whether the TimeRoot block was added/removed/modified */
  timeRootChanged: boolean;
}

/**
 * GraphCommitted event.
 *
 * Emitted exactly once after any user operation that changes the patch graph
 * (blocks/buses/bindings/time root/composites), after the mutation is fully
 * applied and undo state is committed.
 *
 * This replaces the granular events (BlockAdded, BlockRemoved, WireAdded, etc.)
 * for diagnostic purposes - it provides a single stable "recompute point".
 *
 * Emitted by: PatchStore (after all mutation methods)
 * When: After mutation fully applied, before recompilation
 *
 * Reference: design-docs/4-Event-System/3.5-Events-and-Payloads-Schema.md §1
 */
export interface GraphCommittedEvent {
  type: 'GraphCommitted';
  /** Unique identifier for this patch */
  patchId: string;
  /** Monotonic revision number (increments on every committed graph edit) */
  patchRevision: number;
  /** Reason for the mutation */
  reason: GraphCommitReason;
  /** Summary of what changed */
  diffSummary: GraphDiffSummary;
  /** IDs of blocks affected by this mutation (best effort, bounded) */
  affectedBlockIds?: string[];
  /** IDs of buses affected by this mutation (best effort, bounded) */
  affectedBusIds?: string[];
}

/**
 * Trigger for a compilation.
 */
export type CompileTrigger =
  | 'graphCommitted'
  | 'manual'
  | 'startup'
  | 'hotReload';

/**
 * CompileStarted event.
 *
 * Emitted when compilation begins for a specific graph revision.
 *
 * Emitted by: CompilerService.compile()
 * When: At start of compilation
 *
 * Diagnostic use: Clears/marks "stale compile diagnostics" state, shows "compiling..." badges.
 *
 * Reference: design-docs/4-Event-System/3.5-Events-and-Payloads-Schema.md §2
 */
export interface CompileStartedEvent {
  type: 'CompileStarted';
  /** Unique ID for this compilation (UUID) */
  compileId: string;
  /** ID of the patch being compiled */
  patchId: string;
  /** Revision of the patch being compiled */
  patchRevision: number;
  /** What triggered the compilation */
  trigger: CompileTrigger;
}

/**
 * Status of a compilation.
 */
export type CompileStatus = 'ok' | 'failed';

/**
 * Metadata about the compiled program (only present on success).
 */
export interface CompiledProgramMeta {
  /** TimeModel kind */
  timeModelKind: 'finite' | 'cyclic' | 'infinite';
  /** Kind of TimeRoot used */
  timeRootKind: 'FiniteTimeRoot' | 'CycleTimeRoot' | 'InfiniteTimeRoot' | 'none';
  /** Optional bus usage summary */
  busUsageSummary?: Record<string, { publishers: number; listeners: number }>;
}

/**
 * CompileFinished event.
 *
 * Emitted when compilation completes (SUCCESS OR FAILURE - single event, not split).
 * The diagnostics array contains the authoritative compile-time diagnostics snapshot.
 *
 * Emitted by: CompilerService.compile()
 * When: After compilation completes (regardless of success/failure)
 *
 * Diagnostic use: Replace compile diagnostics snapshot for that patchRevision.
 *
 * Reference: design-docs/4-Event-System/3.5-Events-and-Payloads-Schema.md §3
 */
export interface CompileFinishedEvent {
  type: 'CompileFinished';
  /** ID of this compilation (matches CompileStarted.compileId) */
  compileId: string;
  /** ID of the patch that was compiled */
  patchId: string;
  /** Revision of the patch that was compiled */
  patchRevision: number;
  /** Compilation result status */
  status: CompileStatus;
  /** Compilation duration in milliseconds */
  durationMs: number;
  /** Authoritative diagnostics snapshot from compilation */
  diagnostics: Diagnostic[];
  /** Program metadata (only present if status === 'ok') */
  programMeta?: CompiledProgramMeta;
}

/**
 * Swap mode for program activation.
 */
export type ProgramSwapMode =
  | 'hard'     // Immediate swap
  | 'soft'     // Crossfade / state-bridge
  | 'deferred'; // Applied on boundary (pulse/loop seam)

/**
 * ProgramSwapped event.
 *
 * Emitted when the runtime actually begins using a new compiled program.
 *
 * Emitted by: Player (when activating a new program)
 * When: After program is active in runtime
 *
 * Diagnostic use: Set "active revision" pointer, attach runtime diagnostics to active revision.
 *
 * Reference: design-docs/4-Event-System/3.5-Events-and-Payloads-Schema.md §4
 */
export interface ProgramSwappedEvent {
  type: 'ProgramSwapped';
  /** ID of the patch */
  patchId: string;
  /** Revision of the patch now active */
  patchRevision: number;
  /** ID of the compilation that produced this program */
  compileId: string;
  /** How the swap was performed */
  swapMode: ProgramSwapMode;
  /** Time between CompileFinished and swap (ms) */
  swapLatencyMs: number;
  /** Whether state bridging was used (for soft swaps) */
  stateBridgeUsed?: boolean;
}

/**
 * Frame budget statistics.
 */
export interface FrameBudgetStats {
  /** Estimated FPS */
  fpsEstimate: number;
  /** Average frame time over window (ms) */
  avgFrameMs: number;
  /** Worst frame time in window (ms) */
  worstFrameMs?: number;
}

/**
 * Evaluation statistics.
 */
export interface EvalStats {
  /** Number of field materializations */
  fieldMaterializations: number;
  /** Top K worst offenders (block IDs) */
  worstOffenders?: Array<{ blockId: string; count: number }>;
  /** Estimated allocation bytes (optional) */
  allocBytesEstimate?: number;
  /** Count of NaN values detected */
  nanCount: number;
  /** Count of Infinity values detected */
  infCount: number;
}

/**
 * RuntimeHealthSnapshot event.
 *
 * Emitted at a fixed low frequency (2-5 Hz), NOT per frame.
 * Provides runtime health information for performance diagnostics.
 *
 * Emitted by: Player/Runtime (throttled)
 * When: Every 200-500ms during playback
 *
 * Diagnostic use: Update runtime diagnostics (dedupe/expire), perf warnings.
 *
 * Reference: design-docs/4-Event-System/3.5-Events-and-Payloads-Schema.md §5
 */
export interface RuntimeHealthSnapshotEvent {
  type: 'RuntimeHealthSnapshot';
  /** ID of the patch */
  patchId: string;
  /** Currently active revision */
  activePatchRevision: number;
  /** Current runtime time in ms */
  tMs: number;
  /** Frame budget statistics */
  frameBudget: FrameBudgetStats;
  /** Evaluation statistics */
  evalStats: EvalStats;
  /** Runtime diagnostics delta (raised/resolved IDs) or full snapshot */
  diagnosticsDelta?: {
    raised: Diagnostic[];
    resolved: string[]; // diagnostic IDs that are now resolved
  };
  /** Current bus values for debug UI (sampled at snapshot time) */
  busValues?: Record<string, import('../debug/types').ValueSummary>;
}

// ============================================================================

/**
 * Union of all editor events (discriminated by 'type' field).
 *
 * DIAGNOSTIC LIFECYCLE EVENTS (new):
 * - GraphCommitted: Single mutation boundary event
 * - CompileStarted: Compilation begins
 * - CompileFinished: Compilation complete with diagnostics snapshot
 * - ProgramSwapped: Runtime activated new program
 * - RuntimeHealthSnapshot: Throttled runtime health stats
 *
 * GRANULAR EVENTS:
 * - BlockAdded/BlockRemoved/WireAdded/etc: Used for UI coordination and targeted updates
 */
export type EditorEvent =
  // Lifecycle events
  | MacroExpandedEvent
  | PatchLoadedEvent
  | PatchClearedEvent
  // Diagnostic lifecycle events (new)
  | GraphCommittedEvent
  | CompileStartedEvent
  | CompileFinishedEvent
  | ProgramSwappedEvent
  | RuntimeHealthSnapshotEvent
  // Granular events (used for UI coordination)
  | BlockAddedEvent
  | BlockRemovedEvent
  | BlockReplacedEvent
  | WireAddedEvent
  | WireRemovedEvent
  | BindingAddedEvent
  | BindingRemovedEvent
  | BusCreatedEvent
  | BusDeletedEvent;

/**
 * Event handler function type.
 * Handlers are synchronous and non-blocking.
 */
export type EventHandler<T> = (event: T) => void;

/**
 * Utility type to extract a specific event from the union by type discriminant.
 * Example: EventOfType<'MacroExpanded'> = MacroExpandedEvent
 */
export type EventOfType<T extends EditorEvent['type']> = Extract<EditorEvent, { type: T }>;
