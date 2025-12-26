/**
 * Pass 8: Link Resolution
 *
 * Resolves all ValueRefs to concrete node IDs and creates BlockInputRootIR
 * and BlockOutputRootIR tables.
 *
 * This pass finalizes the IR by ensuring every port has a concrete value
 * and there are no dangling references.
 *
 * References:
 * - design-docs/12-Compiler-Final/15-Canonical-Lowering-Pipeline.md § Pass 8
 * - PLAN-2025-12-25-200731.md P0-3: Pass 8 - Link Resolution
 */

import type { Block, Listener } from "../../types";
import type { BlockIndex } from "../ir/patches";
import type { BusIndex } from "../ir/types";
import type { IRBuilder } from "../ir/IRBuilder";
import type { IRWithBusRoots, ValueRefPacked } from "./pass7-bus-lowering";
import type { CompilerConnection, CompileError } from "../types";

// =============================================================================
// Types
// =============================================================================

/**
 * BlockInputRootIR - Maps each block input to its value source
 */
export interface BlockInputRootIR {
  /** Flat array of ValueRefs, indexed by (blockIdx * maxInputs + portIdx) */
  readonly refs: ValueRefPacked[];

  /** Helper to get ValueRef for a specific input */
  indexOf(blockIndex: BlockIndex, portIdx: number): number;
}

/**
 * BlockOutputRootIR - Maps each block output to its value
 */
export interface BlockOutputRootIR {
  /** Flat array of ValueRefs, indexed by (blockIdx * maxOutputs + portIdx) */
  readonly refs: ValueRefPacked[];

  /** Helper to get ValueRef for a specific output */
  indexOf(blockIndex: BlockIndex, portIdx: number): number;
}

/**
 * LinkedGraphIR - Output of Pass 8
 *
 * Complete IR with all ports resolved to concrete values.
 */
export interface LinkedGraphIR {
  /** IRBuilder instance containing all emitted nodes */
  builder: IRBuilder;

  /** Bus combine nodes */
  busRoots: Map<BusIndex, ValueRefPacked>;

  /** Block output port mappings */
  blockOutputRoots: BlockOutputRootIR;

  /** Block input port mappings */
  blockInputRoots: BlockInputRootIR;

  /** Compilation errors */
  errors: CompileError[];
}

// =============================================================================
// Pass 8 Implementation
// =============================================================================

/**
 * Pass 8: Link Resolution
 *
 * Resolves all ports to concrete ValueRefs.
 *
 * Input: IRWithBusRoots (from Pass 7) + blocks + wires + listeners
 * Output: LinkedGraphIR with complete port mappings
 *
 * For each block:
 * - Output ports: already in blockOutputs from Pass 6
 * - Input ports: resolve via wire → bus listener → default source
 */
export function pass8LinkResolution(
  irWithBusRoots: IRWithBusRoots,
  blocks: readonly Block[],
  wires: readonly CompilerConnection[],
  listeners: readonly Listener[]
): LinkedGraphIR {
  const { builder, busRoots, blockOutputs, errors: inheritedErrors } = irWithBusRoots;
  const errors: CompileError[] = [...inheritedErrors];

  // Build BlockOutputRootIR from Pass 6 results
  const blockOutputRoots = buildBlockOutputRoots(blocks, blockOutputs);

  // Build BlockInputRootIR by resolving wires, listeners, and defaults
  const blockInputRoots = buildBlockInputRoots(
    blocks,
    wires,
    listeners,
    busRoots,
    blockOutputs,
    errors
  );

  return {
    builder,
    busRoots,
    blockOutputRoots,
    blockInputRoots,
    errors,
  };
}

/**
 * Build BlockOutputRootIR from Pass 6 blockOutputs.
 */
function buildBlockOutputRoots(
  blocks: readonly Block[],
  blockOutputs: Map<number, ValueRefPacked[]>
): BlockOutputRootIR {
  const refs: ValueRefPacked[] = [];

  // Calculate max outputs for indexing
  const maxOutputs = Math.max(...blocks.map((b) => b.outputs.length), 0);

  // Create flat array indexed by (blockIdx * maxOutputs + portIdx)
  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
    const block = blocks[blockIdx];
    const outputs = blockOutputs.get(blockIdx) || [];

    for (let portIdx = 0; portIdx < block.outputs.length; portIdx++) {
      const ref = outputs[portIdx];
      if (ref) {
        refs[blockIdx * maxOutputs + portIdx] = ref;
      }
    }
  }

  return {
    refs,
    indexOf: (blockIndex: BlockIndex, portIdx: number) => {
      return (blockIndex as number) * maxOutputs + portIdx;
    },
  };
}

