/**
 * Catalog functions for discovering available transforms.
 *
 * Provides unified access to adapter and lens registries for UI and validation.
 */

import type { TransformScope } from './types';
import type { TypeDesc } from '../types';
import { adapterRegistry, type AdapterDef } from '../adapters/AdapterRegistry';
import { getAllLenses, getLens as getLensFromRegistry, type LensDef } from '../lenses/LensRegistry';

/**
 * List all registered adapters.
 */
export function listAdapters(): AdapterDef[] {
  return adapterRegistry.list();
}

/**
 * List all registered lenses.
 */
export function listLenses(): LensDef[] {
  return getAllLenses();
}

/**
 * List lenses compatible with a specific scope and type.
 *
 * Filters by:
 * - Lens domain matches type domain
 * - Lens allowedScopes includes the requested scope
 *
 * @param scope - Where the lens will be applied
 * @param typeDesc - Type of the artifact being transformed
 * @returns Array of compatible lens definitions
 */
export function listLensesFor(scope: TransformScope, typeDesc: TypeDesc): LensDef[] {
  const allLenses = getAllLenses();

  return allLenses.filter((lens) => {
    // Check domain compatibility
    if (lens.domain !== typeDesc.domain) {
      return false;
    }

    // Check scope compatibility (Sprint 2 complete)
    return lens.allowedScopes.includes(scope);
  });
}

/**
 * Find adapters that convert from one type to another.
 */
export function findAdapters(from: TypeDesc, to: TypeDesc): AdapterDef[] {
  return adapterRegistry.findAdapters(from, to);
}

/**
 * Get a specific adapter by ID.
 */
export function getAdapter(id: string): AdapterDef | undefined {
  return adapterRegistry.get(id);
}

/**
 * Get a specific lens by ID.
 */
export function getLens(id: string): LensDef | undefined {
  return getLensFromRegistry(id);
}
