/**
 * Lens Migration to TransformRegistry
 *
 * Sprint 4: Phase 0 - Unify Lenses and Adapters
 * Migrates all lenses from LensRegistry to TransformRegistry.
 *
 * This file imports all lens definitions from the old LensRegistry
 * and registers them in the new TransformRegistry.
 */

import { TRANSFORM_REGISTRY } from './TransformRegistry';
import { getAllLenses } from '../lenses/LensRegistry';

/**
 * Migrate all lenses from LensRegistry to TransformRegistry.
 * This preserves all existing lens functionality while using the new unified registry.
 */
export function migrateLensesToTransformRegistry(): void {
  const allLenses = getAllLenses();

  for (const lens of allLenses) {
    // Convert LensDef to TransformDef format
    TRANSFORM_REGISTRY.registerLens({
      id: lens.id,
      label: lens.label,
      inputType: 'same', // Lenses are type-preserving
      outputType: 'same',
      domain: lens.domain,
      allowedScopes: lens.allowedScopes,
      params: lens.params,
      costHint: lens.costHint,
      stabilityHint: lens.stabilityHint,
      apply: lens.apply,
      compileToIR: lens.compileToIR,
    });
  }
}

/**
 * Auto-initialize lens migration.
 * This runs when the module is imported, ensuring lenses are available
 * in the TransformRegistry.
 */
migrateLensesToTransformRegistry();
