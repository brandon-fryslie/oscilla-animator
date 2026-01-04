import type { BlockDefinition, BlockTags } from './types';
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

// Import default source provider blocks (Sprint 4+)
import * as DefaultSourceProviders from './default-source-providers';

// Import BusBlock (hidden bus representation)
import * as BusBlockModule from './bus-block';

// Import validation for primitive closure enforcement
import { validateBlockDefinitions } from './registry-validation';

const ALL_INDIVIDUAL_BLOCKS: BlockDefinition[] = [
  ...Object.values(DomainBlocks),
  ...Object.values(TimeRootBlocks),
  ...Object.values(SignalBlocks),
  ...Object.values(RhythmBlocks),
  ...Object.values(FieldPrimitiveBlocks),
  ...Object.values(MacroBlocks),
  ...Object.values(DefaultSourceProviders),
  ...Object.values(BusBlockModule),
].filter((block): block is BlockDefinition => (block as BlockDefinition).type !== undefined);


/**
 * Normalize tags with canonical defaults for form/subcategory.
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
  return tags;
}

/**
 * Check if a block should be hidden from user-facing UI.
 *
 * Hidden blocks (e.g., default source providers) are tagged with `hidden: true`.
 * They should not appear in:
 * - Block palette (BlockLibrary)
 * - Context menu replacements
 * - Search results
 * - Any user-facing block lists
 *
 * They may intentionally appear in:
 * - Debug/diagnostic UIs
 * - Internal system listings
 *
 * @param definition - Block definition to check
 * @returns true if block should be hidden from UI
 */
export function isBlockHidden(definition: BlockDefinition): boolean {
  return getBlockTags(definition).hidden === true;
}

export function getBlockDefinitions(): readonly BlockDefinition[] {
  return ALL_INDIVIDUAL_BLOCKS.map(normalizeDefinition);
}

// ============================================================================
// Registry Validation - Enforces Primitive Closure
// ============================================================================
// Validate all block definitions on module load (fail-fast).
// This ensures the registry complies with KERNEL_PRIMITIVES allowlist.
try {
  const allDefinitions = getBlockDefinitions();
  validateBlockDefinitions(allDefinitions);
} catch (error) {
  // Re-throw with context about where the error occurred
  if (error instanceof Error) {
    error.message = `Registry validation failed during initialization:\n${error.message}`;
  }
  throw error;
}

export const BLOCK_DEFS_BY_TYPE = new Map<string, BlockDefinition>(
  getBlockDefinitions().map((def) => [def.type, def])
);

/**
 * Lane-aware filtering
 */
export function getBlocksForPalette(): { matched: readonly BlockDefinition[]; other: readonly BlockDefinition[] } {
  const allBlocks = getBlockDefinitions();
  return { matched: allBlocks, other: [] };
}

/**
 * Get block definition by type.
 */
export function getBlockDefinition(type: string): BlockDefinition | undefined {
  return BLOCK_DEFS_BY_TYPE.get(type);
}
