/**
 * @file ActionExecutor
 * @description Service for executing diagnostic fix actions.
 *
 * Design principles:
 * - Receives action requests from UI (DiagnosticsConsole)
 * - Validates actions are safe to execute
 * - Executes actions against appropriate stores
 * - Returns success/failure for UI feedback
 *
 * Reference: .agent_planning/diagnostics-system/PLAN-D-FixAction-Execution.md
 */

import type { DiagnosticAction, TargetRef } from './types';
import type { PatchStore } from '../stores/PatchStore';
import type { UIStateStore } from '../stores/UIStateStore';
import type { DiagnosticHub } from './DiagnosticHub';

/**
 * ActionExecutor executes diagnostic fix actions by delegating to stores.
 */
export class ActionExecutor {
  patchStore: PatchStore;
  uiStore: UIStateStore;
  diagnosticHub: DiagnosticHub;

  constructor(
    patchStore: PatchStore,
    uiStore: UIStateStore,
    diagnosticHub: DiagnosticHub
  ) {
    this.patchStore = patchStore;
    this.uiStore = uiStore;
    this.diagnosticHub = diagnosticHub;
  }

  /**
   * Execute a diagnostic action.
   * @param action - The action to execute
   * @returns True if action was executed successfully, false otherwise
   */
  execute(action: DiagnosticAction): boolean {
    try {
      switch (action.kind) {
        case 'goToTarget':
          return this.goToTarget(action.target);

        case 'insertBlock':
          return this.insertBlock(
            action.blockType,
            action.position,
            action.nearBlockId
          );

        case 'removeBlock':
          return this.removeBlock(action.blockId);

        case 'addAdapter':
          // Deferred to Phase 3 - complex connection rewiring required
          console.warn('[ActionExecutor] addAdapter action deferred to Phase 3');
          return false;

        case 'createTimeRoot':
          return this.createTimeRoot(action.timeRootKind);

        case 'muteDiagnostic':
          this.diagnosticHub.muteDiagnostic(action.diagnosticId);
          return true;

        case 'openDocs':
          window.open(action.docUrl, '_blank');
          return true;

        default:
          console.warn('[ActionExecutor] Unknown action kind:', (action as any).kind);
          return false;
      }
    } catch (error) {
      console.error('[ActionExecutor] Error executing action:', error);
      return false;
    }
  }

  // ===========================================================================
  // Action Implementations
  // ===========================================================================

  /**
   * Navigate to and select a target entity.
   */
  goToTarget(target: TargetRef): boolean {
    switch (target.kind) {
      case 'block':
      case 'timeRoot':
        // Select the block
        this.uiStore.selectBlock(target.blockId);
        // TODO: Scroll into view and flash highlight (future enhancement)
        return true;

      case 'port':
        // Select the block containing the port
        this.uiStore.selectBlock(target.blockId);
        // TODO: Expand port panel and highlight port (future enhancement)
        return true;

      case 'bus':
        // Select the bus
        this.uiStore.selectBus(target.busId);
        // TODO: Switch to bus board tab (future enhancement)
        return true;

      case 'binding':
        // Select the bus, highlight binding (best effort)
        this.uiStore.selectBus(target.busId);
        // TODO: Highlight binding row (future enhancement)
        return true;

      case 'graphSpan':
        // Multi-select not yet supported, select first block if available
        if (target.blockIds.length > 0) {
          this.uiStore.selectBlock(target.blockIds[0]);
        }
        // TODO: Multi-select and zoom to fit (future enhancement)
        return true;

      case 'composite':
        // Composite editor not yet implemented
        console.warn('[ActionExecutor] Composite editor not yet implemented');
        return false;

      default:
        console.warn('[ActionExecutor] Unknown target kind:', (target as any).kind);
        return false;
    }
  }

  /**
   * Insert a new block near an existing one.
   */
  insertBlock(
    blockType: string,
    position?: 'before' | 'after',
    nearBlockId?: string
  ): boolean {
    // Find the appropriate lane
    let targetLane = this.patchStore.lanes[0]; // Default to first lane

    if (nearBlockId) {
      // Find the lane containing the reference block
      const refLane = this.patchStore.lanes.find((lane) =>
        lane.blockIds.includes(nearBlockId)
      );
      if (refLane) {
        targetLane = refLane;
      }
    }

    if (!targetLane) {
      console.warn('[ActionExecutor] No target lane found for insertBlock');
      return false;
    }

    // Add the block
    const newBlockId = this.patchStore.addBlock(blockType, targetLane.id);

    // Reorder if position is specified
    if (nearBlockId && position && targetLane.blockIds.includes(nearBlockId)) {
      const nearIndex = targetLane.blockIds.indexOf(nearBlockId);
      const newIndex = position === 'before' ? nearIndex : nearIndex + 1;
      this.patchStore.reorderBlockInLane(targetLane.id, newBlockId, newIndex);
    }

    // Select the new block
    this.uiStore.selectBlock(newBlockId);

    return true;
  }

  /**
   * Remove a problematic block.
   */
  removeBlock(blockId: string): boolean {
    const block = this.patchStore.blocks.find((b) => b.id === blockId);
    if (!block) {
      console.warn('[ActionExecutor] Block not found:', blockId);
      return false;
    }

    this.patchStore.removeBlock(blockId);
    return true;
  }

  /**
   * Add a missing TimeRoot block.
   * Clears existing TimeRoots (if any) and adds a new one to the Time lane.
   */
  createTimeRoot(timeRootKind: 'Finite' | 'Cycle' | 'Infinite'): boolean {
    // Find the Time lane (Phase lane is the time lane in the current layouts)
    const timeLane = this.patchStore.lanes.find((lane) => lane.kind === 'Phase');
    if (!timeLane) {
      console.warn('[ActionExecutor] Time lane not found');
      return false;
    }

    // Remove existing TimeRoot blocks (if any)
    const existingTimeRoots = this.patchStore.blocks.filter(
      (block) =>
        block.type === 'FiniteTimeRoot' ||
        block.type === 'CycleTimeRoot' ||
        block.type === 'InfiniteTimeRoot'
    );

    for (const timeRoot of existingTimeRoots) {
      this.patchStore.removeBlock(timeRoot.id);
    }

    // Determine the block type to create
    const blockType = `${timeRootKind}TimeRoot`;

    // Add the new TimeRoot block
    const newBlockId = this.patchStore.addBlock(blockType, timeLane.id);

    // Auto-publish to buses (handled by PatchStore.addBlock via processAutoBusConnections)
    // CycleTimeRoot auto-publishes 'phase' -> 'phaseA' and 'wrap' -> 'pulse'
    // FiniteTimeRoot auto-publishes 'progress' -> 'progress'

    // Select the new TimeRoot
    this.uiStore.selectBlock(newBlockId);

    return true;
  }
}
