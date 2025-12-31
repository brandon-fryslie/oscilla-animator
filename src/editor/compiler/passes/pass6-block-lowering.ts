/**
 * Pass 6: Block Lowering to IR
 *
 * Translates compiled Artifact closures into IR nodes. This pass creates
 * "skeleton" IR nodes that represent the structure of block outputs without
 * full semantic equivalence (that's deferred to Phase 4).
 *
 * Key insight: Block compilers still emit Artifacts (closures). This pass
 * infers IR structure from those Artifacts rather than modifying block compilers.
 *
 * References:
 * - HANDOFF.md Topic 4: Pass 6 - Block Lowering
 * - design-docs/12-Compiler-Final/15-Canonical-Lowering-Pipeline.md § Pass 6
 * - design-docs/12-Compiler-Final/16-Block-Lowering.md
 */

import type { Artifact } from "../types";
import type { AcyclicOrLegalGraph, BlockIndex } from "../ir/patches";
import type { Block } from "../../types";
import type { IRBuilder } from "../ir/IRBuilder";
import { IRBuilderImpl } from "../ir/IRBuilderImpl";
import type { TypeDesc } from "../ir/types";
import { asTypeDesc } from "../ir/types";
import type { CompileError } from "../types";
import type { ValueRefPacked, LowerCtx } from "../ir/lowerTypes";
import { getBlockType } from "../ir/lowerTypes";
import type { Domain } from "../unified/Domain";
import { BLOCK_DEFS_BY_TYPE } from "../../blocks/registry";
import { validatePureBlockOutput } from "../pure-block-validator";
import { materializeDefaultSource } from "../ir/defaultSourceUtils";

// Re-export ValueRefPacked for backwards compatibility
export type { ValueRefPacked } from "../ir/lowerTypes";

// =============================================================================
// Types
// =============================================================================

/**
 * UnlinkedIRFragments - Output of Pass 6
 *
 * Contains IR fragments for each block, but not yet linked together via
 * buses or wires. Block outputs are represented as ValueRefs but inputs
 * are not yet resolved.
 */
export interface UnlinkedIRFragments {
  /** IRBuilder instance containing all emitted nodes */
  builder: IRBuilder;

  /** Map from block index to map of port ID to ValueRef */
  blockOutputs: Map<BlockIndex, Map<string, ValueRefPacked>>;

  /** Compilation errors encountered during lowering */
  errors: CompileError[];
}

// =============================================================================
// Artifact-to-TypeDesc Conversion
// =============================================================================

/**
 * Infer TypeDesc from Artifact kind.
 *
 * This is a bridge function - in Phase 4, block compilers will emit TypeDesc directly.
 */
function artifactKindToTypeDesc(kind: string): TypeDesc {
  // Signal types
  if (kind === "Signal:float") {
    return { world: "signal", domain: "float", category: "core", busEligible: true };
  }
  if (kind === "Signal:int") {
    return { world: "signal", domain: "int", category: "core", busEligible: true };
  }
  if (kind === "Signal:phase") {
    return { world: "signal", domain: "float", semantics: "phase(0..1)", category: "core", busEligible: true };
  }
  if (kind === "Signal:vec2") {
    return { world: "signal", domain: "vec2", category: "core", busEligible: true };
  }
  if (kind === "Signal:color") {
    return { world: "signal", domain: "color", category: "core", busEligible: true };
  }
  if (kind === "Signal:Time") {
    return { world: "signal", domain: "float", category: "core", busEligible: true };
  }

  // Field types
  if (kind === "Field:float") {
    return { world: "field", domain: "float", category: "core", busEligible: true };
  }
  if (kind === "Field:int") {
    return { world: "field", domain: "int", category: "core", busEligible: true };
  }
  if (kind === "Field:vec2" || kind === "Field:Point" || kind === "Field<Point>") {
    return { world: "field", domain: "vec2", category: "core", busEligible: true };
  }
  if (kind === "Field:color") {
    return { world: "field", domain: "color", category: "core", busEligible: true };
  }
  if (kind === "Field:string") {
    return { world: "field", domain: "string", category: "internal", busEligible: false };
  }
  if (kind === "Field:boolean") {
    return { world: "field", domain: "boolean", category: "core", busEligible: true };
  }

  // Scalars map to signals with constant values
  if (kind === "Scalar:float") {
    return { world: "signal", domain: "float", category: "core", busEligible: true };
  }
  if (kind === "Scalar:int") {
    return { world: "signal", domain: "int", category: "core", busEligible: true };
  }
  if (kind === "Scalar:vec2") {
    return { world: "signal", domain: "vec2", category: "core", busEligible: true };
  }
  if (kind === "Scalar:color") {
    return { world: "signal", domain: "color", category: "core", busEligible: true };
  }

  // Default: unknown scalar
  return { world: "signal", domain: "float", category: "core", busEligible: true };
}

