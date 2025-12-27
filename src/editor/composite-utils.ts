/**
 * @file Composite Utilities
 * @description Helper functions for creating and managing custom composites
 */

import type { Block, Connection, Composite, CompositeConnection } from './types';
import type { ExposedPort } from './composites';
import { getBlockDefinition } from './blocks';

/**
 * Auto-detect exposed ports from a selection of blocks.
 *
 * An input port is exposed if it's not connected to another selected block.
 * An output port is exposed if it's not connected to another selected block.
 */
export interface DetectedPorts {
  inputs: ExposedPort[];
  outputs: ExposedPort[];
}

export function detectExposedPorts(
  selectedBlocks: Block[],
  allConnections: Connection[]
): DetectedPorts {
  const selectedBlockIds = new Set(selectedBlocks.map(b => b.id));
  const inputs: ExposedPort[] = [];
  const outputs: ExposedPort[] = [];

  // Build a map of connections for quick lookup
  const connectionsToSelected = new Set<string>(); // port refs going TO selected blocks
  const connectionsFromSelected = new Set<string>(); // port refs coming FROM selected blocks

  for (const conn of allConnections) {
    const fromInSelection = selectedBlockIds.has(conn.from.blockId);
    const toInSelection = selectedBlockIds.has(conn.to.blockId);

    if (fromInSelection && toInSelection) {
      // Internal connection - mark both ends as connected
      connectionsFromSelected.add(`${conn.from.blockId}:${conn.from.slotId}`);
      connectionsToSelected.add(`${conn.to.blockId}:${conn.to.slotId}`);
    } else if (fromInSelection) {
      // Connection from selection to outside - output is connected
      connectionsFromSelected.add(`${conn.from.blockId}:${conn.from.slotId}`);
    } else if (toInSelection) {
      // Connection from outside to selection - input is connected
      connectionsToSelected.add(`${conn.to.blockId}:${conn.to.slotId}`);
    }
  }

  // Find exposed ports
  for (const block of selectedBlocks) {
    const definition = getBlockDefinition(block.type);
    if (!definition) continue;

    // Check input slots
    for (const slot of block.inputs) {
      const portKey = `${block.id}:${slot.id}`;
      // Input is exposed if it's NOT connected from another selected block
      const isConnectedInternally = connectionsToSelected.has(portKey);

      if (!isConnectedInternally) {
        inputs.push({
          id: `${block.id}_${slot.id}`,
          label: `${block.label}.${slot.label}`,
          direction: 'input',
          slotType: slot.type,
          nodeId: block.id,
          nodePort: slot.id,
        });
      }
    }

    // Check output slots
    for (const slot of block.outputs) {
      const portKey = `${block.id}:${slot.id}`;
      // Output is exposed if it's NOT connected to another selected block
      const isConnectedInternally = connectionsFromSelected.has(portKey);

      if (!isConnectedInternally) {
        outputs.push({
          id: `${block.id}_${slot.id}`,
          label: `${block.label}.${slot.label}`,
          direction: 'output',
          slotType: slot.type,
          nodeId: block.id,
          nodePort: slot.id,
        });
      }
    }
  }

  return { inputs, outputs };
}

/**
 * Generate a sanitized composite ID from a name.
 * Format: "user:<sanitized-name>"
 */
export function generateCompositeId(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `user:${sanitized}`;
}

/**
 * Convert selected blocks and connections to a Composite definition.
 */
export function createCompositeFromSelection(
  name: string,
  _description: string | undefined,
  _subcategory: string,
  selectedBlocks: Block[],
  allConnections: Connection[],
  _exposedInputIds: Set<string>,
  _exposedOutputIds: Set<string>
): Composite {
  const selectedBlockIds = new Set(selectedBlocks.map(b => b.id));

  // Filter connections that are internal to the selection
  const internalConnections: CompositeConnection[] = [];
  for (const conn of allConnections) {
    if (selectedBlockIds.has(conn.from.blockId) && selectedBlockIds.has(conn.to.blockId)) {
      internalConnections.push({
        id: conn.id,
        from: {
          blockId: conn.from.blockId,
          slotId: conn.from.slotId,
          direction: 'output' as const,
        },
        to: {
          blockId: conn.to.blockId,
          slotId: conn.to.slotId,
          direction: 'input' as const,
        },
      });
    }
  }

  const composite: Composite = {
    id: generateCompositeId(name),
    name,
    blocks: selectedBlocks.map(b => ({
      id: b.id,
      type: b.type,
      label: b.label,
      inputs: b.inputs,
      outputs: b.outputs,
      params: b.params,
      category: b.category,
      description: b.description,
    })),
    connections: internalConnections,
  };

  return composite;
}

/**
 * Validate that a composite name is valid (non-empty, not duplicate).
 */
export function validateCompositeName(
  name: string,
  existingComposites: Composite[]
): { valid: boolean; error?: string } {
  if (!name || name.trim() === '') {
    return { valid: false, error: 'Name cannot be empty' };
  }

  const id = generateCompositeId(name);
  const duplicate = existingComposites.some(c => c.id === id);
  if (duplicate) {
    return { valid: false, error: 'A composite with this name already exists' };
  }

  return { valid: true };
}
