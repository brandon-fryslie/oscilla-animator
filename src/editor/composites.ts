import type { BlockSubcategory, LaneKind, LaneFlavor, SlotType } from './types';
import type { BlockTags } from './blocks';

export interface ExposedPort {
  id: string;
  label: string;
  direction: 'input' | 'output';
  slotType: SlotType;
  nodeId: string;
  nodePort: string;
}

export interface CompositeGraph {
  nodes: Record<string, { type: string; params?: Record<string, unknown> }>;
  edges: readonly { from: string; to: string }[];
  inputMap: Record<string, string>;
  outputMap: Record<string, string>;
  /**
   * Bus subscriptions - maps input port names to bus names.
   * When the composite is expanded, these create bus listeners automatically.
   * Format: { inputPort: busName }
   * Example: { phase: 'phaseA' } means the 'phase' input subscribes to 'phaseA' bus
   */
  busSubscriptions?: Record<string, string>;
  /**
   * Bus publications - maps output port names to bus names.
   * When the composite is expanded, these create bus publishers automatically.
   * Format: { outputPort: busName }
   * Example: { out: 'energy' } means the 'out' output publishes to 'energy' bus
   */
  busPublications?: Record<string, string>;
}

export interface CompositeDefinition {
  id: string;
  label: string;
  description?: string;
  color?: string;
  subcategory: BlockSubcategory;
  laneKind: LaneKind;
  laneFlavor?: LaneFlavor;
  tags?: BlockTags;
  graph: CompositeGraph;
  exposedInputs: readonly ExposedPort[];
  exposedOutputs: readonly ExposedPort[];
}

const compositeRegistry: CompositeDefinition[] = [];

export function listCompositeDefinitions(): readonly CompositeDefinition[] {
  return compositeRegistry;
}

export function registerComposite(definition: CompositeDefinition): CompositeDefinition {
  validateCompositePortMaps(definition);
  compositeRegistry.push(definition);
  return definition;
}

export function replaceComposite(definition: CompositeDefinition): CompositeDefinition {
  validateCompositePortMaps(definition);
  const idx = compositeRegistry.findIndex((c) => c.id === definition.id);
  if (idx >= 0) {
    compositeRegistry[idx] = definition;
  } else {
    compositeRegistry.push(definition);
  }
  return definition;
}

export function upsertComposite(definition: CompositeDefinition): CompositeDefinition {
  return replaceComposite(definition);
}

export function removeComposite(id: string): void {
  const idx = compositeRegistry.findIndex((c) => c.id === id);
  if (idx >= 0) {
    compositeRegistry.splice(idx, 1);
  }
}

function validateCompositePortMaps(definition: CompositeDefinition): void {
  const missingInputs = definition.exposedInputs
    .map((port) => port.id)
    .filter((portId) => !(portId in definition.graph.inputMap));
  const missingOutputs = definition.exposedOutputs
    .map((port) => port.id)
    .filter((portId) => !(portId in definition.graph.outputMap));

  if (missingInputs.length > 0 || missingOutputs.length > 0) {
    const parts: string[] = [];
    if (missingInputs.length > 0) {
      parts.push(`inputs: ${missingInputs.join(', ')}`);
    }
    if (missingOutputs.length > 0) {
      parts.push(`outputs: ${missingOutputs.join(', ')}`);
    }
    throw new Error(`Composite "${definition.id}" is missing port maps (${parts.join('; ')}).`);
  }
}
