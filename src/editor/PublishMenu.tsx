/**
 * PublishMenu Component
 *
 * @deprecated This component is deprecated as part of the bus system refactoring.
 * The Publisher/Listener system has been removed in favor of BusBlocks.
 * Bus publications are now made through standard block connections in the patch bay.
 *
 * Sprint: Phase 0 - Bus System Deprecation
 */

import type { PortRef } from './types';

interface PublishMenuProps {
  isOpen: boolean;
  onClose: () => void;
  portRef: PortRef;
  position: { x: number; y: number };
}

/**
 * Deprecated publish menu component.
 * Renders a deprecation notice instead of the publish menu UI.
 */
export function PublishMenu(_props: PublishMenuProps): null {
  // Component is deprecated and non-functional
  // Bus publications are now made through standard block connections
  console.warn('[PublishMenu] This component is deprecated. Use BusBlock connections instead.');
  return null;
}
