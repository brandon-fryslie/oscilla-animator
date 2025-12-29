/**
 * Migration Tracking
 *
 * Track which signal block types have been migrated from closure-based
 * compilation to SignalExpr IR.
 *
 * This is TEMPORARY infrastructure to support gradual migration.
 * Will be removed once all blocks are migrated.
 *
 * Philosophy:
 * - Explicit tracking of migration status
 * - Easy to update as blocks are migrated
 * - Provides progress reporting
 * - Simple Set-based membership test
 *
 * References:
 * - .agent_planning/signalexpr-runtime/SPRINT-06-closureBridge.md §P1 "Migration Tracking"
 * - design-docs/12-Compiler-Final/01.1-CompilerMigration-Roadmap.md
 */

/**
 * Set of block types that have been fully migrated to IR.
 *
 * Phase 3 Complete (2025-12-26):
 * - All 42 blocks now use registerBlockType() with BlockLowerFn
 * - Dual-emit mode: blocks emit both closures and IR
 * - IR validation integrated into compilation pipeline
 *
 * Phase 4 Complete (2025-12-26):
 * - SigEvaluator complete with 122+ tests
 * - Materializer integrated with SigEvaluator (IR evaluation preferred)
 * - All node kinds supported: const, timeAbsMs, timeModelMs, phase01,
 *   wrapEvent, map, zip, select, inputSlot, busCombine, transform,
 *   stateful, closureBridge
 *
 * @example
 * ```typescript
 * if (isMigrated('AddSignal')) {
 *   // Block fully supports IR evaluation
 * }
 * ```
 */
export const MIGRATED_BLOCKS = new Set<string>([
  // ==========================================================================
  // Signal Math Blocks - All migrated with validated IR
  // ==========================================================================
  "AddSignal",
  "SubSignal",
  "MulSignal",
  "DivSignal",
  "MinSignal",
  "MaxSignal",
  "ClampSignal",

  // ==========================================================================
  // Oscillators and Shapers - Migrated with IR support
  // ==========================================================================
  "Oscillator",
  "Shaper",
  "ColorLFO",

  // ==========================================================================
  // Rhythm Blocks - Migrated with stateful IR support
  // ==========================================================================
  "EnvelopeAD",
  "PulseDivider",

  // ==========================================================================
  // Domain Blocks - Migrated with field IR support
  // ==========================================================================
  "DomainN",
  "GridDomain",
  "SVGSampleDomain",
  "PositionMapGrid",
  "PositionMapCircle",
  "PositionMapLine",
  "FieldMapNumber",
  "FieldMapVec2",
  "FieldZipNumber",
  "FieldZipSignal",
  "FieldReduce",
  "FieldAddVec2",
  "FieldColorize",
  "FieldOpacity",
  "FieldHueGradient",
  "FieldConstNumber",
  "FieldConstColor",
  "FieldStringToColor",
  "FieldFromExpression",
  "FieldFromSignalBroadcast",
  "FieldHash01ById",
  "JitterFieldVec2",
  "StableIdHash",

  // ==========================================================================
  // Time Blocks - Migrated with time topology IR support
  // ==========================================================================
  "InfiniteTimeRoot",
  "InfiniteTimeRoot",
  "FiniteTimeRoot",
  "PhaseClock",
  "TriggerOnWrap",
  "ViewportInfo",

  // ==========================================================================
  // Render Blocks - Migrated with renderSink IR support
  // ==========================================================================
  "RenderInstances2D",
  "Render2dCanvas",

  // ==========================================================================
  // Debug Blocks - Migrated
  // ==========================================================================
  "DebugDisplay",
]);

/**
 * Complete list of all signal block types.
 *
 * Used for migration progress tracking.
 * IMPORTANT: Keep this list synchronized with actual block types.
 */
const ALL_SIGNAL_BLOCKS = [
  // Math operations
  "AddSignal",
  "SubSignal",
  "MulSignal",
  "DivSignal",
  "ModSignal",
  "PowSignal",
  "MinSignal",
  "MaxSignal",
  "ClampSignal",
  "AbsSignal",
  "SignSignal",
  "FloorSignal",
  "CeilSignal",
  "RoundSignal",

  // Trigonometry
  "SinSignal",
  "CosSignal",
  "TanSignal",
  "AsinSignal",
  "AcosSignal",
  "AtanSignal",
  "Atan2Signal",

  // Exponential
  "ExpSignal",
  "LogSignal",
  "SqrtSignal",

  // Oscillators
  "Oscillator",
  "LFO",
  "NoiseSignal",

  // Shapers
  "Shaper",
  "WaveFolder",
  "Quantizer",

  // Color
  "ColorLFO",
  "ColorMixer",

  // Time
  "TimeSignal",
  "DeltaSignal",
  "PhaseSignal",

  // Utility
  "ConstantSignal",
  "RampSignal",
  "StepSignal",
  "SelectorSignal",
];

/**
 * Check if a block type has been migrated to IR.
 *
 * @param blockType - Block type identifier
 * @returns true if block is migrated, false if still uses closures
 *
 * @example
 * ```typescript
 * if (isMigrated('AddSignal')) {
 *   // Use IR compilation
 * } else {
 *   // Use closure compilation + bridge
 * }
 * ```
 */
export function isMigrated(blockType: string): boolean {
  return MIGRATED_BLOCKS.has(blockType);
}

/**
 * Migration status report.
 *
 * Contains:
 * - List of migrated blocks
 * - List of pending blocks
 * - Total count
 * - Percentage complete
 */
export interface MigrationStatus {
  /** Block types that have been migrated */
  migrated: string[];

  /** Block types still pending migration */
  pending: string[];

  /** Total number of signal blocks */
  total: number;

  /** Migration progress percentage (0-100) */
  percentage: number;
}

/**
 * Get current migration status.
 *
 * Reports on migration progress across all signal block types.
 *
 * @returns Migration status report
 *
 * @example
 * ```typescript
 * const status = getMigrationStatus();
 * console.log(`Migration: ${status.percentage.toFixed(1)}% complete`);
 * console.log(`Migrated: ${status.migrated.join(', ')}`);
 * console.log(`Pending: ${status.pending.join(', ')}`);
 * ```
 */
export function getMigrationStatus(): MigrationStatus {
  const migrated = ALL_SIGNAL_BLOCKS.filter((b) => MIGRATED_BLOCKS.has(b));
  const pending = ALL_SIGNAL_BLOCKS.filter((b) => !MIGRATED_BLOCKS.has(b));

  return {
    migrated,
    pending,
    total: ALL_SIGNAL_BLOCKS.length,
    percentage:
      ALL_SIGNAL_BLOCKS.length > 0
        ? (migrated.length / ALL_SIGNAL_BLOCKS.length) * 100
        : 0,
  };
}
