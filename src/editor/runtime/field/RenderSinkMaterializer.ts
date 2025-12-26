/**
 * @file Render Sink Materializer
 * @description Materialization for render sinks - executing the final step of field compilation.
 *
 * Key Design:
 * - Render sinks declare what buffers they need (positions, sizes, colors, etc.)
 * - RenderSinkMaterializationPlan specifies all materialization requests
 * - executeRenderSink produces typed buffers + uniforms ready for rendering
 *
 * This is the bridge between field system and rendering system.
 */

import { materialize, type MaterializerEnv } from './Materializer';
import type {
  FieldExprId,
  SigExprId,
  MaterializationRequest,
} from './types';

// =============================================================================
// Render Sink Types
// =============================================================================

/**
 * RenderSinkInputs: Declares what data a render sink needs
 */
export interface RenderSinkInputs {
  /** Domain handle (defines number of instances) */
  domain: number; // ValueSlot

  /** Position field */
  pos: FieldExprId;

  /** Optional size field */
  size?: FieldExprId;

  /** Optional fill/color field */
  fill?: FieldExprId;

  /** Optional opacity signal (uniform, not per-instance) */
  opacity?: SigExprId;
}

/**
 * RenderSinkMaterializationPlan: List of materialization requests for a sink
 */
export interface RenderSinkMaterializationPlan {
  /** Unique sink ID */
  sinkId: number;

  /** All materialization requests for this sink */
  requests: MaterializationRequest[];
}

/**
 * RenderSinkIR: IR representation of a render sink
 */
export interface RenderSinkIR {
  /** Type of sink (e.g., 'instances2d', 'particles', etc.) */
  sinkType: string;

  /** Domain ID for instance count */
  domainId: number;

  /** Field inputs keyed by semantic name */
  fieldInputs: Record<string, FieldExprId>;

  /** Signal uniforms keyed by name */
  signalUniforms: Record<string, SigExprId>;
}

/**
 * RenderOutput: Materialized buffers + uniforms ready for rendering
 */
export interface RenderOutput {
  /** Sink type (determines shader/renderer) */
  kind: string;

  /** Number of instances to render */
  instanceCount: number;

  /** Materialized buffers keyed by usage tag */
  buffers: Record<string, ArrayBufferView>;

  /** Evaluated signal uniforms keyed by name */
  uniforms: Record<string, number>;
}

// =============================================================================
// Render Environment
// =============================================================================

/**
 * RenderEnv: Environment for render sink execution
 * Contains materializer env + any rendering-specific state
 */
export interface RenderEnv {
  /** Materializer environment for field materialization */
  materializerEnv: MaterializerEnv;
}

// =============================================================================
// Signal Evaluation Stub
// =============================================================================

/**
 * Evaluate a signal expression (stub implementation)
 * Will be replaced when signal system is integrated
 */
function evalSig(
  _sigId: SigExprId,
  _env: MaterializerEnv
): number {
  // Stub: return default value
  return 1.0;
}

// =============================================================================
// Render Sink Execution
// =============================================================================

/**
 * Execute a render sink: materialize all fields and evaluate all signals
 *
 * This is the final step in the field compilation pipeline:
 * 1. Materialize all required field buffers
 * 2. Evaluate all signal uniforms
 * 3. Package everything into RenderOutput
 *
 * @param sink - Render sink IR node
 * @param plan - Materialization plan for this sink
 * @param env - Render environment
 * @returns RenderOutput ready for rendering system
 */
export function executeRenderSink(
  sink: RenderSinkIR,
  plan: RenderSinkMaterializationPlan,
  env: RenderEnv
): RenderOutput {
  // 1. Materialize all required buffers
  const buffers: Record<string, ArrayBufferView> = {};

  for (const req of plan.requests) {
    buffers[req.usageTag] = materialize(req, env.materializerEnv);
  }

  // 2. Evaluate any signal uniforms
  const uniforms: Record<string, number> = {};
  for (const [name, sigId] of Object.entries(sink.signalUniforms)) {
    uniforms[name] = evalSig(sigId, env.materializerEnv);
  }

  // 3. Get domain count (number of instances)
  const instanceCount = env.materializerEnv.getDomainCount(sink.domainId);

  // 4. Build render output
  return {
    kind: sink.sinkType,
    instanceCount,
    buffers,
    uniforms,
  };
}

/**
 * Create a render sink materialization plan from sink IR
 *
 * This analyzes the sink's requirements and builds a list of
 * materialization requests.
 *
 * @param sink - Render sink IR node
 * @returns Materialization plan
 */
export function createRenderSinkPlan(
  sink: RenderSinkIR
): RenderSinkMaterializationPlan {
  const requests: MaterializationRequest[] = [];

  // Build requests for each field input
  for (const [usageTag, fieldId] of Object.entries(sink.fieldInputs)) {
    // Determine format based on usage tag
    const format = inferFormatFromUsage(usageTag);
    const layout = inferLayoutFromUsage(usageTag);

    requests.push({
      fieldId,
      domainId: sink.domainId,
      format,
      layout,
      usageTag,
    });
  }

  return {
    sinkId: 0, // Will be assigned by render system
    requests,
  };
}

/**
 * Infer buffer format from usage tag
 * This is a heuristic - real system would use type info
 */
function inferFormatFromUsage(usageTag: string): MaterializationRequest['format'] {
  if (usageTag === 'pos' || usageTag === 'position') return 'vec2f32';
  if (usageTag === 'size' || usageTag === 'radius') return 'f32';
  if (usageTag === 'fill' || usageTag === 'color') return 'rgba8';
  if (usageTag === 'velocity') return 'vec2f32';
  if (usageTag === 'rotation') return 'f32';

  // Default: scalar f32
  return 'f32';
}

/**
 * Infer buffer layout from usage tag
 */
function inferLayoutFromUsage(usageTag: string): MaterializationRequest['layout'] {
  if (usageTag === 'pos' || usageTag === 'position') return 'vec2';
  if (usageTag === 'fill' || usageTag === 'color') return 'color';
  if (usageTag === 'velocity') return 'vec2';

  // Default: scalar
  return 'scalar';
}
