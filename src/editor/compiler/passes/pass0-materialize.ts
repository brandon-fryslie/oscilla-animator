/**
 * Pass 0: Materialize Default Sources
 *
 * Converts unconnected inputs with default sources into hidden provider blocks with connections.
 * This eliminates the need for separate default source metadata and special-case input resolution.
 *
 * Sprint: Phase 0 - Sprint 2: Unify Default Sources with Blocks
 * References:
 * - .agent_planning/phase0-architecture-refactoring/PLAN-2025-12-31-170000-sprint2-default-sources.md
 * - .agent_planning/phase0-architecture-refactoring/DOD-2025-12-31-170000-sprint2-default-sources.md
 * - compiler-final/ARCHITECTURE-RECOMMENDATIONS.md Part 2
 */

import type { CompilerPatch, CompilerConnection, BlockInstance } from '../types';
import type { SlotWorld } from '../../types';
import type { TypeDesc } from '../ir/types';
import { getBlockDefinition } from '../../blocks';

/**
 * Map world + domain to DSConst* block type.
 * Returns the appropriate provider block type for a given input's type.
 */
function selectProviderType(world: SlotWorld, domain: string): string {
  // Normalize world: 'config' becomes 'scalar' at compile time
  const normalizedWorld = world === 'config' ? 'scalar' : world;

  const key = `${normalizedWorld}:${domain}`;

  const mapping: Record<string, string> = {
    // Scalar providers
    'scalar:float': 'DSConstScalarFloat',
    'scalar:int': 'DSConstScalarInt',
    'scalar:string': 'DSConstScalarString',
    'scalar:waveform': 'DSConstScalarWaveform',

    // Signal providers
    'signal:float': 'DSConstSignalFloat',
    'signal:int': 'DSConstSignalInt',
    'signal:color': 'DSConstSignalColor',
    'signal:vec2': 'DSConstSignalPoint',

    // Field providers
    'field:float': 'DSConstFieldFloat',
    'field:color': 'DSConstFieldColor',
    'field:vec2': 'DSConstFieldVec2',
  };

  const providerType = mapping[key];

  if (providerType === '' || providerType == null) {
    // Fallback for unmapped types - try to use a sensible default
    console.warn(`No provider block type for ${key}, falling back to DSConstSignalFloat`);
    return 'DSConstSignalFloat';
  }

  return providerType;
}

/**
 * Check if an input is connected via a CompilerConnection.
 */
function hasConnectionToInput(
  connections: readonly CompilerConnection[],
  blockId: string,
  slotId: string
): boolean {
  return connections.some(
    c => c.to.block === blockId && c.to.port === slotId
  );
}

/**
 * Generate a deterministic ID for a hidden provider block.
 */
function generateProviderId(blockId: string, slotId: string): string {
  return `${blockId}_default_${slotId}`;
}

/**
 * Materialize default sources as hidden provider blocks.
 *
 * This is Pass 0 of the compilation pipeline - it runs BEFORE pass 1.
 * It scans all blocks for inputs that:
 * 1. Have a defaultSource defined
 * 2. Are not connected via any CompilerConnection
 *
 * For each such input, it:
 * 1. Creates a hidden DSConst* provider block with the default value
 * 2. Creates a CompilerConnection from the provider to the input
 *
 * The result is a patch where ALL inputs are backed by connections, eliminating
 * the need for special-case input resolution in later passes.
 *
 * @param patch - The CompilerPatch from editorToPatch
 * @returns A new CompilerPatch with materialized default sources as hidden blocks
 */
export function materializeDefaultSources(patch: CompilerPatch): CompilerPatch {
  const existingConnections = patch.connections ?? [];

  const newBlocks: BlockInstance[] = [];
  const newConnections: CompilerConnection[] = [];

  // Scan all blocks for unconnected inputs with defaults
  for (const block of patch.blocks) {
    const blockDef = getBlockDefinition(block.type);

    if (blockDef == null) {
      // Block type not found - skip (will be caught by validation later)
      continue;
    }

    // Check each input
    for (const inputDef of blockDef.inputs) {
      // Does this input have a default source?
      if (inputDef.defaultSource == null) {
        continue;
      }

      // Is this input already connected?
      if (hasConnectionToInput(existingConnections, block.id, inputDef.id)) {
        continue;
      }

      // Create hidden provider block
      const providerId = generateProviderId(block.id, inputDef.id);
      const defaultSource = inputDef.defaultSource;

      // Determine provider block type based on input world and domain
      // Extract domain from the input type
      const inputType = inputDef.type;

      // Parse domain from SlotType string (e.g., "Signal<float>" -> "float")
      let domain = 'float'; // default
      if (typeof inputType === 'string') {
        const match = inputType.match(/<([^>]+)>/);
        if (match != null) {
          domain = match[1];
        } else if (inputType.includes(':')) {
          // Handle "Scalar:float" format
          domain = inputType.split(':')[1];
        }
      } else if (typeof inputType === 'object' && (inputType != null) && ('domain' in inputType)) {
        // TypeDesc format
        domain = (inputType as TypeDesc).domain;
      }

      const providerType = selectProviderType(defaultSource.world, domain);

      // Get the provider block definition
      const providerDef = getBlockDefinition(providerType);
      if (providerDef == null) {
        console.warn(`Provider block type not found: ${providerType}`);
        continue;
      }

      // Create the hidden provider BlockInstance (minimal format for CompilerPatch)
      const provider: BlockInstance = {
        id: providerId,
        type: providerType,
        params: { value: defaultSource.value },
        position: 0, // Hidden blocks have no position in CompilerPatch
      };

      // Create CompilerConnection from provider output to block input
      const connection: CompilerConnection = {
        id: `${providerId}_conn`,
        from: { block: providerId, port: 'out' },
        to: { block: block.id, port: inputDef.id },
      };

      newBlocks.push(provider);
      newConnections.push(connection);
    }
  }

  // Return new patch with augmented blocks and connections
  return {
    ...patch,
    blocks: [...patch.blocks, ...newBlocks],
    connections: [...existingConnections, ...newConnections],
  };
}
