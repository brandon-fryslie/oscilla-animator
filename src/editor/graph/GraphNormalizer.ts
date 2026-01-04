/**
 * Graph Normalizer
 *
 * Pure function that transforms RawGraph (user intent) into NormalizedGraph (compiler input).
 * Materializes default sources as structural blocks with edges.
 *
 * Sprint: Graph Normalization Layer (2026-01-03)
 * References:
 * - .agent_planning/graph-normalization/PLAN-2026-01-03-121815.md
 * - .agent_planning/graph-normalization/USER-RESPONSE-2026-01-03.md
 * - Migrated from: src/editor/compiler/passes/pass0-materialize.ts
 */

import type { RawGraph, NormalizedGraph } from './types';
import type { Block, Edge, PortRef, BlockRole, EdgeRole, TypeDesc } from '../types';
import { getBlockDefinition } from '../blocks';

// =============================================================================
// Local Type Definitions
// =============================================================================

/**
 * SlotWorld - type of value domain (scalar, signal, field, config).
 * Local definition since it's not exported from types.ts yet.
 */
type SlotWorld = 'signal' | 'field' | 'scalar' | 'config';

// =============================================================================
// Helper Functions (migrated from pass0-materialize.ts)
// =============================================================================

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
 * Check if an input is driven (has a wire).
 * Returns true if the input is already driven, false if it needs a default provider.
 *
 * Note: Bus normalization is deferred, so we only check for direct edges.
 */
function isInputDriven(
  raw: RawGraph,
  blockId: string,
  slotId: string
): boolean {
  // Check for edge: any edge to this input
  return raw.edges.some(
    e => e.to.kind === 'port' && e.to.blockId === blockId && e.to.slotId === slotId
  );
}

/**
 * Generate a deterministic ID for a structural provider block.
 * Simple string concatenation as per user specification.
 */
function generateProviderId(blockId: string, slotId: string): string {
  return `${blockId}_default_${slotId}`;
}

/**
 * Build params for a provider block based on its type.
 * DomainN expects { n, seed }, DSConst* expects { value }.
 */
function buildProviderParams(providerType: string, defaultValue: unknown): Record<string, unknown> {
  if (providerType === 'DomainN') {
    // Domain default: wire defaultValue to DomainN.n
    const count = typeof defaultValue === 'number'
      ? Math.max(1, Math.floor(defaultValue))
      : 30; // Safe default if value is invalid

    return {
      n: count,
      seed: 0, // Default seed
    };
  }

  // Standard DSConst* block: { value: T }
  return { value: defaultValue };
}

/**
 * Extract domain from a type descriptor.
 * Works with both core TypeDesc (from types.ts) and IR TypeDesc (from compiler/ir/types).
 */
function extractDomain(inputType: TypeDesc): string {
  // TypeDesc format: just extract the domain
  return inputType.domain;
}

// =============================================================================
// Main Normalization Function
// =============================================================================

/**
 * Normalize a RawGraph into a NormalizedGraph.
 *
 * This is a pure transformation that:
 * 1. Scans RawGraph for unconnected inputs with default sources
 * 2. Creates structural provider blocks (DSConst*, DomainN)
 * 3. Creates structural edges from providers to inputs
 * 4. Tags all structural artifacts with appropriate role metadata
 *
 * Eager normalization: Recomputes on every RawGraph mutation, cached until next edit.
 *
 * Anchor-based IDs: Deterministic from structure, not creation order.
 * Moving blocks doesn't change their provider IDs.
 *
 * @param raw - The RawGraph (user blocks + edges only)
 * @returns A NormalizedGraph (user + structural blocks + edges)
 */
export function normalize(raw: RawGraph): NormalizedGraph {
  const structuralBlocks: Block[] = [];
  const structuralEdges: Edge[] = [];

  // For each user block
  for (const block of raw.blocks) {
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

      // Is this input already driven (by wire)?
      if (isInputDriven(raw, block.id, inputDef.id)) {
        continue;
      }

      // Create structural provider block
      const providerId = generateProviderId(block.id, inputDef.id);
      const defaultSource = inputDef.defaultSource;

      // Handle undefined world - default to 'signal' if not specified
      const world: SlotWorld = defaultSource.world ?? 'signal';

      // Determine provider block type based on input world and domain
      const domain = extractDomain(inputDef.type);
      const providerType = selectProviderType(world, domain);

      // Get the provider block definition
      const providerDef = getBlockDefinition(providerType);
      if (providerDef == null) {
        console.warn(`Provider block type not found: ${providerType}`);
        continue;
      }

      // Build provider params (DomainN vs DSConst*)
      const providerParams = buildProviderParams(providerType, defaultSource.value);

      // Create the port reference for role metadata
      const targetPort: PortRef = {
        blockId: block.id,
        slotId: inputDef.id,
        direction: 'input',
      };

      // Create role metadata for structural block
      const blockRole: BlockRole = {
        kind: 'structural',
        meta: {
          kind: 'defaultSource',
          target: { kind: 'port', port: targetPort }
        }
      };

      // Create the structural provider Block
      const provider: Block = {
        id: providerId,
        type: providerType,
        label: `Default ${inputDef.id}`,
        position: { x: 0, y: 0 },  // Hidden blocks have no meaningful position
        params: providerParams,
        form: 'primitive',
        hidden: true,  // Structural blocks are hidden
        role: blockRole,
      };

      // Create Edge from provider output to block input
      // DomainN output port is 'domain', DSConst* output port is 'out'
      const providerOutputPort = providerType === 'DomainN' ? 'domain' : 'out';

      // Create role metadata for structural edge
      const edgeRole: EdgeRole = {
        kind: 'default',
        meta: { defaultSourceBlockId: providerId }
      };

      const edge: Edge = {
        id: `${providerId}_edge`,
        from: { kind: 'port', blockId: providerId, slotId: providerOutputPort },
        to: { kind: 'port', blockId: block.id, slotId: inputDef.id },
        enabled: true,
        role: edgeRole,
      };

      structuralBlocks.push(provider);
      structuralEdges.push(edge);
    }
  }

  // Return normalized graph with user + structural artifacts
  return {
    blocks: [...raw.blocks, ...structuralBlocks],
    edges: [...raw.edges, ...structuralEdges],
  };
}