// =============================================================================
// Artifact-to-IR Translation (Fallback for blocks without lowering functions)
// =============================================================================

/**
 * Translate an Artifact into a ValueRefPacked.
 *
 * For Sprint 2, this creates "skeleton" IR nodes that represent the structure
 * without full semantic equivalence. The closures still execute - the IR is
 * just for validation.
 *
 * Strategy:
 * - Scalar artifacts → constant signal nodes
 * - Signal artifacts → placeholder signal nodes (identity-like)
 * - Field artifacts → placeholder field nodes (identity-like)
 * - Special artifacts (RenderTree, etc.) → Not represented in IR (skip)
 */
function artifactToValueRef(
  artifact: Artifact,
  builder: IRBuilder,
  blockId: string,
  portId: string
): ValueRefPacked | null {
  const { kind } = artifact;

  // Scalar: create constant signal
  if (kind === "Scalar:float" || kind === "Scalar:int") {
    const type: TypeDesc = asTypeDesc({
      world: "signal",
      domain: kind === "Scalar:int" ? "int" : "float",
    });
    const sigId = builder.sigConst(artifact.value, type);
    const slot = builder.allocValueSlot(type);
    builder.registerSigSlot(sigId, slot);
    return { k: "sig", id: sigId, slot };
  }

  if (kind === "Scalar:vec2") {
    const type: TypeDesc = { world: "signal", domain: "vec2", category: "core", busEligible: true };
    // For vec2, we need to create a constant. For now, use 0 as placeholder
    const sigId = builder.sigConst(0, type);
    const slot = builder.allocValueSlot(type);
    builder.registerSigSlot(sigId, slot);
    return { k: "sig", id: sigId, slot };
  }

  if (kind === "Scalar:color") {
    const type: TypeDesc = { world: "signal", domain: "color", category: "core", busEligible: true };
    const sigId = builder.sigConst(0, type);
    const slot = builder.allocValueSlot(type);
    builder.registerSigSlot(sigId, slot);
    return { k: "sig", id: sigId, slot };
  }

  // Signal: create time-based signal (placeholder)
  // In Phase 4, we'll parse the closure to extract actual operations
  if (
    kind === "Signal:float" ||
    kind === "Signal:int" ||
    kind === "Signal:phase" ||
    kind === "Signal:vec2" ||
    kind === "Signal:color" ||
    kind === "Signal:Time"
  ) {
    // Create a time signal as placeholder - actual signal evaluation happens via closure
    const timeId = builder.sigTimeAbsMs();
    const slot = builder.allocValueSlot({ world: "signal", domain: "timeMs", category: "internal", busEligible: false });
    builder.registerSigSlot(timeId, slot);
    // For now, use time signal directly as placeholder
    // In Phase 4, we'll emit proper signal expressions
    return { k: "sig", id: timeId, slot };
  }

  // Field: create placeholder field node
  if (
    kind === "Field:float" ||
    kind === "Field:int" ||
    kind === "Field:vec2" ||
    kind === "Field:Point" ||
    kind === "Field<Point>" ||
    kind === "Field:color" ||
    kind === "Field:string" ||
    kind === "Field:boolean"
  ) {
    const type = artifactKindToTypeDesc(kind);
    // Create constant field as placeholder
    const fieldId = builder.fieldConst(0, type);
    const slot = builder.allocValueSlot(type);
    builder.registerFieldSlot(fieldId, slot);
    return { k: "field", id: fieldId, slot };
  }

  // Special types that don't map to IR (render trees, events, etc.)
  // These are consumed by the runtime, not represented in signal/field graphs
  if (
    kind === "RenderTreeProgram" ||
    kind === "RenderTree" ||
    kind === "Scene" ||
    kind === "TargetScene" ||
    kind === "PhaseMachine" ||
    kind === "StrokeStyle" ||
    kind === "ElementCount" ||
    kind === "Event" ||     // Discrete events - handled by event system, not signal graph
    kind === "Domain"       // Domain configuration - handled separately
  ) {
    if (kind === "Domain") {
      const domain = artifact.value as Domain | undefined;
      const count = domain?.elements?.length ?? 0;
      const domainSlot = builder.domainFromN(count);
      return { k: "special", tag: "domain", id: domainSlot };
    }
    return null; // No IR representation
  }

  // Unknown artifact kind - skip with warning
  console.warn(
    `[Pass 6] Unknown artifact kind "${kind}" for block ${blockId}:${portId} - skipping IR emission`
  );
  return null;
}

// =============================================================================
// Block Lowering with Registered Functions
// =============================================================================

