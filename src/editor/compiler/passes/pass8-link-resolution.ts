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

import type { Block, Listener, AdapterStep, LensInstance } from "../../types";
import type { BlockIndex } from "../ir/patches";
import type { BusIndex } from "../ir/types";
import type { IRBuilder } from "../ir/IRBuilder";
import type { IRWithBusRoots, ValueRefPacked } from "./pass7-bus-lowering";
import type { CompilerConnection, CompileError } from "../types";
import { getBlockType } from "../ir/lowerTypes";
import type { LowerCtx } from "../ir/lowerTypes";
import { adapterRegistry } from "../../adapters/AdapterRegistry";
import type { AdapterIRCtx } from "../../adapters/AdapterRegistry";
import { materializeDefaultSource } from "../ir/defaultSourceUtils";
import { getLens } from "../../lenses/LensRegistry";

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
  listeners: readonly Listener[],
  edges?: readonly import("../../types").Edge[]
): LinkedGraphIR {
  const { builder, busRoots, blockOutputs, errors: inheritedErrors } = irWithBusRoots;
  const errors: CompileError[] = [...inheritedErrors];

  // Build BlockOutputRootIR from Pass 6 results
  const blockOutputRoots = buildBlockOutputRoots(blocks, blockOutputs);

  // P1 Validation 1: Output Slot Validation
  // BEFORE registerFieldSlots, verify outputs from Pass 6 are properly registered
  // This catches blocks that failed to register their outputs during lowering
  validateOutputSlots(blocks, blockOutputRoots, builder, errors);

  // Safety net: Register field slots that may have been missed
  // This ensures downstream code can rely on field slots being registered
  registerFieldSlots(builder, blockOutputRoots);

  // Build BlockInputRootIR by resolving wires, listeners, and defaults
  const blockInputRoots = buildBlockInputRoots(
    blocks,
    wires,
    listeners,
    busRoots,
    blockOutputs,
    builder,
    errors,
    edges
  );

  applyRenderLowering(builder, blocks, blockInputRoots, blockOutputRoots, errors);

  // P1 Validation 2: Bus Publisher Validation
  // After bus lowering (pass7), verify buses have publishers
  validateBusPublishers(busRoots, blockOutputs, blocks, errors);

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
    if (ref !== undefined && ref.k === "field") {
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
          const defaultRef = materializeDefaultSource(builder, inputDecl.type, defaultSource.value);
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
          const defaultRef = materializeDefaultSource(builder, inputDecl.type, defaultSource.value);
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
 * Apply adapter chain to a value reference.
 *
 * Iterates through the adapter chain and applies each adapter's compileToIR.
 * If any adapter doesn't support IR compilation, adds an error and returns the input unchanged.
 */
function applyAdapterChain(
  valueRef: ValueRefPacked,
  adapterChain: readonly AdapterStep[],
  builder: IRBuilder,
  errors: CompileError[],
  context: string
): ValueRefPacked {
  let result = valueRef;

  for (const step of adapterChain) {
    const adapterDef = adapterRegistry.get(step.adapterId);

    if (adapterDef === undefined) {
      errors.push({
        code: "UnsupportedAdapterInIRMode",
        message: `Unknown adapter '${step.adapterId}' in ${context}. This adapter is not registered.`,
      });
      continue; // Skip unknown adapter, continue with original value
    }

    if (adapterDef.compileToIR === undefined) {
      errors.push({
        code: "UnsupportedAdapterInIRMode",
        message: `Adapter '${adapterDef.label}' used in ${context} is not yet supported in IR compilation mode. ` +
                 `This adapter requires special runtime handling that hasn't been implemented in the IR compiler. ` +
                 `To use this adapter, either:\n` +
                 `  - Switch to legacy closure compilation mode (set VITE_USE_UNIFIED_COMPILER=false)\n` +
                 `  - Remove this adapter from your connection\n` +
                 `  - Use an alternative adapter if available`,
      });
      continue; // Skip unsupported adapter, continue with original value
    }

    // Apply the adapter's IR compilation
    const irCtx: AdapterIRCtx = {
      builder,
      adapterId: step.adapterId,
      params: step.params,
    };

    const transformed = adapterDef.compileToIR(result, irCtx);
    if (transformed === null) {
      errors.push({
        code: "UnsupportedAdapterInIRMode",
        message: `Adapter '${adapterDef.label}' in ${context} failed to compile to IR. ` +
                 `The input type may be incompatible with this adapter.`,
      });
      continue; // Skip failed adapter, continue with original value
    }

    result = transformed;
  }

  return result;
}

/**
 * Apply lens stack to a value reference.
 *
 * Iterates through the lens stack and applies each lens's compileToIR.
 * If any lens doesn't support IR compilation, adds an error and returns the input unchanged.
 */
function applyLensStack(
  valueRef: ValueRefPacked,
  lensStack: readonly LensInstance[],
  builder: IRBuilder,
  errors: CompileError[],
  context: string
): ValueRefPacked {
  let result = valueRef;

  for (const lensInstance of lensStack) {
    const lensDef = getLens(lensInstance.lensId);

    if (lensDef === undefined) {
      errors.push({
        code: "UnsupportedLensInIRMode",
        message: `Unknown lens '${lensInstance.lensId}' in ${context}. This lens is not registered.`,
      });
      continue; // Skip unknown lens, continue with original value
    }

    if (lensDef.compileToIR === undefined) {
      errors.push({
        code: "UnsupportedLensInIRMode",
        message: `Lens '${lensDef.label}' used in ${context} is not yet supported in IR compilation mode. ` +
                 `This lens requires stateful operation or special runtime handling that hasn't been implemented in the IR compiler. ` +
                 `To use this lens, either:\n` +
                 `  - Switch to legacy closure compilation mode (set VITE_USE_UNIFIED_COMPILER=false)\n` +
                 `  - Remove this lens from your connection\n` +
                 `  - Use an alternative lens with similar functionality`,
      });
      continue; // Skip unsupported lens, continue with original value
    }

    // Convert lens params to ValueRefPacked
    const paramsMap: Record<string, ValueRefPacked> = {};
    for (const [paramId, binding] of Object.entries(lensInstance.params)) {
      if (binding.kind === 'literal') {
        // Convert literal values to scalar constants
        const constId = builder.allocConstId(binding.value);
        paramsMap[paramId] = { k: 'scalarConst', constId };
      }
      // TODO: Handle other binding kinds (bus, wire, default) in future sprints
      // For now, only literal bindings are supported in IR mode
    }

    // Apply the lens's IR compilation
    const irCtx = { builder };
    const transformed = lensDef.compileToIR(result, paramsMap, irCtx);
    if (transformed === null) {
      errors.push({
        code: "UnsupportedLensInIRMode",
        message: `Lens '${lensDef.label}' in ${context} failed to compile to IR. ` +
                 `The input type may be incompatible with this lens, or the lens parameters are not yet supported.`,
      });
      continue; // Skip failed lens, continue with original value
    }

    result = transformed;
  }

  return result;
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
  errors: CompileError[],
  edges?: readonly import("../../types").Edge[]
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

  // Determine whether to use unified edges or legacy lookup
  const useUnifiedEdges = edges !== undefined && edges.length > 0;

  // Process each block's inputs
  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
    const block = blocks[blockIdx];
    const blockDecl = blockDecls[blockIdx];

    for (let portIdx = 0; portIdx < block.inputs.length; portIdx++) {
      const input = block.inputs[portIdx];
      const flatIdx = blockIdx * maxInputs + portIdx;

      let resolved = false;

      if (useUnifiedEdges) {
        // Use unified edge lookup
        const edge = edges.find(
          (e) => e.to.kind === 'port' && e.to.blockId === block.id && e.to.slotId === input.id
        );

        if (edge !== undefined) {
          if (edge.from.kind === 'port') {
            // Handle like wire: port→port connection
            const upstreamBlockIdx = blockIdToIndex.get(edge.from.blockId);

            if (upstreamBlockIdx === undefined) {
              errors.push({
                code: "DanglingConnection",
                message: `Edge to ${block.id}:${input.id} from unknown block ${edge.from.blockId}`,
              });
              continue;
            }

            const upstreamOutputs = blockOutputs.get(upstreamBlockIdx);
            let ref = upstreamOutputs?.get(edge.from.slotId);

            if (ref !== undefined) {
              // Apply adapter chain if present
              if (edge.adapterChain !== undefined && edge.adapterChain.length > 0) {
                ref = applyAdapterChain(
                  ref,
                  edge.adapterChain,
                  builder,
                  errors,
                  `edge to ${block.type}.${input.id}`
                );
              }

              // Apply lens stack if present
              if (edge.lensStack !== undefined && edge.lensStack.length > 0) {
                ref = applyLensStack(
                  ref,
                  edge.lensStack,
                  builder,
                  errors,
                  `edge to ${block.type}.${input.id}`
                );
              }

              refs[flatIdx] = ref;
              resolved = true;
              continue;
            }

            // Wire exists but upstream port has no IR representation
            // This is expected for non-IR types (events, domains, etc.)
            resolved = true;
            continue;
          } else {
            // Handle like listener: bus→port connection
            const busIdx = busIdToIndex.get(edge.from.busId);

            if (busIdx === undefined) {
              errors.push({
                code: "DanglingBindingEndpoint",
                message: `Edge to ${block.id}:${input.id} from unknown bus ${edge.from.busId}`,
              });
              continue;
            }

            let busRef = busRoots.get(busIdx);

            if (busRef !== undefined) {
              // Apply adapter chain if present
              if (edge.adapterChain !== undefined && edge.adapterChain.length > 0) {
                busRef = applyAdapterChain(
                  busRef,
                  edge.adapterChain,
                  builder,
                  errors,
                  `bus edge for ${block.type}.${input.id}`
                );
              }

              // Apply lens stack if present
              if (edge.lensStack !== undefined && edge.lensStack.length > 0) {
                busRef = applyLensStack(
                  busRef,
                  edge.lensStack,
                  builder,
                  errors,
                  `bus edge for ${block.type}.${input.id}`
                );
              }

              refs[flatIdx] = busRef;
              resolved = true;
              continue;
            }

            // Bus exists but has no IR representation (e.g., event bus)
            // This is expected for non-IR bus types - NOT an error
            resolved = true;
            continue;
          }
        }
      } else {
        // Fall back to legacy wires/listeners lookup
        // Priority 1: Check for wire connection
        const wire = wires.find(
          (w) => w.to.block === block.id && w.to.port === input.id
        );

        if (wire !== undefined) {
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
          let ref = upstreamOutputs?.get(wire.from.port);

          if (ref !== undefined) {
            // Apply adapter chain if present
            if (wire.adapterChain !== undefined && wire.adapterChain.length > 0) {
              ref = applyAdapterChain(
                ref,
                wire.adapterChain,
                builder,
                errors,
                `wire to ${block.type}.${input.id}`
              );
            }

            // Apply lens stack if present
            if (wire.lensStack !== undefined && wire.lensStack.length > 0) {
              ref = applyLensStack(
                ref,
                wire.lensStack,
                builder,
                errors,
                `wire to ${block.type}.${input.id}`
              );
            }

            refs[flatIdx] = ref;
            resolved = true;
            continue;
          }

          // P1 Validation 3: Null ValueRef Documentation
          // Wire exists but upstream port has no IR representation.
          //
          // When null is EXPECTED (not an error):
          // - Event ports: Events are discrete streams with no default values
          // - Domain ports: Domain handles are config-time, not runtime IR
          // - Config ports: Non-runtime-evaluated types
          //
          // When null is ERROR (missing data):
          // - Signal/Field/Scalar ports: IR types require concrete values
          //
          // For now, we continue silently for non-IR types (backward compatibility).
          // In future sprints, we could emit a diagnostic for IR types with null refs
          // by checking the port's TypeDesc.world against IR type worlds.
          resolved = true;
          continue;
        }

        // Priority 2: Check for bus listener
        const listener = listeners.find(
          (l) => l.to.blockId === block.id && l.to.slotId === input.id
        );

        if (listener !== undefined) {
          const busIdx = busIdToIndex.get(listener.busId);

          if (busIdx === undefined) {
            // Bus not found - this is a real error
            errors.push({
              code: "DanglingBindingEndpoint",
              message: `Listener to ${block.id}:${input.id} from unknown bus ${listener.busId}`,
            });
            continue;
          }

          let busRef = busRoots.get(busIdx);

          if (busRef !== undefined) {
            // Apply adapter chain if present
            if (listener.adapterChain !== undefined && listener.adapterChain.length > 0) {
              busRef = applyAdapterChain(
                busRef,
                listener.adapterChain,
                builder,
                errors,
                `bus listener for ${block.type}.${input.id}`
              );
            }

            // Apply lens stack if present
            if (listener.lensStack !== undefined && listener.lensStack.length > 0) {
              busRef = applyLensStack(
                busRef,
                listener.lensStack,
                builder,
                errors,
                `bus listener for ${block.type}.${input.id}`
              );
            }

            refs[flatIdx] = busRef;
            resolved = true;
            continue;
          }

          // Bus exists but has no IR representation (e.g., event bus)
          // This is expected for non-IR bus types - NOT an error
          resolved = true;
          continue;
        }
      }

      // If not resolved via edge/wire/listener, try default source
      if (!resolved) {
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

          const defaultRef = materializeDefaultSource(builder, inputDef.type, defaultSource.value);
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
            const defaultRef = materializeDefaultSource(builder, portDecl.type, input.defaultSource.value);
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
  }

  return {
    refs,
    indexOf: (blockIndex: BlockIndex, portIdx: number) => {
      return (blockIndex as number) * maxInputs + portIdx;
    },
  };
}
/**
 * P1 Validation 1: Output Slot Validation
 *
 * After all blocks are lowered, verify that block outputs are properly registered in IR.
 * Emits MissingOutputRegistration diagnostic if an output has no slot registration.
 */
function validateOutputSlots(
  blocks: readonly Block[],
  blockOutputRoots: BlockOutputRootIR,
  builder: IRBuilder,
  errors: CompileError[]
): void {
  // Get the built IR to access slot registrations
  const ir = builder.build();

  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
    const block = blocks[blockIdx];

    for (let portIdx = 0; portIdx < block.outputs.length; portIdx++) {
      const output = block.outputs[portIdx];
      const idx = blockOutputRoots.indexOf(blockIdx as BlockIndex, portIdx);
      const ref = blockOutputRoots.refs[idx];

      // Skip undefined outputs (not all outputs produce IR)
      if (ref === undefined) {
        continue;
      }

      // Check if the slot is registered based on ValueRef kind
      let isRegistered = false;

      if (ref.k === 'sig') {
        // Signal: check sigValueSlots array
        isRegistered = ir.sigValueSlots[ref.id] !== undefined;
      } else if (ref.k === 'field') {
        // Field: check fieldValueSlots array
        isRegistered = ir.fieldValueSlots[ref.id] !== undefined;
      } else if (ref.k === 'scalarConst') {
        // ScalarConst: check constants array
        isRegistered = ref.constId < ir.constants.length;
      } else if (ref.k === 'special') {
        // Special types don't need slot registration (config-time only)
        isRegistered = true;
      }

      if (!isRegistered) {
        // Try to get block type declaration for better error messages
        const blockDecl = getBlockType(block.type);
        const outputDecl = blockDecl?.outputs.find(o => o.portId === output.id);

        errors.push({
          code: "MissingOutputRegistration",
          message: `Block '${block.label !== "" ? block.label : block.id}' output '${output.label !== "" ? output.label : output.id}' (type: ${ref.k}) has no slot registration. ` +
                   `This indicates a compiler bug - the block lowering function should call registerSigSlot() or registerFieldSlot().`,
          where: {
            blockId: block.id,
            port: output.id,
            blockType: block.type,
            outputType: outputDecl?.type
          },
        });
      }
    }
  }
}

/**
 * P1 Validation 2: Bus Publisher Validation
 *
 * After bus lowering (pass7), verify that each bus has at least one publisher.
 * Emits BusWithoutPublisher diagnostic if a bus has zero publishers.
 *
 * NOTE: This validation is currently a placeholder. A proper implementation requires
 * modifying pass7 to track publisher counts and pass them to pass8 for validation.
 * For now, we rely on pass7's existing validation logic for empty buses.
 *
 * Future enhancement:
 * - Modify IRWithBusRoots to include publisherCount metadata for each bus
 * - Validate publisherCount > 0 for each bus
 * - Emit BusWithoutPublisher if count === 0
 */
function validateBusPublishers(
  _busRoots: Map<BusIndex, ValueRefPacked>,
  _blockOutputs: Map<number, Map<string, ValueRefPacked>>,
  _blocks: readonly Block[],
  _errors: CompileError[]
): void {
  // TODO: Implement proper bus publisher validation
  // This requires modifying pass7 to track and pass publisher counts to pass8.
  // For now, this is a no-op - we rely on pass7's existing empty bus handling.
}
