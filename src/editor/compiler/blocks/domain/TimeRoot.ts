/**
 * TimeRoot Block Compilers
 *
 * Define the time topology for a patch. Every patch needs exactly one TimeRoot.
 * These blocks produce the primary time signals that other blocks consume.
 */

import type {
  BlockCompiler,
  RuntimeCtx,
  CompiledOutputs,
  AutoPublication,
  TimeModel,
} from '../../types';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

type SignalNumber = (tMs: number, ctx: RuntimeCtx) => number;
type Event = (tMs: number, lastTMs: number, ctx: RuntimeCtx) => boolean;

/**
 * Helper to extract auto-publications from a TimeRoot compilation.
 * This is used by the main compiler to inject system bus publishers.
 */
export function extractTimeRootAutoPublications(
  blockType: string,
  _artifacts: CompiledOutputs
): AutoPublication[] {
  switch (blockType) {
    case 'CycleTimeRoot':
      return [
        { busName: 'phaseA', artifactKey: 'phase', sortKey: 0 },
        { busName: 'pulse', artifactKey: 'wrap', sortKey: 0 },
        { busName: 'energy', artifactKey: 'energy', sortKey: 0 },
      ];

    case 'FiniteTimeRoot':
      // FiniteTimeRoot does NOT publish to phaseA - only CycleTimeRoot owns that bus
      return [
        { busName: 'progress', artifactKey: 'progress', sortKey: 0 },
        { busName: 'pulse', artifactKey: 'end', sortKey: 0 },
        { busName: 'energy', artifactKey: 'energy', sortKey: 0 },
      ];

    case 'InfiniteTimeRoot':
      // InfiniteTimeRoot does NOT publish to phaseA - only CycleTimeRoot owns that bus
      // It has ambient phase but that's not the primary coordinating phase
      return [
        { busName: 'pulse', artifactKey: 'pulse', sortKey: 0 },
        { busName: 'energy', artifactKey: 'energy', sortKey: 0 },
      ];

    default:
      return [];
  }
}

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

/**
 * Lower FiniteTimeRoot block to IR.
 *
 * Uses canonical time signals from IRBuilder:
 * - sigTimeAbsMs() for systemTime
 * - sigTimeModelMs() for progress calculation
 * - sigPhase01() for phase (same as progress for finite)
 * - sigWrapEvent() for end event
 */
const lowerFiniteTimeRoot: BlockLowerFn = ({ ctx, config }) => {
  const configData = (config as any) || {};
  const durationMs = Number(configData.durationMs);

  // Canonical time signals from TimeModel
  const systemTimeId = ctx.b.sigTimeAbsMs();
  const progressId = ctx.b.sigTimeModelMs(); // Will be scaled by TimeModel
  const phaseId = ctx.b.sigPhase01();
  const endId = ctx.b.sigWrapEvent();

  // Energy: constant 1.0 (simplified - runtime handles completion)
  const energyId = ctx.b.sigConst(1.0, { world: 'signal', domain: 'number' });

  // Declare TimeModel
  const timeModel: TimeModel = {
    kind: 'finite',
    durationMs,
  };

  return {
    outputs: [
      { k: 'sig', id: systemTimeId, slot: ctx.b.allocValueSlot() },  // systemTime
      { k: 'sig', id: progressId, slot: ctx.b.allocValueSlot() },     // progress
      { k: 'sig', id: phaseId, slot: ctx.b.allocValueSlot() },        // phase
      { k: 'sig', id: endId, slot: ctx.b.allocValueSlot() },          // end
      { k: 'sig', id: energyId, slot: ctx.b.allocValueSlot() },       // energy
    ],
    declares: { timeModel },
  };
};

/**
 * Lower CycleTimeRoot block to IR.
 *
 * Uses canonical time signals:
 * - sigTimeAbsMs() for systemTime
 * - sigTimeModelMs() for cycleT
 * - sigPhase01() for phase
 * - sigWrapEvent() for wrap
 */
