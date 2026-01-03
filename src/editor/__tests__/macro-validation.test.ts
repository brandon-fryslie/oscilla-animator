/**
 * Comprehensive macro validation tests
 * Tests all macros for:
 * - Structure validity
 * - Block type references
 * - Connection integrity
 *
 * NOTE: Publisher/listener validation removed after transform unification
 */

import { describe, it, expect } from 'vitest';
import { MACRO_REGISTRY, getMacroKey, getMacroExpansion } from '../macros';
import { getBlockDefinition } from '../blocks';

describe('Macro Registry Validation', () => {
  describe('Quick Start Macros', () => {
    const quickStartMacros = [
      'macro:simpleGrid',
      'macro:animatedCircleRing',
      'macro:lineWave',
      'macro:rainbowGrid',
      'macro:pulsingGrid',
      'macro:driftingCircle',
      'macro:multiRing',
      'macro:breathingLine',
      'macro:colorPulse',
      'macro:rhythmicDots',
    ];

    quickStartMacros.forEach((macroKey) => {
      describe(macroKey, () => {
        it('should be registered', () => {
          expect(MACRO_REGISTRY[macroKey]).toBeDefined();
        });

        it('should have valid structure', () => {
          const expansion = MACRO_REGISTRY[macroKey];
          expect(expansion.blocks).toBeDefined();
          expect(Array.isArray(expansion.blocks)).toBe(true);
          expect(expansion.blocks.length).toBeGreaterThan(0);
          expect(expansion.connections).toBeDefined();
          expect(Array.isArray(expansion.connections)).toBe(true);
        });

        it('should reference only existing block types', () => {
          const expansion = MACRO_REGISTRY[macroKey];
          expansion.blocks.forEach((block) => {
            const def = getBlockDefinition(block.type);
            expect(def, `Block type "${block.type}" not found for macro "${macroKey}"`).toBeDefined();
          });
        });

        it('should have valid connections', () => {
          const expansion = MACRO_REGISTRY[macroKey];
          const blockRefs = new Set(expansion.blocks.map(b => b.ref));

          expansion.connections.forEach((conn) => {
            expect(blockRefs.has(conn.fromRef),
              `Connection fromRef "${conn.fromRef}" not found in blocks`).toBe(true);
            expect(blockRefs.has(conn.toRef),
              `Connection toRef "${conn.toRef}" not found in blocks`).toBe(true);
          });
        });

        // DELETED: Publisher/listener validation (removed in transform unification)
        // MacroExpansion no longer has publishers/listeners fields

        it('should have at least one render block', () => {
          const expansion = MACRO_REGISTRY[macroKey];
          const hasRenderBlock = expansion.blocks.some(b =>
            b.type.toLowerCase().includes('render')
          );
          expect(hasRenderBlock, `Macro "${macroKey}" has no render block`).toBe(true);
        });
      });
    });
  });

  describe('Slice Demo Macros', () => {
    const sliceDemoMacros = [
      'macro:breathingDots',
      'macro:breathingWave',
      'macro:rhythmicPulse',
      'macro:colorDrift',
      'macro:stableGrid',
      'macro:phaseSpread',
      'macro:driftingDots',
      'macro:styledElements',
      'macro:responsiveGrid',
      'macro:goldenPatch',
    ];

    sliceDemoMacros.forEach((macroKey) => {
      describe(macroKey, () => {
        it('should be registered', () => {
          expect(MACRO_REGISTRY[macroKey]).toBeDefined();
        });

        it('should have valid structure', () => {
          const expansion = MACRO_REGISTRY[macroKey];
          expect(expansion.blocks).toBeDefined();
          expect(Array.isArray(expansion.blocks)).toBe(true);
          expect(expansion.blocks.length).toBeGreaterThan(0);
          expect(expansion.connections).toBeDefined();
          expect(Array.isArray(expansion.connections)).toBe(true);
        });

        it('should reference only existing block types', () => {
          const expansion = MACRO_REGISTRY[macroKey];
          expansion.blocks.forEach((block) => {
            const def = getBlockDefinition(block.type);
            expect(def, `Block type "${block.type}" not found for macro "${macroKey}"`).toBeDefined();
          });
        });

        it('should have valid connections', () => {
          const expansion = MACRO_REGISTRY[macroKey];
          const blockRefs = new Set(expansion.blocks.map(b => b.ref));

          expansion.connections.forEach((conn) => {
            expect(blockRefs.has(conn.fromRef),
              `Connection fromRef "${conn.fromRef}" not found in blocks`).toBe(true);
            expect(blockRefs.has(conn.toRef),
              `Connection toRef "${conn.toRef}" not found in blocks`).toBe(true);
          });
        });

        // DELETED: Publisher/listener validation (removed in transform unification)

        it('should have at least one render block', () => {
          const expansion = MACRO_REGISTRY[macroKey];
          const hasRenderBlock = expansion.blocks.some(b =>
            b.type.toLowerCase().includes('render')
          );
          expect(hasRenderBlock, `Macro "${macroKey}" has no render block`).toBe(true);
        });
      });
    });

    describe('macro:goldenPatch (comprehensive)', () => {
      it('should be the most complex macro', () => {
        const golden = MACRO_REGISTRY['macro:goldenPatch'];

        // Golden patch should be among the most complex
        expect(golden.blocks.length).toBeGreaterThan(10);
      });

      // DELETED: Bus publication test (publishers field removed)
    });
  });

  describe('getMacroKey utility', () => {
    it('should recognize macro: prefixed types', () => {
      expect(getMacroKey('macro:simpleGrid')).toBe('macro:simpleGrid');
      expect(getMacroKey('macro:breathingDots')).toBe('macro:breathingDots');
    });

    it('should return null for non-macro types', () => {
      expect(getMacroKey('GridDomain')).toBeNull();
      expect(getMacroKey('RenderInstances2D')).toBeNull();
    });

    it('should return null for undefined macros', () => {
      expect(getMacroKey('macro:nonExistent')).toBeNull();
    });
  });

  describe('getMacroExpansion utility', () => {
    it('should return expansion for valid keys', () => {
      const exp = getMacroExpansion('macro:simpleGrid');
      expect(exp).toBeDefined();
      expect(exp?.blocks).toBeDefined();
    });

    it('should return null for invalid keys', () => {
      expect(getMacroExpansion('macro:nonExistent')).toBeNull();
      expect(getMacroExpansion('GridDomain')).toBeNull();
    });
  });
});
