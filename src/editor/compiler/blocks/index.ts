/**
 * Block Compiler Registry
 *
 * Contains domain primitives and signal blocks.
 *
 * CRITICAL: Adding new blocks is strictly NOT ALLOWED unless the user explicitly
 * asks you to, and you confirm it with them. Use existing blocks, composites,
 * defaultSource, and adapters instead.
 */

import type { BlockRegistry, BlockCompiler } from '../types';

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
  TriggerOnWrapBlock,
  RenderInstances2DBlock,
  RenderPaths2DBlock,
  Render2dCanvasBlock,
  PathConstBlock,
  // TimeRoot blocks (Phase 3: TimeRoot)
  FiniteTimeRootBlock,
  InfiniteTimeRootBlock,
  // Field manipulation blocks (Slices 4-8)
  FieldAddVec2Block,
  FieldColorizeBlock,
  FieldOpacityBlock,
  FieldHueGradientBlock,
  FieldFromExpressionBlock,
  FieldStringToColorBlock,
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

// Default source provider blocks (Sprint 4-5)
import {
  DSConstSignalFloatBlock,
  DSConstSignalIntBlock,
  DSConstSignalColorBlock,
  DSConstSignalPointBlock,
  DSConstFieldFloatBlock,
  DSConstFieldVec2Block,
  DSConstFieldColorBlock,
  DSConstScalarStringBlock,
  DSConstScalarWaveformBlock,
  DSConstScalarIntBlock,
  DSConstScalarFloatBlock,
} from './defaultSources';

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
  TriggerOnWrap: TriggerOnWrapBlock,
  RenderInstances2D: RenderInstances2DBlock,
  RenderPaths2D: RenderPaths2DBlock,
  Render2dCanvas: Render2dCanvasBlock,
  PathConst: PathConstBlock,

  // TimeRoot blocks (Phase 3: TimeRoot)
  FiniteTimeRoot: FiniteTimeRootBlock,
  InfiniteTimeRoot: InfiniteTimeRootBlock,

  // Field manipulation blocks (Slices 4-8)
  FieldAddVec2: FieldAddVec2Block,
  FieldColorize: FieldColorizeBlock,
  FieldOpacity: FieldOpacityBlock,
  FieldHueGradient: FieldHueGradientBlock,
  FieldFromExpression: FieldFromExpressionBlock,
  FieldStringToColor: FieldStringToColorBlock,
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

  // Default source provider blocks (Sprint 4-5)
  DSConstSignalFloat: DSConstSignalFloatBlock,
  DSConstSignalInt: DSConstSignalIntBlock,
  DSConstSignalColor: DSConstSignalColorBlock,
  DSConstSignalPoint: DSConstSignalPointBlock,
  DSConstFieldFloat: DSConstFieldFloatBlock,
  DSConstFieldVec2: DSConstFieldVec2Block,
  DSConstFieldColor: DSConstFieldColorBlock,
  DSConstScalarInt: DSConstScalarIntBlock,
  DSConstScalarFloat: DSConstScalarFloatBlock,
  DSConstScalarString: DSConstScalarStringBlock,
  DSConstScalarWaveform: DSConstScalarWaveformBlock,
};

/**
 * Mutable registry allowing dynamic additions (composites/macros).
 * Starts from DEFAULT_BLOCK_REGISTRY.
 */
const dynamicRegistry: BlockRegistry = { ...DEFAULT_BLOCK_REGISTRY };

export function createBlockRegistry(): BlockRegistry {
  return dynamicRegistry;
}

export function registerDynamicBlock(type: string, compiler: BlockCompiler): void {
  dynamicRegistry[type] = compiler;
}

// =============================================================================
// Re-exports for convenience
// =============================================================================

// Export domain blocks for testing
export * from './domain';
export * from './signal';
export * from './rhythm';
export * from './defaultSources';
export * from './helpers';
