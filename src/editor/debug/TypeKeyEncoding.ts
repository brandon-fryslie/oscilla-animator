/**
 * TypeKey Encoding System
 *
 * Provides stable, canonical type identity encoding for the debug infrastructure.
 * Maps TypeDesc (editor) and ValueKind (compiler) to compact u16 TypeKeyIds.
 *
 * Key properties:
 * - Deterministic: same TypeKey always gets same ID
 * - Stable serialization: sorted keys, absent-default elision
 * - Compact: fits in u16 (65535 unique types)
 * - IR-agnostic: works with any evaluation strategy
 */

import type { TypeWorld, Domain } from '../types';

/**
 * Canonical type key structure.
 * Represents the essential identity of a type for debugging purposes.
 */
export interface TypeKey {
  /** World: signal, field, scalar, or config */
  readonly world: TypeWorld;

  /** Domain: number, vec2, color, etc. */
  readonly domain: Domain;

  /** Optional semantic information for precise matching */
  readonly semantics?: string;

  /** Optional unit information (e.g., "seconds", "beats") */
  readonly unit?: string;
}

/**
 * Compact type identifier (fits in u16).
 */
export type TypeKeyId = number;

/**
 * TypeKeyTable manages the bidirectional mapping between TypeKeys and TypeKeyIds.
 *
 * Provides:
 * - Interning: TypeKey → TypeKeyId
 * - Lookup: TypeKeyId → TypeKey
 * - Deterministic ID assignment
 * - Stable serialization
 */
export class TypeKeyTable {
  private keyToId = new Map<string, TypeKeyId>();
  private idToKey: TypeKey[] = [];

  /**
   * Intern a TypeKey, returning its numeric ID.
   * Same TypeKey always returns same ID (deterministic).
   */
  intern(key: TypeKey): TypeKeyId {
    const canonical = this.serialize(key);
    let id = this.keyToId.get(canonical);
    if (id === undefined) {
      id = this.idToKey.length;
      this.keyToId.set(canonical, id);
      this.idToKey.push(key);
    }
    return id;
  }

  /**
   * Lookup TypeKey by ID.
   * Returns undefined if ID is out of range.
   */
  lookup(id: TypeKeyId): TypeKey | undefined {
    return this.idToKey[id];
  }

  /**
   * Get all registered TypeKeys.
   */
  getAll(): readonly TypeKey[] {
    return this.idToKey;
  }

  /**
   * Get the number of registered TypeKeys.
   */
  size(): number {
    return this.idToKey.length;
  }

  /**
   * Serialize a TypeKey to a canonical string.
   *
   * Format: "w:<world>|d:<domain>[|s:<semantics>][|u:<unit>]"
   *
   * Properties:
   * - Sorted keys (world, domain, semantics, unit)
   * - Omits undefined fields
   * - No trailing separators
   *
   * Examples:
   * - {world: 'signal', domain: 'number'} → "w:signal|d:number"
   * - {world: 'field', domain: 'vec2', semantics: 'position'} → "w:field|d:vec2|s:position"
   * - {world: 'signal', domain: 'time', unit: 'seconds'} → "w:signal|d:time|u:seconds"
   */
  private serialize(key: TypeKey): string {
    const parts: string[] = [
      `w:${key.world}`,
      `d:${key.domain}`,
    ];

    if (key.semantics !== undefined) {
      parts.push(`s:${key.semantics}`);
    }

    if (key.unit !== undefined) {
      parts.push(`u:${key.unit}`);
    }

    return parts.join('|');
  }

  /**
   * Export the table as a plain object (for trace export).
   */
  toJSON(): { keys: TypeKey[] } {
    return { keys: [...this.idToKey] };
  }

  /**
   * Import a table from JSON.
   */
  static fromJSON(data: { keys: TypeKey[] }): TypeKeyTable {
    const table = new TypeKeyTable();
    for (const key of data.keys) {
      table.intern(key);
    }
    return table;
  }
}

/**
 * Create a global TypeKeyTable for the debug infrastructure.
 * This should be attached to the CompileResult alongside the program.
 */
export function createTypeKeyTable(): TypeKeyTable {
  return new TypeKeyTable();
}
