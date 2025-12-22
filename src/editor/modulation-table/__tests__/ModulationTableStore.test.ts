/**
 * Tests for ModulationTableStore
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../../stores/RootStore';
import { ModulationTableStore } from '../ModulationTableStore';

describe('ModulationTableStore', () => {
  let rootStore: RootStore;
  let tableStore: ModulationTableStore;

  beforeEach(() => {
    rootStore = new RootStore();
    tableStore = new ModulationTableStore(rootStore);
  });

  describe('reactivity', () => {
    it('should update rows when blocks are added', () => {
      // Initially no blocks
      expect(tableStore.rows.length).toBe(0);
      expect(tableStore.rowGroups.length).toBe(0);

      // Add macro
      rootStore.patchStore.addBlock('macro:simpleGrid');

      // Now should have rows (count increased after Remove Parameters refactor)
      // RenderInstances2D now exposes: positions, radius, color, opacity, glow, glowIntensity
      // GridDomain now exposes: rows, cols, spacing, originX, originY
      // But only bus-eligible inputs are shown (Field/Signal types, not Domain/Scalar)
      expect(tableStore.rows.length).toBeGreaterThan(0);
      expect(tableStore.rowGroups.length).toBeGreaterThan(0);

      // visibleRows should also have rows (no filters applied)
      expect(tableStore.visibleRows.length).toBeGreaterThan(0);
    });
  });

  describe('macro expansion and row derivation', () => {
    it('should create blocks when macro:simpleGrid is added', () => {
      // Add the macro
      rootStore.patchStore.addBlock('macro:simpleGrid');

      // Check blocks were created
      const blocks = rootStore.patchStore.blocks;
      expect(blocks.length).toBeGreaterThan(0);

      // Log what we got
      console.log('Blocks created:');
      for (const block of blocks) {
        console.log(`  - ${block.id}: ${block.type} (${block.label})`);
      }

      // Should have GridDomain and RenderInstances2D
      const types = blocks.map(b => b.type);
      expect(types).toContain('GridDomain');
      expect(types).toContain('RenderInstances2D');
    });

    it('should derive rows from RenderInstances2D inputs', () => {
      // Add the macro
      rootStore.patchStore.addBlock('macro:simpleGrid');

      // Check rows
      const rows = tableStore.rows;
      console.log('Rows derived:');
      for (const row of rows) {
        console.log(`  - ${row.key}: ${row.label} (${row.type.domain})`);
      }

      // RenderInstances2D has bus-eligible inputs: positions, radius, color
      // (domain is not bus-eligible)
      expect(rows.length).toBeGreaterThan(0);

      const labels = rows.map(r => r.label);
      // At minimum should have these
      expect(labels).toContain('Positions');
      expect(labels).toContain('Radius');
      expect(labels).toContain('Color');
    });

    it('should create row groups for blocks', () => {
      rootStore.patchStore.addBlock('macro:simpleGrid');

      const groups = tableStore.rowGroups;
      console.log('Row groups:');
      for (const group of groups) {
        console.log(`  - ${group.key}: ${group.label} (${group.rowKeys.length} rows)`);
      }

      // Should have at least one group (for RenderInstances2D)
      expect(groups.length).toBeGreaterThan(0);
    });

    it('should derive columns from buses', () => {
      rootStore.patchStore.addBlock('macro:simpleGrid');

      const columns = tableStore.columns;
      console.log('Columns (buses):');
      for (const col of columns) {
        console.log(`  - ${col.busId}: ${col.name} (${col.type.domain})`);
      }

      // Should have default buses
      expect(columns.length).toBeGreaterThan(0);

      const names = columns.map(c => c.name);
      expect(names).toContain('phaseA');
      expect(names).toContain('energy');
    });
  });
});
