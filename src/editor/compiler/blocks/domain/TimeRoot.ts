/**
 * TimeRoot Block Compilers
 *
 * Define the time topology for a patch. Every patch needs exactly one TimeRoot.
 * These blocks produce the primary time signals that other blocks consume.
 */

import type { TimeModel } from '../../types';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// TODO: Reinstate TimeRoot auto-publication wiring once bus auto-pubs are finalized.
// The legacy closure compiler exposed an extract helper; reintroduce with IR-aware
// artifacts and a deterministic bus publish order when the bus pipeline is ready.
/*
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
*/

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
  const tAbsMsType = { world: "signal" as const, domain: "timeMs" as const, category: "internal" as const, busEligible: false };
  const progress01Type = { world: "signal" as const, domain: "float" as const, category: "core" as const, busEligible: true };
  const phase01Type = { world: "signal" as const, domain: "float" as const, semantics: 'phase(0..1)' as const, category: "core" as const, busEligible: true };
  const triggerType = { world: "event" as const, domain: "trigger" as const, category: "core" as const, busEligible: true };

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
  const energyId = ctx.b.sigConst(1.0, { world: "signal", domain: "float", category: "core", busEligible: true });

  // Declare TimeModel
  const timeModel: TimeModel = {
    kind: 'finite',
    durationMs,
  };

  // Allocate energy slot
  const energySlot = ctx.b.allocValueSlot({ world: "signal", domain: "float", category: "core", busEligible: true }, 'energy');

  return {
    outputs: [],  // Legacy array - empty for migrated blocks
    outputsById: {
      systemTime: { k: 'sig', id: systemTimeId, slot: tAbsMsSlot },
      progress: { k: 'sig', id: progressId, slot: tModelMsSlot },
      phase: { k: 'sig', id: phaseId, slot: phase01Slot },
      end: { k: 'sig', id: endId, slot: wrapEventSlot },
      energy: { k: 'sig', id: energyId, slot: energySlot },
    },
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
  const periodMs = 'periodMs' in configData ? Number(configData.periodMs) : 10000;

  // Allocate time-related slots upfront
  const tAbsMsType = { world: "signal" as const, domain: "timeMs" as const, category: "internal" as const, busEligible: false };
  const phase01Type = { world: "signal" as const, domain: "float" as const, semantics: 'phase(0..1)' as const, category: "core" as const, busEligible: true };
  const triggerType = { world: "event" as const, domain: "trigger" as const, category: "core" as const, busEligible: true };
  const numberType = { world: "signal" as const, domain: "float" as const, category: "core" as const, busEligible: true };

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
  const energyId = ctx.b.sigConst(1.0, { world: "signal", domain: "float", category: "core", busEligible: true });

  // Declare TimeModel - cyclic with period from periodMs (read from block.params)
  const timeModel: TimeModel = {
    kind: 'cyclic',
    periodMs,
    phaseDomain: '0..1',
    mode: 'loop',
  };

  // Allocate energy slot
  const energySlot = ctx.b.allocValueSlot(numberType, 'energy');

  return {
    outputs: [],  // Legacy array - empty for migrated blocks
    outputsById: {
      systemTime: { k: 'sig', id: systemTimeId, slot: tAbsMsSlot },
      phase: { k: 'sig', id: phaseId, slot: phase01Slot },
      pulse: { k: 'sig', id: wrapId, slot: wrapEventSlot },
      energy: { k: 'sig', id: energyId, slot: energySlot },
    },
    declares: { timeModel },
  };
};

// Register block types
registerBlockType({
  type: 'FiniteTimeRoot',
  capability: 'time',
  inputs: [],
  outputs: [
    { portId: 'systemTime', label: 'System Time', dir: 'out', type: { world: "signal", domain: "timeMs", category: "internal", busEligible: false } },
    { portId: 'progress', label: 'Progress', dir: 'out', type: { world: "signal", domain: "float", category: "core", busEligible: true } },
    { portId: 'phase', label: 'Phase', dir: 'out', type: { world: "signal", domain: "float", semantics: 'phase(0..1)', category: "core", busEligible: true } },
    // end is event<trigger>, NOT signal - discrete event when animation completes
    { portId: 'end', label: 'End', dir: 'out', type: { world: "event", domain: "trigger", category: "core", busEligible: true } },
    { portId: 'energy', label: 'Energy', dir: 'out', type: { world: "signal", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerFiniteTimeRoot,
});

registerBlockType({
  type: 'InfiniteTimeRoot',
  capability: 'time',
  inputs: [],  // TimeRoot has NO inputs - it's the source of time. Config comes from block.params.
  outputs: [
    { portId: 'systemTime', label: 'System Time', dir: 'out', type: { world: "signal", domain: "timeMs", category: "internal", busEligible: false } },
    { portId: 'phase', label: 'Phase', dir: 'out', type: { world: "signal", domain: "float", semantics: 'phase(0..1)', category: "core", busEligible: true } },
    // pulse is event<trigger>, NOT signal - discrete event on cycle boundary
    { portId: 'pulse', label: 'Pulse', dir: 'out', type: { world: "event", domain: "trigger", category: "core", busEligible: true } },
    { portId: 'energy', label: 'Energy', dir: 'out', type: { world: "signal", domain: "float", category: "core", busEligible: true } },
  ],
  lower: lowerInfiniteTimeRoot,
});
