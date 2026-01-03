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
// NOTE: After bus-block unification (2026-01-02), bus contract validation is
// handled by BusBlock definitions. The following imports are no longer needed:
// import { RESERVED_BUS_CONTRACTS, validateReservedBus, validateCombineModeCompatibility, validateBusIRSupport } from './busContracts';

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

    // Rule 6: TimeRoot upstream dependency validation
    const timeRootDepErrors = this.validateTimeRootDependencies(patch);
    errors.push(...timeRootDepErrors);

    // NOTE: After bus-block unification (2026-01-02), buses are now BusBlocks.
    // Reserved bus validation, combine mode validation, and IR support validation
    // are handled differently - BusBlocks validate themselves via their block definition.
    // The following validations have been removed:
    // - validateReservedBuses (buses are now BusBlocks with proper TypeDesc)
    // - validateCombineModeCompatibility (BusBlock validates this internally)
    // - validateBusIRSupport (handled by compiler)
    // - warnEmptyBuses (edge connections are visible in graph)
    // - warnMultiplePublishersOnControlBuses (edges to BusBlocks are explicit)

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
            'Patch must contain exactly one TimeRoot block (FiniteTimeRoot, or InfiniteTimeRoot)',
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
            blockId: timeRootBlocks[0].id,
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
          direction: 'input',
        };

        const incomingWires = this.graph.getIncomingWires(portKey);

        // After bus-block unification, all edges are wire edges
        const totalWriters = incomingWires.length;

        if (totalWriters > 1) {
          // Multiple writers to same input - error
          const connections = incomingWires.map((e) => e.connectionId);

          errors.push(
            createDiagnostic({
              code: 'E_INVALID_CONNECTION',
              severity: 'error',
              domain: 'compile',
              primaryTarget: {
                kind: 'port',
                portRef: {
                  blockId: block.id,
                  slotId: input.id,
                  direction: 'input',
                },
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

    // Check wire connections (edges after bus-block unification)
    for (const edge of patch.edges) {
      const fromBlock = patch.blocks.find((b) => b.id === edge.from.blockId);
      const toBlock = patch.blocks.find((b) => b.id === edge.to.blockId);

      if (!fromBlock || !toBlock) {
        // Endpoint validation will catch this
        continue;
      }

      const fromSlot = fromBlock.outputs.find((s) => s.id === edge.from.slotId);
      const toSlot = toBlock.inputs.find((s) => s.id === edge.to.slotId);

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
              portRef: {
                blockId: toBlock.id,
                slotId: toSlot.id,
                direction: 'input',
              },
            },
            affectedTargets: [
              {
                kind: 'port',
                portRef: {
                  blockId: fromBlock.id,
                  slotId: fromSlot.id,
                  direction: 'output',
                },
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

    // NOTE: After bus-block unification, publishers/listeners are just regular edges
    // to/from BusBlock blocks. Type compatibility is checked uniformly above.

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

    for (const edge of patch.edges) {
      // Check from endpoint
      const fromBlock = patch.blocks.find((b) => b.id === edge.from.blockId);
      if (!fromBlock) {
        errors.push(
          createDiagnostic({
            code: 'E_INVALID_CONNECTION',
            severity: 'error',
            domain: 'compile',
            primaryTarget: {
              kind: 'block',
              blockId: edge.from.blockId,
            },
            title: 'Invalid connection source',
            message: `Edge references missing block: ${edge.from.blockId}`,
            patchRevision: this.patchRevision,
          })
        );
        continue;
      }

      const fromSlot = fromBlock.outputs.find((s) => s.id === edge.from.slotId);
      if (!fromSlot) {
        errors.push(
          createDiagnostic({
            code: 'E_INVALID_CONNECTION',
            severity: 'error',
            domain: 'compile',
            primaryTarget: {
              kind: 'port',
              portRef: {
                blockId: edge.from.blockId,
                slotId: edge.from.slotId,
                direction: 'output',
              },
            },
            title: 'Invalid connection source',
            message: `Edge references missing output slot: ${edge.from.blockId}.${edge.from.slotId}`,
            patchRevision: this.patchRevision,
          })
        );
      }

      // Check to endpoint
      const toBlock = patch.blocks.find((b) => b.id === edge.to.blockId);
      if (!toBlock) {
        errors.push(
          createDiagnostic({
            code: 'E_INVALID_CONNECTION',
            severity: 'error',
            domain: 'compile',
            primaryTarget: {
              kind: 'block',
              blockId: edge.to.blockId,
            },
            title: 'Invalid connection target',
            message: `Edge references missing block: ${edge.to.blockId}`,
            patchRevision: this.patchRevision,
          })
        );
        continue;
      }

      const toSlot = toBlock.inputs.find((s) => s.id === edge.to.slotId);
      if (!toSlot) {
        errors.push(
          createDiagnostic({
            code: 'E_INVALID_CONNECTION',
            severity: 'error',
            domain: 'compile',
            primaryTarget: {
              kind: 'port',
              portRef: {
                blockId: edge.to.blockId,
                slotId: edge.to.slotId,
                direction: 'input',
              },
            },
            title: 'Invalid connection target',
            message: `Edge references missing input slot: ${edge.to.blockId}.${edge.to.slotId}`,
            patchRevision: this.patchRevision,
          })
        );
      }
    }

    return errors;
  }

  /**
   * Rule: TimeRoot cannot have upstream dependencies.
   * NEW P0: Prevents TimeRoot from depending on evaluated block outputs.
   */
  private validateTimeRootDependencies(patch: PatchDocument): Diagnostic[] {
    const timeRoot = patch.blocks.find(
      (b) =>
        b.type === 'FiniteTimeRoot' ||
        b.type === 'InfiniteTimeRoot'
    );

    if (!timeRoot) {
      // Already handled by validateTimeRootConstraint
      return [];
    }

    const errors: Diagnostic[] = [];

    // Check incoming edges to TimeRoot inputs
    const incomingEdges = patch.edges.filter(
      (e) => e.to.blockId === timeRoot.id
    );
    for (const edge of incomingEdges) {
      const sourceBlock = patch.blocks.find((b) => b.id === edge.from.blockId);
      if (!sourceBlock) {
        continue; // Endpoint validation will catch this
      }

      // Check if source is whitelisted (DefaultSource, Config, UIControl, ExternalIO)
      // NOTE: After bus-block unification, BusBlocks are also forbidden as TimeRoot sources
      if (!isWhitelistedTimeRootSource(sourceBlock)) {
        errors.push(
          createDiagnostic({
            code: 'E_TIME_ROOT_UPSTREAM_DEPENDENCY',
            severity: 'error',
            domain: 'compile',
            primaryTarget: {
              kind: 'timeRoot',
              blockId: timeRoot.id,
            },
            affectedTargets: [
              {
                kind: 'block',
                blockId: sourceBlock.id,
              },
            ],
            title: 'TimeRoot cannot have upstream dependencies',
            message: `TimeRoot cannot depend on block "${sourceBlock.type}". TimeRoot may only depend on DefaultSource, Config, UIControl, or ExternalIO.`,
            patchRevision: this.patchRevision,
          })
        );
      }
    }

    return errors;
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
    from: { blockId: string; slotId: string; direction: 'output' },
    to: { blockId: string; slotId: string; direction: 'input' }
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
            portRef: {
              blockId: from.blockId,
              slotId: from.slotId,
              direction: 'output',
            },
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
            portRef: {
              blockId: to.blockId,
              slotId: to.slotId,
              direction: 'input',
            },
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
            portRef: {
              blockId: toBlock.id,
              slotId: toSlot.id,
              direction: 'input',
            },
          },
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

    // Check for multiple writers
    const existingWires = patch.edges.filter(
      (e) => e.to.blockId === to.blockId && e.to.slotId === to.slotId
    );

    if (existingWires.length > 0) {
      errors.push(
        createDiagnostic({
          code: 'E_INVALID_CONNECTION',
          severity: 'error',
          domain: 'authoring',
          primaryTarget: {
            kind: 'port',
            portRef: {
              blockId: to.blockId,
              slotId: toSlot.id,
              direction: 'input',
            },
          },
          title: 'Multiple writers',
          message: `Input port ${toBlock.id}.${toSlot.id} already has a connection`,
          patchRevision: this.patchRevision,
        })
      );
    }

    // TODO: Check if would create a cycle (needs incremental graph analysis)

    return {
      ok: errors.length === 0,
      errors,
      warnings: [],
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a block is whitelisted as a valid TimeRoot input source.
 */
function isWhitelistedTimeRootSource(block: {
  type: string;
  tags?: Record<string, unknown>;
}): boolean {
  return (
    block.type === 'DefaultSource' ||
    block.type === 'UIControl' ||
    block.type === 'ExternalIO' ||
    block.tags?.category === 'config'
  );
}
