/**
 * Debug Blocks
 *
 * Blocks for debugging and inspecting values at runtime.
 * These display their input values on a canvas overlay for real-time monitoring.
 */

import { createBlock } from './factory';
import { input, output } from './utils';
import { slotTypeToTypeDesc } from '../ir/types/typeConversion';

/**
 * DebugDisplay - Shows input values on a canvas overlay.
 *
 * Accepts multiple input types and displays them in real-time.
 * Useful for understanding what values are flowing through the patch.
 */
export const DebugDisplay = createBlock({
  type: 'DebugDisplay',
  label: 'Debug Display',
  description: 'Display input values on canvas overlay for debugging',
  subcategory: 'Other',
  inputs: [
    input('signal', 'Signal Value', slotTypeToTypeDesc('Signal<float>'), {
      tier: 'primary',
      defaultSource: { value: 0, world: 'signal', uiHint: { kind: 'number' } },
    }),
    input('phase', 'Phase Value', slotTypeToTypeDesc('Signal<phase>'), {
      tier: 'secondary',
      defaultSource: { value: 0, world: 'signal', uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    }),
    input('domain', 'Domain', slotTypeToTypeDesc('Domain'), {
      tier: 'secondary',
    }),
    input('field', 'Field Value', slotTypeToTypeDesc('Field<float>'), {
      tier: 'secondary',
    }),
  ],
  outputs: [
    output('debug', 'Debug Info', slotTypeToTypeDesc('RenderTree')),
  ],
  defaultParams: {
    label: '',  // Empty = auto-generate from block ID
    posX: 0,    // 0 = auto-position
    posY: 0,    // 0 = auto-position
  },
  color: '#F59E0B', // Amber - stands out for debugging
  priority: 200, // High priority so it's easy to find
});
