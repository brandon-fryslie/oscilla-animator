/**
 * Composite Bridge - Integration between Composite System and Block/Compiler Systems
 *
 * This module provides the integration layer between the composite definition system
 * (in composites.ts) and the existing block registry and compiler systems.
 */

import type { BlockDefinition, BlockTags, ParamSchema } from './blocks/types';
import type { CompoundGraph } from './blocks/types';
import type { CompositeDefinition } from './composites';
import type { BlockCompiler } from './compiler/types';
import { listCompositeDefinitions } from './composites';
import { getBlockDefinition } from './blocks';

// Type declaration for dynamic require to avoid circular dependency
declare function require(module: string): {
  getBlockDefinitions: () => readonly BlockDefinition[];
};

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

  // Generate paramSchema from exposedParams
  const paramSchema = generateParamSchema(def);

  // Generate default params from paramSchema
  const defaultParams: Record<string, unknown> = {};
  for (const param of paramSchema) {
    defaultParams[param.key] = param.defaultValue;
  }

  return {
    type: `composite:${def.id}`,
    label: def.label,
    capability: 'pure',
    compileKind: 'composite',
    description: def.description !== undefined && def.description !== ''
      ? def.description
      : `Composite: ${def.label}`,
    color: def.color ?? '#666666',
    subcategory: def.subcategory,
    laneKind: def.laneKind,
    laneFlavor: def.laneFlavor,
    // Note: form is derived from compositeDefinition via getBlockForm()
    inputs,
    outputs,
    defaultParams,
    paramSchema,
    priority: 100, // Lower priority than primitive blocks
    tags: {
      ...def.tags,
      subcategory: def.subcategory,
      laneKind: def.laneKind,
      origin: 'composite',
    } as BlockTags,
    // Store the composite definition for compiler integration
    compositeDefinition: def,
    primitiveGraph: compositeToPrimitiveGraph(def),
  };
}

/**
 * Generate paramSchema from exposedParams.
 * Looks up the parameter definitions from internal blocks.
 */
function generateParamSchema(def: CompositeDefinition): ParamSchema[] {
  if ((def.exposedParams == null) || def.exposedParams.length === 0) {
    return [];
  }

  const paramSchemas: ParamSchema[] = [];

  for (const exposedParam of def.exposedParams) {
    // Find the internal node
    const node = def.graph.nodes[exposedParam.blockId];
    if (node == null) {
      console.warn(`Exposed param references unknown node: ${exposedParam.blockId}`);
      continue;
    }

    // Get the block definition for this node
    const blockDef = getBlockDefinition(node.type);
    if (blockDef == null || blockDef.paramSchema == null) {
      console.warn(`Block type ${node.type} has no paramSchema`);
      continue;
    }

    // Find the parameter in the block's schema
    const paramDef = blockDef.paramSchema.find(p => p.key === exposedParam.paramKey);
    if (paramDef == null) {
      console.warn(`Parameter ${exposedParam.paramKey} not found in ${node.type}`);
      continue;
    }

    // Create a new ParamSchema entry with the exposed label
    // Use the exposed param ID as the key (this is what the composite instance will use)
    paramSchemas.push({
      key: exposedParam.id,
      label: exposedParam.label,
      type: paramDef.type,
      min: paramDef.min,
      max: paramDef.max,
      step: paramDef.step,
      options: paramDef.options,
      defaultValue: paramDef.defaultValue,
    });
  }

  return paramSchemas;
}

/**
 * Convert a CompositeGraph to the CompoundGraph format expected by the compiler.
 * Applies __fromParam mechanism for exposed parameters.
 */
export function compositeToPrimitiveGraph(def: CompositeDefinition): CompoundGraph {
  const graph = def.graph;

  // If there are no exposed params, return the graph as-is
  if ((def.exposedParams == null) || def.exposedParams.length === 0) {
    return {
      nodes: graph.nodes,
      edges: graph.edges,
      inputMap: graph.inputMap,
      outputMap: graph.outputMap,
    };
  }

  // Create a map from (blockId, paramKey) -> exposedParamId
  const paramMap = new Map<string, string>();
  for (const exposedParam of def.exposedParams) {
    const key = `${exposedParam.blockId}:${exposedParam.paramKey}`;
    paramMap.set(key, exposedParam.id);
  }

  // Transform nodes to apply __fromParam
  const transformedNodes: Record<string, { type: string; params?: Record<string, unknown> }> = {};

  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    const transformedParams: Record<string, unknown> = { ...node.params };

    // Check if any parameters of this node are exposed
    for (const paramKey of Object.keys(node.params ?? {})) {
      const mapKey = `${nodeId}:${paramKey}`;
      const exposedParamId = paramMap.get(mapKey);

      if (exposedParamId !== undefined) {
        // Replace the value with __fromParam directive
        transformedParams[paramKey] = { __fromParam: exposedParamId };
      }
    }

    transformedNodes[nodeId] = {
      type: node.type,
      params: transformedParams,
    };
  }

  return {
    nodes: transformedNodes,
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
  const getBlockDefinitions = require('./blocks').getBlockDefinitions as () => readonly BlockDefinition[];

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
export function setupTestCompositeEnvironment(): {
  composites: readonly CompositeDefinition[];
  compositeBlocks: readonly BlockDefinition[];
} {
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