const lowerCycleTimeRoot: BlockLowerFn = ({ ctx, config }) => {
  const configData = (config as any) || {};
  const periodMs = Number(configData.periodMs);
  const mode = String(configData.mode);

  // Canonical time signals from TimeModel
  const systemTimeId = ctx.b.sigTimeAbsMs();
  const cycleTId = ctx.b.sigTimeModelMs(); // Modulo by period
  const phaseId = ctx.b.sigPhase01();
  const wrapId = ctx.b.sigWrapEvent();

  // Cycle index: floor(systemTime / period)
  const periodConst = ctx.b.sigConst(periodMs, { world: 'signal', domain: 'number' });
  const cyclesId = ctx.b.sigZip(systemTimeId, periodConst, {
    fnId: 'div',
    opcode: 102, // OpCode.Div
    outputType: { world: 'signal', domain: 'number' },
  });
  const cycleIndexId = ctx.b.sigMap(cyclesId, {
    fnId: 'floor',
    opcode: 121, // OpCode.Floor
    outputType: { world: 'signal', domain: 'number' },
  });

  // Energy: constant 1.0
  const energyId = ctx.b.sigConst(1.0, { world: 'signal', domain: 'number' });

  // Declare TimeModel
  const timeModel: TimeModel = {
    kind: 'cyclic',
    periodMs,
    phaseDomain: '0..1',
    mode: mode === 'pingpong' ? 'pingpong' : 'loop',
  };

  return {
    outputs: [
      { k: 'sig', id: systemTimeId, slot: ctx.b.allocValueSlot() },  // systemTime
      { k: 'sig', id: cycleTId, slot: ctx.b.allocValueSlot() },      // cycleT
      { k: 'sig', id: phaseId, slot: ctx.b.allocValueSlot() },       // phase
      { k: 'sig', id: wrapId, slot: ctx.b.allocValueSlot() },        // wrap
      { k: 'sig', id: cycleIndexId, slot: ctx.b.allocValueSlot() },  // cycleIndex
      { k: 'sig', id: energyId, slot: ctx.b.allocValueSlot() },      // energy
    ],
    declares: { timeModel },
  };
};

/**
 * Lower InfiniteTimeRoot block to IR.
 *
 * Uses canonical time signals:
 * - sigTimeAbsMs() for systemTime
 * - sigPhase01() for ambient phase
 * - sigWrapEvent() for pulse
 */
const lowerInfiniteTimeRoot: BlockLowerFn = ({ ctx, config }) => {
  const configData = (config as any) || {};
  const periodMs = Number(configData.periodMs);

  // Canonical time signals from TimeModel
  const systemTimeId = ctx.b.sigTimeAbsMs();
  const phaseId = ctx.b.sigPhase01();
  const pulseId = ctx.b.sigWrapEvent();

  // Energy: constant 1.0
  const energyId = ctx.b.sigConst(1.0, { world: 'signal', domain: 'number' });

  // Declare TimeModel
  const timeModel: TimeModel = {
    kind: 'infinite',
    windowMs: periodMs,
  };

  return {
    outputs: [
      { k: 'sig', id: systemTimeId, slot: ctx.b.allocValueSlot() },  // systemTime
      { k: 'sig', id: phaseId, slot: ctx.b.allocValueSlot() },       // phase
      { k: 'sig', id: pulseId, slot: ctx.b.allocValueSlot() },       // pulse
      { k: 'sig', id: energyId, slot: ctx.b.allocValueSlot() },      // energy
    ],
    declares: { timeModel },
  };
};

// Register block types
registerBlockType({
  type: 'FiniteTimeRoot',
  capability: 'time',
  inputs: [],
  outputs: [
    { portId: 'systemTime', label: 'System Time', dir: 'out', type: { world: 'signal', domain: 'timeMs' } },
    { portId: 'progress', label: 'Progress', dir: 'out', type: { world: 'signal', domain: 'number' } },
    { portId: 'phase', label: 'Phase', dir: 'out', type: { world: 'signal', domain: 'phase01' } },
    // end is event<trigger>, NOT signal - discrete event when animation completes
    { portId: 'end', label: 'End', dir: 'out', type: { world: 'event', domain: 'trigger' } },
    { portId: 'energy', label: 'Energy', dir: 'out', type: { world: 'signal', domain: 'number' } },
  ],
  lower: lowerFiniteTimeRoot,
});

registerBlockType({
  type: 'CycleTimeRoot',
  capability: 'time',
  inputs: [],
  outputs: [
    { portId: 'systemTime', label: 'System Time', dir: 'out', type: { world: 'signal', domain: 'timeMs' } },
    { portId: 'cycleT', label: 'Cycle T', dir: 'out', type: { world: 'signal', domain: 'timeMs' } },
    { portId: 'phase', label: 'Phase', dir: 'out', type: { world: 'signal', domain: 'phase01' } },
    // wrap is event<trigger>, NOT signal - discrete event on cycle boundary
    { portId: 'wrap', label: 'Wrap', dir: 'out', type: { world: 'event', domain: 'trigger' } },
    { portId: 'cycleIndex', label: 'Cycle Index', dir: 'out', type: { world: 'signal', domain: 'number' } },
    { portId: 'energy', label: 'Energy', dir: 'out', type: { world: 'signal', domain: 'number' } },
  ],
  lower: lowerCycleTimeRoot,
});

