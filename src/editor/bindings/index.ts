/**
 * Unified Bindings Module
 *
 * Single abstraction over wire/publisher/listener edge types.
 * Provides unified read and write operations for all binding kinds.
 *
 * This is the ONLY module that should branch on binding kind.
 * All UI components should use these facades instead of directly accessing stores.
 */

// Export all types
export type {
  BindingKind,
  BindingRef,
  EndpointRef,
  NormalizedBinding,
  ResolvedPortEndpoint,
  ResolvedBusEndpoint,
  ResolvedEndpoint,
  ResolvedBinding,
} from './types';

// Export all read operations
export {
  resolveBinding,
  getIncomingBindingForInputPort,
  getOutgoingBindingsForOutputPort,
  getPublishersForBus,
  getListenersForBus,
  isPortPublishingToBus,
  isPortSubscribedToBus,
} from './read';

// Export all write operations
export { disconnectBinding, setBindingEnabled } from './write';
