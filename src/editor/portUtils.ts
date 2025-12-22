/**
 * Port Utilities
 *
 * Type compatibility checking and connection color assignment.
 *
 * NOTE: Type compatibility is delegated to the semantic module to ensure
 * the UI and compiler use the same rules. The local TypeDescriptor parsing
 * is retained for UI display purposes (badges, hints).
 */

import type { SlotType, Connection, Block, Slot, PortRef } from './types';
import { areSlotTypesCompatible, getCompatibilityHint } from './semantic';

// =============================================================================
// Slot Type Descriptors
// =============================================================================

type PortWorld =
  | 'signal'
  | 'field'
  | 'scalar'
  | 'event'
  | 'scene'
  | 'program'
  | 'render'
  | 'filter'
  | 'stroke'
  | 'unknown';

export interface TypeDescriptor {
  readonly raw: SlotType;
  readonly world: PortWorld;
  readonly domain: string | null;
}

export function formatTypeDescriptor(desc: TypeDescriptor): string {
  const worldGlyph: Record<PortWorld, string> = {
    signal: 'S',
    field: 'F',
    scalar: 'C',
    event: 'E',
    scene: 'SC',
    program: 'P',
    render: 'R',
    filter: 'FX',
    stroke: 'ST',
    unknown: '?',
  };
  const world = worldGlyph[desc.world] ?? '?';
  if (!desc.domain) return world;
  return `${world} · ${desc.domain}`;
}

export function formatSlotType(type: SlotType): string {
  return formatTypeDescriptor(describeSlotType(type));
}

/**
 * Human-readable compatibility hint for a slot type.
 * Delegates to the semantic module for consistent hints.
 */
export function slotCompatibilityHint(type: SlotType): string {
  return getCompatibilityHint(type);
}

function normalizeDomain(domain: string): string {
  switch (domain.toLowerCase()) {
    case 'point':
    case 'vec2':
      return 'vec2';
    case 'duration':
    case 'time':
      return 'time';
    case 'unit':
    case 'phase':
      return 'phase';
    case 'phasesample':
      return 'phase-sample';
    case 'number':
      return 'num';
    case 'hsl':
      return 'color';
    case 'scenetargets':
      return 'scene-targets';
    case 'scenestrokes':
      return 'scene-strokes';
    case 'rendertree':
      return 'render-tree';
    default:
      return domain.toLowerCase();
  }
}

/**
 * Parse a SlotType into a world + domain descriptor for compatibility checks and badges.
 */
export function describeSlotType(type: SlotType): TypeDescriptor {
  // Field<T>
  const fieldMatch = /^Field<(.*)>$/.exec(type);
  if (fieldMatch) {
    return {
      raw: type,
      world: 'field',
      domain: normalizeDomain(fieldMatch[1] ?? ''),
    };
  }

  // Signal<T>
  const signalMatch = /^Signal<(.*)>$/.exec(type);
  if (signalMatch) {
    return {
      raw: type,
      world: 'signal',
      domain: normalizeDomain(signalMatch[1] ?? ''),
    };
  }

  // Scalar:*
  const scalarMatch = /^Scalar:(.*)$/.exec(type);
  if (scalarMatch) {
    return {
      raw: type,
      world: 'scalar',
      domain: normalizeDomain(scalarMatch[1] ?? ''),
    };
  }

  // Events
  if (type.startsWith('Event<')) {
    return { raw: type, world: 'event', domain: 'event' };
  }

  // Scene-ish
  if (type === 'Scene' || type === 'SceneTargets' || type === 'SceneStrokes') {
    return { raw: type, world: 'scene', domain: normalizeDomain(type) };
  }

  // Program / Render
  if (type === 'Program') return { raw: type, world: 'program', domain: 'program' };
  if (type === 'RenderTree' || type === 'RenderNode' || type === 'RenderNode[]') {
    return { raw: type, world: 'render', domain: normalizeDomain(type) };
  }

  // Filters / Stroke styles
  if (type === 'FilterDef') return { raw: type, world: 'filter', domain: 'filter' };
  if (type === 'StrokeStyle') return { raw: type, world: 'stroke', domain: 'stroke' };

  // Element count (treated like numeric scalar)
  if (type === 'ElementCount') {
    return { raw: type, world: 'scalar', domain: 'num' };
  }

  return { raw: type, world: 'unknown', domain: null };
}

// =============================================================================
// Type Compatibility
// =============================================================================

/**
 * Check if two slot types are compatible for connection.
 * Delegates to the semantic module to ensure UI and compiler use the same rules.
 *
 * @param outputType The source SlotType (from output port)
 * @param inputType The target SlotType (to input port)
 * @returns true if the types are compatible
 */
