/**
 * Block Compiler Registry
 *
 * Contains both domain primitives (new system) and legacy blocks.
 * Legacy blocks are needed for macro expansions to work.
 */

import type { BlockRegistry } from '../types';

// Domain primitives (new system)
import {
  DomainNBlock,
  GridDomainBlock,
  SVGSampleDomainBlock,
  PositionMapGridBlock,
  PositionMapCircleBlock,
  PositionMapLineBlock,
  FieldConstNumberBlock,
  FieldConstColorBlock,
  FieldHash01ByIdBlock,
  StableIdHashBlock,
  FieldMapNumberBlock,
  FieldMapVec2Block,
  FieldZipNumberBlock,
  PhaseClockBlock,
  PhaseClockLegacyBlock,
  TriggerOnWrapBlock,
  RenderInstances2DBlock,
  // TimeRoot blocks (Phase 3: TimeRoot)
  FiniteTimeRootBlock,
  CycleTimeRootBlock,
  InfiniteTimeRootBlock,
  // Field manipulation blocks (Slices 4-8)
  FieldAddVec2Block,
  FieldColorizeBlock,
  FieldOpacityBlock,
  ViewportInfoBlock,
  JitterFieldVec2Block,
  // Field-Signal combination blocks (Slice 5)
  FieldFromSignalBroadcastBlock,
  FieldZipSignalBlock,
} from './domain';

// Signal primitives (Slice 1: Breathing Energy System)
import {
  OscillatorBlock,
  ShaperBlock,
  ColorLFOBlock,
  AddSignalBlock,
  MulSignalBlock,
  MinSignalBlock,
  MaxSignalBlock,
  ClampSignalBlock,
} from './signal';

// Rhythm primitives (Slice 2: Rhythmic Accent System)
import {
  PulseDividerBlock,
  EnvelopeADBlock,
} from './rhythm';

// Legacy blocks (needed for macros)
import {
  // Sources
  SVGPathSourceBlock,
  ConstantNumberBlock,
  ConstantVec2Block,
  TextSourceBlock,
} from './legacy/sources';
import {
  // Fields
  RadialOriginBlock,
  LinearStaggerBlock,
  AddFieldNumberBlock,
  MulFieldNumberBlock,
  ScaleFieldNumberBlock,
  MapFieldNumberBlock,
  StaggerFieldBlock,
  NoiseFieldBlock,
  RegionFieldBlock,
  ConstantFieldDurationBlock,
  WaveStaggerBlock,
  SizeVariationBlock,
  ColorFieldBlock,
  ElementIndexFieldBlock,
  RandomJitterFieldBlock,
  SinFieldBlock,
  SubFieldNumberBlock,
  DivFieldNumberBlock,
  FloorFieldNumberBlock,
  MakePointFieldBlock,
  RandomStaggerBlock,
  IndexStaggerBlock,
  DurationVariationBlock,
  DecayEnvelopeBlock,
  ExplosionOriginBlock,
  TopDropOriginBlock,
  GridPositionsBlock,
  CenterPointBlock,
  RotationFieldBlock,
  ScaleFieldBlock,
  OpacityFieldBlock,
  WobbleParamsBlock,
  SpiralParamsBlock,
  WaveParamsBlock,
  JitterParamsBlock,
  EasingFieldBlock,
} from './legacy/fields';
import {
  // Time
  PhaseMachineBlock,
  EaseRampBlock,
  PhaseProgressBlock,
} from './legacy/time';
import {
  // Compose
  PerElementTransportBlock,
  DemoProgramBlock,
  PerElementProgressBlock,
  LerpPointsBlock,
} from './legacy/compose';
import {
  // Sinks
  OutputProgramBlock,
  DebugOutputBlock,
} from './legacy/sinks';
import {
  // Adapters
  SamplePointsBlock,
  SceneToTargetsBlock,
  FieldToSignalBlock,
  LiftScalarToFieldNumberBlock,
  ScalarToSignalNumberBlock,
  SignalToScalarNumberBlock,
  TimeToPhaseBlock,
  PhaseToTimeBlock,
  WrapPhaseBlock,
  ElementCountBlock,
} from './legacy/adapters';
import {
  // Render
  ParticleRendererBlock,
  CanvasBlock,
  GlowFilterBlock,
  CircleNodeBlock,
  GroupNodeBlock,
  RenderTreeAssembleBlock,
  PerElementCirclesBlock,
  PathRendererBlock,
  StrokeStyleBlock,
  GooFilterBlock,
  RGBSplitFilterBlock,
  MaskRevealBlock,
} from './legacy/render';
import {
  // Math
  MathConstNumberBlock,
  MathAddScalarBlock,
  MathMulScalarBlock,
  MathSinScalarBlock,
} from './legacy/math';

