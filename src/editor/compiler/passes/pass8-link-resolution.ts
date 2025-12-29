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
import type { TypeDesc } from "../ir/types";

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
    builder,
    errors
  );

  applyRenderLowering(builder, blocks, blockInputRoots, blockOutputRoots, errors);

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
    if (ref !== null && ref.k === "field") {
      builder.registerFieldSlot(ref.id, ref.slot);
    }
  }
}

/**
 * Create a ValueRef for a default source value.
 *
 * For signal types: creates a sigConst
 * For field types: creates a fieldConst
 *
 * Note: Scalar types are handled at the call site (they're compile-time
 * config values, not runtime IR).
 */
/**
 * Create a ValueRefPacked from a default source value.
 *
 * Supports:
 * - signal/number → sigConst
 * - field/* → fieldConst
 * - scalar/* → scalarConst (stored in constant pool)
 */
function createDefaultRef(
  builder: IRBuilder,
  type: TypeDesc,
  defaultValue: unknown
): ValueRefPacked | null {
  if (type.world === "signal") {
    // Signal constants can be numbers (for numeric signals) or other values (like strings for colors)
    // The IRBuilder.sigConst accepts numbers, but for other types (like color strings),
    // we may need special handling in the future. For now, only handle numeric signals.
    if (typeof defaultValue !== "number") {
      // Non-number signal values (vec3, color) → use constant pool
      const constId = builder.allocConstId(defaultValue);
      return { k: "scalarConst", constId };
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

  if (type.world === "scalar") {
    const constId = builder.allocConstId(defaultValue);
    return { k: "scalarConst", constId };
  }

  if (type.world === "special" && type.domain === "domain") {
    const count = typeof defaultValue === "number" ? defaultValue : Number(defaultValue);
    const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    const domainSlot = builder.domainFromN(safeCount);
    return { k: "special", tag: "domain", id: domainSlot };
  }

  return null;
}


function applyRenderLowering(
  builder: IRBuilder,
  blocks: readonly Block[],
  blockInputRoots: BlockInputRootIR,
  blockOutputRoots: BlockOutputRootIR,
  errors: CompileError[],
): void {
  // Phase 1: Process Camera blocks (produce Special<cameraRef> outputs)
  // These must run before render blocks so camera outputs are available
  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
    const block = blocks[blockIdx];
    if (block.type !== "Camera") {
      continue;
    }

    const decl = getBlockType(block.type);
    if (decl === undefined) {
      continue;
    }

    const inputs: ValueRefPacked[] = [];
    let missingInput = false;

    for (const inputDecl of decl.inputs) {
      const portIdx = block.inputs.findIndex((p) => p.id === inputDecl.portId);
      if (portIdx < 0) {
        // Check if port is optional
        if (inputDecl.optional === true) {
          continue;
        }
        missingInput = true;
        break;
      }
      const ref = blockInputRoots.refs[blockInputRoots.indexOf(blockIdx as BlockIndex, portIdx)];
      if (ref === undefined) {
        const input = block.inputs[portIdx];
        const defaultSource = input.defaultSource;
        if (defaultSource !== undefined) {
          const defaultRef = createDefaultRef(builder, inputDecl.type, defaultSource.value);
          if (defaultRef !== null) {
            inputs.push(defaultRef);
            continue;
          }
        }
        if (inputDecl.optional === true) {
          continue;
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

    const result = decl.lower({
      ctx,
      inputs,
      config: block.params,
    });

    // Store Camera outputs in blockOutputRoots for downstream blocks to reference
    if (result.outputs.length > 0) {
      for (let outIdx = 0; outIdx < result.outputs.length; outIdx++) {
        const output = result.outputs[outIdx];
        const outputDecl = decl.outputs[outIdx];
        if (outputDecl !== undefined) {
          const idx = blockOutputRoots.indexOf(blockIdx as BlockIndex, outIdx);
          blockOutputRoots.refs[idx] = output;
        }
      }
    }
  }

  // Phase 2: Process render blocks
  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
    const block = blocks[blockIdx];
    const decl = getBlockType(block.type);
    if (decl === undefined || decl.capability !== "render") {
      continue;
    }

    const inputs: ValueRefPacked[] = [];
    let missingInput = false;

    for (const inputDecl of decl.inputs) {
      // Scalar types are compile-time config values, not runtime IR
      // They're passed to block lowering via config, not resolved here
      if (inputDecl.type.world === "scalar") {
        continue;
      }

      const portIdx = block.inputs.findIndex((p) => p.id === inputDecl.portId);
      if (portIdx < 0) {
        missingInput = true;
        break;
      }
      const ref = blockInputRoots.refs[blockInputRoots.indexOf(blockIdx as BlockIndex, portIdx)];
      if (ref === undefined) {
        const input = block.inputs[portIdx];
        const defaultSource = input.defaultSource ?? inputDecl.defaultSource;
        if (defaultSource !== undefined) {
          const defaultRef = createDefaultRef(builder, inputDecl.type, defaultSource.value);
          if (defaultRef !== null) {
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
      if (ref !== undefined) {
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
 * 3. Default source (materialized into IR)
 * 3. Default source (fallback constant from slot definition)
 *
 * If no source is found and input has no defaultSource, it's an error.
 */
function buildBlockInputRoots(
  blocks: readonly Block[],
  wires: readonly CompilerConnection[],
  listeners: readonly Listener[],
  busRoots: Map<BusIndex, ValueRefPacked>,
  blockOutputs: Map<number, Map<string, ValueRefPacked>>,
  builder: IRBuilder,
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

  // Get block type declarations for type information
  const blockDecls = blocks.map((block) => getBlockType(block.type));

  // Process each block's inputs
  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
    const block = blocks[blockIdx];
    const blockDecl = blockDecls[blockIdx];

    for (let portIdx = 0; portIdx < block.inputs.length; portIdx++) {
      const input = block.inputs[portIdx];
      const flatIdx = blockIdx * maxInputs + portIdx;

      // Priority 1: Check for wire connection
      const wire = wires.find(
        (w) => w.to.block === block.id && w.to.port === input.id
      );

      if (wire !== undefined) {
        // Validate no adapters on wires (unsupported in IR mode)
        if (wire.adapterChain !== undefined && wire.adapterChain.length > 0) {
          errors.push({
            code: "UnsupportedAdapterInIRMode",
            message: `Wire connection to ${block.type}.${input.id} uses adapter chain, which is not yet supported in IR compilation mode. Adapters are only supported in legacy compilation. Remove the adapter chain or disable IR mode (VITE_USE_UNIFIED_COMPILER=false).`,
          });
        }
        // Lens stacks are ignored in IR mode for now (no transform chain emission yet).

        // Resolve upstream block output
        const upstreamBlockIdx = blockIdToIndex.get(wire.from.block);

        if (upstreamBlockIdx === undefined) {
          // Upstream block wasn't processed - this is a real error
          errors.push({
            code: "DanglingConnection",
            message: `Wire to ${block.id}:${input.id} from unknown block ${wire.from.block}`,
          });
          continue;
        }

        const upstreamOutputs = blockOutputs.get(upstreamBlockIdx);
        const ref = upstreamOutputs?.get(wire.from.port);

        if (ref !== undefined) {
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

      if (listener !== undefined) {
        // Validate no adapters on listeners (unsupported in IR mode)
        if (listener.adapterChain !== undefined && listener.adapterChain.length > 0) {
          errors.push({
            code: "UnsupportedAdapterInIRMode",
            message: `Bus listener for ${block.type}.${input.id} uses adapter chain, which is not yet supported in IR compilation mode. Adapters are only supported in legacy compilation. Remove the adapter chain or disable IR mode (VITE_USE_UNIFIED_COMPILER=false).`,
          });
        }
        // Lens stacks are ignored in IR mode for now (no transform chain emission yet).

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

        if (busRef !== undefined) {
          // Adapters/lenses validated above - assume 1:1 mapping
          refs[flatIdx] = busRef;
          continue; // Successfully resolved via bus
        }

        // Bus exists but has no IR representation (e.g., event bus)
        // This is expected for non-IR bus types - NOT an error
        continue;
      }

      // Priority 3: Default source
      // Check instance first, then block definition for defaultSource
      const blockDef = getBlockType(block.type);
      const inputDef = blockDef?.inputs.find(i => i.portId === input.id);
      const defaultSource = input.defaultSource ?? inputDef?.defaultSource;

      if (defaultSource !== undefined && inputDef !== undefined) {
        // Scalar types are compile-time config values, not runtime IR
        // They're passed to block lowering via config, not resolved here
        if (inputDef.type.world === "scalar") {
          continue; // Successfully resolved via config
        }

        const defaultRef = createDefaultRef(builder, inputDef.type, defaultSource.value);
        if (defaultRef !== null) {
          refs[flatIdx] = defaultRef;
          continue; // Successfully resolved via default
        }
      }

      // Check if this is a scalar input that doesn't need IR resolution
      // (even without explicit defaultSource, scalars come from params/config)
      if (inputDef?.type.world === "scalar") {
        continue;
      }

      // No wire, no bus, no default - this is a missing required input
      // Use the defaultSource from the input slot if available
      if (input.defaultSource !== undefined && blockDecl !== undefined) {
        // Find the port declaration to get the type
        const portDecl = blockDecl.inputs.find((p) => p.portId === input.id);
        if (portDecl !== undefined) {
          const defaultRef = createDefaultRef(builder, portDecl.type, input.defaultSource.value);
          if (defaultRef !== null) {
            refs[flatIdx] = defaultRef;
            continue; // Successfully resolved via default source
          }
        }
      }

      // No source found - check if this is an error
      // Only report error if there's no defaultSource
      if (input.defaultSource === undefined) {
        errors.push({
          code: "MissingInput",
          message: `Missing required input for ${block.type}.${input.id} (no wire, bus, or valid defaultSource).`,
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
