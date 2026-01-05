/**
 * Pass 6: Block Lowering to IR
 *
 * Translates compiled Artifact closures into IR nodes. This pass creates
 * "skeleton" IR nodes that represent the structure of block outputs without
 * full semantic equivalence (that's deferred to Phase 4).
 *
 * Multi-Input Blocks Integration (2026-01-01):
 * - Use resolveWriters to enumerate all writers to each input
 * - Insert combine nodes when N > 1 writers
 * - Validate combine policies and type compatibility
 *
 * Key insight: Block compilers still emit Artifacts (closures). This pass
 * infers IR structure from those Artifacts rather than modifying block compilers.
 *
 * References:
 * - HANDOFF.md Topic 4: Pass 6 - Block Lowering
 * - design-docs/12-Compiler-Final/15-Canonical-Lowering-Pipeline.md § Pass 6
 * - design-docs/12-Compiler-Final/16-Block-Lowering.md
 * - design-docs/now/01-MultiBlock-Input.md §5 (Multi-input resolution in Pass 6)
 */

import type { Artifact } from "../types";
import type { AcyclicOrLegalGraph, BlockIndex } from "../ir/patches";
import type { Block, Edge, SlotWorld } from "../../types";
import type { IRBuilder } from "../ir/IRBuilder";
import { IRBuilderImpl } from "../ir/IRBuilderImpl";
import type { TypeDesc } from "../../ir/types/TypeDesc";
import type { CompileError } from "../types";
import type { ValueRefPacked, LowerCtx } from "../ir/lowerTypes";
import { getBlockType } from "../ir/lowerTypes";
import type { Domain } from "../unified/Domain";
import { BLOCK_DEFS_BY_TYPE } from "../../blocks/registry";
import { validatePureBlockOutput } from "../pure-block-validator";
// Multi-Input Blocks Integration
import {
  resolveBlockInputs,
  type Writer,
} from "./resolveWriters";
import {
  createCombineNode,
  validateCombineMode,
  validateCombinePolicy,
  shouldCombine,
} from "./combine-utils";

// Re-export ValueRefPacked for backwards compatibility
export type { ValueRefPacked } from "../ir/lowerTypes";

// =============================================================================
// IR-Only Mode Verification (Deliverable 3)
// =============================================================================

/**
 * VERIFIED_IR_BLOCKS - Set of block types with verified IR lowering
 *
 * Blocks in this set are guaranteed to have complete IR lowering functions
 * and can be compiled in IR-only mode (strictIR=true).
 *
 * When adding a new block to this set:
 * 1. Ensure the block has a registered lowering function via registerBlockType()
 * 2. Add IR-specific tests verifying the lowering produces correct IR nodes
 * 3. Test the block in IR-only mode (strictIR=true) to catch fallback bugs
 *
 * Initial set: 12 core blocks from Sprint 1 (block-ir-lowering)
 */
const VERIFIED_IR_BLOCKS = new Set([
  'FiniteTimeRoot',
  'InfiniteTimeRoot',
  'GridDomain',
  'DomainN',
  'Oscillator',
  'AddSignal',
  'MulSignal',
  'SubSignal',
  'FieldConstNumber',
  'FieldMapNumber',
  'RenderInstances2D',
  'FieldColorize',
]);

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

/**
 * Options for pass6BlockLowering
 */
export interface Pass6Options {
  /**
   * When true, blocks in VERIFIED_IR_BLOCKS MUST use IR lowering.
   * Fallback to closure artifacts will throw an error.
   *
   * Use this mode for testing to ensure IR lowering is actually used.
   */
  strictIR?: boolean;
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

