/**
 * Unified Transform System
 *
 * Sprint 4: Phase 0 - Unify Lenses and Adapters
 */

export {
  TransformRegistry,
  TRANSFORM_REGISTRY,
  isLensTransform,
  isAdapterTransform,
  type TransformDef,
  type LensParamSpec,
  type TransformIRCtx,
} from './TransformRegistry';

// Migration files removed in Phase 0.5 Track B cleanup
// Lenses and adapters now use TRANSFORM_REGISTRY directly
