/**
 * Bus ↔ BusBlock Conversion Utilities
 *
 * Sprint: Bus-Block Unification - Sprint 1 (Foundation)
 * Created: 2026-01-01
 *
 * Provides bidirectional conversion between Bus entities and BusBlock instances.
 * Critical: Block ID MUST equal Bus ID for stable references during migration.
 */

import type { Bus, Block, TypeDesc } from '../types';

/**
 * Convert TypeDesc to SlotType string.
 *
 * This is a temporary mapping until we fully migrate to TypeDesc everywhere.
 * For now, we use 'Signal<float>' as a generic placeholder since the actual
 * type will be resolved during compilation from params.busType.
 */
// UNUSED: Commented out to avoid TS6133 error
// function typeDescToSlotType(_typeDesc: TypeDesc): SlotType {
//   // TODO: Proper TypeDesc -> SlotType mapping
//   // For now, use placeholder since BusBlock type is dynamic
//   return 'Signal<float>';
// }

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
  return {
    id: bus.id, // Block ID = Bus ID (unified)
    type: 'BusBlock',
    label: bus.name,
    position: { x: 0, y: 0 }, // Hidden blocks don't need meaningful positions
    form: 'primitive',
    params: {
      // Bus-specific metadata (no redundant busId/busName - use block.id and block.label)
      name: bus.name, // Programmatic name for lookups
      busType: bus.type,
      combineMode: bus.combineMode, // Updated from combine
      defaultValue: bus.defaultValue,
      sortKey: 0, // sortKey is not on Bus interface
      origin: 'user', // origin is not on Bus interface - default to 'user'
    },
    hidden: true,
    role: {
      kind: 'structural',
      meta: {
        kind: 'globalBus',
        target: {
          kind: 'bus',
          busId: bus.id,
        },
      },
    },
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
    name,
    busType,
    combineMode,
    defaultValue,
  } = block.params;

  // Use block.id as bus ID (unified model)
  const busId = block.id;
  // Use params.name for bus name (or fallback to block.label)
  const busName = (typeof name === 'string') ? name : (block.label ?? block.id);

  // Validate required parameters
  if (typeof busType !== 'object' || busType === null) {
    throw new Error('BusBlock params.busType must be a TypeDesc object');
  }
  if (typeof combineMode !== 'string') {
    throw new Error('BusBlock params.combineMode must be a CombineMode string');
  }

  return {
    id: busId,
    name: busName,
    type: busType as TypeDesc,
    combineMode: combineMode as Bus['combineMode'],
    defaultValue,
  };
}
