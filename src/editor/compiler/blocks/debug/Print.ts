/**
 * Print Block Compiler
 *
 * Simple debug block that logs input value to console.
 * Passes through the input value so it can be chained.
 * Throttled to ~3 updates per second to avoid spam.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { createTypeDesc } from '../../../editor/ir/types/TypeDesc';

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
    { portId: 'value', label: 'Value', dir: 'in', type: createTypeDesc({ world: 'signal', domain: 'float' }) },
  ],
  outputs: [
    { portId: 'out', label: 'Output', dir: 'out', type: createTypeDesc({ world: 'signal', domain: 'float' }) },
  ],
  lower: lowerPrint,
});

// =============================================================================
// Legacy Closure Compiler
// =============================================================================

export const PrintBlock: BlockCompiler = {
  type: 'Print',

  inputs: [
    { name: 'value', type: { kind: 'Signal:float' }, required: false },
    { name: 'label', type: { kind: 'Scalar:string' }, required: false },
  ],

  outputs: [
    { name: 'out', type: { kind: 'Signal:float' } },
  ],

  compile({ id, inputs }) {
    // Get input signal
    const valueArtifact = inputs.value;
    let inputFn: Signal<number>;

    if (valueArtifact === undefined) {
      inputFn = () => 0;
    } else if (valueArtifact.kind === 'Signal:float' || valueArtifact.kind === 'Signal:phase') {
      inputFn = valueArtifact.value as Signal<number>;
    } else if (valueArtifact.kind === 'Scalar:float') {
      const constVal = valueArtifact.value as number;
      inputFn = () => constVal;
    } else {
      console.warn(`[Print] Unsupported input type: ${valueArtifact.kind}`);
      inputFn = () => 0;
    }

    // Get label (optional)
    const labelArtifact = inputs.label;
    const label =
      labelArtifact !== undefined && labelArtifact.kind === 'Scalar:string'
        ? (labelArtifact.value as string)
        : id;

    // Create throttled print signal
    const printSignal: Signal<number> = (t, ctx) => {
      const value = inputFn(t, ctx);

      const now = Date.now();
      const lastTime = lastPrintTime.get(id) ?? 0;

      if (now - lastTime > THROTTLE_MS) {
        console.log(`[${label}] ${value}`);
        lastPrintTime.set(id, now);
      }

      return value;
    };

    return {
      out: { kind: 'Signal:float', value: printSignal },
    };
  },
};
