/**
 * Binding Write Facade
 *
 * Provides unified mutation operations for all binding types (wire/publisher/listener).
 * This is the ONLY place that should branch on binding kind for write operations.
 */

import type { RootStore } from '../stores/RootStore';
import type { BindingRef } from './types';

/**
 * Disconnect a binding (wire, publisher, or listener).
 * Delegates to the appropriate store method based on binding kind.
 */
export function disconnectBinding(root: RootStore, ref: BindingRef): void {
  if (ref.kind === 'wire') {
    root.patchStore.disconnect(ref.id);
  } else if (ref.kind === 'publisher') {
    root.busStore.removePublisher(ref.id);
  } else {
    // listener
    root.busStore.removeListener(ref.id);
  }
}

/**
 * Set the enabled state of a binding (wire, publisher, or listener).
 * Delegates to the appropriate store method based on binding kind.
 */
export function setBindingEnabled(
  root: RootStore,
  ref: BindingRef,
  enabled: boolean
): void {
  if (ref.kind === 'wire') {
    root.patchStore.updateConnection(ref.id, { enabled });
  } else if (ref.kind === 'publisher') {
    root.busStore.updatePublisher(ref.id, { enabled });
  } else {
    // listener
    root.busStore.updateListener(ref.id, { enabled });
  }
}
