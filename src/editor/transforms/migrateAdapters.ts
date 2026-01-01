/**
 * Adapter Migration to TransformRegistry
 *
 * Sprint 4: Phase 0 - Unify Lenses and Adapters
 * Migrates all adapters from AdapterRegistry to TransformRegistry.
 *
 * This file imports all adapter definitions from the old AdapterRegistry
 * and registers them in the new TransformRegistry.
 */

import { TRANSFORM_REGISTRY, type TransformIRCtx } from './TransformRegistry';
import { adapterRegistry, type AdapterIRCtx } from '../adapters/AdapterRegistry';

/**
 * Migrate all adapters from AdapterRegistry to TransformRegistry.
 * This preserves all existing adapter functionality while using the new unified registry.
 */
export function migrateAdaptersToTransformRegistry(): void {
  const allAdapters = adapterRegistry.list();

  for (const adapter of allAdapters) {
    // Convert AdapterDef to TransformDef format
    TRANSFORM_REGISTRY.registerAdapter({
      id: adapter.id,
      label: adapter.label,
      inputType: adapter.from,
      outputType: adapter.to,
      policy: adapter.policy,
      cost: adapter.cost,
      apply: adapter.apply,
      // Adapt the compileToIR function to match TransformIRCtx interface
      compileToIR: adapter.compileToIR
        ? (input, _params, ctx: TransformIRCtx) => {
            // Convert TransformIRCtx to AdapterIRCtx
            const adapterCtx: AdapterIRCtx = {
              builder: ctx.builder,
              adapterId: ctx.transformId,
              params: ctx.params ?? {},
            };
            return adapter.compileToIR!(input, adapterCtx);
          }
        : undefined,
    });
  }
}

/**
 * Auto-initialize adapter migration.
 * This runs when the module is imported, ensuring adapters are available
 * in the TransformRegistry.
 */
migrateAdaptersToTransformRegistry();
