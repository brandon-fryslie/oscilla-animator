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
import type { CompileError } from "../types";
import type { ValueRefPacked } from "../ir/lowerTypes";

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
  if (kind === "Signal:number") {
    return { world: "signal", domain: "number" };
  }
  if (kind === "Signal:phase") {
    return { world: "signal", domain: "phase01" };
  }
  if (kind === "Signal:vec2") {
    return { world: "signal", domain: "vec2" };
  }
  if (kind === "Signal:color") {
    return { world: "signal", domain: "color" };
  }
  if (kind === "Signal:Time") {
    return { world: "signal", domain: "number" };
  }

  // Field types
  if (kind === "Field:number") {
    return { world: "field", domain: "number" };
  }
  if (kind === "Field:vec2" || kind === "Field:Point" || kind === "Field<Point>") {
    return { world: "field", domain: "vec2" };
  }
  if (kind === "Field:color") {
    return { world: "field", domain: "color" };
  }
  if (kind === "Field:string") {
    return { world: "field", domain: "string" };
  }
  if (kind === "Field:boolean") {
    return { world: "field", domain: "boolean" };
  }

  // Scalars map to signals with constant values
  if (kind === "Scalar:number") {
    return { world: "signal", domain: "number" };
  }
  if (kind === "Scalar:vec2") {
    return { world: "signal", domain: "vec2" };
  }
  if (kind === "Scalar:color") {
    return { world: "signal", domain: "color" };
  }

  // Default: unknown scalar
  return { world: "signal", domain: "number" };
}

// =============================================================================
// Artifact-to-IR Translation
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
  if (kind === "Scalar:number") {
    const type: TypeDesc = { world: "signal", domain: "number" };
    const sigId = builder.sigConst(artifact.value, type);
    return { k: "sig", id: sigId };
  }

  if (kind === "Scalar:vec2") {
    const type: TypeDesc = { world: "signal", domain: "vec2" };
    // For vec2, we need to create a constant. For now, use 0 as placeholder
    const sigId = builder.sigConst(0, type);
    return { k: "sig", id: sigId };
  }

  if (kind === "Scalar:color") {
    const type: TypeDesc = { world: "signal", domain: "color" };
    const sigId = builder.sigConst(0, type);
    return { k: "sig", id: sigId };
  }

  // Signal: create time-based signal (placeholder)
  // In Phase 4, we'll parse the closure to extract actual operations
  if (
    kind === "Signal:number" ||
    kind === "Signal:phase" ||
    kind === "Signal:vec2" ||
    kind === "Signal:color" ||
    kind === "Signal:Time"
  ) {
    // Create a time signal as placeholder - actual signal evaluation happens via closure
    const timeId = builder.sigTimeAbsMs();
    // For now, use time signal directly as placeholder
    // In Phase 4, we'll emit proper signal expressions
    return { k: "sig", id: timeId };
  }

  // Field: create placeholder field node
  if (
    kind === "Field:number" ||
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
    return { k: "field", id: fieldId };
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
    kind === "Domain"       // Domain configuration - not a signal/field value
  ) {
    return null; // No IR representation
  }

  // Unknown artifact kind - skip with warning
  console.warn(
    `[Pass 6] Unknown artifact kind "${kind}" for block ${blockId}:${portId} - skipping IR emission`
  );
  return null;
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

  // Process blocks in dependency order (already sorted by Pass 4)
  // For each block, translate its output artifacts to IR nodes
  for (const scc of validated.sccs) {
    for (const node of scc.nodes) {
      if (node.kind !== "BlockEval") {
        continue; // Skip bus nodes (handled in Pass 7)
      }

      const blockIndex = node.blockIndex;
      const block = blocks[blockIndex];

      if (!block) {
        errors.push({
          code: "BlockMissing",
          message: `Block index ${blockIndex} out of bounds`,
        });
        continue;
      }

      // Collect output port artifacts for this block (keyed by port ID)
      const outputRefs = new Map<string, ValueRefPacked>();

      for (const output of block.outputs) {
        const portKey = `${block.id}:${output.id}`;
        const artifact = compiledPortMap.get(portKey);

        if (!artifact) {
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

        if (valueRef) {
          outputRefs.set(output.id, valueRef);
        }
      }

      // Store output refs for this block
      if (outputRefs.size > 0) {
        blockOutputs.set(blockIndex, outputRefs);
      }
    }
  }

  return {
    builder,
    blockOutputs,
    errors,
  };
}
