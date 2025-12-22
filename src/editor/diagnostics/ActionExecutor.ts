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

import type { DiagnosticAction, TargetRef, PortTargetRef } from './types';
import type { PatchStore } from '../stores/PatchStore';
import type { UIStateStore } from '../stores/UIStateStore';
import type { ViewStateStore } from '../stores/ViewStateStore';
import type { DiagnosticHub } from './DiagnosticHub';

/**
 * ActionExecutor executes diagnostic fix actions by delegating to stores.
 */
export class ActionExecutor {
  patchStore: PatchStore;
  uiStore: UIStateStore;
  viewStore: ViewStateStore;
  diagnosticHub: DiagnosticHub;

  constructor(
    patchStore: PatchStore,
    uiStore: UIStateStore,
    viewStore: ViewStateStore,
    diagnosticHub: DiagnosticHub
  ) {
    this.patchStore = patchStore;
    this.uiStore = uiStore;
    this.viewStore = viewStore;
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
          return this.addAdapter(action.fromPort, action.adapterType);

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
        this.uiStore.selectBlock(target.portRef.blockId);
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
    let targetLane = this.viewStore.lanes[0]; // Default to first lane

    if (nearBlockId) {
      // Find the lane containing the reference block
      const refLane = this.viewStore.lanes.find((lane) =>
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
    const newBlockId = this.patchStore.addBlock(blockType);

    // Reorder if position is specified
    if (nearBlockId && position && targetLane.blockIds.includes(nearBlockId)) {
      const nearIndex = targetLane.blockIds.indexOf(nearBlockId);
      const newIndex = position === 'before' ? nearIndex : nearIndex + 1;
      
      // We need to ensure the block is in the target lane first (it might have been auto-placed elsewhere)
      this.viewStore.moveBlockToLane(newBlockId, targetLane.id);
      this.viewStore.reorderBlockInLane(targetLane.id, newBlockId, newIndex);
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
   * Insert an adapter/lens between two connected ports.
   * Finds the connection from the specified port, inserts an adapter block,
   * and rewires the connections to go through the adapter.
   */
  addAdapter(fromPort: PortTargetRef, adapterType: string): boolean {
    const portRef = fromPort.portRef;
    // 1. Find the connection from this port
    const connection = this.patchStore.connections.find(
      (c) => c.from.blockId === portRef.blockId && c.from.slotId === portRef.slotId
    );

    if (!connection) {
      console.warn('[ActionExecutor] No connection found from port:', portRef);
      return false;
    }

    // 2. Find the lane containing the source block
    const lane = this.viewStore.lanes.find((l) =>
      l.blockIds.includes(portRef.blockId)
    );

    if (!lane) {
      console.warn('[ActionExecutor] Lane not found for block:', portRef.blockId);
      return false;
    }

    // 3. Add the adapter block
    const adapterId = this.patchStore.addBlock(adapterType);
    
    // Move to the correct lane
    this.viewStore.moveBlockToLane(adapterId, lane.id);

    // 4. Rewire: remove old connection
    this.patchStore.disconnect(connection.id);

    // 5. Rewire: add new connections through adapter
    // Adapter blocks typically have 'in' input and 'out' output ports
    // For blocks like ClampSignal, Shaper, etc.
    const adapterBlock = this.patchStore.blocks.find((b) => b.id === adapterId);
    if (!adapterBlock) {
      console.warn('[ActionExecutor] Adapter block not found after creation:', adapterId);
      return false;
    }

    // Find the input port on the adapter (typically 'in' or 'input')
    const adapterInput = adapterBlock.inputs.find((inp) =>
      inp.id === 'in' || inp.id === 'input'
    );

    // Find the output port on the adapter (typically 'out' or 'output')
    const adapterOutput = adapterBlock.outputs.find((out) =>
      out.id === 'out' || out.id === 'output'
    );

    if (!adapterInput || !adapterOutput) {
      console.warn('[ActionExecutor] Adapter block missing expected ports:', {
        adapterType,
        inputs: adapterBlock.inputs.map((i) => i.id),
        outputs: adapterBlock.outputs.map((o) => o.id),
      });
      // Restore the original connection
      this.patchStore.connect(
        connection.from.blockId,
        connection.from.slotId,
        connection.to.blockId,
        connection.to.slotId
      );
      // Remove the failed adapter block
      this.patchStore.removeBlock(adapterId);
      return false;
    }

    // Connect: source -> adapter input
    this.patchStore.connect(
      connection.from.blockId,
      connection.from.slotId,
      adapterId,
      adapterInput.id
    );

    // Connect: adapter output -> original destination
    this.patchStore.connect(
      adapterId,
      adapterOutput.id,
      connection.to.blockId,
      connection.to.slotId
    );

    // Select the adapter for user to configure parameters
    this.uiStore.selectBlock(adapterId);

    return true;
  }

  /**
   * Add a missing TimeRoot block.
   * Clears existing TimeRoots (if any) and adds a new one to the Time lane.
   */
  createTimeRoot(timeRootKind: 'Finite' | 'Cycle' | 'Infinite'): boolean {
    // Find the Time lane (Phase lane is the time lane in the current layouts)
    const timeLane = this.viewStore.lanes.find((lane) => lane.kind === 'Phase');
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
    const newBlockId = this.patchStore.addBlock(blockType);
    
    // Ensure it's in the time lane
    this.uiStore.root.viewStore.moveBlockToLane(newBlockId, timeLane.id);

    // Auto-publish to buses (handled by PatchStore.addBlock via processAutoBusConnections)
    // CycleTimeRoot auto-publishes 'phase' -> 'phaseA' and 'wrap' -> 'pulse'
    // FiniteTimeRoot auto-publishes 'progress' -> 'progress'

    // Select the new TimeRoot
    this.uiStore.selectBlock(newBlockId);

    return true;
  }
}
