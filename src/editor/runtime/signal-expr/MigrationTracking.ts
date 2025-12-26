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
 * IMPORTANT: Update this set as blocks are migrated in Sprint 7+.
 *
 * Sprint 7 Status (2025-12-26):
 * - IR infrastructure complete (SignalExprBuilder, golden tests)
 * - All basic math blocks have IR capability but not yet integrated into compiler
 * - Blocks marked below have validated IR implementations via golden tests
 *
 * Next step: Integrate IR builders into actual block compilers (dual-emit mode)
 *
 * @example
 * ```typescript
 * // After migrating AddSignal block:
 * MIGRATED_BLOCKS.add('AddSignal');
 *
 * // After migrating MulSignal block:
 * MIGRATED_BLOCKS.add('MulSignal');
 * ```
 */
export const MIGRATED_BLOCKS = new Set<string>([
  // NOTE: These blocks have VALIDATED IR implementations but are not yet
  // integrated into the compiler. The infrastructure (SignalExprBuilder,
  // golden tests) is ready. Next sprint will integrate them.
  //
  // Sprint 7 accomplishments:
  // - Created SignalExprBuilder for block compilers
  // - Created golden test framework
  // - Created missing blocks (SubSignal, DivSignal)
  // - Validated IR produces identical output to closures for:
  //   - AddSignal (constant + time-based inputs)
  //   - SubSignal (constant + time-based inputs)
  //   - MulSignal (constant + amplitude modulation)
  //   - DivSignal (constant + division by zero handling)
  //   - MinSignal (constant + time-varying signals)
  //   - MaxSignal (constant + time-varying signals)
  //   - ClampSignal (three test cases: basic, below min, within range)
  //   - Complex compositions (shared subexpressions, deep trees)
  //
  // Blocks will be marked as migrated once:
  // 1. Block compiler emits IR instead of closures
  // 2. Compiler pipeline integrates IR output
  // 3. All existing tests pass with IR compilation
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
