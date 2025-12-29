import type { Block, BlockId, SlotType } from '../types';
import { SemanticGraph } from '../semantic';
import { storeToPatchDocument } from '../semantic/patchAdapter';
import { getBlockDefinition } from '../blocks';
import type { RootStore } from '../stores/RootStore';
import type { LaneViewKind, LaneViewLane, LaneViewTemplate, LaneViewId } from './types';

const SLOT_LANE_KIND_MAP: Array<{ prefix: string; kind: LaneViewKind }> = [
  { prefix: 'Scene', kind: 'Scene' },
  { prefix: 'Field<', kind: 'Fields' },
  { prefix: 'Signal<', kind: 'Phase' },
  { prefix: 'Scalar:', kind: 'Scalars' },
];

const DOMAIN_LANE_KIND: LaneViewKind = 'Fields';

function slotTypeToLaneKind(slotType: SlotType): LaneViewKind | null {
  if (slotType === 'Domain') return DOMAIN_LANE_KIND;
  for (const { prefix, kind } of SLOT_LANE_KIND_MAP) {
    if (slotType.startsWith(prefix)) return kind;
  }
  return null;
}

function inferLaneKindFromSlots(slots: readonly { type: SlotType }[]): LaneViewKind | null {
  for (const slot of slots) {
    const kind = slotTypeToLaneKind(slot.type);
    if (kind !== null) return kind;
  }
  return null;
}

function isOutputLike(block: Block, outputs: readonly { type: SlotType }[]): boolean {
  if (outputs.length > 0) return false;
  if (block.category === 'Render' || block.category === 'Output') return true;
  return block.type.toLowerCase().includes('render');
}

function inferLaneKindForBlock(block: Block): LaneViewKind {
  const def = getBlockDefinition(block.type);
  if (def === undefined) return 'Scalars';

  const outputKind = inferLaneKindFromSlots(def.outputs);
  if (outputKind !== null) return outputKind;

  if (isOutputLike(block, def.outputs)) return 'Output';

  const inputKind = inferLaneKindFromSlots(def.inputs);
  if (inputKind !== null) return inputKind;

  return 'Program';
}

function createLanesFromLayout(templates: readonly LaneViewTemplate[]): LaneViewLane[] {
  return templates.map((template) => ({
    id: template.id,
    kind: template.kind,
    label: template.label,
    description: template.description,
    flowStyle: template.flowStyle,
    blockIds: [],
    collapsed: false,
    pinned: false,
  }));
}

function getTopologicalOrder(root: RootStore): BlockId[] {
  const doc = storeToPatchDocument(root);
  const graph = SemanticGraph.fromPatch(doc);
  const blocks = graph.getBlocks().map((b) => b.blockId);

  const indegree = new Map<BlockId, number>();
  for (const blockId of blocks) {
    indegree.set(blockId, 0);
  }

  for (const blockId of blocks) {
    for (const downstream of graph.getDownstreamBlocks(blockId)) {
      indegree.set(downstream, (indegree.get(downstream) ?? 0) + 1);
    }
  }

  const queue = blocks.filter((id) => (indegree.get(id) ?? 0) === 0).sort();
  const order: BlockId[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const next of graph.getDownstreamBlocks(current)) {
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if ((indegree.get(next) ?? 0) === 0) {
        queue.push(next);
        queue.sort();
      }
    }
  }

  // Fallback for cycles or disconnected nodes.
  if (order.length !== blocks.length) {
    const remaining = blocks.filter((id) => !order.includes(id)).sort();
    order.push(...remaining);
  }

  return order;
}

export function buildLaneProjection(root: RootStore, templates: readonly LaneViewTemplate[]): LaneViewLane[] {
  const lanes = createLanesFromLayout(templates);
  const blocksById = new Map<BlockId, Block>(root.patchStore.blocks.map((block) => [block.id, block]));
  const order = getTopologicalOrder(root);

  for (const blockId of order) {
    const block = blocksById.get(blockId);
    if (block === undefined) continue;

    const laneKind = inferLaneKindForBlock(block);
    const lane = lanes.find((entry) => entry.kind === laneKind) ?? lanes[0];
    if (lane !== undefined) {
      lane.blockIds.push(blockId);
    }
  }

  return lanes;
}

export function applyLaneOrderOverrides(
  lanes: readonly LaneViewLane[],
  overrides: ReadonlyMap<LaneViewId, readonly BlockId[]>
): LaneViewLane[] {
  return lanes.map((lane) => {
    const override = overrides.get(lane.id);
    if (override === undefined) return lane;

    const remaining = lane.blockIds.filter((id) => !override.includes(id));
    const ordered = override.filter((id) => lane.blockIds.includes(id));
    return { ...lane, blockIds: [...ordered, ...remaining] };
  });
}
