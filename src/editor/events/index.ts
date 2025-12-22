/**
 * @file Event System Public API
 * @description Export event types and dispatcher for editor use.
 */

export { EventDispatcher } from './EventDispatcher';
export type {
  EditorEvent,
  EventHandler,
  EventOfType,
  MacroExpandedEvent,
  PatchLoadedEvent,
  PatchClearedEvent,
  BlockAddedEvent,
  BlockRemovedEvent,
} from './types';
