/**
 * Tests for TypeKeyEncoding
 */

import { describe, it, expect } from 'vitest';
import { TypeKeyTable, createTypeKeyTable } from '../TypeKeyEncoding';
import type { TypeKey } from '../TypeKeyEncoding';

describe('TypeKeyEncoding', () => {
  describe('TypeKeyTable', () => {
    it('interns keys with dense IDs starting from 0', () => {
      const table = new TypeKeyTable();
      const id1 = table.intern({ world: 'signal', domain: 'float' });
      const id2 = table.intern({ world: 'field', domain: 'vec2' });
      const id3 = table.intern({ world: 'signal', domain: 'color' });

      expect(id1).toBe(0);
      expect(id2).toBe(1);
      expect(id3).toBe(2);
    });

    it('returns same ID for identical keys (deterministic)', () => {
      const table = new TypeKeyTable();
      const key: TypeKey = { world: 'signal', domain: 'float' };

      const id1 = table.intern(key);
      const id2 = table.intern(key);
      const id3 = table.intern({ ...key });

      expect(id1).toBe(id2);
      expect(id2).toBe(id3);
    });

    it('differentiates keys by world', () => {
      const table = new TypeKeyTable();
      const id1 = table.intern({ world: 'signal', domain: 'float' });
      const id2 = table.intern({ world: 'field', domain: 'float' });

      expect(id1).not.toBe(id2);
    });

    it('differentiates keys by domain', () => {
      const table = new TypeKeyTable();
      const id1 = table.intern({ world: 'signal', domain: 'float' });
      const id2 = table.intern({ world: 'signal', domain: 'vec2' });

      expect(id1).not.toBe(id2);
    });

    it('differentiates keys by semantics', () => {
      const table = new TypeKeyTable();
      const id1 = table.intern({ world: 'signal', domain: 'float' });
      const id2 = table.intern({ world: 'signal', domain: 'float', semantics: 'unit' });

      expect(id1).not.toBe(id2);
    });

    it('differentiates keys by unit', () => {
      const table = new TypeKeyTable();
      const id1 = table.intern({ world: 'signal', domain: 'time' });
      const id2 = table.intern({ world: 'signal', domain: 'time', unit: 'seconds' });

      expect(id1).not.toBe(id2);
    });

    it('supports lookup by ID', () => {
      const table = new TypeKeyTable();
      const key: TypeKey = { world: 'signal', domain: 'float', semantics: 'phase' };
      const id = table.intern(key);

      const lookedUp = table.lookup(id);
      expect(lookedUp).toEqual(key);
    });

    it('returns undefined for invalid IDs', () => {
      const table = new TypeKeyTable();
      expect(table.lookup(999)).toBeUndefined();
    });

    it('supports roundtrip: intern → lookup → matches', () => {
      const table = new TypeKeyTable();
      const keys: TypeKey[] = [
        { world: 'signal', domain: 'float' },
        { world: 'field', domain: 'vec2', semantics: 'position' },
        { world: 'signal', domain: 'time', unit: 'seconds' },
        { world: 'field', domain: 'color' },
      ];

      const ids = keys.map(k => table.intern(k));
      const lookedUp = ids.map(id => table.lookup(id));

      expect(lookedUp).toEqual(keys);
    });

    it('stable serialization: same key twice produces same ID', () => {
      const table = new TypeKeyTable();

      // First pass
      const id1a = table.intern({ world: 'signal', domain: 'float' });
      const id1b = table.intern({ world: 'field', domain: 'vec2', semantics: 'position' });

      // Second pass with same keys
      const id2a = table.intern({ world: 'signal', domain: 'float' });
      const id2b = table.intern({ world: 'field', domain: 'vec2', semantics: 'position' });

      expect(id1a).toBe(id2a);
      expect(id1b).toBe(id2b);
    });

    it('registers 50 common types without collision', () => {
      const table = new TypeKeyTable();
      const commonTypes: TypeKey[] = [
        // Scalar domains
        { world: 'scalar', domain: 'float' },
        { world: 'scalar', domain: 'vec2' },
        { world: 'scalar', domain: 'color' },
        { world: 'scalar', domain: 'boolean' },

        // Signal domains
        { world: 'signal', domain: 'float' },
        { world: 'signal', domain: 'vec2' },
        { world: 'signal', domain: 'color' },
        { world: 'signal', domain: 'boolean' },
        { world: 'signal', domain: 'time', unit: 'seconds' },
        { world: 'signal', domain: 'time', unit: 'ms' },
        { world: 'signal', domain: 'float', semantics: 'phase(0..1)' },
        { world: 'signal', domain: 'rate' },
        { world: 'signal', domain: 'trigger' },

        // Field domains
        { world: 'field', domain: 'float' },
        { world: 'field', domain: 'vec2' },
        { world: 'field', domain: 'vec2', semantics: 'position' },
        { world: 'field', domain: 'color' },
        { world: 'field', domain: 'boolean' },
        { world: 'field', domain: 'time', semantics: 'duration' },
        { world: 'field', domain: 'time', semantics: 'delay' },

        // Signal semantics variants
        { world: 'signal', domain: 'float', semantics: 'unit' },
        { world: 'signal', domain: 'float', semantics: 'scalar' },
        { world: 'signal', domain: 'float', semantics: 'count' },
        { world: 'signal', domain: 'vec2', semantics: 'point' },

        // Config domains
        { world: 'config', domain: 'string' },
        { world: 'config', domain: 'boolean' },

        // Additional common types to reach 50
        { world: 'signal', domain: 'float', semantics: 'phase', unit: '0..1' },
        { world: 'signal', domain: 'float', semantics: 'progress', unit: '0..1' },
        { world: 'signal', domain: 'float', semantics: 'opacity', unit: '0..1' },
        { world: 'signal', domain: 'float', semantics: 'radius' },
        { world: 'signal', domain: 'float', semantics: 'angle', unit: 'radians' },
        { world: 'signal', domain: 'float', semantics: 'angle', unit: 'degrees' },
        { world: 'signal', domain: 'vec2', semantics: 'velocity' },
        { world: 'signal', domain: 'vec2', semantics: 'offset' },
        { world: 'field', domain: 'float', semantics: 'radius' },
        { world: 'field', domain: 'float', semantics: 'opacity' },
        { world: 'field', domain: 'float', semantics: 'scale' },
        { world: 'field', domain: 'float', semantics: 'rotation', unit: 'radians' },
        { world: 'field', domain: 'float', semantics: 'rotation', unit: 'degrees' },
        { world: 'field', domain: 'vec2', semantics: 'velocity' },
        { world: 'field', domain: 'vec2', semantics: 'offset' },
        { world: 'field', domain: 'vec2', semantics: 'scale' },
        { world: 'field', domain: 'color', semantics: 'fill' },
        { world: 'field', domain: 'color', semantics: 'stroke' },
        { world: 'field', domain: 'string', semantics: 'hex-color' },
        { world: 'field', domain: 'string', semantics: 'label' },
        { world: 'field', domain: 'path' },
        { world: 'field', domain: 'wobble' },
        { world: 'field', domain: 'spiral' },
        { world: 'field', domain: 'wave' },
      ];

      expect(commonTypes.length).toBeGreaterThanOrEqual(50);

      const ids = new Set<number>();
      for (const type of commonTypes) {
        const id = table.intern(type);
        expect(ids.has(id)).toBe(false); // No collisions
        ids.add(id);
      }

      expect(table.size()).toBe(commonTypes.length);
    });

    it('supports JSON export/import roundtrip', () => {
      const table1 = new TypeKeyTable();
      table1.intern({ world: 'signal', domain: 'float' });
      table1.intern({ world: 'field', domain: 'vec2', semantics: 'position' });
      table1.intern({ world: 'signal', domain: 'time', unit: 'seconds' });

      const json = table1.toJSON();
      const table2 = TypeKeyTable.fromJSON(json);

      expect(table2.size()).toBe(table1.size());
      expect(table2.getAll()).toEqual(table1.getAll());

      // IDs should match
      const key: TypeKey = { world: 'signal', domain: 'float' };
      expect(table2.intern(key)).toBe(table1.intern(key));
    });
  });

  describe('createTypeKeyTable factory', () => {
    it('creates a new empty table', () => {
      const table = createTypeKeyTable();
      expect(table.size()).toBe(0);
    });
  });
});
