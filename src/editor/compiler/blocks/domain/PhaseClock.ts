/**
 * PhaseClock Block Compiler
 *
 * Derived clock that transforms upstream time into phase [0,1].
 * Requires a time input from a TimeRoot.
 *
 * Outputs:
 * - phase: Signal<phase> in [0,1] based on mode (loop/once/pingpong)
 * - u: Signal<unit> clamped [0,1] progress for envelopes
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';
import { OpCode } from '../../ir/opcodes';

type SignalNumber = (tMs: number, ctx: RuntimeCtx) => number;

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

/**
 * Lower PhaseClock block to IR.
 *
 * Takes upstream time signal and transforms it into phase [0,1] based on mode:
 * - loop: sawtooth wave (wraps at period)
 * - once: clamped ramp (0..1, then stays at 1)
 * - pingpong: triangle wave (0..1..0..1)
 *
 * This is a PURE block - no state needed for phase calculation.
 */
const lowerPhaseClock: BlockLowerFn = ({ ctx, inputs, config }) => {
  const tIn = inputs[0]; // Signal:Time input

  if (tIn.k !== 'sig') {
    throw new Error(`PhaseClock: expected sig input for tIn, got ${tIn.k}`);
  }

  const configData = (config as any) || {};
  const periodSec = Number(configData.period);
  const mode = String(configData.mode);

  if (periodSec <= 0) {
    throw new Error('PhaseClock: period must be > 0');
  }

  const periodMs = periodSec * 1000;

  const numberType = { world: 'signal' as const, domain: 'number' as const };
  const phaseType = { world: 'signal' as const, domain: 'phase01' as const };

  // Calculate raw phase: t / period
  const periodConst = ctx.b.sigConst(periodMs, numberType);
  const rawPhaseId = ctx.b.sigZip(tIn.id, periodConst, {
    fnId: 'div',
    opcode: OpCode.Div,
    outputType: numberType,
  });

  let phaseId: number;
  let uId: number;

  if (mode === 'once') {
    // Phase = clamp(t / period, 0, 1)
    const zeroConst = ctx.b.sigConst(0, numberType);
    const oneConst = ctx.b.sigConst(1, numberType);
    phaseId = ctx.b.sigZip(
      rawPhaseId,
      ctx.b.sigZip(zeroConst, oneConst, {
        fnId: 'clamp',
        opcode: OpCode.Clamp,
        outputType: phaseType,
      }),
      {
        fnId: 'clamp',
        opcode: OpCode.Clamp,
        outputType: phaseType,
      }
    );

    // For once mode, u is same as phase
    uId = phaseId;
  } else if (mode === 'pingpong') {
    // Pingpong: triangle wave
    // phase = abs((raw % 2) - 1)
    // This creates: 0→1→0→1...
    const twoConst = ctx.b.sigConst(2, numberType);
    const modTwoId = ctx.b.sigZip(rawPhaseId, twoConst, {
      fnId: 'mod',
      opcode: OpCode.Mod,
      outputType: numberType,
    });

    const oneConst = ctx.b.sigConst(1, numberType);
    const minus1Id = ctx.b.sigZip(modTwoId, oneConst, {
      fnId: 'sub',
      opcode: OpCode.Sub,
      outputType: numberType,
    });

    phaseId = ctx.b.sigMap(minus1Id, {
      fnId: 'abs',
      opcode: OpCode.Abs,
      outputType: phaseType,
    });

    // For pingpong, u is the same as phase (wraps 0→1→0→1)
    uId = phaseId;
  } else {
    // Loop mode: sawtooth wave
    // phase = fract(raw) = raw - floor(raw)
    const floorId = ctx.b.sigMap(rawPhaseId, {
      fnId: 'floor',
      opcode: OpCode.Floor,
      outputType: numberType,
    });

    phaseId = ctx.b.sigZip(rawPhaseId, floorId, {
      fnId: 'sub',
      opcode: OpCode.Sub,
      outputType: phaseType,
    });

    // For loop mode, u is same as phase
    uId = phaseId;
  }

  return {
    outputs: [
      { k: 'sig', id: phaseId, slot: ctx.b.allocValueSlot() }, // phase
      { k: 'sig', id: uId, slot: ctx.b.allocValueSlot() },     // u
    ],
  };
};

