/**
 * Transform Registration Entry Point
 *
 * Imports all transform definition files to register them with the
 * unified TRANSFORM_REGISTRY. This file must be imported at app startup.
 *
 * Phase 4 Deliverable: Single registration point for all transforms.
 *
 * References:
 * - .agent_planning/lens-adapter-unification/DOD-2026-01-02-transform-unification.md
 * - .agent_planning/lens-adapter-unification/PLAN-2026-01-02-transform-unification.md
 */

import { TRANSFORM_REGISTRY } from './TransformRegistry';

// Import adapter registrations (side-effects register transforms)
import './definitions/adapters/ConstToSignal';
import './definitions/adapters/BroadcastSignal';

// Import lens registrations (side-effects register transforms)
import './definitions/lenses/arithmetic';
import './definitions/lenses/shaping';
import './definitions/lenses/ease';

/**
 * Initialize all transforms.
 * Call this once at app startup to register all adapters and lenses.
 */
export function initializeTransforms(): void {
  const adapterCount = TRANSFORM_REGISTRY.getAllAdapters().length;
  const lensCount = TRANSFORM_REGISTRY.getAllLenses().length;
  const totalCount = adapterCount + lensCount;

  console.log(`[Transforms] Initialized ${totalCount} transforms (${adapterCount} adapters, ${lensCount} lenses)`);
}
