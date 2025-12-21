/**
 * Semantic Validator
 *
 * Single source of truth for all graph validation rules.
 * Used by both the editor mutation layer and the compiler.
 *
 * Key principles:
 * - One ruleset, three consumers (UI, Compiler, Diagnostics)
 * - Incremental validation where possible
 * - Clear policy on what to prevent vs warn
 *
 * Edit-time policy:
 * - PREVENT: invalid endpoints, incompatible types, multiple TimeRoots, multiple writers, cycles
 * - ALLOW (warn): expensive adapters, unused blocks, empty buses, perf hotspots
 *
 * Reference: design-docs/10-Refactor-for-UI-prep/5-DivergentTypes.md
 */

import type { PatchDocument, PortKey, ValidationResult } from './types';
import { SemanticGraph } from './graph';
import { createDiagnostic, type Diagnostic } from '../diagnostics/types';
import { areSlotTypesCompatible } from './index';
import type { SlotType } from '../types';

/**
 * Validator provides validation operations for patch graphs.
 *
 * Usage:
 * - canApply(op, patch): Preflight check before mutation
 * - validateDelta(delta): Post-apply diagnostics for affected nodes
 * - validateAll(patch): Full validation pass
 */
export class Validator {
  private graph: SemanticGraph;
  private patchRevision: number;

  constructor(patch: PatchDocument, patchRevision: number = 0) {
    this.graph = SemanticGraph.fromPatch(patch);
    this.patchRevision = patchRevision;
  }

