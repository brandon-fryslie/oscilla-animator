/**
 * V2 Block Compiler Adapter
 *
 * Adapts V2 (IR-emitting) block compilers to work with the V1 (closure-based) pipeline.
 * This enables gradual migration - blocks can emit IR while the pipeline still expects closures.
 *
 * Phase 0, Sprint 3: V2 Adapter Implementation
 * References:
 * - .agent_planning/phase0-architecture-refactoring/PLAN-2025-12-31-170000-sprint3-v2-adapter.md
 * - .agent_planning/phase0-architecture-refactoring/DOD-2025-12-31-170000-sprint3-v2-adapter.md
 */

import type { BlockCompiler, Artifact, RuntimeCtx } from './types';
import type { SignalExprBuilder } from '../runtime/signal-expr/SignalExprBuilder';
import { createSignalExprBuilder } from '../runtime/signal-expr/SignalExprBuilder';
import type { SigExprId, TypeDesc, Domain } from './ir/types';
import type { SignalExprIR } from './ir/signalExpr';
import type { ConstPool } from '../runtime/signal-expr/SignalExprBuilder';
import { evalSig } from '../runtime/signal-expr/SigEvaluator';
import { createSigEnv } from '../runtime/signal-expr/SigEnv';
import { createSigFrameCache } from '../runtime/signal-expr/SigFrameCache';
import { asTypeDesc } from './ir/types';

/**
 * V2 Block Compiler Interface (IR-based)
 *
 * V2 compilers receive a builder and emit IR nodes instead of closures.
 */
export interface BlockCompilerV2 {
  type: string;
  inputs: BlockCompiler['inputs'];
  outputs: BlockCompiler['outputs'];

  /**
   * Compile block to IR using SignalExprBuilder.
   *
   * @param args.id - Block instance ID
   * @param args.params - Block parameters
   * @param args.inputs - Input signal IDs (already compiled to IR)
   * @param args.builder - SignalExprBuilder for emitting nodes
   * @returns Output signal IDs
   */
  compileV2(args: {
    id: string;
    params: Record<string, unknown>;
    inputs: Record<string, SigExprId>;
    builder: SignalExprBuilder;
  }): Record<string, SigExprId>;
}

/**
 * Convert V1 Artifact to SigExprId using closure node.
 *
 * Wraps V1 signal closures as IR nodes that can be used as inputs to V2 compilers.
 * Only supports numeric signal artifacts (Signal:float, Signal:int, etc.).
 *
 * @param artifact - V1 artifact (must be a Signal type)
 * @param builder - SignalExprBuilder for creating nodes
 * @param portName - Port name (for error messages)
 * @returns Signal expression ID
 * @throws Error if artifact is not a supported Signal type
 */
function artifactToSigExprId(
  artifact: Artifact,
  builder: SignalExprBuilder,
  portName: string
): SigExprId {
  // Check if artifact is a Signal type
  if (!artifact.kind.startsWith('Signal:')) {
    throw new Error(
      `V2 adapter input conversion: port '${portName}' has non-Signal artifact (kind: ${artifact.kind}). ` +
      `Only Signal artifacts are supported.`
    );
  }

  // Determine type from artifact kind
  let domain: Domain;
  switch (artifact.kind) {
    case 'Signal:Time':
    case 'Signal:float':
    case 'Signal:Unit':
      domain = 'float';
      break;
    case 'Signal:int':
      domain = 'int';
      break;
    case 'Signal:phase':
    case 'Signal:phase01':
      domain = "rate";
      break;
    default:
      throw new Error(
        `V2 adapter input conversion: port '${portName}' has unsupported Signal type (kind: ${artifact.kind}). ` +
        `Only numeric signals (float, int, phase) are currently supported.`
      );
  }

  const type: TypeDesc = asTypeDesc({
    world: 'signal',
    domain,
  });

  // Wrap the V1 closure as a closure node
  // V1 closures take (t, ctx: RuntimeCtx) but closure nodes expect (t, ctx: LegacyClosureContext)
  // The closure will be called with createLegacyContext(env) at eval time
  // So we need to adapt the signature
  const v1Closure = artifact.value as (t: number, ctx: RuntimeCtx) => number;

  // Create an adapter closure that matches LegacyClosureContext signature
  const adaptedClosure = (tAbsMs: number, ctx: { deltaSec: number; deltaMs: number; frameIndex: number }): number => {
    // V1 closures expect RuntimeCtx with viewport, but we only have LegacyClosureContext
    // For now, create a minimal RuntimeCtx with dummy viewport
    // This is safe because V1 closures typically don't use viewport for Signal operations
    const runtimeCtx: RuntimeCtx = {
      ...ctx,
      viewport: { w: 1920, h: 1080, dpr: 1 }, // Dummy viewport
    };
    return v1Closure(tAbsMs, runtimeCtx);
  };

  return builder.closureNode(adaptedClosure, type);
}

