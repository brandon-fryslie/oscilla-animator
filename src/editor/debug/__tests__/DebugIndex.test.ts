/**
 * Tests for DebugIndex
 */

import { describe, it, expect } from 'vitest';
import { DebugIndex, createDebugIndex } from '../DebugIndex';

describe('DebugIndex', () => {
  describe('Basic interning', () => {
    it('initializes with compile metadata', () => {
      const index = new DebugIndex('compile-abc123', 42);
      expect(index.compileId).toBe('compile-abc123');
      expect(index.patchRevision).toBe(42);
    });

    it('interns port keys with dense IDs starting from 1', () => {
      const index = new DebugIndex('test', 1);
      const id1 = index.internPort('Block#1:output:output');
      const id2 = index.internPort('Block#2:input:input');
      const id3 = index.internPort('Block#3:value:output');

      expect(id1).toBe(1);
      expect(id2).toBe(2);
      expect(id3).toBe(3);
    });

    it('interns bus IDs with dense IDs starting from 1', () => {
      const index = new DebugIndex('test', 1);
      const id1 = index.internBus('/time/t');
      const id2 = index.internBus('/style/color');
      const id3 = index.internBus('/motion/wobble');

      expect(id1).toBe(1);
      expect(id2).toBe(2);
      expect(id3).toBe(3);
    });

    it('interns block IDs with dense IDs starting from 1', () => {
      const index = new DebugIndex('test', 1);
      const id1 = index.internBlock('RadialOrigin#1');
      const id2 = index.internBlock('PhaseMachine#5');
      const id3 = index.internBlock('ParticleRenderer#1');

      expect(id1).toBe(1);
      expect(id2).toBe(2);
      expect(id3).toBe(3);
    });

    it('returns same ID for same key (deterministic)', () => {
      const index = new DebugIndex('test', 1);
      const id1 = index.internPort('Block#1:output:output');
      const id2 = index.internPort('Block#1:output:output');
      const id3 = index.internPort('Block#1:output:output');

      expect(id1).toBe(id2);
      expect(id2).toBe(id3);
    });
  });

  describe('Reverse lookup', () => {
    it('retrieves port key by ID', () => {
      const index = new DebugIndex('test', 1);
      const key = 'Block#1:position:output';
      const id = index.internPort(key);

      expect(index.getPortKey(id)).toBe(key);
    });

    it('retrieves bus ID by numeric ID', () => {
      const index = new DebugIndex('test', 1);
      const busId = '/time/phase';
      const id = index.internBus(busId);

      expect(index.getBusId(id)).toBe(busId);
    });

    it('retrieves block ID by numeric ID', () => {
      const index = new DebugIndex('test', 1);
      const blockId = 'GridDomain#3';
      const id = index.internBlock(blockId);

      expect(index.getBlockId(id)).toBe(blockId);
    });

    it('returns undefined for out-of-range IDs', () => {
      const index = new DebugIndex('test', 1);
      index.internPort('test:key:output');

      expect(index.getPortKey(999)).toBeUndefined();
      expect(index.getBusId(999)).toBeUndefined();
      expect(index.getBlockId(999)).toBeUndefined();
    });

    it('returns placeholder for ID 0 (none/invalid)', () => {
      const index = new DebugIndex('test', 1);
      expect(index.getPortKey(0)).toBe('<none>');
      expect(index.getBusId(0)).toBe('<none>');
      expect(index.getBlockId(0)).toBe('<none>');
    });
  });

  describe('Interning 100 port keys', () => {
    it('assigns IDs 1..100 for 100 unique keys', () => {
      const index = new DebugIndex('test', 1);
      const ids: number[] = [];

      for (let i = 0; i < 100; i++) {
        const key = `Block#${i}:output:output`;
        const id = index.internPort(key);
        ids.push(id);
      }

      expect(ids).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    });

    it('reverse lookup matches for all 100 keys', () => {
      const index = new DebugIndex('test', 1);
      const keys: string[] = [];

      for (let i = 0; i < 100; i++) {
        const key = `Block#${i}:output:output`;
        keys.push(key);
        index.internPort(key);
      }

      for (let i = 0; i < 100; i++) {
        expect(index.getPortKey(i + 1)).toBe(keys[i]);
      }
    });
  });

  describe('Count methods', () => {
    it('returns correct port count', () => {
      const index = new DebugIndex('test', 1);
      expect(index.portCount()).toBe(0);

      index.internPort('key1');
      expect(index.portCount()).toBe(1);

      index.internPort('key2');
      expect(index.portCount()).toBe(2);

      index.internPort('key1'); // Duplicate
      expect(index.portCount()).toBe(2);
    });

    it('returns correct bus count', () => {
      const index = new DebugIndex('test', 1);
      expect(index.busCount()).toBe(0);

      index.internBus('/time/t');
      expect(index.busCount()).toBe(1);

      index.internBus('/style/color');
      expect(index.busCount()).toBe(2);
    });

    it('returns correct block count', () => {
      const index = new DebugIndex('test', 1);
      expect(index.blockCount()).toBe(0);

      index.internBlock('Block#1');
      expect(index.blockCount()).toBe(1);

      index.internBlock('Block#2');
      expect(index.blockCount()).toBe(2);
    });
  });

  describe('JSON serialization', () => {
    it('exports to JSON', () => {
      const index = new DebugIndex('compile-123', 5);
      index.internPort('port1');
      index.internPort('port2');
      index.internBus('/bus1');
      index.internBlock('block1');

      const json = index.toJSON();

      expect(json.compileId).toBe('compile-123');
      expect(json.patchRevision).toBe(5);
      expect(json.portKeys).toEqual(['port1', 'port2']);
      expect(json.busIds).toEqual(['/bus1']);
      expect(json.blockIds).toEqual(['block1']);
    });

    it('imports from JSON', () => {
      const json = {
        compileId: 'compile-456',
        patchRevision: 10,
        portKeys: ['portA', 'portB'],
        busIds: ['/busA'],
        blockIds: ['blockA'],
      };

      const index = DebugIndex.fromJSON(json);

      expect(index.compileId).toBe('compile-456');
      expect(index.patchRevision).toBe(10);
      expect(index.portCount()).toBe(2);
      expect(index.busCount()).toBe(1);
      expect(index.blockCount()).toBe(1);

      expect(index.getPortKey(1)).toBe('portA');
      expect(index.getPortKey(2)).toBe('portB');
      expect(index.getBusId(1)).toBe('/busA');
      expect(index.getBlockId(1)).toBe('blockA');
    });

    it('roundtrips JSON export/import', () => {
      const index1 = new DebugIndex('test', 42);
      index1.internPort('port1');
      index1.internPort('port2');
      index1.internBus('/bus1');
      index1.internBlock('block1');

      const json = index1.toJSON();
      const index2 = DebugIndex.fromJSON(json);

      expect(index2.toJSON()).toEqual(json);
      expect(index2.portCount()).toBe(index1.portCount());
      expect(index2.busCount()).toBe(index1.busCount());
      expect(index2.blockCount()).toBe(index1.blockCount());
    });
  });

  describe('createDebugIndex factory', () => {
    it('creates a new empty index', () => {
      const index = createDebugIndex('compile-xyz', 99);
      expect(index.compileId).toBe('compile-xyz');
      expect(index.patchRevision).toBe(99);
      expect(index.portCount()).toBe(0);
      expect(index.busCount()).toBe(0);
      expect(index.blockCount()).toBe(0);
    });
  });
});
