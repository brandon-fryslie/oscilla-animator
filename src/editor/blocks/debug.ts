/**
 * Debug Blocks
 *
 * Blocks for debugging and inspecting values at runtime.
 * These display their input values on a canvas overlay for real-time monitoring.
 */

import { createBlock } from './factory';
import { input, output } from './utils';

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
    input('signal', 'Signal Value', 'Signal<number>', {
      tier: 'primary',
      defaultSource: { value: 0, world: 'signal', uiHint: { kind: 'number' } },
    }),
    input('phase', 'Phase Value', 'Signal<phase>', {
      tier: 'secondary',
      defaultSource: { value: 0, world: 'signal', uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    }),
    input('domain', 'Domain', 'Domain', {
      tier: 'secondary',
    }),
    input('field', 'Field Value', 'Field<number>', {
      tier: 'secondary',
    }),
  ],
  outputs: [
    output('debug', 'Debug Info', 'RenderTree'),
  ],
  paramSchema: [
    {
      key: 'label',
      label: 'Label (auto if empty)',
      type: 'string',
      defaultValue: '',  // Empty = auto-generate from block ID
    },
    {
      key: 'posX',
      label: 'X Position (auto if 0)',
      type: 'number',
      min: 0,
      max: 1000,
      defaultValue: 0,  // 0 = auto-position
    },
    {
      key: 'posY',
      label: 'Y Position (auto if 0)',
      type: 'number',
      min: 0,
      max: 1000,
      defaultValue: 0,  // 0 = auto-position
    },
  ],
  color: '#F59E0B', // Amber - stands out for debugging
  laneKind: 'Program',
  priority: 200, // High priority so it's easy to find
});
