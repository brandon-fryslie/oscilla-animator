/**
 * BusPicker Component
 *
 * @deprecated This component is deprecated as part of the bus system refactoring.
 * The Publisher/Listener system has been removed in favor of BusBlocks.
 * Bus connections are now made through standard block connections in the patch bay.
 *
 * Sprint: Phase 0 - Bus System Deprecation
 */

import type { PortRef } from './types';

interface BusPickerProps {
  isOpen: boolean;
  onClose: () => void;
  portRef: PortRef;
  position: { x: number; y: number };
}

/**
 * Deprecated bus picker component.
 * Renders a deprecation notice instead of the bus picker UI.
 */
export function BusPicker(_props: BusPickerProps): null {
  // Component is deprecated and non-functional
  // Bus connections are now made through standard block connections
  console.warn('[BusPicker] This component is deprecated. Use BusBlock connections instead.');
  return null;
}