registerBlockType({
  type: 'InfiniteTimeRoot',
  capability: 'time',
  inputs: [],
  outputs: [
    { portId: 'systemTime', label: 'System Time', dir: 'out', type: { world: 'signal', domain: 'timeMs' } },
    { portId: 'phase', label: 'Phase', dir: 'out', type: { world: 'signal', domain: 'phase01' } },
    // pulse is event<trigger>, NOT signal - discrete event on cycle boundary
    { portId: 'pulse', label: 'Pulse', dir: 'out', type: { world: 'event', domain: 'trigger' } },
    { portId: 'energy', label: 'Energy', dir: 'out', type: { world: 'signal', domain: 'number' } },
  ],
  lower: lowerInfiniteTimeRoot,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

/**
 * FiniteTimeRoot - Finite performance with known duration.
 *
 * Outputs:
 * - systemTime: Monotonic time in milliseconds
 * - progress: 0..1 clamped (reaches 1 at durationMs and stays there)
 * - end: Event that fires once when progress reaches 1
 * - energy: Constant 1.0 while animating, 0 when complete
 */
export const FiniteTimeRootBlock: BlockCompiler = {
  type: 'FiniteTimeRoot',

  inputs: [
    { name: 'durationMs', type: { kind: 'Signal:number' }, required: false },
  ],

  outputs: [
    { name: 'systemTime', type: { kind: 'Signal:Time' } },
    { name: 'progress', type: { kind: 'Signal:number' } },
    { name: 'phase', type: { kind: 'Signal:phase' } },
    { name: 'end', type: { kind: 'Event' } },
    { name: 'energy', type: { kind: 'Signal:number' } },
  ],

  compile({ inputs }): CompiledOutputs {
    // Read from inputs - values come from defaultSource or explicit connections
    // For Signal artifacts, .value is a function - call it at t=0 to get the current value
    const durationArtifact = inputs.durationMs as any;
    const durationMs = typeof durationArtifact?.value === 'function'
      ? Number(durationArtifact.value(0, { viewport: { w: 0, h: 0, dpr: 1 } }))
      : Number(durationArtifact?.value);

    // System time is identity (tMs passed in is the raw time)
    const systemTime: SignalNumber = (tMs) => tMs;

    // Progress clamps at 1 after duration
    const progress: SignalNumber = (tMs) => {
      if (tMs <= 0) return 0;
      if (tMs >= durationMs) return 1;
      return tMs / durationMs;
    };

    // Phase is same as progress for FiniteTimeRoot (0..1 clamped)
    const phase: SignalNumber = (tMs) => {
      if (tMs <= 0) return 0;
      if (tMs >= durationMs) return 1;
      return tMs / durationMs;
    };

    // End event fires exactly once when progress reaches 1
    const end: Event = (tMs, lastTMs) => {
      const currProgress = Math.min(tMs / durationMs, 1);
      const lastProgress = Math.min(lastTMs / durationMs, 1);
      return currProgress >= 1 && lastProgress < 1;
    };

    // Energy is 1.0 while animating, 0 when complete
    const energy: SignalNumber = (tMs) => {
      return tMs < durationMs ? 1.0 : 0.0;
    };

    return {
      systemTime: { kind: 'Signal:Time', value: systemTime },
      progress: { kind: 'Signal:number', value: progress },
      phase: { kind: 'Signal:phase', value: phase },
      end: { kind: 'Event', value: end },
      energy: { kind: 'Signal:number', value: energy },
    };
  },
};

/**
 * CycleTimeRoot - Looping primary cycle.
 *
 * Outputs:
 * - systemTime: Monotonic time in milliseconds
 * - cycleT: Time within current cycle (0..period or pingpong)
 * - phase: 0..1 wrapped at period (sawtooth or triangle wave)
 * - wrap: Event that fires on cycle boundary or direction change
 * - cycleIndex: Number of completed cycles
 * - energy: Constant 1.0 baseline
 */
export const CycleTimeRootBlock: BlockCompiler = {
  type: 'CycleTimeRoot',

  inputs: [
    { name: 'periodMs', type: { kind: 'Signal:number' }, required: false },
    { name: 'mode', type: { kind: 'Scalar:string' }, required: false },
  ],

  outputs: [
    { name: 'systemTime', type: { kind: 'Signal:Time' } },
    { name: 'cycleT', type: { kind: 'Signal:Time' } },
    { name: 'phase', type: { kind: 'Signal:phase' } },
    { name: 'wrap', type: { kind: 'Event' } },
    { name: 'cycleIndex', type: { kind: 'Signal:number' } },
    { name: 'energy', type: { kind: 'Signal:number' } },
  ],

  compile({ inputs }): CompiledOutputs {
    // Read from inputs - values come from defaultSource or explicit connections
    // For Signal artifacts, .value is a function - call it at t=0 to get the current value
    const periodArtifact = inputs.periodMs as any;
    const periodMs = typeof periodArtifact?.value === 'function'
      ? Number(periodArtifact.value(0, { viewport: { w: 0, h: 0, dpr: 1 } }))
      : Number(periodArtifact?.value);
    const modeArtifact = inputs.mode as any;
    const mode = typeof modeArtifact?.value === 'function'
      ? String(modeArtifact.value(0, { viewport: { w: 0, h: 0, dpr: 1 } }))
      : String(modeArtifact?.value);

    // System time is identity
    const systemTime: SignalNumber = (tMs) => tMs;

    // Phase wraps at period
    const phase: SignalNumber = (tMs) => {
      if (tMs < 0) return 0;

      const cycles = tMs / periodMs;
      const phaseValue = cycles - Math.floor(cycles); // 0..1

      if (mode === 'pingpong') {
        // Triangle wave: 0→1→0→1...
        const cycleNum = Math.floor(cycles);
        return (cycleNum % 2 === 0) ? phaseValue : (1 - phaseValue);
      }

      // Default loop: sawtooth wave
      return phaseValue;
    };

    // Time within current cycle
    const cycleT: SignalNumber = (tMs) => {
      if (tMs < 0) return 0;
      return tMs % periodMs;
    };

    // Cycle index: number of completed cycles
    const cycleIndex: SignalNumber = (tMs) => {
      if (tMs < 0) return 0;
      return Math.floor(tMs / periodMs);
    };

    // Wrap event: fires on cycle boundary (loop) or direction change (pingpong)
    const wrap: Event = (tMs, lastTMs) => {
      if (tMs < 0 || lastTMs < 0) return false;

      const currCycle = Math.floor(tMs / periodMs);
      const lastCycle = Math.floor(lastTMs / periodMs);

      if (mode === 'pingpong') {
        // Wrap on direction change (even/odd cycle boundary)
        return currCycle !== lastCycle;
      }

      // Wrap on cycle boundary (sawtooth)
      return currCycle > lastCycle;
    };

    // Energy is constant 1.0 baseline (steady loops)
    const energy: SignalNumber = (_tMs) => 1.0;

    return {
      systemTime: { kind: 'Signal:Time', value: systemTime },
      cycleT: { kind: 'Signal:Time', value: cycleT },
      phase: { kind: 'Signal:phase', value: phase },
      wrap: { kind: 'Event', value: wrap },
      cycleIndex: { kind: 'Signal:number', value: cycleIndex },
      energy: { kind: 'Signal:number', value: energy },
    };
  },
};

/**
 * InfiniteTimeRoot - Ambient, unbounded time (no primary cycle).
 *
 * Outputs:
 * - systemTime: Monotonic time in milliseconds
 * - energy: Constant 1.0 for ambient content
 */
export const InfiniteTimeRootBlock: BlockCompiler = {
  type: 'InfiniteTimeRoot',

  inputs: [
    { name: 'windowMs', type: { kind: 'Signal:number' }, required: false },
    { name: 'periodMs', type: { kind: 'Signal:number' }, required: false },
  ],

  outputs: [
    { name: 'systemTime', type: { kind: 'Signal:Time' } },
    { name: 'phase', type: { kind: 'Signal:phase' } },
    { name: 'pulse', type: { kind: 'Event' } },
    { name: 'energy', type: { kind: 'Signal:number' } },
  ],

  compile({ inputs }): CompiledOutputs {
    // Read from inputs - values come from defaultSource or explicit connections
    // For Signal artifacts, .value is a function - call it at t=0 to get the current value
    const periodArtifact = inputs.periodMs as any;
    const periodMs = typeof periodArtifact?.value === 'function'
      ? Number(periodArtifact.value(0, { viewport: { w: 0, h: 0, dpr: 1 } }))
      : Number(periodArtifact?.value);

    // System time is identity - just passes through the raw time
    const systemTime: SignalNumber = (tMs) => tMs;

    // Ambient phase: simple 0..1 loop based on periodMs
    const phase: SignalNumber = (tMs) => {
      if (tMs < 0) return 0;
      const cycles = tMs / periodMs;
      return cycles - Math.floor(cycles);
    };

    // Ambient pulse: fires on cycle boundary
    const pulse: Event = (tMs, lastTMs) => {
      if (tMs < 0 || lastTMs < 0) return false;
      const currCycle = Math.floor(tMs / periodMs);
      const lastCycle = Math.floor(lastTMs / periodMs);
      return currCycle > lastCycle;
    };

    // Energy is constant 1.0 for ambient content
    const energy: SignalNumber = (_tMs) => 1.0;

    return {
      systemTime: { kind: 'Signal:Time', value: systemTime },
      phase: { kind: 'Signal:phase', value: phase },
      pulse: { kind: 'Event', value: pulse },
      energy: { kind: 'Signal:number', value: energy },
    };
  },
};