/**
 * Lower a block instance using its registered lowering function.
 *
 * If the block has a registered lowering function, use it.
 * Otherwise, fall back to artifactToValueRef for each output.
 */
function lowerBlockInstance(
  block: Block,
  blockIndex: BlockIndex,
  compiledPortMap: Map<string, Artifact>,
  builder: IRBuilder,
  errors: CompileError[]
): Map<string, ValueRefPacked> {
  const outputRefs = new Map<string, ValueRefPacked>();

  // Check if block has registered lowering function
  const blockType = getBlockType(block.type);

  if (blockType !== undefined) {
    // Use registered lowering function
    try {
      const blockDef = BLOCK_DEFS_BY_TYPE.get(block.type);
      const enforcePortContract = blockDef?.tags?.irPortContract !== 'relaxed';
      if (enforcePortContract && blockDef !== undefined) {
        const defInputIds = blockDef.inputs.map((input) => input.id);
        const irInputIds = blockType.inputs.map((input) => input.portId);
        const defOutputIds = blockDef.outputs.map((output) => output.id);
        const irOutputIds = blockType.outputs.map((output) => output.portId);

        const inputOrderMismatch = defInputIds.join('|') !== irInputIds.join('|');
        const outputOrderMismatch = defOutputIds.join('|') !== irOutputIds.join('|');

        if (inputOrderMismatch || outputOrderMismatch) {
          errors.push({
            code: "IRValidationFailed",
            message:
              `IR port contract mismatch for "${block.type}" (${block.id}). ` +
              `Editor inputs [${defInputIds.join(", ")}], IR inputs [${irInputIds.join(", ")}]; ` +
              `Editor outputs [${defOutputIds.join(", ")}], IR outputs [${irOutputIds.join(", ")}].`,
            where: { blockId: block.id },
          });
          return outputRefs;
        }
      }

      // Collect input ValueRefs (need to resolve from wires/buses)
      // For now, we'll collect inputs from compiled port map
      const inputsById: Record<string, ValueRefPacked> = {};
      const inputs: ValueRefPacked[] = block.inputs.map((inputPort, portIndex) => {
        const portKey = `${block.id}:${inputPort.id}`;
        const artifact = compiledPortMap.get(portKey);

        if (artifact !== undefined) {
          const ref = artifactToValueRef(artifact, builder, block.id, inputPort.id);
          if (ref !== null) {
            inputsById[inputPort.id] = ref;
            return ref;
          }
        }

        // Check if the port has a registered default source
        const portDecl = blockType.inputs[portIndex];
        if (portDecl?.defaultSource !== undefined) {
          // Port has a default source - materialize it using shared helper
          const ref = materializeDefaultSource(builder, portDecl.type, portDecl.defaultSource.value);
          if (ref !== null) {
            inputsById[inputPort.id] = ref;
            return ref;
          }
        }

        // P0.5: No silent fallback - missing inputs without defaultSource are compile errors
        throw new Error(
          `Missing input "${inputPort.id}" for block "${block.type}" (${block.id}). ` +
          `No wire, bus listener, or defaultSource provides a value. ` +
          `Fix: Connect a wire, add a bus listener, or define a defaultSource for this port.`
        );
      });

      // Build lowering context
      const ctx: LowerCtx = {
        blockIdx: blockIndex,
        blockType: block.type,
        instanceId: block.id,
        label: block.label,
        inTypes: blockType.inputs.map((port) => port.type),
        outTypes: blockType.outputs.map((port) => port.type),
        b: builder,
        seedConstId: 0, // TODO: Proper seed management
      };

      // Call lowering function
      const result = blockType.lower({ ctx, inputs, inputsById });

      // Map outputs to port IDs - prefer outputsById over positional outputs
      if (result.outputsById !== undefined && Object.keys(result.outputsById).length > 0) {
        // New path: Use outputsById (keyed by port ID, order-independent)
        const portOrder = blockType.outputs.map((p) => p.portId);
        for (const portId of portOrder) {
          const ref = result.outputsById[portId];
          if (ref === undefined) {
            errors.push({
              code: "IRValidationFailed",
              message: `Block ${ctx.blockType}#${ctx.instanceId} outputsById missing port '${portId}'`,
              where: { blockId: block.id },
            });
            continue;
          }
          // Register slot for signal/field outputs (required for pass8 validation)
          if (ref.k === 'sig') {
            builder.registerSigSlot(ref.id, ref.slot);
          } else if (ref.k === 'field') {
            builder.registerFieldSlot(ref.id, ref.slot);
          }
          outputRefs.set(portId, ref);
        }
      } else {
        // Legacy path: Use positional outputs array
        result.outputs.forEach((ref, index) => {
          if (index < block.outputs.length) {
            // Register slot for signal/field outputs (required for pass8 validation)
            if (ref.k === 'sig') {
              builder.registerSigSlot(ref.id, ref.slot);
            } else if (ref.k === 'field') {
              builder.registerFieldSlot(ref.id, ref.slot);
            }
            outputRefs.set(block.outputs[index].id, ref);
          }
        });
      }

    } catch (error) {
      // Lowering failed - record error and fall back
      errors.push({
        code: "NotImplemented",
        message: `Block lowering failed for "${block.type}": ${error instanceof Error ? error.message : String(error)}`,
        where: { blockId: block.id },
      });

      // Fall back to artifact lowering
      for (const output of block.outputs) {
        const portKey = `${block.id}:${output.id}`;
        const artifact = compiledPortMap.get(portKey);

        if (artifact === undefined) {
          continue;
        }

        const valueRef = artifactToValueRef(
          artifact,
          builder,
          block.id,
          output.id
        );

        if (valueRef !== null) {
          outputRefs.set(output.id, valueRef);
        }
      }
    }
  } else {
    // No lowering function - fall back to artifact-based lowering
    for (const output of block.outputs) {
      const portKey = `${block.id}:${output.id}`;
      const artifact = compiledPortMap.get(portKey);

      if (artifact === undefined) {
        // Output not in compiled map - might be unused or error
        // Don't fail here - downstream passes will catch missing inputs
        continue;
      }

      // Translate artifact to IR
      const valueRef = artifactToValueRef(
        artifact,
        builder,
        block.id,
        output.id
      );

      if (valueRef !== null) {
        outputRefs.set(output.id, valueRef);
      }
    }
  }

  return outputRefs;
}

