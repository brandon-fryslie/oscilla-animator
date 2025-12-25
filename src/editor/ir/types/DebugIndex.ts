/**
 * Debug Index for IR
 *
 * Maps dense numeric indices back to string IDs for debugging.
 * Built at compile time. Used for debugging and introspection, not runtime evaluation.
 *
 * @module ir/types/DebugIndex
 */

import type {
  NodeIndex, NodeId, BusIndex, BusId, ValueSlot
} from './Indices';
import { nodeIndex, busIndex, valueSlot } from './Indices';

// =============================================================================
// Debug Index Interface
// =============================================================================

/**
 * DebugIndex provides bidirectional mapping between string IDs and numeric indices.
 * This is used for:
 * - Debugging: translating runtime indices back to human-readable IDs
 * - Source mapping: connecting IR nodes to editor blocks
 * - Hot-swap: matching old IR nodes to new ones by stable ID
 */
export interface DebugIndex {
  /** Compile identity */
  readonly compileId: string;

  /** Patch revision this index was built for */
  readonly patchRevision: number;

  /** Node ID → Index lookup */
  readonly nodeIdToIndex: ReadonlyMap<NodeId, NodeIndex>;

  /** Index → Node ID lookup (array index = NodeIndex) */
  readonly nodeIndexToId: readonly NodeId[];

  /** Bus ID → Index lookup */
  readonly busIdToIndex: ReadonlyMap<BusId, BusIndex>;

  /** Index → Bus ID lookup (array index = BusIndex) */
  readonly busIndexToId: readonly BusId[];

  /** Port key ('nodeId:portName') → ValueSlot lookup */
  readonly portKeyToSlot: ReadonlyMap<string, ValueSlot>;

  /** ValueSlot → Port key lookup (array index = ValueSlot) */
  readonly slotToPortKey: readonly string[];

  /** Node ID → Editor Block ID mapping (for source mapping) */
  readonly nodeIdToBlockId: ReadonlyMap<NodeId, string>;
}

// =============================================================================
// Debug Index Builder
// =============================================================================

/**
 * Builder for constructing a DebugIndex during compilation.
 * Entities are "interned" - calling intern with the same ID returns the same index.
 */
export class DebugIndexBuilder {
  private readonly _nodeIdToIndex = new Map<NodeId, NodeIndex>();
  private readonly _nodeIndexToId: NodeId[] = [];

  private readonly _busIdToIndex = new Map<BusId, BusIndex>();
  private readonly _busIndexToId: BusId[] = [];

  private readonly _portKeyToSlot = new Map<string, ValueSlot>();
  private readonly _slotToPortKey: string[] = [];

  private readonly _nodeIdToBlockId = new Map<NodeId, string>();

  private readonly compileId: string;
  private readonly patchRevision: number;

  /**
   * Create a new DebugIndexBuilder.
   *
   * @param compileId - Unique identifier for this compilation
   * @param patchRevision - Revision number of the patch being compiled
   */
  constructor(compileId: string, patchRevision: number) {
    this.compileId = compileId;
    this.patchRevision = patchRevision;
  }

  /**
   * Intern a node ID, returning its dense index.
   * If the ID has already been interned, returns the existing index.
   *
   * @param id - The node's stable string ID
   * @param blockId - Optional editor block ID for source mapping
   * @returns The node's dense index
   */
  internNode(id: NodeId, blockId?: string): NodeIndex {
    let idx = this._nodeIdToIndex.get(id);
    if (idx === undefined) {
      idx = nodeIndex(this._nodeIndexToId.length);
      this._nodeIdToIndex.set(id, idx);
      this._nodeIndexToId.push(id);
      if (blockId !== undefined) {
        this._nodeIdToBlockId.set(id, blockId);
      }
    }
    return idx;
  }

  /**
   * Intern a bus ID, returning its dense index.
   * If the ID has already been interned, returns the existing index.
   *
   * @param id - The bus's stable string ID
   * @returns The bus's dense index
   */
  internBus(id: BusId): BusIndex {
    let idx = this._busIdToIndex.get(id);
    if (idx === undefined) {
      idx = busIndex(this._busIndexToId.length);
      this._busIdToIndex.set(id, idx);
      this._busIndexToId.push(id);
    }
    return idx;
  }

  /**
   * Intern a port, returning its value slot.
   * Ports are identified by 'nodeId:portName' keys.
   *
   * @param nodeId - The owning node's ID
   * @param portName - The port's name
   * @returns The port's value slot index
   */
  internPort(nodeId: NodeId, portName: string): ValueSlot {
    const key = `${nodeId}:${portName}`;
    let slot = this._portKeyToSlot.get(key);
    if (slot === undefined) {
      slot = valueSlot(this._slotToPortKey.length);
      this._portKeyToSlot.set(key, slot);
      this._slotToPortKey.push(key);
    }
    return slot;
  }

  /**
   * Build the final DebugIndex.
   * After calling build(), the builder should not be used further.
   *
   * @returns The completed DebugIndex
   */
  build(): DebugIndex {
    return {
      compileId: this.compileId,
      patchRevision: this.patchRevision,
      nodeIdToIndex: this._nodeIdToIndex,
      nodeIndexToId: this._nodeIndexToId,
      busIdToIndex: this._busIdToIndex,
      busIndexToId: this._busIndexToId,
      portKeyToSlot: this._portKeyToSlot,
      slotToPortKey: this._slotToPortKey,
      nodeIdToBlockId: this._nodeIdToBlockId,
    };
  }
}
