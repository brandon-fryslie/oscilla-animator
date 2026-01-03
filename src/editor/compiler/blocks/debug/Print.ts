/**
 * Print Block Compiler
 *
 * Simple debug block that logs input value to console.
 * Passes through the input value so it can be chained.
 * Throttled to ~3 updates per second to avoid spam.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

type Signal<A> = (t: number, ctx: RuntimeCtx) => A;

// Throttle to ~3x per second
const THROTTLE_MS = 333;
const lastPrintTime = new Map<string, number>();

// =============================================================================
// IR Lowering
// =============================================================================

const lowerPrint: BlockLowerFn = ({ ctx }) => {
  throw new Error(
    `Print block (${ctx.instanceId}) cannot be lowered to IR.\n` +
    `Reason: Print has side-effects (console.log) that don't fit the pure IR model.\n` +
    `This block uses the legacy closure compiler.`
  );
};

registerBlockType({
  type: 'Print',
  capability: 'io',
  inputs: [
    { portId: 'value', label: 'Value', dir: 'in', type: { world: 'signal', domain: 'number' } },
  ],
  outputs: [
    { portId: 'out', label: 'Output', dir: 'out', type: { world: 'signal', domain: 'number' } },
  ],
  lower: lowerPrint,
});

// =============================================================================
// Legacy Closure Compiler
// =============================================================================

export const PrintBlock: BlockCompiler = {
  type: 'Print',

  inputs: [
    { name: 'value', type: { kind: 'Signal:number' }, required: false },
    { name: 'label', type: { kind: 'Scalar:string' }, required: false },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Signal:number' } },
  ],

  compile({ id, inputs }) {
    // Get input signal
    const valueArtifact = inputs.value;
    let inputFn: Signal<number>;

    if (valueArtifact === undefined) {
      inputFn = () => 0;
    } else if (valueArtifact.kind === 'Signal:number' || valueArtifact.kind === 'Signal:phase') {
      inputFn = valueArtifact.value as Signal<number>;
    } else if (valueArtifact.kind === 'Scalar:number') {
      const constVal = valueArtifact.value as number;
      inputFn = () => constVal;
    } else {
      inputFn = () => 0;
    }

    // Get label
    const labelArtifact = inputs.label;
    const label = labelArtifact !== undefined
      ? String((labelArtifact as { value?: unknown }).value ?? 'value')
      : 'value';

    // Create passthrough signal that logs when evaluated
    const outputFn: Signal<number> = (t: number, ctx: RuntimeCtx): number => {
      const value = inputFn(t, ctx);

      // Throttle console output
      const lastTime = lastPrintTime.get(id) ?? 0;
      if (t - lastTime >= THROTTLE_MS) {
        lastPrintTime.set(id, t);
        console.log(`[Print:${label}]`, value);
      }

      return value;
    };

    return {
      out: { kind: 'Signal:number', value: outputFn },
    };
  },
};
