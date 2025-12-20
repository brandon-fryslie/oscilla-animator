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
  compositeRegistry.push(definition);
  return definition;
}

export function replaceComposite(definition: CompositeDefinition): CompositeDefinition {
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
