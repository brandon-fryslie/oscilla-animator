/**
 * Block Sizing
 *
 * Deterministic block size calculation based on density mode.
 * Layout uses collapsed sizes only - hover expansion is visual overlay.
 *
 * @see design-docs/8-UI-Redesign/5-NewUIRules-2of3.md (Section 1)
 */

import { BLOCK_SIZES } from './constants';
import type { DensityMode, LayoutBlockData } from './types';

/**
 * Block size result.
 */
export interface BlockSize {
  readonly w: number;
  readonly h: number;
  readonly portsVisible: boolean;
}

/**
 * Measure block dimensions for layout.
 *
 * Returns fixed size based on density mode.
 * Ports are only visible in normal and detail modes.
 *
 * @param _block - Block data (unused, reserved for future)
 * @param density - Current density mode
 * @param _focusState - Whether block is focused (unused, reserved for future)
 * @returns Block dimensions and port visibility
 */
export function measureBlock(
  _block: LayoutBlockData,
  density: DensityMode,
  _focusState?: { isFocused: boolean }
): BlockSize {
  const { w, h } = BLOCK_SIZES[density];

  // Ports visible in normal and detail modes
  const portsVisible = density !== 'overview';

  return { w, h, portsVisible };
}