  // Scalars - should NOT be converted to signals
  // Scalar artifacts should use scalarConst, not signal nodes
  if (kind === "Scalar:float") {
    return { world: "scalar", domain: "float", category: "core", busEligible: false };
  }
  if (kind === "Scalar:int") {
    return { world: "scalar", domain: "int", category: "core", busEligible: false };
  }
  if (kind === "Scalar:vec2") {
    return { world: "scalar", domain: "vec2", category: "core", busEligible: false };
  }
  if (kind === "Scalar:color") {
    return { world: "scalar", domain: "color", category: "core", busEligible: false };
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
 * - Scalar artifacts → scalarConst (const pool, NOT signal nodes)
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

  // Scalar: store in const pool (DO NOT create signal nodes)
  // Workstream 03: Scalar inputs must remain scalarConst in IR
  if (kind === "Scalar:float" || kind === "Scalar:int") {
    const constId = builder.allocConstId(artifact.value);
    return { k: "scalarConst", constId };
  }

  if (kind === "Scalar:vec2") {
    const constId = builder.allocConstId(artifact.value);
    return { k: "scalarConst", constId };
  }

  if (kind === "Scalar:color") {
    const constId = builder.allocConstId(artifact.value);
    return { k: "scalarConst", constId };
  }

  if (kind === "Scalar:boolean") {
    const constId = builder.allocConstId(artifact.value);
    return { k: "scalarConst", constId };
  }

  if (kind === "Scalar:string") {
    const constId = builder.allocConstId(artifact.value);
    return { k: "scalarConst", constId };
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
    const fieldId = builder.fieldConst(0, type as any);
    const slot = builder.allocValueSlot(type as any);
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
// Helper Functions
// =============================================================================

/**
 * Check if a domain is a CoreDomain from core/types.
 * CoreDomains: float, int, vec2, vec3, color, boolean, time, rate, trigger
 */
function isCoreDomain(domain: string): domain is import("../../../core/types").CoreDomain {
  const coreDomains = ['float', 'int', 'vec2', 'vec3', 'color', 'boolean', 'time', 'rate', 'trigger'];
  return coreDomains.includes(domain);
}

// =============================================================================
// Multi-Input Resolution (New in Multi-Input Blocks Integration)
// =============================================================================

/**
 * Resolve input ValueRefs for a block using multi-input resolution.
 *
 * For each input:
 * 1. Enumerate writers (wires, bus listeners, defaults) via resolveWriters
 * 2. If N=0: Error (should not happen after pass 0 materialization)
 * 3. If N=1: Direct bind
 * 4. If N>1: Validate combine policy, create combine node
 *
 * @param block - Block instance
 * @param edges - Unified edges (from Pass 1)
 * @param compiledPortMap - Compiled artifacts (for writer sources)
 * @param builder - IRBuilder for emitting combine nodes
 * @param errors - Error accumulator
 * @returns Map of slotId → ValueRefPacked
 */
function resolveInputsWithMultiInput(
  block: Block,
  edges: readonly Edge[],
  compiledPortMap: Map<string, Artifact>,
  builder: IRBuilder,
  errors: CompileError[]
): Map<string, ValueRefPacked> {
  const resolved = resolveBlockInputs(block, edges);
  const inputRefs = new Map<string, ValueRefPacked>();

  for (const [slotId, spec] of resolved.entries()) {
    const { writers, combine, portType, endpoint } = spec;

    // Validate combine policy against writer count
    const policyValidation = validateCombinePolicy(combine, writers.length);
    if (!policyValidation.valid) {
      errors.push({
        code: 'PortTypeMismatch',
        message: policyValidation.reason ?? 'Invalid combine policy',
        where: { blockId: endpoint.blockId, port: endpoint.slotId },
      });
      continue;
    }

    // Validate combine mode against port type
    // Only validate for slot worlds (signal, field, scalar, config) and core domains
    // Skip validation for event world and internal domains
    if (combine.mode !== 'error' && portType.world !== 'event' && isCoreDomain(portType.domain)) {
      const modeValidation = validateCombineMode(
        combine.mode,
        portType.world as SlotWorld,
        portType.domain as import("../../../core/types").CoreDomain
      );
      if (!modeValidation.valid) {
        errors.push({
          code: 'PortTypeMismatch',
          message: `${modeValidation.reason} for port ${endpoint.blockId}.${endpoint.slotId}`,
          where: { blockId: endpoint.blockId, port: endpoint.slotId },
        });
        continue;
      }
    }

    // Convert writers to ValueRefs
    const writerRefs: ValueRefPacked[] = [];
    for (const writer of writers) {
      const writerRef = getWriterValueRef(writer, compiledPortMap, builder, errors);
      if (writerRef !== null) {
        writerRefs.push(writerRef);
      }
    }

    // Handle different writer counts
    if (writerRefs.length === 0) {
      // Should not happen - defaults are injected by resolveWriters
      errors.push({
        code: 'UpstreamError',
        message: `No writers for required input ${endpoint.blockId}.${endpoint.slotId}`,
        where: { blockId: endpoint.blockId, port: endpoint.slotId },
      });
      continue;
    }

    if (writerRefs.length === 1 && !shouldCombine(combine, 1)) {
      // Direct bind (optimization: no combine node for single writer)
      inputRefs.set(slotId, writerRefs[0]);
      continue;
    }

    // Multiple writers (or always combine) - create combine node
    if (combine.mode === 'error') {
      // Should have been caught by validateCombinePolicy
      errors.push({
        code: 'PortTypeMismatch',
        message: `Internal error: combine mode 'error' reached combine node creation`,
        where: { blockId: endpoint.blockId, port: endpoint.slotId },
      });
      continue;
    }

    const combinedRef = createCombineNode(
      combine.mode,
      writerRefs,
      portType as any,
      builder
    );

    if (combinedRef === null) {
      errors.push({
        code: 'NotImplemented',
        message: `Failed to create combine node for ${endpoint.blockId}.${endpoint.slotId}`,
        where: { blockId: endpoint.blockId, port: endpoint.slotId },
      });
      continue;
    }

    inputRefs.set(slotId, combinedRef);
  }

  return inputRefs;
}

/**
 * Get ValueRef for a writer.
 *
 * Converts Writer (from resolveWriters) to ValueRefPacked by looking up
 * the artifact and translating to IR.
 *
 * Workstream 03: Writer defaults for scalar/config types use scalarConst,
 * not signal nodes.
 *
 * @param writer - Writer specification
 * @param compiledPortMap - Compiled artifacts
 * @param builder - IRBuilder
 * @param errors - Error accumulator
 * @returns ValueRefPacked or null if artifact missing/invalid
 */
function getWriterValueRef(
  writer: Writer,
  compiledPortMap: Map<string, Artifact>,
  builder: IRBuilder,
  errors: CompileError[]
): ValueRefPacked | null {
  if (writer.kind === 'wire') {
    // Wire: blockId:slotId in compiledPortMap
    const portKey = `${writer.from.blockId}:${writer.from.slotId}`;
    const artifact = compiledPortMap.get(portKey);
    if (artifact === undefined) {
      errors.push({
        code: 'UpstreamError',
        message: `Missing artifact for wire writer ${portKey}`,
        where: { blockId: writer.from.blockId, port: writer.from.slotId },
      });
      return null;
    }
    return artifactToValueRef(artifact, builder, writer.from.blockId, writer.from.slotId);
  }

  // Note: After Sprint 2 migration, all edges are port→port. BusBlock.out edges
  // are 'wire' writers, not 'bus' writers. Bus value resolution happens in Pass 7.

  if (writer.kind === 'default') {
    // Default: Create constant node from default type
    // Workstream 03: Scalar/config types use scalarConst
    const type = writer.type;

    if (type.world === 'scalar' || type.world === 'config') {
      // Scalar/config defaults: use const pool
      const constId = builder.allocConstId(0); // Placeholder value - actual value from defaultSource
      return { k: 'scalarConst', constId };
    }

    if (type.world === 'signal') {
      const sigId = builder.sigConst(0, type as any);
      const slot = builder.allocValueSlot(type as any);
      builder.registerSigSlot(sigId, slot);
      return { k: 'sig', id: sigId, slot };
    }

    if (type.world === 'field') {
      const fieldId = builder.fieldConst(0, type as any);
      const slot = builder.allocValueSlot(type as any);
      builder.registerFieldSlot(fieldId, slot);
      return { k: 'field', id: fieldId, slot };
    }

    // Unsupported world for default
    return null;
  }

  return null;
}

// =============================================================================
// Block Lowering with Registered Functions
// =============================================================================

/**
 * Lower a block instance using its registered lowering function.
 *
 * Multi-Input Blocks Integration:
 * - If edges are provided, use resolveInputsWithMultiInput for input resolution
 * - Otherwise, fall back to legacy compiled port map lookup
 *
 * IR-Only Mode (Deliverable 3):
 * - If strictIR=true and block is in VERIFIED_IR_BLOCKS, throw error if IR lowering fails
 * - Logs IR lowering usage vs fallback for debugging
 *
 * If the block has a registered lowering function, use it.
 * Otherwise, fall back to artifactToValueRef for each output.
 */
function lowerBlockInstance(
  block: Block,
  blockIndex: BlockIndex,
  compiledPortMap: Map<string, Artifact>,
  builder: IRBuilder,
  errors: CompileError[],
  edges?: readonly Edge[],
  strictIR?: boolean
): Map<string, ValueRefPacked> {
  const outputRefs = new Map<string, ValueRefPacked>();
  const blockDef = BLOCK_DEFS_BY_TYPE.get(block.type);

  // Check if block has registered lowering function
  const blockType = getBlockType(block.type);

  if (blockType !== undefined) {
    // Use registered lowering function
    console.debug(`[IR] Using IR lowering for ${block.type} (${block.id})`);

    try {
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

      // Collect input ValueRefs
      // Multi-Input Integration: Use resolveInputsWithMultiInput if edges available
      const inputsById: Record<string, ValueRefPacked> = edges !== undefined
        ? Object.fromEntries(resolveInputsWithMultiInput(block, edges, compiledPortMap, builder, errors).entries())
        : {};

      const inputs: ValueRefPacked[] = (blockDef?.inputs ?? []).map((inputPort) => {
        // If multi-input resolution succeeded, use it
        if (inputsById[inputPort.id] !== undefined) {
          return inputsById[inputPort.id];
        }

        // Legacy path: Look up in compiled port map
        const portKey = `${block.id}:${inputPort.id}`;
        const artifact = compiledPortMap.get(portKey);

        if (artifact !== undefined) {
          const ref = artifactToValueRef(artifact, builder, block.id, inputPort.id);
          if (ref !== null) {
            inputsById[inputPort.id] = ref;
            return ref;
          }
        }

        // Sprint 2: After materializeDefaultSources() runs in pass 0, all inputs
        // should have wires. If we reach here, it's an internal compiler error.
        throw new Error(
          `Internal compiler error: Unmaterialized input "${inputPort.id}" for block "${block.type}" (${block.id}). ` +
          `All inputs should have wires after pass 0 materialization.`
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

      // Pass block params as config (needed for DSConst blocks to access their value)
      const config = block.params;

      // Call lowering function
      const result = blockType.lower({ ctx, inputs, inputsById, config });

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
          if (blockDef && index < blockDef.outputs.length) {
            // Register slot for signal/field outputs (required for pass8 validation)
            if (ref.k === 'sig') {
              builder.registerSigSlot(ref.id, ref.slot);
            } else if (ref.k === 'field') {
              builder.registerFieldSlot(ref.id, ref.slot);
            }
            outputRefs.set(blockDef.outputs[index].id, ref);
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

      // IR-Only Mode: If this is a verified block in strict mode, fail hard
      if (strictIR && VERIFIED_IR_BLOCKS.has(block.type)) {
        throw new Error(
          `[IR-ONLY] Block "${block.type}" is in VERIFIED_IR_BLOCKS but IR lowering failed. ` +
          `Error: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      console.warn(`[IR] Falling back to closure for ${block.type} (${block.id}) - IR lowering failed`);

      // Fall back to artifact lowering
      for (const output of (blockDef?.outputs ?? [])) {
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

    // IR-Only Mode: If this is a verified block in strict mode, fail hard
    if (strictIR && VERIFIED_IR_BLOCKS.has(block.type)) {
      throw new Error(
        `[IR-ONLY] Block "${block.type}" is in VERIFIED_IR_BLOCKS but has no registered IR lowering function`
      );
    }

    console.warn(`[IR] Falling back to closure for ${block.type} (${block.id}) - no IR lowering registered`);

    for (const output of (blockDef?.outputs ?? [])) {
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
 * Multi-Input Blocks Integration:
 * - Accepts optional edges parameter for multi-input resolution
 * - When edges provided, uses resolveWriters + combine logic
 * - Otherwise falls back to legacy single-input path
 *
 * IR-Only Mode (Deliverable 3):
 * - When options.strictIR=true, blocks in VERIFIED_IR_BLOCKS must use IR lowering
 * - Fallback to closures throws an error in strict mode
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
  compiledPortMap: Map<string, Artifact>,
  edges?: readonly Edge[],
  options?: Pass6Options
): UnlinkedIRFragments {
  const builder = new IRBuilderImpl();
  const blockOutputs = new Map<BlockIndex, Map<string, ValueRefPacked>>();
  const errors: CompileError[] = [];
  const strictIR = options?.strictIR ?? false;

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
        errors,
        edges,
        strictIR
      );

      // Get block definition for artifact validation
      const blockDef = BLOCK_DEFS_BY_TYPE.get(block.type);

      // Collect block artifacts for pure block validation
      const blockArtifacts = new Map<string, Artifact>();
      for (const output of (blockDef?.outputs ?? [])) {
        const portKey = `${block.id}:${output.id}`;
        const artifact = compiledPortMap.get(portKey);
        if (artifact !== undefined) {
          blockArtifacts.set(output.id, artifact);
        }
      }

      // Validate pure block outputs (Deliverable 3: Pure Block Compilation Enforcement)
      // Only validate if the block has a definition with capability metadata
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
