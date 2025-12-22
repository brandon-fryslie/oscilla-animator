import type { BlockDefinition, BlockTags, LaneKind } from './types';
import { getBlockForm } from './types';

// Import domain blocks (new system only)
import * as DomainBlocks from './domain';

// Import TimeRoot blocks (Phase 3: TimeRoot)
import * as TimeRootBlocks from './time-root';

// Import signal blocks (Slice 1: Breathing Energy System)
import * as SignalBlocks from './signal';

// Import rhythm blocks (Slice 2: Rhythmic Accent System)
import * as RhythmBlocks from './rhythm';

// Import field primitive blocks (Slices 4-8)
import * as FieldPrimitiveBlocks from './field-primitives';

// Import macro blocks (Slice demos)
import * as MacroBlocks from './macros';

// Import composite bridge for optional composite support
import { getCompositeBlockDefinitions } from '../composite-bridge';

const ALL_INDIVIDUAL_BLOCKS: BlockDefinition[] = [
  ...Object.values(DomainBlocks),
  ...Object.values(TimeRootBlocks),
  ...Object.values(SignalBlocks),
  ...Object.values(RhythmBlocks),
  ...Object.values(FieldPrimitiveBlocks),
  ...Object.values(MacroBlocks),
].filter((block): block is BlockDefinition => (block as BlockDefinition).type !== undefined);


/**
 * Normalize tags with canonical defaults for form/subcategory/legacy category.
 */
function normalizeDefinition(definition: BlockDefinition): BlockDefinition {
  const normalizedDef: BlockDefinition = { ...definition };
  normalizedDef.tags = getBlockTags(normalizedDef);
  return normalizedDef;
}

export function getBlockTags(definition: BlockDefinition): BlockTags {
  const tags: BlockTags = { ...(definition.tags ?? {}) };

  // Normalize canonical tags - form is derived, not stored
  tags.form = getBlockForm(definition);
  tags.subcategory = definition.subcategory ?? 'Other';
  tags.laneKind = definition.laneKind;

  if (definition.laneFlavor) {
    tags.laneFlavor = definition.laneFlavor;
  }

  return tags;
}

export function getBlockDefinitions(includeComposites: boolean = false): readonly BlockDefinition[] {
  const coreBlocks = ALL_INDIVIDUAL_BLOCKS.map(normalizeDefinition);

  if (includeComposites) {
    const composites = getCompositeBlockDefinitions();
    return [...coreBlocks, ...composites.map(normalizeDefinition)];
  }

  return coreBlocks;
}

export const BLOCK_DEFS_BY_TYPE = new Map<string, BlockDefinition>(
  getBlockDefinitions(true).map((def) => [def.type, def])
);

/**
 * Lane-aware filtering
 */
export function getBlocksForLaneKind(laneKind?: LaneKind): readonly BlockDefinition[] {
  const allBlocks = getBlockDefinitions(true);

  if (!laneKind) {
    return allBlocks; // All blocks available for general context
  }

  // Filter blocks matching the lane kind
  return allBlocks.filter((block) => {
    if (block.laneKind === laneKind) {
      return true;
    }

    // Allow cross-lane blocks (e.g., adapters) in any lane
    if (block.laneKind === undefined) {
      return true;
    }

    return false;
  });
}

/**
 * Get blocks for palette with lane filtering support.
 * Returns matched blocks (exact lane) and other blocks (cross-lane/adapters).
 */
export function getBlocksForPalette(
  filterByLane: boolean,
  laneKind?: LaneKind,
  _laneFlavor?: string
): { matched: readonly BlockDefinition[]; other: readonly BlockDefinition[] } {
  const allBlocks = getBlockDefinitions(true);

  if (!filterByLane || !laneKind) {
    return { matched: allBlocks, other: [] };
  }

  const matched: BlockDefinition[] = [];
  const other: BlockDefinition[] = [];

  for (const block of allBlocks) {
    if (block.laneKind === laneKind) {
      matched.push(block);
    } else if (block.laneKind === undefined) {
      // Cross-lane blocks (adapters) go to "other"
      other.push(block);
    }
    // Blocks from other lanes are excluded entirely
  }

  return { matched, other };
}

/**
 * Get block definition by type
 */
export function getBlockDefinition(type: string): BlockDefinition | undefined {
  return BLOCK_DEFS_BY_TYPE.get(type);
}