/**
 * Build BlockInputRootIR by resolving input sources.
 *
 * Resolution priority:
 * 1. Wire connection (direct block-to-block)
 * 2. Bus listener (bus → input)
 * 3. Default source (fallback - for Sprint 2, we'll use placeholder)
 */
function buildBlockInputRoots(
  blocks: readonly Block[],
  wires: readonly CompilerConnection[],
  listeners: readonly Listener[],
  busRoots: Map<BusIndex, ValueRefPacked>,
  blockOutputs: Map<number, ValueRefPacked[]>,
  errors: CompileError[]
): BlockInputRootIR {
  const refs: ValueRefPacked[] = [];

  // Calculate max inputs for indexing
  const maxInputs = Math.max(...blocks.map((b) => b.inputs.length), 0);

  // Create a map from blockId to blockIndex for lookups
  const blockIdToIndex = new Map<string, number>();
  blocks.forEach((block, idx) => {
    blockIdToIndex.set(block.id, idx);
  });

  // Create a map from busId to busIndex
  // For Sprint 2, we'll use the bus position in the array as index
  // In Phase 4, this will come from the normalized patch
  const busIdToIndex = new Map<string, BusIndex>();
  listeners.forEach((listener) => {
    if (!busIdToIndex.has(listener.busId)) {
      // Assign sequential bus indices
      busIdToIndex.set(listener.busId, busIdToIndex.size as BusIndex);
    }
  });

  // Process each block's inputs
  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
    const block = blocks[blockIdx];

    for (let portIdx = 0; portIdx < block.inputs.length; portIdx++) {
      const input = block.inputs[portIdx];
      const flatIdx = blockIdx * maxInputs + portIdx;

      // Priority 1: Check for wire connection
      const wire = wires.find(
        (w) => w.to.blockId === block.id && w.to.port === input.id
      );

      if (wire) {
        // Resolve upstream block output
        const upstreamBlockIdx = blockIdToIndex.get(wire.from.blockId);

        if (upstreamBlockIdx !== undefined) {
          const upstreamBlock = blocks[upstreamBlockIdx];
          const upstreamPortIdx = upstreamBlock.outputs.findIndex(
            (o) => o.id === wire.from.port
          );

          if (upstreamPortIdx >= 0) {
            const upstreamOutputs = blockOutputs.get(upstreamBlockIdx);
            const ref = upstreamOutputs?.[upstreamPortIdx];

            if (ref) {
              refs[flatIdx] = ref;
              continue; // Successfully resolved via wire
            }
          }
        }

        // Wire found but couldn't resolve - log error but continue
        errors.push({
          code: "DanglingConnection",
          message: `Wire to ${block.id}:${input.id} from ${wire.from.blockId}:${wire.from.port} could not be resolved`,
        });
      }

      // Priority 2: Check for bus listener
      const listener = listeners.find(
        (l) => l.to.blockId === block.id && l.to.slotId === input.id
      );

      if (listener) {
        const busIdx = busIdToIndex.get(listener.busId);

        if (busIdx !== undefined) {
          const busRef = busRoots.get(busIdx);

          if (busRef) {
            // TODO (Phase 4): Apply listener transform chain if present
            refs[flatIdx] = busRef;
            continue; // Successfully resolved via bus
          }
        }

        // Listener found but couldn't resolve - log error but continue
        errors.push({
          code: "DanglingBindingEndpoint",
          message: `Listener to ${block.id}:${input.id} from bus ${listener.busId} could not be resolved`,
        });
      }

      // Priority 3: Default source
      // For Sprint 2, we'll create a placeholder constant
      // In Phase 4, this will use the DefaultSourceAttachment from Pass 1
      //
      // For now, if we reach here, the input is unresolved
      // This is acceptable for Sprint 2 - we're creating structural IR
      errors.push({
        code: "UnresolvedPort",
        message: `Input ${block.id}:${input.id} has no value source (no wire, listener, or default)`,
      });
    }
  }

  return {
    refs,
    indexOf: (blockIndex: BlockIndex, portIdx: number) => {
      return (blockIndex as number) * maxInputs + portIdx;
    },
  };
}
