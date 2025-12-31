/**
 * Default Source Utilities
 *
 * Shared helpers for materializing defaultSource values into IR.
 * Used by both Pass6 (block-lowering.ts) and Pass8 (link-resolution.ts).
 *
 * Implements consistent handling for all type worlds:
 * - signal (numeric): Create sigConst with allocated slot
 * - signal (non-numeric): Store in const pool (no coercion!)
 * - field: Create fieldConst with allocated slot
 * - scalar: Store in const pool
 * - config: Store in const pool (except domain='domain' special case)
 * - config (domain='domain'): Create domain from N
 * - event: Return null (events have no default values)
 *
 * References:
 * - .agent_planning/type-contracts-ir-plumbing/DOD-2025-12-31-045033.md (P1)
 */

import type { IRBuilder } from './IRBuilder';
import type { TypeDesc } from './types';
import type { ValueRefPacked } from './lowerTypes';

/**
 * Materialize a defaultSource value into IR.
 *
 * @param builder - IRBuilder instance for creating IR nodes
 * @param type - TypeDesc of the port (determines how value is materialized)
 * @param value - The defaultSource value to materialize
 * @returns ValueRefPacked reference to the materialized value, or null for events
 *
 * @example
 * ```typescript
 * const portDecl = blockType.inputs[0];
 * const ref = materializeDefaultSource(builder, portDecl.type, portDecl.defaultSource.value);
 * if (ref !== null) {
 *   inputsById[portDecl.id] = ref;
 * }
 * ```
 */
export function materializeDefaultSource(
  builder: IRBuilder,
  type: TypeDesc,
  value: unknown
): ValueRefPacked | null {
  // Event: Events have no default values (they are discrete streams)
  if (type.world === 'event') {
    return null;
  }

  // Signal: numeric values use sigConst, non-numeric use const pool
  if (type.world === 'signal') {
    if (typeof value === 'number') {
      // Numeric signal: Create signal constant with allocated slot
      const sigId = builder.sigConst(value, type);
      const slot = builder.allocValueSlot(type);
      builder.registerSigSlot(sigId, slot);
      return { k: 'sig', id: sigId, slot };
    } else {
      // Non-numeric signal (e.g., color strings, vec3): Use const pool
      // DO NOT coerce to number - this preserves type information
      const constId = builder.allocConstId(value);
      return { k: 'scalarConst', constId };
    }
  }

  // Field: Create field constant with allocated slot
  if (type.world === 'field') {
    const fieldId = builder.fieldConst(value, type);
    const slot = builder.allocValueSlot(type);
    builder.registerFieldSlot(fieldId, slot);
    return { k: 'field', id: fieldId, slot };
  }

  // Config (domain='domain'): Special case - create domain from N
  if (type.world === 'config' && type.domain === 'domain') {
    const count = typeof value === 'number' ? value : Number(value);
    const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    const domainSlot = builder.domainFromN(safeCount);
    return { k: 'special', tag: 'domain', id: domainSlot };
  }

  // Scalar or Config (non-domain): Store in const pool
  if (type.world === 'scalar' || type.world === 'config') {
    const constId = builder.allocConstId(value);
    return { k: 'scalarConst', constId };
  }

  // Should never reach here if TypeDesc is valid
  throw new Error(
    `materializeDefaultSource: Unsupported type world "${type.world}" (domain: ${type.domain})`
  );
}
