/**
 * Cluster Key Calculation
 *
 * Computes cluster grouping keys from bus signatures.
 * Blocks with same cluster key are grouped together in layout.
 *
 * @see design-docs/8-UI-Redesign/5-NewUIRules-2of3.md (Section 5)
 */

import type { BlockId, BusBinding, BusSignature, BusSignatureItem, Role } from './types';

/**
 * Compute bus signature for a block.
 *
 * Signature includes all buses touched by the block with direction prefix.
 * Items are sorted for deterministic hashing.
 *
 * @param blockId - Block ID
 * @param busBindings - All bus bindings in graph
 * @returns Bus signature
 */
export function computeBusSignature(blockId: BlockId, busBindings: BusBinding[]): BusSignature {
  const items: BusSignatureItem[] = [];

  for (const binding of busBindings) {
    if (binding.blockId === blockId) {
      items.push({
        busId: binding.busId,
        direction: binding.direction === 'publish' ? 'P' : 'S',
      });
    }
  }

  // Sort for determinism
  items.sort((a, b) => {
    // First by direction (P before S)
    if (a.direction !== b.direction) {
      return a.direction < b.direction ? -1 : 1;
    }
    // Then by busId
    return a.busId.localeCompare(b.busId);
  });

  return { items };
}

/**
 * Hash bus signature to a stable string.
 *
 * @param signature - Bus signature
 * @returns Hash string
 */
export function hashBusSignature(signature: BusSignature): string {
  if (signature.items.length === 0) {
    return 'none';
  }

  return signature.items.map((item) => `${item.direction}:${item.busId}`).join(',');
}

/**
 * Compute cluster key for a block.
 *
 * Cluster key groups blocks semantically based on bus interactions.
 * Format: "<role>|<busSignatureHash>"
 *
 * Focus mode: if focusedBusId is set, cluster key becomes "focusBus:<busId>" or "other".
 *
 * @param blockId - Block ID
 * @param role - Block role
 * @param busBindings - All bus bindings
 * @param focusedBusId - Focused bus ID (if any)
 * @returns Cluster key
 */
export function computeClusterKey(
  blockId: BlockId,
  role: Role,
  busBindings: BusBinding[],
  focusedBusId?: string
): string {
  const signature = computeBusSignature(blockId, busBindings);

  // Focus mode
  if (focusedBusId !== undefined) {
    const touchesFocusedBus = signature.items.some((item) => item.busId === focusedBusId);
    return touchesFocusedBus ? `focusBus:${focusedBusId}` : 'other';
  }

  // Normal mode
  const sigHash = hashBusSignature(signature);
  return `${role}|${sigHash}`;
}

/**
 * Compute cluster keys for all blocks.
 *
 * @param blocks - Block IDs and roles
 * @param busBindings - All bus bindings
 * @param focusedBusId - Focused bus ID (if any)
 * @returns Map from BlockId to cluster key
 */
export function computeClusterKeys(
  blocks: Array<{ id: BlockId; role: Role }>,
  busBindings: BusBinding[],
  focusedBusId?: string
): Map<BlockId, string> {
  const clusterKeys = new Map<BlockId, string>();

  for (const block of blocks) {
    const key = computeClusterKey(block.id, block.role, busBindings, focusedBusId);
    clusterKeys.set(block.id, key);
  }

  return clusterKeys;
}
