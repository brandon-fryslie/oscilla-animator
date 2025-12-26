/**
 * V2 Block Compiler Adapter
 *
 * Adapts V2 (IR-emitting) block compilers to work with the V1 (closure-based) pipeline.
 * This enables gradual migration - blocks can emit IR while the pipeline still expects closures.
 *
 * Phase 4, Sprint 8: Compiler Integration
 * References:
 * - .agent_planning/signalexpr-runtime/PLAN-2025-12-26-031245.md §B2
 * - .agent_planning/signalexpr-runtime/DOD-2025-12-26-031245.md §B2
 *
 * STUB IMPLEMENTATION: This is a minimal stub to establish the type interface.
 * Full implementation will convert input closures to IR nodes, call V2 compiler,
 * and wrap output IR as closures that evaluate via evalSig.
 */

import type { BlockCompiler, Artifact } from './types';
import type { SignalExprBuilder } from '../runtime/signal-expr/SignalExprBuilder';
import type { SigExprId } from './ir/types';

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
 * Adapt a V2 compiler to the V1 interface.
 *
 * This adapter:
 * 1. Creates a SignalExprBuilder for each block compilation
 * 2. Wraps input closures as IR nodes (via closureBridge or direct constants)
 * 3. Calls the V2 compiler's compileV2() method
 * 4. Wraps the output IR as a closure that evaluates via evalSig
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

    compile(_compileArgs) {
      // STUB IMPLEMENTATION for Phase 4, Sprint 8
      // This is a minimal stub to get the infrastructure wired up.
      // Full implementation will:
      // 1. Create SignalExprBuilder
      // 2. Convert input Artifacts to SigExprIds
      // 3. Call v2Compiler.compileV2()
      // 4. Build IR
      // 5. Wrap output as closure that calls evalSig

      // For now, just create Error artifacts
      const errorArtifact: Artifact = {
        kind: 'Error',
        message: `V2 adapter not yet fully implemented for ${v2Compiler.type}`,
      };

      const outputs: Record<string, Artifact> = {};
      for (const output of v2Compiler.outputs) {
        outputs[output.name] = errorArtifact;
      }
      return outputs;
    },
  };
}
