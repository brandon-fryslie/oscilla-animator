/**
 * SignalExpr Runtime - Public API
 *
 * Core signal expression evaluator for Oscilla Animator.
 * Evaluates SignalExpr IR DAGs with per-frame caching.
 *
 * References:
 * - .agent_planning/signalexpr-runtime/PLAN-20251225-190000.md
 * - .agent_planning/signalexpr-runtime/DOD-20251225-190000.md
 */

// Core evaluator
export { evalSig } from "./SigEvaluator";

// Environment and const pool
export {
  createSigEnv,
  createConstPool,
  getConstNumber,
  type SigEnv,
  type ConstPool,
  type CreateSigEnvParams,
} from "./SigEnv";

// Per-frame cache
export {
  createSigFrameCache,
  newFrame,
  isCached,
  getCached,
  setCached,
  type SigFrameCache,
} from "./SigFrameCache";

// OpCode execution
export {
  applyPureFn,
  applyBinaryFn,
  applyTernaryFn,
} from "./OpCodeRegistry";

// Easing curves (Sprint 4)
export {
  createBuiltinCurves,
  applyEasing,
  BUILTIN_CURVES,
  type EasingCurve,
  type EasingCurveTable,
} from "./EasingCurves";

// Slot value readers (Sprint 2)
export {
  createArraySlotReader,
  createEmptySlotReader,
  type SlotValueReader,
} from "./SlotValueReader";

// Debug sink (Sprint 3)
export {
  type DebugSink,
  type BusCombineTraceInfo,
  type TransformTraceInfo,
  type TransformStepTrace,
} from "./DebugSink";

// SignalExpr Builder (Sprint 7) - for block compiler migration
export {
  createSignalExprBuilder,
  opcode,
  type SignalExprBuilder,
  type SignalExprBuildResult,
} from "./SignalExprBuilder";

// Migration tracking (Sprint 6+7)
export {
  isMigrated,
  getMigrationStatus,
  MIGRATED_BLOCKS,
  type MigrationStatus,
} from "./MigrationTracking";
