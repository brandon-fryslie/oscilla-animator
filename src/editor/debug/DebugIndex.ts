/**
 * DebugIndex - String Interning for Debug Infrastructure
 *
 * Maps human-readable identifiers (port keys, bus IDs, block IDs) to dense
 * numeric IDs for efficient storage in span records.
 *
 * Key properties:
 * - Dense IDs starting from 1 (0 reserved for "none/invalid")
 * - Deterministic interning (same string → same ID)
 * - Reverse lookup for UI display
 * - Attached to CompileResult alongside program
 */

/**
 * DebugIndex provides string interning for debug infrastructure.
 *
 * This is populated during compilation and used by instrumentation wrappers
 * to convert string identifiers to compact numeric IDs for span storage.
 *
 * Example usage:
 * ```ts
 * const debugIndex = new DebugIndex('compile-abc123', 42);
 * const blockId = debugIndex.internBlock('RadialOrigin#1');
 * const portId = debugIndex.internPort('RadialOrigin#1:position:output');
 * const busId = debugIndex.internBus('/time/t');
 * ```
 */
export class DebugIndex {
  /** Unique compile identifier */
  readonly compileId: string;

  /** Patch revision number */
  readonly patchRevision: number;

  // Port key interning (e.g., "blockId:slotId:direction")
  private portKeyToId = new Map<string, number>();
  private portKeys: string[] = ['<none>']; // 0 = invalid

  // Bus ID interning
  private busIdToId = new Map<string, number>();
  private busIds: string[] = ['<none>']; // 0 = invalid

  // Block ID interning
  private blockIdToId = new Map<string, number>();
  private blockIds: string[] = ['<none>']; // 0 = invalid

  constructor(compileId: string, patchRevision: number) {
    this.compileId = compileId;
    this.patchRevision = patchRevision;
  }

  /**
   * Intern a port key, returning its numeric ID.
   * Returns dense IDs starting from 1 (0 reserved for none/invalid).
   *
   * Port keys follow the format: "blockId:slotId:direction"
   * Example: "RadialOrigin#1:position:output"
   */
  internPort(key: string): number {
    let id = this.portKeyToId.get(key);
    if (id === undefined) {
      id = this.portKeys.length;
      this.portKeyToId.set(key, id);
      this.portKeys.push(key);
    }
    return id;
  }

  /**
   * Get port key by numeric ID.
   * Returns undefined if ID is out of range.
   */
  getPortKey(id: number): string | undefined {
    return this.portKeys[id];
  }

  /**
   * Intern a bus ID, returning its numeric ID.
   * Returns dense IDs starting from 1 (0 reserved for none/invalid).
   *
   * Bus IDs follow the canonical bus naming scheme.
   * Example: "/time/t", "/style/color", "/motion/wobble"
   */
  internBus(id: string): number {
    let numericId = this.busIdToId.get(id);
    if (numericId === undefined) {
      numericId = this.busIds.length;
      this.busIdToId.set(id, numericId);
      this.busIds.push(id);
    }
    return numericId;
  }

  /**
   * Get bus ID by numeric ID.
   * Returns undefined if ID is out of range.
   */
  getBusId(id: number): string | undefined {
    return this.busIds[id];
  }

  /**
   * Intern a block ID, returning its numeric ID.
   * Returns dense IDs starting from 1 (0 reserved for none/invalid).
   *
   * Block IDs are unique identifiers for block instances.
   * Example: "RadialOrigin#1", "PhaseMachine#5"
   */
  internBlock(id: string): number {
    let numericId = this.blockIdToId.get(id);
    if (numericId === undefined) {
      numericId = this.blockIds.length;
      this.blockIdToId.set(id, numericId);
      this.blockIds.push(id);
    }
    return numericId;
  }

  /**
   * Get block ID by numeric ID.
   * Returns undefined if ID is out of range.
   */
  getBlockId(id: number): string | undefined {
    return this.blockIds[id];
  }

  /**
   * Get total number of interned ports.
   */
  portCount(): number {
    return this.portKeys.length - 1; // Exclude 0 (none)
  }

  /**
   * Get total number of interned buses.
   */
  busCount(): number {
    return this.busIds.length - 1; // Exclude 0 (none)
  }

  /**
   * Get total number of interned blocks.
   */
  blockCount(): number {
    return this.blockIds.length - 1; // Exclude 0 (none)
  }

  /**
   * Export the debug index for trace serialization.
   */
  toJSON(): {
    compileId: string;
    patchRevision: number;
    portKeys: string[];
    busIds: string[];
    blockIds: string[];
  } {
    return {
      compileId: this.compileId,
      patchRevision: this.patchRevision,
      portKeys: this.portKeys.slice(1), // Exclude '<none>'
      busIds: this.busIds.slice(1),
      blockIds: this.blockIds.slice(1),
    };
  }

  /**
   * Import a debug index from JSON.
   */
  static fromJSON(data: {
    compileId: string;
    patchRevision: number;
    portKeys: string[];
    busIds: string[];
    blockIds: string[];
  }): DebugIndex {
    const index = new DebugIndex(data.compileId, data.patchRevision);

    // Re-intern all keys to rebuild maps
    for (const key of data.portKeys) {
      index.internPort(key);
    }
    for (const id of data.busIds) {
      index.internBus(id);
    }
    for (const id of data.blockIds) {
      index.internBlock(id);
    }

    return index;
  }
}

/**
 * Create a DebugIndex for a compilation.
 */
export function createDebugIndex(compileId: string, patchRevision: number): DebugIndex {
  return new DebugIndex(compileId, patchRevision);
}
