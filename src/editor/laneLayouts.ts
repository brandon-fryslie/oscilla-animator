/**
 * Lane Layout Presets
 *
 * Defines preset lane arrangements users can switch between.
 * Per lane-mode.md and lane-mode-2.md specs.
 */

import type { LaneTemplate, LaneKind, LaneLayout } from './types';

// =============================================================================
// Simple Layout (5 lanes) - from lane-mode.md
// =============================================================================

const SIMPLE_LANES: readonly LaneTemplate[] = [
  {
    id: 'scene',
    kind: 'Scene',
    label: 'Scene',
    description: 'What are we animating? Logo, text, selections',
    flowStyle: 'patchbay',
  },
  {
    id: 'phase',
    kind: 'Phase',
    label: 'Phases',
    description: 'When does it happen? Entrance, hold, exit',
    flowStyle: 'patchbay',
  },
  {
    id: 'fields',
    kind: 'Fields',
    label: 'Fields',
    description: 'How does it vary? Timing, motion, style per element',
    flowStyle: 'patchbay',
  },
  {
    id: 'spec',
    kind: 'Spec',
    label: 'Spec',
    description: 'What kind of animation? LineMorph, Particles, etc.',
    flowStyle: 'chain',
  },
  {
    id: 'program',
    kind: 'Program',
    label: 'Program',
    description: 'Compile, transform, and output',
    flowStyle: 'chain',
  },
];

export const SIMPLE_LAYOUT: LaneLayout = {
  id: 'simple',
  name: 'Simple (5 lanes)',
  description: 'Clean layout with one lane per concept. Good for learning.',
  lanes: SIMPLE_LANES,
  isPreset: true,
};

// =============================================================================
// Detailed Layout (9 lanes) - from lane-mode-2.md
// =============================================================================

const DETAILED_LANES: readonly LaneTemplate[] = [
  {
    id: 'scene',
    kind: 'Scene',
    label: 'Scene & Targets',
    description: 'Logo, text, selections - what we animate',
    flowStyle: 'patchbay',
  },
  {
    id: 'phase',
    kind: 'Phase',
    label: 'Phases & Time',
    description: 'Entrance, hold, exit - macro time structure',
    flowStyle: 'patchbay',
  },
  {
    id: 'fields-motion',
    kind: 'Fields',
    label: 'Motion Params',
    description: 'Origins, trajectories, positions',
    flavor: 'Motion',
    flowStyle: 'patchbay',
  },
  {
    id: 'fields-timing',
    kind: 'Fields',
    label: 'Timing Params',
    description: 'Delays, durations, stagger',
    flavor: 'Timing',
    flowStyle: 'patchbay',
  },
  {
    id: 'fields-style',
    kind: 'Fields',
    label: 'Style Params',
    description: 'Colors, sizes, opacity',
    flavor: 'Style',
    flowStyle: 'patchbay',
  },
  {
    id: 'spec',
    kind: 'Spec',
    label: 'Archetype Spec',
    description: 'Animation intent: LineMorph, Particles, Glitch',
    flowStyle: 'chain',
  },
  {
    id: 'compile',
    kind: 'Program',
    label: 'Compile',
    description: 'Turn spec into runnable program',
    flowStyle: 'chain',
  },
  {
    id: 'compositors',
    kind: 'Program',
    label: 'Compositors',
    description: 'Transform, ripple, color grade',
    flowStyle: 'chain',
  },
  {
    id: 'output',
    kind: 'Output',
    label: 'Output & Export',
    description: 'Preview, render, export SVG/CSS',
    flowStyle: 'chain',
  },
];

export const DETAILED_LAYOUT: LaneLayout = {
  id: 'detailed',
  name: 'Detailed (9 lanes)',
  description: 'Explicit lanes for each parameter type. More guidance.',
  lanes: DETAILED_LANES,
  isPreset: true,
};

// =============================================================================
// All Presets
// =============================================================================

export const PRESET_LAYOUTS: readonly LaneLayout[] = [
  SIMPLE_LAYOUT,
  DETAILED_LAYOUT,
];

export const DEFAULT_LAYOUT = SIMPLE_LAYOUT;

/**
 * Get a preset layout by ID.
 */
export function getLayoutById(id: string): LaneLayout | undefined {
  return PRESET_LAYOUTS.find((l) => l.id === id);
}

/**
 * Find the best matching lane in a layout for a given lane kind.
 * Used when migrating blocks between layouts.
 */
export function findLaneForKind(
  layout: LaneLayout,
  kind: LaneKind,
  flavor?: string
): LaneTemplate | undefined {
  // First try to match both kind and flavor
  if (flavor !== undefined && flavor !== null && flavor !== '') {
    const flavorMatch = layout.lanes.find(
      (l) => l.kind === kind && l.flavor === flavor
    );
    if (flavorMatch !== undefined && flavorMatch !== null) return flavorMatch;
  }

  // Fall back to just kind match
  return layout.lanes.find((l) => l.kind === kind);
}

/**
 * Map a lane ID from one layout to the best match in another layout.
 * Returns the target lane ID, or the first lane of same kind, or first lane.
 */
export function mapLaneToLayout(
  sourceLaneId: string,
  sourceLayout: LaneLayout,
  targetLayout: LaneLayout
): string {
  // Find source lane
  const sourceLane = sourceLayout.lanes.find((l) => l.id === sourceLaneId);
  if (!sourceLane) {
    // Unknown lane, put in first lane
    return targetLayout.lanes[0]?.id ?? 'unknown';
  }

  // Try exact ID match first
  const exactMatch = targetLayout.lanes.find((l) => l.id === sourceLaneId);
  if (exactMatch) return exactMatch.id;

  // Try kind + flavor match
  const bestMatch = findLaneForKind(targetLayout, sourceLane.kind, sourceLane.flavor);
  if (bestMatch) return bestMatch.id;

  // Fall back to first lane
  return targetLayout.lanes[0]?.id ?? 'unknown';
}

export type { LaneLayout };
