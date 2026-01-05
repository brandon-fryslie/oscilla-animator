/**
 * Print Block Compiler
 *
 * Simple debug block that logs input value to console.
 * Passes through the input value so it can be chained.
 * Throttled to ~3 updates per second to avoid spam.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { createTypeDescCompat } from '../../ir/types';

// =============================================================================
// IR Lowering
// =============================================================================

const lowerPrint: BlockLowerFn = ({ ctx }) => {
  throw new Error(
    `Print block (${ctx.instanceId}) cannot be lowered to IR.\n` +
    `Reason: Print has side-effects (console.log) that don't fit the pure IR model.\n` +
    `Remove this block or replace it with an IR-supported debug tool.`
  );
};

registerBlockType({
  type: 'Print',
  capability: 'io',
  inputs: [
    { portId: 'value', label: 'Value', dir: 'in', type: createTypeDescCompat('signal', 'float') },
  ],
  outputs: [
    { portId: 'out', label: 'Output', dir: 'out', type: createTypeDescCompat('signal', 'float') },
  ],
  lower: lowerPrint,
});