// =============================================================================
// Registry
// =============================================================================

/**
 * Default block compiler registry.
 * Maps block type strings to their compiler implementations.
 */
export const DEFAULT_BLOCK_REGISTRY: BlockRegistry = {
  // Domain primitives (new system)
  DomainN: DomainNBlock,
  GridDomain: GridDomainBlock,
  SVGSampleDomain: SVGSampleDomainBlock,
  PositionMapGrid: PositionMapGridBlock,
  PositionMapCircle: PositionMapCircleBlock,
  PositionMapLine: PositionMapLineBlock,
  FieldConstNumber: FieldConstNumberBlock,
  FieldConstColor: FieldConstColorBlock,
  FieldHash01ById: FieldHash01ByIdBlock,
  StableIdHash: StableIdHashBlock,
  FieldMapNumber: FieldMapNumberBlock,
  FieldMapVec2: FieldMapVec2Block,
  FieldZipNumber: FieldZipNumberBlock,
  PhaseClock: PhaseClockBlock,
  PhaseClockLegacy: PhaseClockLegacyBlock,
  TriggerOnWrap: TriggerOnWrapBlock,
  RenderInstances2D: RenderInstances2DBlock,

  // TimeRoot blocks (Phase 3: TimeRoot)
  FiniteTimeRoot: FiniteTimeRootBlock,
  CycleTimeRoot: CycleTimeRootBlock,
  InfiniteTimeRoot: InfiniteTimeRootBlock,

  // Field manipulation blocks (Slices 4-8)
  FieldAddVec2: FieldAddVec2Block,
  FieldColorize: FieldColorizeBlock,
  FieldOpacity: FieldOpacityBlock,
  ViewportInfo: ViewportInfoBlock,
  JitterFieldVec2: JitterFieldVec2Block,

  // Field-Signal combination blocks (Slice 5)
  FieldFromSignalBroadcast: FieldFromSignalBroadcastBlock,
  FieldZipSignal: FieldZipSignalBlock,

  // Signal primitives (Slice 1: Breathing Energy System)
  Oscillator: OscillatorBlock,
  Shaper: ShaperBlock,
  ColorLFO: ColorLFOBlock,
  AddSignal: AddSignalBlock,
  MulSignal: MulSignalBlock,
  MinSignal: MinSignalBlock,
  MaxSignal: MaxSignalBlock,
  ClampSignal: ClampSignalBlock,

  // Rhythm primitives (Slice 2: Rhythmic Accent System)
  PulseDivider: PulseDividerBlock,
  EnvelopeAD: EnvelopeADBlock,

  // Legacy - Sources
  SVGPathSource: SVGPathSourceBlock,
  ConstantNumber: ConstantNumberBlock,
  ConstantVec2: ConstantVec2Block,
  TextSource: TextSourceBlock,

  // Legacy - Fields
  RadialOrigin: RadialOriginBlock,
  LinearStagger: LinearStaggerBlock,
  AddFieldNumber: AddFieldNumberBlock,
  MulFieldNumber: MulFieldNumberBlock,
  ScaleFieldNumber: ScaleFieldNumberBlock,
  MapFieldNumber: MapFieldNumberBlock,
  StaggerField: StaggerFieldBlock,
  NoiseField: NoiseFieldBlock,
  regionField: RegionFieldBlock,
  constantFieldDuration: ConstantFieldDurationBlock,
  WaveStagger: WaveStaggerBlock,
  SizeVariation: SizeVariationBlock,
  ColorField: ColorFieldBlock,
  ElementIndexField: ElementIndexFieldBlock,
  RandomJitterField: RandomJitterFieldBlock,
  SinField: SinFieldBlock,
  SubFieldNumber: SubFieldNumberBlock,
  DivFieldNumber: DivFieldNumberBlock,
  FloorFieldNumber: FloorFieldNumberBlock,
  MakePointField: MakePointFieldBlock,
  RandomStagger: RandomStaggerBlock,
  IndexStagger: IndexStaggerBlock,
  DurationVariation: DurationVariationBlock,
  DecayEnvelope: DecayEnvelopeBlock,
  ExplosionOrigin: ExplosionOriginBlock,
  TopDropOrigin: TopDropOriginBlock,
  GridPositions: GridPositionsBlock,
  CenterPoint: CenterPointBlock,
  RotationField: RotationFieldBlock,
  ScaleField: ScaleFieldBlock,
  OpacityField: OpacityFieldBlock,
  WobbleParams: WobbleParamsBlock,
  SpiralParams: SpiralParamsBlock,
  WaveParams: WaveParamsBlock,
  JitterParams: JitterParamsBlock,
  EasingField: EasingFieldBlock,

  // Legacy - Time
  PhaseMachine: PhaseMachineBlock,
  EaseRamp: EaseRampBlock,
  phaseProgress: PhaseProgressBlock,

  // Legacy - Compose
  PerElementTransport: PerElementTransportBlock,
  demoProgram: DemoProgramBlock,
  perElementProgress: PerElementProgressBlock,
  lerpPoints: LerpPointsBlock,

  // Legacy - Sinks
  outputProgram: OutputProgramBlock,
  DebugOutput: DebugOutputBlock,

  // Legacy - Adapters
  SamplePoints: SamplePointsBlock,
  SceneToTargets: SceneToTargetsBlock,
  FieldToSignal: FieldToSignalBlock,
  LiftScalarToFieldNumber: LiftScalarToFieldNumberBlock,
  ScalarToSignalNumber: ScalarToSignalNumberBlock,
  SignalToScalarNumber: SignalToScalarNumberBlock,
  TimeToPhase: TimeToPhaseBlock,
  PhaseToTime: PhaseToTimeBlock,
  WrapPhase: WrapPhaseBlock,
  elementCount: ElementCountBlock,

  // Legacy - Render
  ParticleRenderer: ParticleRendererBlock,
  canvas: CanvasBlock,
  glowFilter: GlowFilterBlock,
  CircleNode: CircleNodeBlock,
  GroupNode: GroupNodeBlock,
  RenderTreeAssemble: RenderTreeAssembleBlock,
  perElementCircles: PerElementCirclesBlock,
  PathRenderer: PathRendererBlock,
  StrokeStyle: StrokeStyleBlock,
  GooFilter: GooFilterBlock,
  RGBSplitFilter: RGBSplitFilterBlock,
  MaskReveal: MaskRevealBlock,

  // Legacy - Math
  'math.constNumber': MathConstNumberBlock,
  'math.addScalar': MathAddScalarBlock,
  'math.mulScalar': MathMulScalarBlock,
  'math.sinScalar': MathSinScalarBlock,
};

/**
 * Mutable registry allowing dynamic additions (composites/macros).
 * Starts from DEFAULT_BLOCK_REGISTRY.
 */
const dynamicRegistry: BlockRegistry = { ...DEFAULT_BLOCK_REGISTRY };

export function createBlockRegistry(): BlockRegistry {
  return dynamicRegistry;
}

export function registerDynamicBlock(type: string, compiler: any): void {
  dynamicRegistry[type] = compiler;
}

// =============================================================================
// Re-exports for convenience
// =============================================================================

// Export domain blocks for testing
export * from './domain';
export * from './signal';
export * from './rhythm';
export * from './helpers';
