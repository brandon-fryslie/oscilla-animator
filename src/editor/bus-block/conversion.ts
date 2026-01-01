/**
 * Bus ↔ BusBlock Conversion Utilities
 *
 * Sprint: Bus-Block Unification - Sprint 1 (Foundation)
 * Created: 2026-01-01
 *
 * Provides bidirectional conversion between Bus entities and BusBlock instances.
 * Critical: Block ID MUST equal Bus ID for stable references during migration.
 */

import type { Bus, Block, Slot, TypeDesc, SlotType } from '../types';

/**
 * Convert TypeDesc to SlotType string.
 *
 * This is a temporary mapping until we fully migrate to TypeDesc everywhere.
 * For now, we use 'Signal<float>' as a generic placeholder since the actual
 * type will be resolved during compilation from params.busType.
 */
function typeDescToSlotType(_typeDesc: TypeDesc): SlotType {
  // TODO: Proper TypeDesc -> SlotType mapping
  // For now, use placeholder since BusBlock type is dynamic
  return 'Signal<float>';
}

/**
 * Convert a Bus to a BusBlock instance.
 *
 * CRITICAL: The block ID matches the bus ID to maintain stable references
 * during migration. This ensures edges pointing to bus:X can simply use X
 * as the block ID.
 *
 * @param bus - Bus entity to convert
 * @returns Block instance representing the bus
 */
export function convertBusToBlock(bus: Bus): Block {
  const inputSlot: Slot = {
    id: 'in',
    label: 'Publishers',
    type: typeDescToSlotType(bus.type),
    direction: 'input',
    combine: bus.combine, // This makes it multi-input capable
  };

  const outputSlot: Slot = {
    id: 'out',
    label: bus.name,
    type: typeDescToSlotType(bus.type),
    direction: 'output',
  };

  return {
    id: bus.id, // CRITICAL: Same ID for stable references
    type: 'BusBlock',
    label: bus.name,
    inputs: [inputSlot],
    outputs: [outputSlot],
    params: {
      busId: bus.id,
      busName: bus.name,
      busType: bus.type,
      combine: bus.combine,
      defaultValue: bus.defaultValue,
      sortKey: bus.sortKey,
      origin: bus.origin,
    },
    category: 'Other',
    description: `Bus: ${bus.name}`,
    hidden: true,
    role: 'internal',
  };
}

/**
 * Convert a BusBlock instance back to a Bus entity.
 *
 * This is used for backward compatibility and roundtrip testing.
 * In the unified model, Bus metadata may still exist separately from BusBlock.
 *
 * @param block - BusBlock instance to convert
 * @returns Bus entity
 * @throws Error if block is not a BusBlock
 */
export function convertBlockToBus(block: Block): Bus {
  if (block.type !== 'BusBlock') {
    throw new Error(`Cannot convert block of type "${block.type}" to Bus - must be BusBlock`);
  }

  const {
    busId,
    busName,
    busType,
    combine,
    defaultValue,
    sortKey,
    origin,
  } = block.params;

  // Validate required parameters
  if (typeof busId !== 'string') {
    throw new Error('BusBlock params.busId must be a string');
  }
  if (typeof busName !== 'string') {
    throw new Error('BusBlock params.busName must be a string');
  }
  if (typeof busType !== 'object' || busType === null) {
    throw new Error('BusBlock params.busType must be a TypeDesc object');
  }
  if (typeof combine !== 'object' || combine === null) {
    throw new Error('BusBlock params.combine must be a CombinePolicy object');
  }

  return {
    id: busId,
    name: busName,
    type: busType as TypeDesc,
    combine: combine as Bus['combine'],
    defaultValue,
    sortKey: (typeof sortKey === 'number') ? sortKey : 0,
    origin: (origin === 'built-in' || origin === 'user') ? origin : 'user',
  };
}