  /**
   * Validate the entire patch.
   * Returns all diagnostics for the current patch state.
   *
   * This is used by the compiler before codegen and by the diagnostics UI.
   */
  validateAll(patch: PatchDocument): ValidationResult {
    const errors: Diagnostic[] = [];
    const warnings: Diagnostic[] = [];

    // Rule 1: Exactly one TimeRoot
    const timeRootErrors = this.validateTimeRootConstraint(patch);
    errors.push(...timeRootErrors);

    // Rule 2: No multiple writers to same input
    const multiWriterErrors = this.validateUniqueWriters(patch);
    errors.push(...multiWriterErrors);

    // Rule 3: Type compatibility on all connections
    const typeErrors = this.validateConnectionTypes(patch);
    errors.push(...typeErrors);

    // Rule 4: No cycles (unless memory boundary exists - Phase 4)
    const cycleErrors = this.validateNoCycles();
    errors.push(...cycleErrors);

    // Rule 5: All connection endpoints exist
    const endpointErrors = this.validateEndpoints(patch);
    errors.push(...endpointErrors);

    // Warning: Empty buses
    const emptyBusWarnings = this.warnEmptyBuses(patch);
    warnings.push(...emptyBusWarnings);

    return {
      ok: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ===========================================================================
  // Validation Rules (Individual Checks)
  // ===========================================================================

  /**
   * Rule: Exactly one TimeRoot per patch.
   */
  private validateTimeRootConstraint(patch: PatchDocument): Diagnostic[] {
    const timeRootBlocks = patch.blocks.filter(
      (b) =>
        b.type === 'FiniteTimeRoot' ||
        b.type === 'CycleTimeRoot' ||
        b.type === 'InfiniteTimeRoot'
    );

    const errors: Diagnostic[] = [];

    if (timeRootBlocks.length === 0) {
      errors.push(
        createDiagnostic({
          code: 'E_TIME_ROOT_MISSING',
          severity: 'error',
          domain: 'compile',
          primaryTarget: {
            kind: 'graphSpan',
            blockIds: [],
            spanKind: 'subgraph',
          },
          title: 'Missing TimeRoot',
          message:
            'Patch must contain exactly one TimeRoot block (FiniteTimeRoot, CycleTimeRoot, or InfiniteTimeRoot)',
          patchRevision: this.patchRevision,
        })
      );
    }

    if (timeRootBlocks.length > 1) {
      errors.push(
        createDiagnostic({
          code: 'E_TIME_ROOT_MULTIPLE',
          severity: 'error',
          domain: 'compile',
          primaryTarget: {
            kind: 'timeRoot',
            blockId: timeRootBlocks[0]!.id,
          },
          affectedTargets: timeRootBlocks.slice(1).map((b) => ({
            kind: 'block' as const,
            blockId: b.id,
          })),
          title: 'Multiple TimeRoots',
          message: `Patch contains ${timeRootBlocks.length} TimeRoot blocks - only one is allowed`,
          patchRevision: this.patchRevision,
        })
      );
    }

    return errors;
  }

  /**
   * Rule: No multiple writers to the same input port.
   * An input can have at most one incoming wire OR one incoming listener.
   */
  private validateUniqueWriters(patch: PatchDocument): Diagnostic[] {
    const errors: Diagnostic[] = [];

    // Check each block's input ports
    for (const block of patch.blocks) {
      for (const input of block.inputs) {
        const portKey: PortKey = {
          blockId: block.id,
          slotId: input.id,
          dir: 'input',
        };

        const incomingWires = this.graph.getIncomingWires(portKey);
        const incomingListeners = this.graph.getIncomingListeners(portKey);

        const totalWriters = incomingWires.length + incomingListeners.length;

        if (totalWriters > 1) {
          // Multiple writers to same input - error
          const connections = [
            ...incomingWires.map((e) => e.connectionId),
            ...incomingListeners.map((e) => e.listenerId),
          ];

          errors.push(
            createDiagnostic({
              code: 'E_INVALID_CONNECTION',
              severity: 'error',
              domain: 'compile',
              primaryTarget: {
                kind: 'port',
                blockId: block.id,
                portId: input.id,
              },
              title: 'Multiple writers',
              message: `Input port ${block.id}.${input.id} has ${totalWriters} incoming connections (wires + listeners). Only one writer is allowed.`,
              patchRevision: this.patchRevision,
              payload: {
                kind: 'generic',
                data: { connections },
              },
            })
          );
        }
      }
    }

    return errors;
  }

  /**
   * Rule: All connections must be type-compatible.
   * Uses the canonical isAssignable check from semantic/index.ts.
   */
  private validateConnectionTypes(patch: PatchDocument): Diagnostic[] {
    const errors: Diagnostic[] = [];

    // Check wire connections
    for (const conn of patch.connections) {
      const fromBlock = patch.blocks.find((b) => b.id === conn.from.blockId);
      const toBlock = patch.blocks.find((b) => b.id === conn.to.blockId);

      if (!fromBlock || !toBlock) {
        // Endpoint validation will catch this
        continue;
      }

      const fromSlot = fromBlock.outputs.find((s) => s.id === conn.from.slotId);
      const toSlot = toBlock.inputs.find((s) => s.id === conn.to.slotId);

      if (!fromSlot || !toSlot) {
        // Endpoint validation will catch this
        continue;
      }

      // Check type compatibility using canonical semantic check
      const compatible = areSlotTypesCompatible(
        fromSlot.type as SlotType,
        toSlot.type as SlotType
      );

      if (!compatible) {
        errors.push(
          createDiagnostic({
            code: 'E_TYPE_MISMATCH',
            severity: 'error',
            domain: 'compile',
            primaryTarget: {
              kind: 'port',
              blockId: toBlock.id,
              portId: toSlot.id,
            },
            affectedTargets: [
              {
                kind: 'port',
                blockId: fromBlock.id,
                portId: fromSlot.id,
              },
            ],
            title: 'Type mismatch',
            message: `Cannot connect ${fromBlock.id}.${fromSlot.id} (${fromSlot.type}) to ${toBlock.id}.${toSlot.id} (${toSlot.type})`,
            patchRevision: this.patchRevision,
            payload: {
              kind: 'typeMismatch',
              expected: toSlot.type,
              actual: fromSlot.type,
            },
          })
        );
      }
    }

    // TODO Phase 2: Check publisher/listener type compatibility with buses

    return errors;
  }

  /**
   * Rule: No cycles in the dependency graph.
   * Uses SemanticGraph's cycle detection.
   *
   * Note: Phase 4 will allow cycles with memory boundaries.
   * For now, all cycles are errors.
   */
  private validateNoCycles(): Diagnostic[] {
    const cycles = this.graph.detectCycles();
    const errors: Diagnostic[] = [];

    for (const cycle of cycles) {
      errors.push(
        createDiagnostic({
          code: 'E_CYCLE_DETECTED',
          severity: 'error',
          domain: 'compile',
          primaryTarget: {
            kind: 'graphSpan',
            blockIds: cycle,
            spanKind: 'cycle',
          },
          title: 'Cycle detected',
          message: `Cycle detected in patch graph: ${cycle.join(' → ')}`,
          patchRevision: this.patchRevision,
          payload: {
            kind: 'cycle',
            cycleMembers: cycle,
          },
        })
      );
    }

    return errors;
  }

  /**
   * Rule: All connection endpoints must exist (valid blockId + slotId).
   */
  private validateEndpoints(patch: PatchDocument): Diagnostic[] {
    const errors: Diagnostic[] = [];

    for (const conn of patch.connections) {
      // Check from endpoint
      const fromBlock = patch.blocks.find((b) => b.id === conn.from.blockId);
      if (!fromBlock) {
        errors.push(
          createDiagnostic({
            code: 'E_INVALID_CONNECTION',
            severity: 'error',
            domain: 'compile',
            primaryTarget: {
              kind: 'block',
              blockId: conn.from.blockId,
            },
            title: 'Invalid connection source',
            message: `Connection references missing block: ${conn.from.blockId}`,
            patchRevision: this.patchRevision,
          })
        );
        continue;
      }

      const fromSlot = fromBlock.outputs.find((s) => s.id === conn.from.slotId);
      if (!fromSlot) {
        errors.push(
          createDiagnostic({
            code: 'E_INVALID_CONNECTION',
            severity: 'error',
            domain: 'compile',
            primaryTarget: {
              kind: 'port',
              blockId: conn.from.blockId,
              portId: conn.from.slotId,
            },
            title: 'Invalid connection source',
            message: `Connection references missing output slot: ${conn.from.blockId}.${conn.from.slotId}`,
            patchRevision: this.patchRevision,
          })
        );
      }

      // Check to endpoint
      const toBlock = patch.blocks.find((b) => b.id === conn.to.blockId);
      if (!toBlock) {
        errors.push(
          createDiagnostic({
            code: 'E_INVALID_CONNECTION',
            severity: 'error',
            domain: 'compile',
            primaryTarget: {
              kind: 'block',
              blockId: conn.to.blockId,
            },
            title: 'Invalid connection target',
            message: `Connection references missing block: ${conn.to.blockId}`,
            patchRevision: this.patchRevision,
          })
        );
        continue;
      }

      const toSlot = toBlock.inputs.find((s) => s.id === conn.to.slotId);
      if (!toSlot) {
        errors.push(
          createDiagnostic({
            code: 'E_INVALID_CONNECTION',
            severity: 'error',
            domain: 'compile',
            primaryTarget: {
              kind: 'port',
              blockId: conn.to.blockId,
              portId: conn.to.slotId,
            },
            title: 'Invalid connection target',
            message: `Connection references missing input slot: ${conn.to.blockId}.${conn.to.slotId}`,
            patchRevision: this.patchRevision,
          })
        );
      }
    }

    return errors;
  }

  /**
   * Warning: Buses with no publishers.
   * This is allowed but may indicate a configuration issue.
   */
  private warnEmptyBuses(patch: PatchDocument): Diagnostic[] {
    if (!patch.buses) return [];

    const warnings: Diagnostic[] = [];

    for (const bus of patch.buses) {
      const publishers = this.graph.getBusPublishers(bus.id);
      if (publishers.length === 0) {
        warnings.push(
          createDiagnostic({
            code: 'W_BUS_NO_PUBLISHERS',
            severity: 'warn',
            domain: 'compile',
            primaryTarget: {
              kind: 'bus',
              busId: bus.id,
            },
            title: 'Bus has no publishers',
            message: `Bus "${bus.name}" has no publishers. It will use its default value.`,
            patchRevision: this.patchRevision,
          })
        );
      }
    }

    return warnings;
  }

  // ===========================================================================
  // Preflight Validation (for incremental checks)
  // ===========================================================================

  /**
   * Check if adding a connection would be valid.
   * Returns validation result with errors if invalid.
   *
   * Checks:
   * - Endpoints exist
   * - Types are compatible
   * - Would not create multiple writers
   * - Would not create a cycle
   */
  canAddConnection(
    patch: PatchDocument,
    from: { blockId: string; slotId: string },
    to: { blockId: string; slotId: string }
  ): ValidationResult {
    const errors: Diagnostic[] = [];

    // Check endpoints exist
    const fromBlock = patch.blocks.find((b) => b.id === from.blockId);
    const toBlock = patch.blocks.find((b) => b.id === to.blockId);

    if (!fromBlock) {
      errors.push(
        createDiagnostic({
          code: 'E_INVALID_CONNECTION',
          severity: 'error',
          domain: 'authoring',
          primaryTarget: { kind: 'block', blockId: from.blockId },
          title: 'Invalid source block',
          message: `Block not found: ${from.blockId}`,
          patchRevision: this.patchRevision,
        })
      );
      return { ok: false, errors, warnings: [] };
    }

    if (!toBlock) {
      errors.push(
        createDiagnostic({
          code: 'E_INVALID_CONNECTION',
          severity: 'error',
          domain: 'authoring',
          primaryTarget: { kind: 'block', blockId: to.blockId },
          title: 'Invalid target block',
          message: `Block not found: ${to.blockId}`,
          patchRevision: this.patchRevision,
        })
      );
      return { ok: false, errors, warnings: [] };
    }

    const fromSlot = fromBlock.outputs.find((s) => s.id === from.slotId);
    const toSlot = toBlock.inputs.find((s) => s.id === to.slotId);

    if (!fromSlot) {
      errors.push(
        createDiagnostic({
          code: 'E_INVALID_CONNECTION',
          severity: 'error',
          domain: 'authoring',
          primaryTarget: {
            kind: 'port',
            blockId: from.blockId,
            portId: from.slotId,
          },
          title: 'Invalid source port',
          message: `Output slot not found: ${from.blockId}.${from.slotId}`,
          patchRevision: this.patchRevision,
        })
      );
      return { ok: false, errors, warnings: [] };
    }

    if (!toSlot) {
      errors.push(
        createDiagnostic({
          code: 'E_INVALID_CONNECTION',
          severity: 'error',
          domain: 'authoring',
          primaryTarget: {
            kind: 'port',
            blockId: to.blockId,
            portId: to.slotId,
          },
          title: 'Invalid target port',
          message: `Input slot not found: ${to.blockId}.${to.slotId}`,
          patchRevision: this.patchRevision,
        })
      );
      return { ok: false, errors, warnings: [] };
    }

    // Check type compatibility
    const compatible = areSlotTypesCompatible(
      fromSlot.type as SlotType,
      toSlot.type as SlotType
    );

    if (!compatible) {
      errors.push(
        createDiagnostic({
          code: 'E_TYPE_MISMATCH',
          severity: 'error',
          domain: 'authoring',
          primaryTarget: {
            kind: 'port',
            blockId: to.blockId,
            portId: to.slotId,
          },
          affectedTargets: [
            {
              kind: 'port',
              blockId: from.blockId,
              portId: from.slotId,
            },
          ],
          title: 'Type mismatch',
          message: `Cannot connect ${fromSlot.type} to ${toSlot.type}`,
          patchRevision: this.patchRevision,
          payload: {
            kind: 'typeMismatch',
            expected: toSlot.type,
            actual: fromSlot.type,
          },
        })
      );
      return { ok: false, errors, warnings: [] };
    }

    // Check for multiple writers
    const toPortKey: PortKey = {
      blockId: to.blockId,
      slotId: to.slotId,
      dir: 'input',
    };
    const existingIncoming = this.graph.getAllIncomingEdges(toPortKey);
    if (existingIncoming.length > 0) {
      errors.push(
        createDiagnostic({
          code: 'E_INVALID_CONNECTION',
          severity: 'error',
          domain: 'authoring',
          primaryTarget: {
            kind: 'port',
            blockId: to.blockId,
            portId: to.slotId,
          },
          title: 'Multiple writers',
          message: `Input port already has an incoming connection. Replace existing connection?`,
          patchRevision: this.patchRevision,
        })
      );
      return { ok: false, errors, warnings: [] };
    }

    // Check for cycles
    const wouldCreateCycle = this.graph.wouldCreateCycle(from.blockId, to.blockId);
    if (wouldCreateCycle) {
      errors.push(
        createDiagnostic({
          code: 'E_CYCLE_DETECTED',
          severity: 'error',
          domain: 'authoring',
          primaryTarget: {
            kind: 'graphSpan',
            blockIds: [from.blockId, to.blockId],
            spanKind: 'cycle',
          },
          title: 'Would create cycle',
          message: `Adding this connection would create a cycle in the graph`,
          patchRevision: this.patchRevision,
        })
      );
      return { ok: false, errors, warnings: [] };
    }

    return { ok: true, errors: [], warnings: [] };
  }

  /**
   * Get the semantic graph for advanced queries.
   */
  getGraph(): SemanticGraph {
    return this.graph;
  }
}
