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
import { getBlockType } from "../ir/lowerTypes";
import type { LowerCtx } from "../ir/lowerTypes";

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
  registerFieldSlots(builder, blockOutputRoots);

  // Build BlockInputRootIR by resolving wires, listeners, and defaults
  const blockInputRoots = buildBlockInputRoots(
    blocks,
    wires,
    listeners,
    busRoots,
    blockOutputs,
    errors
  );

  applyRenderLowering(builder, blocks, blockInputRoots, errors);

  return {
    builder,
    busRoots,
    blockOutputRoots,
    blockInputRoots,
    errors,
  };
}

function registerFieldSlots(
  builder: IRBuilder,
  blockOutputRoots: BlockOutputRootIR,
): void {
  for (const ref of blockOutputRoots.refs) {
    if (ref && ref.k === "field") {
      builder.registerFieldSlot(ref.id, ref.slot);
    }
  }
}

function applyRenderLowering(
  builder: IRBuilder,
  blocks: readonly Block[],
  blockInputRoots: BlockInputRootIR,
  errors: CompileError[],
): void {
  function createDefaultRef(
    type: import("../ir/types").TypeDesc,
    defaultValue: unknown
  ): ValueRefPacked | null {
    if (type.world === "signal") {
      if (typeof defaultValue !== "number") {
        return null;
      }
      const sigId = builder.sigConst(defaultValue, type);
      const slot = builder.allocValueSlot(type);
      builder.registerSigSlot(sigId, slot);
      return { k: "sig", id: sigId, slot };
    }

    if (type.world === "field") {
      const fieldId = builder.fieldConst(defaultValue, type);
      const slot = builder.allocValueSlot(type);
      builder.registerFieldSlot(fieldId, slot);
      return { k: "field", id: fieldId, slot };
    }

    return null;
  }

  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
    const block = blocks[blockIdx];
    const decl = getBlockType(block.type);
    if (!decl || decl.capability !== "render") {
      continue;
    }

    const inputs: ValueRefPacked[] = [];
    let missingInput = false;

    for (const inputDecl of decl.inputs) {
      const portIdx = block.inputs.findIndex((p) => p.id === inputDecl.portId);
      if (portIdx < 0) {
        missingInput = true;
        break;
      }
      const ref = blockInputRoots.refs[blockInputRoots.indexOf(blockIdx as BlockIndex, portIdx)];
      if (!ref) {
        const input = block.inputs[portIdx];
        const defaultSource = input.defaultSource;
        if (defaultSource) {
          const defaultRef = createDefaultRef(inputDecl.type, defaultSource.value);
          if (defaultRef) {
            inputs.push(defaultRef);
            continue;
          }
        }
        errors.push({
          code: "MissingInput",
          message: `Missing required input for ${block.type}.${inputDecl.portId} (no defaultSource).`,
          where: { blockId: block.id, port: inputDecl.portId },
        });
        missingInput = true;
        break;
      }
      inputs.push(ref);
    }

    if (missingInput) {
      continue;
    }

    const ctx: LowerCtx = {
      blockIdx: blockIdx as BlockIndex,
      blockType: block.type,
      instanceId: block.id,
      label: block.label,
      inTypes: decl.inputs.map((input) => input.type),
      outTypes: decl.outputs.map((output) => output.type),
      b: builder,
      seedConstId: builder.allocConstId(0),
    };

    decl.lower({
      ctx,
      inputs,
      config: block.params,
    });
  }
}

/**
 * Build BlockOutputRootIR from Pass 6 blockOutputs.
 */
function buildBlockOutputRoots(
  blocks: readonly Block[],
  blockOutputs: Map<number, Map<string, ValueRefPacked>>
): BlockOutputRootIR {
  const refs: ValueRefPacked[] = [];

  // Calculate max outputs for indexing
  const maxOutputs = Math.max(...blocks.map((b) => b.outputs.length), 0);

  // Create flat array indexed by (blockIdx * maxOutputs + portIdx)
  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
    const block = blocks[blockIdx];
    const outputs = blockOutputs.get(blockIdx);

    for (let portIdx = 0; portIdx < block.outputs.length; portIdx++) {
      const portId = block.outputs[portIdx].id;
      const ref = outputs?.get(portId);
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
  blockOutputs: Map<number, Map<string, ValueRefPacked>>,
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
      busIdToIndex.set(listener.busId, busIdToIndex.size);
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

        if (upstreamBlockIdx === undefined) {
          // Upstream block wasn't processed - this is a real error
          errors.push({
            code: "DanglingConnection",
            message: `Wire to ${block.id}:${input.id} from unknown block ${wire.from.blockId}`,
          });
          continue;
        }

        const upstreamOutputs = blockOutputs.get(upstreamBlockIdx);
        const ref = upstreamOutputs?.get(wire.from.port);

        if (ref) {
          refs[flatIdx] = ref;
          continue; // Successfully resolved via wire
        }

        // Wire exists but upstream port has no IR representation
        // This is expected for non-IR types (Domain, Event, etc.) - NOT an error
        // The wire is valid at the closure level, just not represented in IR
        continue;
      }

      // Priority 2: Check for bus listener
      const listener = listeners.find(
        (l) => l.to.blockId === block.id && l.to.slotId === input.id
      );

      if (listener) {
        const busIdx = busIdToIndex.get(listener.busId);

        if (busIdx === undefined) {
          // Bus not found - this is a real error
          errors.push({
            code: "DanglingBindingEndpoint",
            message: `Listener to ${block.id}:${input.id} from unknown bus ${listener.busId}`,
          });
          continue;
        }

        const busRef = busRoots.get(busIdx);

        if (busRef) {
          // TODO (Phase 4): Apply listener transform chain if present
          refs[flatIdx] = busRef;
          continue; // Successfully resolved via bus
        }

        // Bus exists but has no IR representation (e.g., event bus)
        // This is expected for non-IR bus types - NOT an error
        continue;
      }

      // Priority 3: Default source
      // For Sprint 2, we'll create a placeholder constant
      // In Phase 4, this will use the DefaultSourceAttachment from Pass 1
      //
      // For now, if we reach here, the input is unresolved
      // This is acceptable for Sprint 2 - we're creating structural IR
      // Unresolved ports are not errors - they're just optional inputs without sources
      if (!input.defaultSource) {
        errors.push({
          code: "MissingInput",
          message: `Missing required input for ${block.type}.${input.id} (no defaultSource).`,
          where: { blockId: block.id, port: input.id },
        });
      }
    }
  }

  return {
    refs,
    indexOf: (blockIndex: BlockIndex, portIdx: number) => {
      return (blockIndex as number) * maxInputs + portIdx;
    },
  };
}
