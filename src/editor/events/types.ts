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

import type { TypeDescriptor } from '../types';

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
 * CompileSucceeded event.
 *
 * Emitted when patch compilation succeeds.
 * Emitted by: CompilerService.compile()
 * When: After program successfully compiled
 */
export interface CompileSucceededEvent {
  type: 'CompileSucceeded';
  /** Compilation duration in milliseconds */
  durationMs: number;
}

/**
 * CompileFailed event.
 *
 * Emitted when patch compilation fails (not for empty patches).
 * Emitted by: CompilerService.compile()
 * When: After compilation errors detected
 */
export interface CompileFailedEvent {
  type: 'CompileFailed';
  /** Number of compilation errors */
  errorCount: number;
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
  type: TypeDescriptor;
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

/**
 * Union of all editor events (discriminated by 'type' field).
 */
export type EditorEvent =
  | MacroExpandedEvent
  | PatchLoadedEvent
  | PatchClearedEvent
  | CompileSucceededEvent
  | CompileFailedEvent
  | BlockAddedEvent
  | BlockRemovedEvent
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
