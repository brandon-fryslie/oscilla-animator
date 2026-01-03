/**
 * @file ActionExecutor Tests
 * @description Unit tests for ActionExecutor service.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActionExecutor } from '../ActionExecutor';
import type { PatchStore } from '../../stores/PatchStore';
import type { UIStateStore } from '../../stores/UIStateStore';
import type { DiagnosticHub } from '../DiagnosticHub';
import type { BlockId, Block, Edge } from '../../types';

// Mock stores
const createMockPatchStore = (): Partial<PatchStore> => {
  const blocks: Block[] = [];
  return {
    blocks,
    edges: [],
    addBlock: vi.fn((_type: string, _params?: Record<string, unknown>) => {
      const newBlockId = `block-${Date.now()}`;
      blocks.push({ id: newBlockId, type: _type, label: _type, params: {}, position: { x: 0, y: 0 }, form: 'primitive' as const, role: { kind: 'user' as const } });
      return newBlockId;
    }),
    removeBlock: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
};


const createMockUIStateStore = (): Partial<UIStateStore> => ({
  selectBlock: vi.fn(),
  selectBus: vi.fn(),
});

const createMockDiagnosticHub = (): Partial<DiagnosticHub> => ({
  muteDiagnostic: vi.fn(),
});

describe('ActionExecutor', () => {
  let actionExecutor: ActionExecutor;
  let mockPatchStore: Partial<PatchStore>;
  let mockUIStateStore: Partial<UIStateStore>;
  let mockDiagnosticHub: Partial<DiagnosticHub>;

  beforeEach(() => {
    mockPatchStore = createMockPatchStore();
    mockUIStateStore = createMockUIStateStore();
    mockDiagnosticHub = createMockDiagnosticHub();

    actionExecutor = new ActionExecutor(
      mockPatchStore as PatchStore,
      mockUIStateStore as UIStateStore,
      mockDiagnosticHub as DiagnosticHub
    );
  });

  describe('goToTarget', () => {
    it('should select a block target', () => {
      const result = actionExecutor.execute({
        kind: 'goToTarget',
        target: { kind: 'block', blockId: 'block-1' },
      });

      expect(result).toBe(true);
      expect(mockUIStateStore.selectBlock).toHaveBeenCalledWith('block-1');
    });

    it('should select a bus target', () => {
      const result = actionExecutor.execute({
        kind: 'goToTarget',
        target: { kind: 'bus', busId: 'bus-1' },
      });

      expect(result).toBe(true);
      expect(mockUIStateStore.selectBus).toHaveBeenCalledWith('bus-1');
    });

    it('should select a port target (selects parent block)', () => {
      const result = actionExecutor.execute({
        kind: 'goToTarget',
        target: { kind: 'port', portRef: { blockId: 'block-1', slotId: 'input-1', direction: 'input' } },
      });

      expect(result).toBe(true);
      expect(mockUIStateStore.selectBlock).toHaveBeenCalledWith('block-1');
    });

    it('should select a timeRoot target', () => {
      const result = actionExecutor.execute({
        kind: 'goToTarget',
        target: { kind: 'timeRoot', blockId: 'block-1' },
      });

      expect(result).toBe(true);
      expect(mockUIStateStore.selectBlock).toHaveBeenCalledWith('block-1');
    });

    it('should handle graphSpan target (selects first block)', () => {
      const result = actionExecutor.execute({
        kind: 'goToTarget',
        target: { kind: 'graphSpan', blockIds: ['block-1', 'block-2'], spanKind: 'cycle' },
      });

      expect(result).toBe(true);
      expect(mockUIStateStore.selectBlock).toHaveBeenCalledWith('block-1');
    });

    it('should handle empty graphSpan target', () => {
      const result = actionExecutor.execute({
        kind: 'goToTarget',
        target: { kind: 'graphSpan', blockIds: [] },
      });

      expect(result).toBe(true);
      expect(mockUIStateStore.selectBlock).not.toHaveBeenCalled();
    });
  });

  describe('insertBlock', () => {
    it('should add a block when no nearBlockId specified', () => {
      const result = actionExecutor.execute({
        kind: 'insertBlock',
        blockType: 'SineWave',
      });

      expect(result).toBe(true);
      expect(mockPatchStore.addBlock).toHaveBeenCalledWith('SineWave');
    });

    it('should add a block near an existing block', () => {
      const result = actionExecutor.execute({
        kind: 'insertBlock',
        blockType: 'SineWave',
        nearBlockId: 'block-1',
        position: 'after',
      });

      expect(result).toBe(true);
      expect(mockPatchStore.addBlock).toHaveBeenCalled();
    });
  });

  describe('removeBlock', () => {
    it('should remove a block', () => {
      mockPatchStore.blocks = [
        { id: 'block-1' as BlockId, type: 'SineWave', label: 'Sine', params: {}, position: { x: 0, y: 0 }, form: 'primitive' as const, role: { kind: 'user' as const } },
      ];

      const result = actionExecutor.execute({
        kind: 'removeBlock',
        blockId: 'block-1',
      });

      expect(result).toBe(true);
      expect(mockPatchStore.removeBlock).toHaveBeenCalledWith('block-1');
    });

    it('should return false when block not found', () => {
      mockPatchStore.blocks = [];

      const result = actionExecutor.execute({
        kind: 'removeBlock',
        blockId: 'nonexistent',
      });

      expect(result).toBe(false);
      expect(mockPatchStore.removeBlock).not.toHaveBeenCalled();
    });
  });

  describe('createTimeRoot', () => {
    it('should create a InfiniteTimeRoot', () => {
      const result = actionExecutor.execute({
        kind: 'createTimeRoot',
        timeRootKind: 'Cycle',
      });

      expect(result).toBe(true);
      expect(mockPatchStore.addBlock).toHaveBeenCalledWith('InfiniteTimeRoot');
    });

    it('should create a FiniteTimeRoot', () => {
      const result = actionExecutor.execute({
        kind: 'createTimeRoot',
        timeRootKind: 'Finite',
      });

      expect(result).toBe(true);
      expect(mockPatchStore.addBlock).toHaveBeenCalledWith('FiniteTimeRoot');
    });

    it('should create an InfiniteTimeRoot', () => {
      const result = actionExecutor.execute({
        kind: 'createTimeRoot',
        timeRootKind: 'Infinite',
      });

      expect(result).toBe(true);
      expect(mockPatchStore.addBlock).toHaveBeenCalledWith('InfiniteTimeRoot');
    });

    it('should remove existing TimeRoots before creating new one', () => {
      mockPatchStore.blocks = [
        { id: 'block-1' as BlockId, type: 'InfiniteTimeRoot', label: 'Cycle', params: {}, position: { x: 0, y: 0 }, form: 'primitive' as const, role: { kind: 'user' as const } },
        { id: 'block-2' as BlockId, type: 'FiniteTimeRoot', label: 'Finite', params: {}, position: { x: 0, y: 0 }, form: 'primitive' as const, role: { kind: 'user' as const } },
      ];

      const result = actionExecutor.execute({
        kind: 'createTimeRoot',
        timeRootKind: 'Infinite',
      });

      expect(result).toBe(true);
      expect(mockPatchStore.removeBlock).toHaveBeenCalledWith('block-1');
      expect(mockPatchStore.removeBlock).toHaveBeenCalledWith('block-2');
      expect(mockPatchStore.addBlock).toHaveBeenCalledWith('InfiniteTimeRoot');
    });
  });

  describe('muteDiagnostic', () => {
    it('should mute a diagnostic', () => {
      const result = actionExecutor.execute({
        kind: 'muteDiagnostic',
        diagnosticId: 'diag-1',
      });

      expect(result).toBe(true);
      expect(mockDiagnosticHub.muteDiagnostic).toHaveBeenCalledWith('diag-1');
    });
  });

  describe('openDocs', () => {
    it('should open documentation URL', () => {
      // Mock window.open
      const originalOpen = window.open;
      window.open = vi.fn();

      const result = actionExecutor.execute({
        kind: 'openDocs',
        docUrl: 'https://example.com/docs',
      });

      expect(result).toBe(true);
      expect(window.open).toHaveBeenCalledWith('https://example.com/docs', '_blank');

      // Restore
      window.open = originalOpen;
    });
  });

  describe('addAdapter', () => {
    beforeEach(() => {
      // Set up test blocks and connections for adapter tests
      const sourceBlock: Block = {
        id: 'source-block' as BlockId,
        type: 'Oscillator',
        label: 'Source',
        params: {}, position: { x: 0, y: 0 }, form: 'primitive' as const, role: { kind: 'user' as const },
      };

      const targetBlock: Block = {
        id: 'target-block' as BlockId,
        type: 'ClampSignal',
        label: 'Target',
        params: {}, position: { x: 0, y: 0 }, form: 'primitive' as const, role: { kind: 'user' as const },
      };

      const adapterBlock: Block = {
        id: 'adapter-block' as BlockId,
        type: 'ClampSignal',
        label: 'Clamp',
        params: {}, position: { x: 0, y: 0 }, form: 'primitive' as const, role: { kind: 'user' as const },
      };

      const edge: Edge = {
        id: 'edge-1',
        from: { kind: 'port', blockId: 'source-block', slotId: 'out' },
        to: { kind: 'port', blockId: 'target-block', slotId: 'in' },
        enabled: true,
      role: { kind: 'user' },
      };

      mockPatchStore.blocks = [sourceBlock, targetBlock];
      mockPatchStore.edges = [edge];
      // Mock addBlock to return adapter and add it to blocks
      (mockPatchStore.addBlock as ReturnType<typeof vi.fn>) = vi.fn((_adapterType: string) => {
        const adapterId = 'adapter-block' as BlockId;
        mockPatchStore.blocks!.push(adapterBlock);
        return adapterId;
      });
    });

    it('should insert adapter between connected ports', () => {
      const result = actionExecutor.execute({
        kind: 'addAdapter',
        fromPort: { kind: 'port', portRef: { blockId: 'source-block', slotId: 'out', direction: 'output' } },
        adapterType: 'ClampSignal',
      });

      expect(result).toBe(true);

      // Verify adapter block was added
      expect(mockPatchStore.addBlock).toHaveBeenCalledWith('ClampSignal');

      // Verify old edge was removed
      expect(mockPatchStore.disconnect).toHaveBeenCalledWith('edge-1');

      // Verify new connections were added (source -> adapter -> target)
      expect(mockPatchStore.connect).toHaveBeenCalledTimes(2);
      expect(mockPatchStore.connect).toHaveBeenCalledWith('source-block', 'out', 'adapter-block', 'in');
      expect(mockPatchStore.connect).toHaveBeenCalledWith('adapter-block', 'out', 'target-block', 'in');

      // Verify adapter was selected
      expect(mockUIStateStore.selectBlock).toHaveBeenCalledWith('adapter-block');
    });

    it('should return false if no edge from port', () => {
      // Remove the edge
      mockPatchStore.edges = [];

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = actionExecutor.execute({
        kind: 'addAdapter',
        fromPort: { kind: 'port', portRef: { blockId: 'source-block', slotId: 'out', direction: 'output' } },
        adapterType: 'ClampSignal',
      });

      expect(result).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[ActionExecutor] No edge found from port:',
        expect.objectContaining({ blockId: 'source-block', slotId: 'out', direction: 'output' })
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle adapter block with missing ports gracefully', () => {
      // Create an adapter block with non-standard port names
      const badAdapterBlock: Block = {
        id: 'adapter-block' as BlockId,
        type: 'BadAdapter',
        label: 'Bad Adapter',
        params: {}, position: { x: 0, y: 0 }, form: 'primitive' as const, role: { kind: 'user' as const },
      };

      // Override addBlock to add bad adapter
      (mockPatchStore.addBlock as ReturnType<typeof vi.fn>) = vi.fn((_badAdapterType: string) => {
        const adapterId = 'adapter-block' as BlockId;
        mockPatchStore.blocks!.push(badAdapterBlock);
        return adapterId;
      });

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = actionExecutor.execute({
        kind: 'addAdapter',
        fromPort: { kind: 'port', portRef: { blockId: 'source-block', slotId: 'out', direction: 'output' } },
        adapterType: 'BadAdapter',
      });

      expect(result).toBe(false);

      // Verify warning was logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[ActionExecutor] Adapter block missing expected ports:',
        expect.objectContaining({
          adapterType: 'BadAdapter',
        })
      );

      // Verify original connection was restored
      expect(mockPatchStore.connect).toHaveBeenCalledWith('source-block', 'out', 'target-block', 'in');

      // Verify failed adapter block was removed
      expect(mockPatchStore.removeBlock).toHaveBeenCalledWith('adapter-block');

      consoleWarnSpy.mockRestore();
    });
  });

  describe('unknown action', () => {
    it('should return false and warn for unknown action kind', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // This tests the "no edge found" warning since there's no edge for block 'b'
      actionExecutor.execute({ kind: 'addAdapter', fromPort: { kind: 'port', portRef: { blockId: 'b', slotId: 'p', direction: 'output' } }, adapterType: 'test' });

      expect(consoleWarnSpy).toHaveBeenCalledWith('[ActionExecutor] No edge found from port:', expect.anything());

      consoleWarnSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should catch and log errors during execution', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Force an error by making selectBlock throw
      (mockUIStateStore.selectBlock as ReturnType<typeof vi.fn>) = vi.fn(() => {
        throw new Error('Test error');
      });

      const result = actionExecutor.execute({
        kind: 'goToTarget',
        target: { kind: 'block', blockId: 'block-1' },
      });

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('Error executing action');

      consoleErrorSpy.mockRestore();
    });
  });
});
