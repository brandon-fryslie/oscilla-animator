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
    'scalar:bool': 'DSConstScalarBool',
    'scalar:color': 'DSConstScalarColor',
    'scalar:vec2': 'DSConstScalarVec2',
    'scalar:string': 'DSConstScalarString',

    // Signal providers
    'signal:float': 'DSConstSignalFloat',
    'signal:int': 'DSConstSignalInt',
    'signal:bool': 'DSConstSignalBool',
    'signal:color': 'DSConstSignalColor',
    'signal:vec2': 'DSConstSignalVec2',
    'signal:vec3': 'DSConstSignalVec3',
    'signal:phase': 'DSConstSignalPhase',
    'signal:time': 'DSConstSignalTime',

    // Field providers
    'field:float': 'DSConstFieldFloat',
    'field:vec2': 'DSConstFieldVec2',
    'field:vec3': 'DSConstFieldVec3',
    'field:color': 'DSConstFieldColor',
  };

  return mapping[key] || 'DSConstSignalFloat'; // Fallback
}

/**
 * Generate unique ID for provider block.
 * Format: `ds_${blockId}_${inputId}`
 */
function generateProviderId(blockId: string, inputId: string): string {
  return `ds_${blockId}_${inputId}`;
}

/**
 * Check if a block input is already driven by a connection.
 * Returns true if there's a wire or bus listener connected to this input.
 */
function isInputDriven(patch: CompilerPatch, blockId: string, inputId: string): boolean {
  // Check for direct wire connections
  for (const edge of patch.edges) {
    if (edge.to.kind === 'port' && edge.to.blockId === blockId && edge.to.slotId === inputId) {
      return true;
    }
  }

  // No wire found
  return false;
}

/**
 * Pass 0: Materialize Default Sources
 *
 * For each unconnected input with a default source:
 * 1. Create hidden provider block with matching world and domain
 * 2. Create edge from provider output to block input
 * 3. Mark blocks as hidden and with structural role
 *
 * Returns: CompilerPatch with augmented blocks and edges
 */
export function pass0Materialize(patch: CompilerPatch): CompilerPatch {
  const newBlocks: BlockInstance[] = [];
  const newEdges: Edge[] = [];

  // Process each block
  for (const block of patch.blocks) {
    // Look up block definition to get input defaults
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

      // Provide default 'signal' world if not specified
      const world: SlotWorld = defaultSource.world ?? 'signal';
      const providerType = selectProviderType(world, domain);

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
        role: { kind: 'default', meta: { defaultSourceBlockId: providerId } },
      };

      newBlocks.push(provider);
      newEdges.push(edge);
    }
  }

  // Return new patch with augmented blocks and edges
  return {
    blocks: [...patch.blocks, ...newBlocks],
    edges: [...patch.edges, ...newEdges],
  };
}
