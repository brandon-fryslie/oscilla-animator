/**
 * Diff Summary Generation
 *
 * Computes a high-level summary of changes from a list of Ops.
 *
 * Reference: design-docs/10-Refactor-for-UI-prep/11-DiffSummary.md
 */

import type { Op } from './ops';
import type { DiffSummary, EntityDiff } from './types';

export function generateDiff(ops: readonly Op[]): DiffSummary {
  const diff: EntityDiff = {
    created: [],
    removed: [],
    updated: []
  };

  const summaryLines: string[] = [];
  const kinds = new Set<string>();

  for (const op of ops) {
    switch (op.op) {
      // Block Ops
      case 'BlockAdd':
        diff.created = [...diff.created, { kind: 'block', id: op.block.id }];
        summaryLines.push(`Added block ${op.block.type}`);
        kinds.add('structural');
        break;
      case 'BlockRemove':
        diff.removed = [...diff.removed, { kind: 'block', id: op.blockId }];
        summaryLines.push(`Removed block ${op.blockId}`);
        kinds.add('structural');
        break;
      case 'BlockRetype':
        diff.updated = [...diff.updated, { ref: { kind: 'block', id: op.blockId }, keys: ['type'] }];
        summaryLines.push(`Retyped block ${op.blockId} to ${op.nextType}`);
        kinds.add('structural');
        break;
      case 'BlockSetLabel':
        diff.updated = [...diff.updated, { ref: { kind: 'block', id: op.blockId }, keys: ['label'] }];
        kinds.add('structural'); // Label is often structural for UI
        break;
      case 'BlockPatchParams':
        diff.updated = [...diff.updated, { ref: { kind: 'block', id: op.blockId }, keys: Object.keys(op.patch) }];
        kinds.add('param');
        break;

      // Wire Ops
      case 'WireAdd':
        diff.created = [...diff.created, { kind: 'wire', id: op.connection.id }];
        kinds.add('structural');
        break;
      case 'WireRemove':
        diff.removed = [...diff.removed, { kind: 'wire', id: op.connectionId }];
        kinds.add('structural');
        break;
      case 'WireRetarget':
        diff.updated = [...diff.updated, { ref: { kind: 'wire', id: op.connectionId }, keys: ['from', 'to'] }];
        kinds.add('structural');
        break;

      // Bus Ops
      case 'BusAdd':
        diff.created = [...diff.created, { kind: 'bus', id: op.bus.id }];
        kinds.add('structural');
        break;
      case 'BusRemove':
        diff.removed = [...diff.removed, { kind: 'bus', id: op.busId }];
        kinds.add('structural');
        break;
      case 'BusUpdate':
        diff.updated = [...diff.updated, { ref: { kind: 'bus', id: op.busId }, keys: Object.keys(op.patch) }];
        kinds.add('structural');
        break;

      // Binding Ops
      case 'PublisherAdd':
        diff.created = [...diff.created, { kind: 'publisher', id: op.publisher.id }];
        kinds.add('structural');
        break;
      case 'PublisherRemove':
        diff.removed = [...diff.removed, { kind: 'publisher', id: op.publisherId }];
        kinds.add('structural');
        break;
      case 'PublisherUpdate':
        diff.updated = [...diff.updated, { ref: { kind: 'publisher', id: op.publisherId }, keys: Object.keys(op.patch) }];
        kinds.add('param'); // Often enabling/disabling or sorting
        break;
      case 'ListenerAdd':
        diff.created = [...diff.created, { kind: 'listener', id: op.listener.id }];
        kinds.add('structural');
        break;
      case 'ListenerRemove':
        diff.removed = [...diff.removed, { kind: 'listener', id: op.listenerId }];
        kinds.add('structural');
        break;
      case 'ListenerUpdate':
        diff.updated = [...diff.updated, { ref: { kind: 'listener', id: op.listenerId }, keys: Object.keys(op.patch) }];
        kinds.add('param'); // Lens changes are params
        break;

      // Composite Ops
      case 'CompositeDefAdd':
        diff.created = [...diff.created, { kind: 'compositeDef', id: op.def.id }];
        kinds.add('composite');
        break;
      case 'CompositeDefRemove':
        diff.removed = [...diff.removed, { kind: 'compositeDef', id: op.defId }];
        kinds.add('composite');
        break;
      case 'CompositeDefUpdate':
        diff.updated = [...diff.updated, { ref: { kind: 'compositeDef', id: op.defId }, keys: Object.keys(op.patch) }];
        kinds.add('composite');
        break;
      case 'CompositeDefReplaceGraph':
        diff.updated = [...diff.updated, { ref: { kind: 'compositeDef', id: op.defId }, keys: ['graph'] }];
        kinds.add('composite');
        break;

      // Time Ops
      case 'TimeRootSet':
        // Global time root change
        summaryLines.push(`Set TimeRoot to ${op.blockId}`);
        kinds.add('time');
        break;

      // Settings Ops
      case 'PatchSettingsUpdate':
        kinds.add('param');
        break;

      // Asset Ops
      case 'AssetAdd':
        diff.created = [...diff.created, { kind: 'asset', id: op.asset.id }];
        kinds.add('asset');
        break;
      case 'AssetRemove':
        diff.removed = [...diff.removed, { kind: 'asset', id: op.assetId }];
        kinds.add('asset');
        break;
      case 'AssetUpdate':
        diff.updated = [...diff.updated, { ref: { kind: 'asset', id: op.assetId }, keys: Object.keys(op.patch) }];
        kinds.add('asset');
        break;
    }
  }

  // Determine aggregate kind
  let kind: DiffSummary['kind'] = 'mixed';
  if (kinds.size === 1) {
    const k = Array.from(kinds)[0];
    if (k === 'structural') kind = 'structural';
    else if (k === 'param') kind = 'param';
    else if (k === 'time') kind = 'time';
    else if (k === 'composite') kind = 'composite';
    else if (k === 'asset') kind = 'asset';
  } else if (kinds.size === 0) {
    kind = 'mixed'; // No ops?
  }

  return {
    kind,
    entities: diff,
    summaryLines,
    stableKey: Date.now().toString() // Placeholder - should ideally be hash of ops
  };
}
