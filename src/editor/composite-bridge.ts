/**
 * Composite Bridge - Integration between Composite System and Block/Compiler Systems
 *
 * This module provides the integration layer between the composite definition system
 * (in composites.ts) and the existing block registry and compiler systems.
 */

import type { BlockDefinition, BlockTags } from './blocks/types';
import type { CompoundGraph } from './blocks/types';
import type { CompositeDefinition, CompositeGraph } from './composites';
import type { BlockCompiler } from './compiler/types';
import { listCompositeDefinitions } from './composites';

// Import domain composites to trigger registration
import './domain-composites';

// Import signal composites (P2: Bus-aware composites)
import './signal-composites';

// Import Golden Patch composites (Slice 9 validation)
import './golden-patch-composites';

// =============================================================================
// Type Conversion Functions
// =============================================================================

/**
 * Convert a CompositeDefinition to a BlockDefinition for use in the block registry.
 */
export function compositeToBlockDefinition(def: CompositeDefinition): BlockDefinition {
  // Convert exposed inputs to block input ports
  const inputs = def.exposedInputs.map(port => ({
    id: port.id,
    label: port.label,
    type: port.slotType,
    direction: 'input' as const,
  }));

  // Convert exposed outputs to block output ports
  const outputs = def.exposedOutputs.map(port => ({
    id: port.id,
    label: port.label,
    type: port.slotType,
    direction: 'output' as const,
  }));

  return {
    type: `composite:${def.id}`,
    label: def.label,
    description: def.description || `Composite: ${def.label}`,
    color: def.color ?? '#666666',
    subcategory: def.subcategory,
    laneKind: def.laneKind,
    laneFlavor: def.laneFlavor,
    // Note: form is derived from compositeDefinition via getBlockForm()
    inputs,
    outputs,
    defaultParams: {}, // Empty default params
    paramSchema: [], // Parameters are dynamic from the exposed ports
    priority: 100, // Lower priority than primitive blocks
    tags: {
      ...def.tags,
      subcategory: def.subcategory,
      laneKind: def.laneKind,
      origin: 'composite',
    } as BlockTags,
    // Store the composite definition for compiler integration
    compositeDefinition: def,
    primitiveGraph: compositeToPrimitiveGraph(def.graph),
  };
}

/**
 * Convert a CompositeGraph to the CompoundGraph format expected by the compiler.
 * The formats are actually compatible, just need type conversion.
 */
export function compositeToPrimitiveGraph(graph: CompositeGraph): CompoundGraph {
  return {
    nodes: graph.nodes,
    edges: graph.edges,
    inputMap: graph.inputMap,
    outputMap: graph.outputMap,
  };
}

// =============================================================================
// Compiler Integration
// =============================================================================

/**
 * Create a block compiler for a composite definition.
 * This compiler handles the expansion of composites into their internal graph.
 */
export function createCompositeCompiler(def: CompositeDefinition): BlockCompiler {
  return {
    type: `composite:${def.id}`,
    inputs: [],
    outputs: [],
    compile: () => {
      // Composites don't compile directly - they're expanded by expandComposites()
      // This compiler exists mainly to satisfy the registry interface
      throw new Error(`Composite blocks should be expanded before compilation: ${def.id}`);
    },
  };
}

// =============================================================================
// Registration Functions
// =============================================================================

/**
 * Register all composite definitions with the block registry and compiler.
 * This should be called during system initialization.
 */
export function registerAllComposites(): void {
  const composites = listCompositeDefinitions();

  for (const composite of composites) {
    registerComposite(composite);
  }
}

// Global registry for composite compilers to avoid circular dependencies
const compositeCompilers: Record<string, BlockCompiler> = {};

/**
 * Register a single composite definition with the compiler system.
 */
export function registerComposite(def: CompositeDefinition): void {
  const compiler = createCompositeCompiler(def);
  compositeCompilers[`composite:${def.id}`] = compiler;
}

/**
 * Get composite compilers for registration with the main block registry.
 * This should be called by the compiler system to integrate composites.
 */
export function getCompositeCompilers(): Record<string, BlockCompiler> {
  return compositeCompilers;
}

// =============================================================================
// Registry Integration Functions
// =============================================================================

/**
 * Get composite block definitions in the format expected by the block registry.
 * This function provides composites without creating circular dependencies.
 */
export function getCompositeBlockDefinitions(): readonly BlockDefinition[] {
  const composites = listCompositeDefinitions();
  return composites.map(compositeToBlockDefinition);
}

/**
 * Enhanced block definition getter that includes composites when requested.
 * This should be used instead of getBlockDefinitions() when composites are needed.
 */
export function getBlockDefinitionsWithComposites(): readonly BlockDefinition[] {
  // Import getBlockDefinitions to avoid circular dependency
  const { getBlockDefinitions } = eval('require')('./blocks');

  const baseBlocks = getBlockDefinitions();
  const compositeBlocks = getCompositeBlockDefinitions();

  return [...baseBlocks, ...compositeBlocks];
}

// =============================================================================
// Test Helper Functions
// =============================================================================

/**
 * Set up test environment with composite integration.
 * Initializes the composite system and returns test utilities.
 */
export function setupTestCompositeEnvironment() {
  // Register all composites for the test
  registerAllComposites();

  return {
    composites: listCompositeDefinitions(),
    compositeBlocks: getCompositeBlockDefinitions(),
  };
}

/**
 * Register a test composite with cleanup support.
 * Returns a cleanup function that removes the composite.
 */
export function registerTestComposite(def: CompositeDefinition): () => void {
  // Register the composite
  registerComposite(def);

  // Return cleanup function
  return () => {
    // Note: Dynamic blocks don't currently support unregistration
    // This is a limitation that should be addressed if needed for testing
    console.warn(`Composite cleanup not implemented for: ${def.id}`);
  };
}