// Register block type
registerBlockType({
  type: 'PhaseClock',
  capability: 'pure',
  inputs: [
    {
      portId: 'tIn',
      label: 'Time In',
      dir: 'in',
      type: { world: 'signal', domain: 'timeMs' },
    },
  ],
  outputs: [
    {
      portId: 'phase',
      label: 'Phase',
      dir: 'out',
      type: { world: 'signal', domain: 'phase01' },
    },
    {
      portId: 'u',
      label: 'U',
      dir: 'out',
      type: { world: 'signal', domain: 'number' },
    },
  ],
  lower: lowerPhaseClock,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const PhaseClockBlock: BlockCompiler = {
  type: 'PhaseClock',

  inputs: [
    { name: 'tIn', type: { kind: 'Signal:Time' }, required: true },
    { name: 'period', type: { kind: 'Scalar:number' }, required: false },
    { name: 'mode', type: { kind: 'Scalar:string' }, required: false },
  ],

  outputs: [
    { name: 'phase', type: { kind: 'Signal:phase' } },
    { name: 'u', type: { kind: 'Signal:Unit' } },
  ],

  compile({ inputs }) {
    // Validate required input
    const tInArtifact = inputs.tIn;
    if (!isDefined(tInArtifact)) {
      return {
        phase: { kind: 'Error', message: 'PhaseClock requires a tIn input' },
        u: { kind: 'Error', message: 'PhaseClock requires a tIn input' },
      };
    }
    if (tInArtifact.kind !== 'Signal:Time') {
      return {
        phase: { kind: 'Error', message: `PhaseClock requires Signal<Time> tIn input, got ${tInArtifact.kind}` },
        u: { kind: 'Error', message: `PhaseClock requires Signal<Time> tIn input, got ${tInArtifact.kind}` },
      };
    }

    // Read from inputs - values come from defaultSource or explicit connections
    const periodSec = Number((inputs.period as any)?.value);
    const mode = String((inputs.mode as any)?.value);

    if (periodSec <= 0) {
      return {
        phase: { kind: 'Error', message: 'PhaseClock: period must be > 0' },
        u: { kind: 'Error', message: 'PhaseClock: period must be > 0' },
      };
    }

    const periodMs = periodSec * 1000;
    const tInSignal = tInArtifact.value as SignalNumber;

    // Compute phase from upstream time
    const phaseSignal: SignalNumber = (tMs, ctx) => {
      const t = tInSignal(tMs, ctx); // get unbounded time from upstream
      const raw = t / periodMs; // raw phase (unbounded)

      switch (mode) {
        case 'once':
          return Math.max(0, Math.min(1, raw));

        case 'pingpong': {
          const p = raw;
          const q = ((p % 2) + 2) % 2; // handle negatives correctly
          return q < 1 ? q : 2 - q;
        }

        case 'loop':
        default:
          return ((raw % 1) + 1) % 1; // handle negatives correctly
      }
    };

    // u output: clamped [0,1] for all modes
    // For loop mode: same as phase
    // For once mode: same as phase (already clamped)
    // For pingpong: we track absolute progress, clamped
    const uSignal: SignalNumber = (tMs, ctx) => {
      const t = tInSignal(tMs, ctx);
      const raw = t / periodMs;

      switch (mode) {
        case 'once':
          // u is clamped linear progress
          return Math.max(0, Math.min(1, raw));

        case 'pingpong': {
          // u tracks the absolute position within one forward-back cycle
          // A full pingpong cycle is 2 periods
          const fullCycleProgress = raw / 2; // [0,0.5,1] for a complete forward-back
          const clamped = Math.max(0, Math.min(1, fullCycleProgress));
          // Wrap to [0,1] range
          return ((clamped % 1) + 1) % 1;
        }

        case 'loop':
        default:
          // u equals phase for loop mode
          return ((raw % 1) + 1) % 1;
      }
    };

    return {
      phase: { kind: 'Signal:phase', value: phaseSignal },
      u: { kind: 'Signal:Unit', value: uSignal },
    };
  },
};
