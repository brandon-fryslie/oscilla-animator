/**
 * @file Default Source Provider Blocks
 * @description Hidden blocks that provide default values for undriven inputs.
 *
 * These blocks are:
 * - Tagged as hidden (never shown in palette or PatchBay)
 * - Injected at compile-time by the compiler for undriven inputs
 * - Simple pass-throughs with editable 'value' input
 *
 * Sprint 4: Implements DSConstSignalFloat as reference implementation.
 * Sprint 5: Will add remaining 8 const provider blocks.
 */

import { createBlock } from './factory';
import { input, output } from './utils';

/**
 * DSConstSignalFloat - Constant provider for Signal<float> inputs
 *
 * This block:
 * - Has one input: 'value' (Signal<float>, with defaultSource for editability)
 * - Has one output: 'out' (Signal<float>)
 * - Acts as pure pass-through: out = value
 * - Tagged as hidden: never appears in UI palette
 * - Tagged with role: 'defaultSourceProvider' for filtering
 *
 * Example usage (automatic at compile-time):
 * - Circle block has 'radius' input with Signal<float> type
 * - User doesn't wire anything to radius
 * - Compiler injects DSConstSignalFloat provider
 * - Provider 'value' input gets default value from Circle's defaultSource metadata
 * - Provider 'out' feeds Circle's 'radius' input
 */
export const DSConstSignalFloat = createBlock({
  type: 'DSConstSignalFloat',
  label: 'Constant (Signal<float>)',
  description: 'Hidden provider block for Signal<float> default sources',
  capability: 'pure',
  compileKind: 'operator',

  inputs: [
    input('value', 'Value', 'Signal<float>', {
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'signal',
        uiHint: { kind: 'slider', min: -100, max: 100, step: 0.1 },
      },
    }),
  ],

  outputs: [
    output('out', 'Output', 'Signal<float>'),
  ],

  tags: {
    role: 'defaultSourceProvider',
    hidden: true,
  },

  // Visual appearance (not used since hidden, but required by schema)
  color: '#6B7280', // Gray - indicates system/internal block
  priority: 1000, // Low priority - should never appear in normal lists
});