// =============================================================================
// Pass 6 Implementation
// =============================================================================

/**
 * Pass 6: Block Lowering
 *
 * Translates compiled Artifacts into IR nodes.
 *
 * Input: Validated dependency graph + compiled port map (closures) + blocks array
 * Output: UnlinkedIRFragments with skeleton IR nodes
 *
 * This pass preserves existing closure compilation - closures still work
 * exactly as before. The IR is additional, for validation only.
 */
export function pass6BlockLowering(
  validated: AcyclicOrLegalGraph,
  blocks: readonly Block[],
  compiledPortMap: Map<string, Artifact>
): UnlinkedIRFragments {
  const builder = new IRBuilderImpl();
  const blockOutputs = new Map<BlockIndex, Map<string, ValueRefPacked>>();
  const errors: CompileError[] = [];

  // Set time model from Pass 3 (threaded through Pass 4 and 5)
  builder.setTimeModel(validated.timeModel);

  // Process blocks in dependency order (already sorted by Pass 4)
  // For each block, translate its output artifacts to IR nodes
  for (const scc of validated.sccs) {
    for (const node of scc.nodes) {
      if (node.kind !== "BlockEval") {
        continue; // Skip bus nodes (handled in Pass 7)
      }

      const blockIndex = node.blockIndex;
      const block = blocks[blockIndex];

      if (block === undefined) {
        errors.push({
          code: "BlockMissing",
          message: `Block index ${blockIndex} out of bounds`,
        });
        continue;
      }

      // Set current block ID for debug index tracking (Phase 7)
      builder.setCurrentBlockId(block.id);

      // Lower this block instance
      const outputRefs = lowerBlockInstance(
        block,
        blockIndex,
        compiledPortMap,
        builder,
        errors
      );

      // Collect block artifacts for pure block validation
      const blockArtifacts = new Map<string, Artifact>();
      for (const output of block.outputs) {
        const portKey = `${block.id}:${output.id}`;
        const artifact = compiledPortMap.get(portKey);
        if (artifact !== undefined) {
          blockArtifacts.set(output.id, artifact);
        }
      }

      // Validate pure block outputs (Deliverable 3: Pure Block Compilation Enforcement)
      // Only validate if the block has a definition with capability metadata
      const blockDef = BLOCK_DEFS_BY_TYPE.get(block.type);
      if (blockDef !== undefined && blockDef.capability === 'pure') {
        try {
          validatePureBlockOutput(
            block.type,
            blockDef.compileKind,
            blockArtifacts
          );
        } catch (error) {
          // Convert validation error to compilation error
          const validationError = error as { message: string; code: string };
          errors.push({
            code: "PureBlockViolation",
            message: `Pure block validation failed for "${block.type}": ${validationError.message}`,
            where: { blockId: block.id },
          });
        }
      }

      // Store output refs for this block
      if (outputRefs.size > 0) {
        blockOutputs.set(blockIndex, outputRefs);
      }
    }
  }

  // Clear block ID after processing all blocks
  builder.setCurrentBlockId(undefined);

  return {
    builder,
    blockOutputs,
    errors,
  };
}
