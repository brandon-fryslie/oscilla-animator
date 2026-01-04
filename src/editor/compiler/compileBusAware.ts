/**
 * IR-Based Patch Compiler Entry Point
 *
 * This file provides backward-compatible entry points that delegate
 * to the main compiler pipeline in compile.ts.
 *
 * The actual compilation pipeline (passes 0-8) is implemented in compile.ts.
 * This file exists for historical API compatibility.
 */

import type {
  CompileError,
  CompileResult,
  CompilerPatch,
  Seed,
  CompileCtx,
  BlockRegistry,
} from './types';

import type { Bus, LensInstance, AdapterStep } from '../types';
import { compilePatch } from './compile';

// Re-export bus types for external consumers
export type { Bus, LensInstance, AdapterStep };

/**
 * DEPRECATED: Old bus-aware compiler (stub for backward compatibility)
 *
 * @deprecated Use compileBusAwarePatch() instead
 */
export function compileBusAware(
  _patch: CompilerPatch,
  _registry: BlockRegistry
): CompileResult {
  const errors: CompileError[] = [{
    code: 'NotImplemented',
    message: 'compileBusAware() is deprecated. Use compileBusAwarePatch() instead.',
  }];

  return {
    ok: false,
    errors,
  };
}

/**
 * Compile a patch using the IR-based compiler pipeline.
 *
 * This is a backward-compatible wrapper around compilePatch() from compile.ts.
 * The actual pass pipeline (0-8) is implemented there.
 *
 * @param patch - The patch to compile
 * @param registry - Block registry
 * @param seed - Random seed for deterministic compilation
 * @param ctx - Compile context
 * @param options - Compilation options
 * @returns Compilation result with program and timeModel, or errors
 */
export function compileBusAwarePatch(
  patch: CompilerPatch,
  registry: BlockRegistry,
  seed: Seed,
  ctx: CompileCtx,
  options?: { emitIR?: boolean }
): CompileResult {
  // Delegate to the main compiler pipeline
  return compilePatch(patch, registry, seed, ctx, options);
}

/**
 * DEPRECATED: Get bus combine mode from Bus object.
 */
export function getBusCombineMode(_bus: Bus): 'last' | 'sum' | 'average' | 'max' | 'min' {
  console.warn('getBusCombineMode() is deprecated');
  return 'last';
}
