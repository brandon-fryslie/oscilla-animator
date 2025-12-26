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