export function areTypesCompatible(outputType: SlotType, inputType: SlotType): boolean {
  return areSlotTypesCompatible(outputType, inputType);
}

/**
 * Find all compatible ports for a given port.
 * @param port The source port
 * @param blocks All blocks in the patch
 * @param connections Existing connections
 * @returns List of compatible ports (on other blocks)
 */
export function findCompatiblePorts(
  port: PortRef,
  sourceSlot: Slot,
  blocks: Block[],
  connections: Connection[]
): Array<{ block: Block; slot: Slot; portRef: PortRef }> {
  const compatible: Array<{ block: Block; slot: Slot; portRef: PortRef }> = [];

  // Determine what we're looking for
  const lookingForDirection = port.direction === 'output' ? 'input' : 'output';

  for (const block of blocks) {
    // Skip same block
    if (block.id === port.blockId) continue;

    const slotsToCheck = lookingForDirection === 'input' ? block.inputs : block.outputs;

    for (const slot of slotsToCheck) {
      // Check type compatibility
      const isCompatible =
        port.direction === 'output'
          ? areTypesCompatible(sourceSlot.type, slot.type)
          : areTypesCompatible(slot.type, sourceSlot.type);

      if (!isCompatible) continue;

      // Check if already connected (inputs can only have one connection)
      if (lookingForDirection === 'input') {
        const existingConnection = connections.find(
          (c) => c.to.blockId === block.id && c.to.slotId === slot.id
        );
        if (existingConnection) continue; // Input already has a connection
      }

      // Check for cycles (would need graph traversal - simplified for now)
      // TODO: Implement proper cycle detection

      compatible.push({
        block,
        slot,
        portRef: {
          blockId: block.id,
          slotId: slot.id,
          direction: lookingForDirection,
        },
      });
    }
  }

  return compatible;
}

// =============================================================================
// Connection Colors
// =============================================================================

/**
 * Color palette for connection visualization.
 * Each unique connection gets a color to help users track wires visually.
 */
const CONNECTION_COLORS = [
  '#4ade80', // green
  '#60a5fa', // blue
  '#f472b6', // pink
  '#facc15', // yellow
  '#a78bfa', // purple
  '#fb923c', // orange
  '#2dd4bf', // teal
  '#e879f9', // fuchsia
  '#a3e635', // lime
  '#38bdf8', // sky
];

/**
 * Assign a color to a connection based on its index.
 * Colors cycle through the palette.
 */
export function getConnectionColor(connectionIndex: number): string {
  return CONNECTION_COLORS[connectionIndex % CONNECTION_COLORS.length];
}

/**
 * Build a map of port -> color for visual indication.
 * Connected ports share the same color.
 */
export function buildPortColorMap(
  connections: Connection[]
): Map<string, string> {
  const colorMap = new Map<string, string>();

  connections.forEach((conn, index) => {
    const color = getConnectionColor(index);
    const fromKey = `${conn.from.blockId}:${conn.from.slotId}`;
    const toKey = `${conn.to.blockId}:${conn.to.slotId}`;

    // Outputs can have multiple connections, so take the first color assigned
    if (!colorMap.has(fromKey)) {
      colorMap.set(fromKey, color);
    }
    // Inputs should only have one connection
    colorMap.set(toKey, color);
  });

  return colorMap;
}

/**
 * Get the color for a specific port.
 */
export function getPortColor(
  blockId: string,
  slotId: string,
  colorMap: Map<string, string>
): string | null {
  return colorMap.get(`${blockId}:${slotId}`) ?? null;
}

/**
 * Check if a port has any connections.
 */
export function isPortConnected(
  blockId: string,
  slotId: string,
  direction: 'input' | 'output',
  connections: Connection[]
): boolean {
  if (direction === 'output') {
    return connections.some(
      (c) => c.from.blockId === blockId && c.from.slotId === slotId
    );
  } else {
    return connections.some(
      (c) => c.to.blockId === blockId && c.to.slotId === slotId
    );
  }
}

/**
 * Get all connections for a specific port.
 */
export function getConnectionsForPort(
  blockId: string,
  slotId: string,
  direction: 'input' | 'output',
  connections: Connection[]
): Connection[] {
  if (direction === 'output') {
    return connections.filter(
      (c) => c.from.blockId === blockId && c.from.slotId === slotId
    );
  } else {
    return connections.filter(
      (c) => c.to.blockId === blockId && c.to.slotId === slotId
    );
  }
}
