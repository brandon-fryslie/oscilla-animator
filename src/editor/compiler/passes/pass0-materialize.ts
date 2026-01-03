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

import type { CompilerPatch, BlockInstance } from '../types';
import type { SlotWorld, Edge } from '../../types';
import type { TypeDesc } from '../ir/types';
import { getBlockDefinition } from '../../blocks';

/**
 * Map world + domain to provider block type.
 * Returns the appropriate provider block type for a given input's type.
 *
 * Workstream 03: Domain defaults use DomainN, not DSConstSignalFloat.
 */
function selectProviderType(world: SlotWorld, domain: string): string {
  // Normalize world: 'config' becomes 'scalar' at compile time
  const normalizedWorld = world === 'config' ? 'scalar' : world;

  // Special case: config/domain uses DomainN structural block
  // Workstream 03: Domain inputs get structural defaults (DomainN) instead of signal constants
  if (world === 'config' && domain === 'domain') {
    return 'DomainN';
  }

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
 * Check if an input is driven (has a wire OR an enabled bus listener).
 * Returns true if the input is already driven, false if it needs a default provider.
 */
function isInputDriven(
  patch: CompilerPatch,
  blockId: string,
  slotId: string
): boolean {
  // Check for edge: any edge to this input
  const hasEdge = patch.edges.some(
    e => e.to.blockId === blockId && e.to.slotId === slotId
  );

  // Bus-Block Unification: Check for edge from any BusBlock to this input
  const busBlockIds = new Set(patch.blocks.filter(b => b.type === 'BusBlock').map(b => b.id));
  const hasListener = patch.edges.some(
    e => busBlockIds.has(e.from.blockId) && e.to.blockId === blockId && e.to.slotId === slotId
  );

  // Returns true if EITHER check is true (has edge OR has listener)
  return hasEdge || hasListener;
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
 * This is System 2 of the dual default source system:
 * - System 1 (injectDefaultSourceProviders): Advanced providers from allowlist (e.g., Oscillator)
 * - System 2 (materializeDefaultSources): Simple DSConst* defaults from block metadata
 *
 * This function runs FIRST in the pipeline. It scans all blocks for inputs that:
 * 1. Have a defaultSource defined in block metadata
 * 2. Are not connected via any Edge
 * 3. Are not connected via any enabled bus Listener
 *
 * For each such input, it:
 * 1. Creates a hidden provider block (DSConst* or DomainN) with the default value
 * 2. Creates an Edge from the provider to the input
 *
 * The result is a patch where simple defaults are materialized as blocks.
 * Advanced defaults (from System 1) will be injected later and will skip inputs
 * that already have connections from System 2.
 *
 * Workstream 03 (P0): Domain defaults create DomainN blocks, not DSConst* blocks.
 * This fixes render sinks that expect structural domain providers.
 *
 * @param patch - The CompilerPatch from editorToPatch
 * @returns A new CompilerPatch with materialized default sources as hidden blocks
 */
export function materializeDefaultSources(patch: CompilerPatch): CompilerPatch {
  const newBlocks: BlockInstance[] = [];
  const newEdges: Edge[] = [];

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

      // Is this input already driven (by wire or bus listener)?
      if (isInputDriven(patch, block.id, inputDef.id)) {
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

      // Workstream 03: Domain defaults create DomainN with N from defaultSource.value
      // DomainN expects { n: int, seed: int } params
      let providerParams: Record<string, unknown>;
      if (providerType === 'DomainN') {
        // Domain default: wire defaultSource.value to DomainN.n
        const count = typeof defaultSource.value === 'number'
          ? Math.max(1, Math.floor(defaultSource.value))
          : 30; // Safe default if value is invalid

        providerParams = {
          n: count,
          seed: 0, // Default seed
        };
      } else {
        // Standard DSConst* block: { value: T }
        providerParams = { value: defaultSource.value };
      }

      // Create the hidden provider BlockInstance (minimal format for CompilerPatch)
      const provider: BlockInstance = {
        id: providerId,
        type: providerType,
        params: providerParams,
        position: 0, // Hidden blocks have no position in CompilerPatch
      };

      // Create Edge from provider output to block input
      // DomainN output port is 'domain', DSConst* output port is 'out'
      const providerOutputPort = providerType === 'DomainN' ? 'domain' : 'out';

      const edge: Edge = {
        id: `${providerId}_edge`,
        from: { kind: 'port', blockId: providerId, slotId: providerOutputPort },
        to: { kind: 'port', blockId: block.id, slotId: inputDef.id },
        enabled: true,
      };

      newBlocks.push(provider);
      newEdges.push(edge);
    }
  }

  // Return new patch with augmented blocks and edges
  return {
    ...patch,
    blocks: [...patch.blocks, ...newBlocks],
    edges: [...patch.edges, ...newEdges],
  };
}
