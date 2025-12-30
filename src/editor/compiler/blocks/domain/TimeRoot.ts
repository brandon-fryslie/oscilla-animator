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

type SignalNumber = (tMs: number, ctx: RuntimeCtx) => float;
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
    case 'FiniteTimeRoot':
      // NEEDS REVIEW - DEPRECATED: FiniteTimeRoot now publishes phase to phaseA/phaseB.
      return [
        { busName: 'phaseA', artifactKey: 'phase', sortKey: 0 },
        { busName: 'phaseB', artifactKey: 'phase', sortKey: 0 },
        { busName: 'progress', artifactKey: 'progress', sortKey: 0 },
        { busName: 'pulse', artifactKey: 'end', sortKey: 0 },
        { busName: 'energy', artifactKey: 'energy', sortKey: 0 },
      ];

    case 'InfiniteTimeRoot':
      // NEEDS REVIEW - DEPRECATED: phaseB mirrors phase (no dedicated secondary phase yet).
      return [
        { busName: 'phaseA', artifactKey: 'phase', sortKey: 0 },
        { busName: 'phaseB', artifactKey: 'phase', sortKey: 0 },
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
  const configData = (config != null && typeof config === 'object') ? config : {};
  const durationMs = 'durationMs' in configData ? Number(configData.durationMs) : 1000;

  // Allocate time-related slots upfront
  const tAbsMsType = { world: 'signal' as const, domain: 'timeMs' as const };
  const progress01Type = { world: 'signal' as const, domain: 'float' as const };
  const phase01Type = { world: 'signal' as const, domain: 'float' as const, semantics: 'phase(0..1)' as const };
  const triggerType = { world: 'event' as const, domain: 'trigger' as const };

  const tAbsMsSlot = ctx.b.allocValueSlot(tAbsMsType, 'tAbsMs');
  const tModelMsSlot = ctx.b.allocValueSlot(progress01Type, 'progress');
  const phase01Slot = ctx.b.allocValueSlot(phase01Type, 'phase');
  const wrapEventSlot = ctx.b.allocValueSlot(triggerType, 'end');

  // Register time slots so schedule can reference them
  ctx.b.setTimeSlots({
    systemTime: tAbsMsSlot,
    tAbsMs: tAbsMsSlot,
    tModelMs: tModelMsSlot,
    phase01: phase01Slot,
    progress01: tModelMsSlot, // For finite, progress is the same as model time
    wrapEvent: wrapEventSlot,
  });

  // Canonical time signals from TimeModel
  const systemTimeId = ctx.b.sigTimeAbsMs();
  const progressId = ctx.b.sigTimeModelMs(); // Will be scaled by TimeModel
  const phaseId = ctx.b.sigPhase01();
  const endId = ctx.b.sigWrapEvent();

  // Energy: constant 1.0 (simplified - runtime handles completion)
  const energyId = ctx.b.sigConst(1.0, { world: 'signal', domain: 'float' });

  // Declare TimeModel
  const timeModel: TimeModel = {
    kind: 'finite',
    durationMs,
  };

  return {
    outputs: [
      { k: 'sig', id: systemTimeId, slot: tAbsMsSlot },       // systemTime
      { k: 'sig', id: progressId, slot: tModelMsSlot },       // progress
      { k: 'sig', id: phaseId, slot: phase01Slot },           // phase
      { k: 'sig', id: endId, slot: wrapEventSlot },           // end
      { k: 'sig', id: energyId, slot: ctx.b.allocValueSlot({ world: 'signal', domain: 'float' }, 'energy') },
    ],
    declares: { timeModel },
  };
};

/**
 * Lower InfiniteTimeRoot block to IR.
 *
 * Uses canonical time signals:
 * - sigTimeAbsMs() for systemTime
 * - sigPhase01() for phase
 * - sigWrapEvent() for pulse
 *
 * NEEDS REVIEW - DEPRECATED: InfiniteTimeRoot currently uses a cyclic TimeModel
 * to synthesize phase/pulse (no dedicated secondary phase yet).
 */
