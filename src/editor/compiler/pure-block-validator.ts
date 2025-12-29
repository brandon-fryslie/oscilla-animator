/**
 * Pure Block Compilation Validator
 *
 * Enforces constraints on what pure blocks can emit during compilation.
 * Pure blocks cannot produce artifacts that require kernel capabilities.
 *
 * Validation rules:
 * 1. Pure blocks CANNOT emit RenderTree/RenderTreeProgram (requires render capability)
 * 2. Pure blocks CANNOT emit Domain (requires identity capability)
 * 3. Pure blocks CANNOT emit StateHandle/HistoryBuffer (requires state capability)
 * 4. Pure blocks CANNOT emit ExternalAsset (requires io capability)
 *
 * Note: The AST requirement for operator blocks is aspirational for future migration.
 * Currently, all blocks (including operator blocks) emit closures, which is acceptable
 * during the transition period.
 *
 * References:
 * - design-docs/7-Primitives/3-Registry-Gating.md § Pure Block Compilation
 * - .agent_planning/primitives/PLAN-2025-12-27-030002.md Deliverable 3
 */

import type { Artifact } from "./types";
import type { PureCompileKind } from "../types";

// =============================================================================
// Forbidden Artifact Kinds for Pure Blocks
// =============================================================================

/**
 * Artifact kinds that require kernel capabilities.
 * Pure blocks CANNOT emit these - doing so is a compile error.
 */
const FORBIDDEN_ARTIFACT_KINDS = new Set([
  // Render capability required
  "RenderTree",
  "RenderTreeProgram",
  "RenderNode",
  "RenderNodeArray",
  "CanvasRender",

  // Identity capability required
  "Domain",

  // State capability required (internal types - not exposed as artifacts yet)
  // "StateHandle",
  // "HistoryBuffer",

  // IO capability required (future)
  "ExternalAsset",
  "ImageSource",
  "TextSource",
]);

/**
 * Artifact kinds allowed for pure blocks.
 * These represent pure values that don't require kernel capabilities.
 */
const ALLOWED_PURE_ARTIFACT_KINDS = new Set([
  // Scalars
  "Scalar:float",
  "Scalar:string",
  "Scalar:boolean",
  "Scalar:color",
  "Scalar:vec2",
  "Scalar:bounds",

  // Signals
  "Signal:Time",
  "Signal:float",
  "Signal:Unit",
  "Signal:vec2",
  "Signal:phase",
  "Signal:color",

  // Fields
  "Field:float",
  "Field:string",
  "Field:boolean",
  "Field:color",
  "Field:vec2",
  "Field:Point",
  "Field<Point>",
  "Field:Jitter",
  "Field:Spiral",
  "Field:Wave",
  "Field:Wobble",
  "Field:Path",

  // Special types allowed for pure blocks
  "PhaseMachine", // Pure time transformation
  "TargetScene", // Pure scene data
  "Scene", // Pure scene data
  "FilterDef", // Pure filter definition
  "StrokeStyle", // Pure style data
  "ElementCount", // Pure scalar count
  "FieldExpr", // Lazy field expression (pure)
  "Event", // Discrete events (pure)

  // Specs (structured config that compiles to Programs)
  // These are pure because they're data structures, not runtime effects
  "Spec:LineMorph",
  "Spec:Particles",
  "Spec:RevealMask",
  "Spec:Transform3DCompositor",
  "Spec:DeformCompositor",
  "Spec:ProgramStack",
]);

// =============================================================================
// Validation Error Types
// =============================================================================

export interface PureBlockValidationError {
  blockType: string;
  portId: string;
  message: string;
  code: "FORBIDDEN_ARTIFACT";
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate that a pure block's output artifacts conform to purity constraints.
 *
 * This validation focuses on FORBIDDEN artifacts that require kernel capabilities.
 * It does NOT enforce AST-only outputs for operator blocks yet - that's future work
 * once all blocks are migrated to IR.
 *
 * @param blockType - The block type (for error messages)
 * @param _compileKind - How this pure block compiles (reserved for future use)
 * @param outputs - Map of port ID to compiled artifact
 * @throws Error (with PureBlockValidationError structure) if validation fails
 */
export function validatePureBlockOutput(
  blockType: string,
  _compileKind: PureCompileKind,
  outputs: Map<string, Artifact>
): void {
  for (const [portId, artifact] of Array.from(outputs)) {
    // Check for forbidden artifact kinds
    if (FORBIDDEN_ARTIFACT_KINDS.has(artifact.kind)) {
      const error: PureBlockValidationError = {
        blockType,
        portId,
        message: `Pure block "${blockType}" cannot emit artifact kind "${artifact.kind}" on port "${portId}" (requires kernel capability). Pure blocks can only emit: ${Array.from(ALLOWED_PURE_ARTIFACT_KINDS).join(", ")}`,
        code: "FORBIDDEN_ARTIFACT",
      };
      // Throw Error object (ESLint only-throw-error rule)
      throw new Error(error.message);
    }

    // Future: Once IR migration is complete, validate that operator blocks emit AST nodes
    // For now, operator blocks can emit closures during the transition period
    // if (_compileKind === "operator") {
    //   validateOperatorOutputIsAST(blockType, portId, artifact);
    // }
  }
}

/**
 * Helper to check if an artifact kind is allowed for pure blocks.
 * Used for filtering/debugging - not part of core validation.
 */
export function isAllowedPureArtifactKind(kind: string): boolean {
  return (
    ALLOWED_PURE_ARTIFACT_KINDS.has(kind) && !FORBIDDEN_ARTIFACT_KINDS.has(kind)
  );
}

/**
 * Get a descriptive error message for forbidden artifact kinds.
 */
export function getForbiddenArtifactMessage(
  artifactKind: string
): string | null {
  if (artifactKind === "RenderTree" || artifactKind === "RenderTreeProgram") {
    return `RenderTree artifacts require 'render' capability. Only RenderInstances blocks can emit render trees.`;
  }

  if (artifactKind === "Domain") {
    return `Domain artifacts require 'identity' capability. Only DomainN and SVGSampleDomain blocks can create domains.`;
  }

  if (artifactKind === "StateHandle" || artifactKind === "HistoryBuffer") {
    return `State artifacts require 'state' capability. Only IntegrateBlock and HistoryBlock can create state.`;
  }

  if (
    artifactKind === "ExternalAsset" ||
    artifactKind === "ImageSource" ||
    artifactKind === "TextSource"
  ) {
    return `External asset artifacts require 'io' capability. Only IO blocks can load external resources.`;
  }

  if (FORBIDDEN_ARTIFACT_KINDS.has(artifactKind)) {
    return `Artifact kind "${artifactKind}" requires kernel capability and cannot be emitted by pure blocks.`;
  }

  return null; // Not a forbidden artifact
}