/**
 * Convert SigExprId to V1 Artifact closure.
 *
 * Wraps IR nodes as V1 signal closures that evaluate via evalSig.
 * The closure captures the IR nodes and const pool, creating a self-contained evaluator.
 *
 * @param sigId - Signal expression ID
 * @param nodes - IR nodes array
 * @param constPool - Constant pool
 * @param kind - Artifact kind (e.g., 'Signal:float')
 * @returns V1 Signal artifact
 */
function sigExprIdToArtifact(
  sigId: SigExprId,
  nodes: SignalExprIR[],
  constPool: ConstPool,
  kind: string
): Artifact {
  // Create a closure that evaluates the IR
  const closure = (tAbsMs: number, _runtimeCtx: RuntimeCtx): number => {
    // Create evaluation environment
    // Use a fresh cache per evaluation to avoid stale data
    const cache = createSigFrameCache(nodes.length);
    cache.frameId = 1; // Use a constant frameId since we're evaluating once

    const env = createSigEnv({
      tAbsMs,
      constPool,
      cache,
      // All other params are optional and will use defaults:
      // - slotValues: empty reader
      // - transformTable: empty table
      // - state: empty buffer
      // - runtimeCtx: 60fps, frame 0
      // - closureRegistry: empty registry
    });

    // Evaluate the signal expression
    return evalSig(sigId, env, nodes);
  };

  // Return artifact with closure
  // We know kind is a valid Artifact kind (e.g., 'Signal:float')
  // Use type assertion to bypass dynamic kind limitation
  return {
    kind,
    value: closure,
  } as Artifact;
}

/**
 * Adapt a V2 compiler to the V1 interface.
 *
 * This adapter:
 * 1. Creates a SignalExprBuilder for each block compilation
 * 2. Converts input V1 Artifacts to SigExprIds (via closure nodes)
 * 3. Calls the V2 compiler's compileV2() method
 * 4. Builds the IR and wraps output SigExprIds as V1 closures (via evalSig)
 *
 * IMPORTANT: This is a TEMPORARY bridge for migration. Once all blocks
 * are migrated and the pipeline is updated, this adapter will be removed.
 *
 * @param v2Compiler - V2 block compiler
 * @returns V1-compatible block compiler
 */
export function adaptV2Compiler(v2Compiler: BlockCompilerV2): BlockCompiler {
  return {
    type: v2Compiler.type,
    inputs: v2Compiler.inputs,
    outputs: v2Compiler.outputs,

    compile(compileArgs) {
      const { id, params, inputs: inputArtifacts } = compileArgs;

      // 1. Create SignalExprBuilder
      const builder = createSignalExprBuilder();

      // 2. Convert input Artifacts to SigExprIds
      const inputSigIds: Record<string, SigExprId> = {};
      for (const inputPort of v2Compiler.inputs) {
        const artifact = inputArtifacts[inputPort.name];
        if (artifact === undefined) {
          // Optional input not provided
          continue;
        }

        try {
          inputSigIds[inputPort.name] = artifactToSigExprId(artifact, builder, inputPort.name);
        } catch (err) {
          // Input conversion error - return Error artifact
          const outputs: Record<string, Artifact> = {};
          for (const output of v2Compiler.outputs) {
            outputs[output.name] = {
              kind: 'Error',
              message: `V2 adapter error in block ${id}: ${(err as Error).message}`,
            };
          }
          return outputs;
        }
      }

      // 3. Call V2 compiler
      let outputSigIds: Record<string, SigExprId>;
      try {
        outputSigIds = v2Compiler.compileV2({
          id,
          params,
          inputs: inputSigIds,
          builder,
        });
      } catch (err) {
        // Compilation error - return Error artifacts
        const outputs: Record<string, Artifact> = {};
        for (const output of v2Compiler.outputs) {
          outputs[output.name] = {
            kind: 'Error',
            message: `V2 compiler error in block ${id}: ${(err as Error).message}`,
          };
        }
        return outputs;
      }

      // 4. Build IR (extract nodes and const pool)
      // Build with a dummy root ID - we'll use individual outputSigIds
      const buildResult = builder.build(0);
      const nodes = buildResult.nodes;
      const constPool = buildResult.constPool;

      // 5. Wrap each output SigExprId as a V1 closure artifact
      const outputs: Record<string, Artifact> = {};
      for (const outputPort of v2Compiler.outputs) {
        const sigId = outputSigIds[outputPort.name];
        if (sigId === undefined) {
          // Output not provided by compiler - create Error artifact
          outputs[outputPort.name] = {
            kind: 'Error',
            message: `V2 compiler for ${v2Compiler.type} did not produce output '${outputPort.name}'`,
          };
          continue;
        }

        // Determine artifact kind from output port
        // For now, default to Signal:float
        // TODO: Use port type information when available
        const artifactKind = 'Signal:float';

        outputs[outputPort.name] = sigExprIdToArtifact(sigId, nodes, constPool, artifactKind);
      }

      return outputs;
    },
  };
}