const lowerInfiniteTimeRoot: BlockLowerFn = ({ ctx, config }) => {
  const configData = (config != null && typeof config === 'object') ? config : {};
  const periodMs = 'periodMs' in configData ? Number(configData.periodMs) : 1000;
  const mode = 'mode' in configData && typeof configData.mode === 'string' ? configData.mode : 'loop';

  // Allocate time-related slots upfront
  const tAbsMsType = { world: 'signal' as const, domain: 'timeMs' as const };
  const phase01Type = { world: 'signal' as const, domain: 'float' as const, semantics: 'phase(0..1)' as const };
  const triggerType = { world: 'event' as const, domain: 'trigger' as const };
  const numberType = { world: 'signal' as const, domain: 'float' as const };

  const tAbsMsSlot = ctx.b.allocValueSlot(tAbsMsType, 'tAbsMs');
  const tModelMsSlot = ctx.b.allocValueSlot(tAbsMsType, 'tModelMs');
  const phase01Slot = ctx.b.allocValueSlot(phase01Type, 'phase');
  const wrapEventSlot = ctx.b.allocValueSlot(triggerType, 'pulse');

  // Register time slots so schedule can reference them
  ctx.b.setTimeSlots({
    systemTime: tAbsMsSlot,
    tAbsMs: tAbsMsSlot,
    tModelMs: tModelMsSlot,
    phase01: phase01Slot,
    wrapEvent: wrapEventSlot,
  });

  // Canonical time signals from TimeModel
  const systemTimeId = ctx.b.sigTimeAbsMs();
  const phaseId = ctx.b.sigPhase01();
  const wrapId = ctx.b.sigWrapEvent();

  // Energy: constant 1.0
  const energyId = ctx.b.sigConst(1.0, { world: 'signal', domain: 'float' });

  // Declare TimeModel
  const timeModel: TimeModel = {
    kind: 'cyclic',
    periodMs,
    phaseDomain: '0..1',
    mode: mode === 'pingpong' ? 'pingpong' : 'loop',
  };

  return {
    outputs: [
      { k: 'sig', id: systemTimeId, slot: tAbsMsSlot },           // systemTime
      { k: 'sig', id: phaseId, slot: phase01Slot },               // phase
      { k: 'sig', id: wrapId, slot: wrapEventSlot },              // pulse
      { k: 'sig', id: energyId, slot: ctx.b.allocValueSlot(numberType, 'energy') },
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
    { portId: 'progress', label: 'Progress', dir: 'out', type: { world: 'signal', domain: 'float' } },
    { portId: 'phase', label: 'Phase', dir: 'out', type: { world: 'signal', domain: 'float', semantics: 'phase(0..1)' } },
    // end is event<trigger>, NOT signal - discrete event when animation completes
    { portId: 'end', label: 'End', dir: 'out', type: { world: 'event', domain: 'trigger' } },
    { portId: 'energy', label: 'Energy', dir: 'out', type: { world: 'signal', domain: 'float' } },
  ],
  lower: lowerFiniteTimeRoot,
});

registerBlockType({
  type: 'InfiniteTimeRoot',
  capability: 'time',
  inputs: [
    {
      portId: 'periodMs',
      label: 'Period (ms)',
      dir: 'in',
      type: { world: 'scalar', domain: 'float' },
      defaultSource: { value: 3000 },
    },
    {
      portId: 'mode',
      label: 'Mode',
      dir: 'in',
      type: { world: 'scalar', domain: 'string' },
      defaultSource: { value: 'loop' },
    },
  ],
  outputs: [
    { portId: 'systemTime', label: 'System Time', dir: 'out', type: { world: 'signal', domain: 'timeMs' } },
    { portId: 'phase', label: 'Phase', dir: 'out', type: { world: 'signal', domain: 'float', semantics: 'phase(0..1)' } },
    // pulse is event<trigger>, NOT signal - discrete event on cycle boundary
    { portId: 'pulse', label: 'Pulse', dir: 'out', type: { world: 'event', domain: 'trigger' } },
    { portId: 'energy', label: 'Energy', dir: 'out', type: { world: 'signal', domain: 'float' } },
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

  inputs: [],

  outputs: [
    { name: 'systemTime', type: { kind: 'Signal:Time' } },
    { name: 'progress', type: { kind: 'Signal:float' } },
    { name: 'phase', type: { kind: 'Signal:phase' } },
    { name: 'end', type: { kind: 'Event' } },
    { name: 'energy', type: { kind: 'Signal:float' } },
  ],

  compile({ params }): CompiledOutputs {
    // Read from params - block configuration values
    const durationMs = Number(params.durationMs ?? 5000);

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
      progress: { kind: 'Signal:float', value: progress },
      phase: { kind: 'Signal:phase', value: phase },
      end: { kind: 'Event', value: end },
      energy: { kind: 'Signal:float', value: energy },
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

  inputs: [],

  outputs: [
    { name: 'systemTime', type: { kind: 'Signal:Time' } },
    { name: 'phase', type: { kind: 'Signal:phase' } },
    { name: 'pulse', type: { kind: 'Event' } },
    { name: 'energy', type: { kind: 'Signal:float' } },
  ],

  compile({ params }): CompiledOutputs {
    // Read from params - block configuration values
    // NEEDS REVIEW - DEPRECATED: InfiniteTimeRoot uses periodMs to synthesize phase/pulse.
    const periodMs = Number(params.periodMs ?? 8000);

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
      energy: { kind: 'Signal:float', value: energy },
    };
  },
};
