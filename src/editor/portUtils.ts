/**
 * Port Utilities
 *
 * Type compatibility checking and connection color assignment.
 *
 * NOTE: Type compatibility is delegated to the semantic module to ensure
 * the UI and compiler use the same rules. The local TypeDescriptor parsing
 * is retained for UI display purposes (badges, hints).
 */

import type { SlotType, Edge, Block, Slot, PortRef } from './types';
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
  if (desc.domain === null || desc.domain === '') return world;
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
      return 'unit';
    case 'phase':
      return 'phase';
    case 'phasesample':
      return 'phase-sample';
    case 'number':
    case 'float':
    case 'int':
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
  edges: Edge[]
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

      // Check if already connected (inputs can only have one edge)
      if (lookingForDirection === 'input') {
        const existingEdge = edges.find(
          (e) => e.to.blockId === block.id && e.to.slotId === slot.id
        );
        if (existingEdge) continue; // Input already has an edge
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
  edges: Edge[]
): Map<string, string> {
  const colorMap = new Map<string, string>();

  edges.forEach((edge, index) => {
    const color = getConnectionColor(index);
    const fromKey = `${edge.from.blockId}:${edge.from.slotId}`;
    const toKey = `${edge.to.blockId}:${edge.to.slotId}`;

    // Outputs can have multiple edges, so take the first color assigned
    if (!colorMap.has(fromKey)) {
      colorMap.set(fromKey, color);
    }
    // Inputs should only have one edge
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
 * Check if a port has any edges.
 */
export function isPortConnected(
  blockId: string,
  slotId: string,
  direction: 'input' | 'output',
  edges: Edge[]
): boolean {
  if (direction === 'output') {
    return edges.some(
      (e) => e.from.blockId === blockId && e.from.slotId === slotId
    );
  } else {
    return edges.some(
      (e) => e.to.blockId === blockId && e.to.slotId === slotId
    );
  }
}

/**
 * Get all edges for a specific port.
 */
export function getEdgesForPort(
  blockId: string,
  slotId: string,
  direction: 'input' | 'output',
  edges: Edge[]
): Edge[] {
  if (direction === 'output') {
    return edges.filter(
      (e) => e.from.blockId === blockId && e.from.slotId === slotId
    );
  } else {
    return edges.filter(
      (e) => e.to.blockId === blockId && e.to.slotId === slotId
    );
  }
}

/**
 * Check if an input port is "driven" by an external source.
 * An input is driven if it has either:
 * - A wire edge from another block's output
 * - A bus listener attached (edge from BusBlock)
 *
 * When an input is NOT driven, its DefaultSource provides the value.
 * When an input IS driven, the DefaultSource is inactive (but still exists).
 */
export function isInputDriven(
  blockId: string,
  slotId: string,
  edges: readonly Edge[],
): boolean {
  // Check for wire edge
  const hasWire = edges.some(
    (e) => e.to.blockId === blockId && e.to.slotId === slotId
  );
  if (hasWire) return true;

  // Bus listeners are now implicit as edges from BusBlock
  return false;
}
