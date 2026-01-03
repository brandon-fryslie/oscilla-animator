/**
 * DEPRECATED: Old Bus-Aware Patch Compiler
 *
 * This file implemented an older compiler architecture and is no longer compatible
 * with the current IR-based compiler pipeline (passes 0-8).
 *
 * TODO: This file needs to be either:
 * 1. Completely rewritten to use the new pass-based architecture, OR
 * 2. Removed and all call sites updated to use the new compiler directly
 *
 * For now, it exports stub implementations to allow the codebase to compile.
 * The real compiler implementation should use:
 * - pass0Materialize (default sources)
 * - pass1Normalize
 * - pass2TypeGraph
 * - pass3Time
 * - pass4DepGraph
 * - pass5SCC
 * - pass6BlockLowering
 * - pass7BusLowering
 * - pass8LinkResolution
 *
 * See: src/editor/compiler/passes/ for the actual compiler implementation
 */

import type {
  CompileError,
  CompileResult,
  CompilerPatch,
  Seed,
} from './types';

import type { Bus, LensInstance, AdapterStep } from '../types';

// Re-export bus types for external consumers
export type { Bus, LensInstance, AdapterStep };

/**
 * DEPRECATED: Compile a patch with bus support.
 *
 * This function is a stub that returns a compilation error.
 * Use the pass-based compiler pipeline instead.
 *
 * @deprecated Use the compiler passes directly (passes 0-8)
 */
export function compileBusAware(
  _patch: CompilerPatch,
  _registry: import('./types').BlockRegistry
): CompileResult {
  const errors: CompileError[] = [{
    code: 'NotImplemented',
    message: 'compileBusAware() is deprecated and non-functional. Use the pass-based compiler pipeline (passes 0-8) instead.',
  }];

  return {
    ok: false,
    errors,
  };
}

/**
 * DEPRECATED: Extended version with additional parameters.
 *
 * This function is a stub that returns a compilation error.
 *
 * @deprecated Use the pass-based compiler pipeline instead
 */
export function compileBusAwarePatch(
  _patch: CompilerPatch,
  _registry: import('./types').BlockRegistry,
  _seed: Seed,
  _ctx: import('./types').CompileCtx,
  _options?: { emitIR?: boolean }
): CompileResult {
  const errors: CompileError[] = [{
    code: 'NotImplemented',
    message: 'compileBusAwarePatch() is deprecated and non-functional. Use the pass-based compiler pipeline (passes 0-8) instead.',
  }];

  return {
    ok: false,
    errors,
  };
}

/**
 * DEPRECATED: Get bus combine mode from Bus object.
 */
export function getBusCombineMode(_bus: Bus): 'last' | 'sum' | 'average' | 'max' | 'min' {
  console.warn('getBusCombineMode() is deprecated');
  return 'last';
}

/* ORIGINAL IMPLEMENTATION COMMENTED OUT - requires extensive refactoring

This file previously implemented a bus-aware compiler with the following structure:
1. Phase 1: Compile blocks to closures (frontend compilation)
2. Phase 2: Generate IR (compiler passes)
3. Phase 3: Generate schedule from IR

However, it used outdated type definitions and APIs that are incompatible with:
- The current IR type system (TypeDesc, Program, RuntimeCtx, etc.)
- The current pass structure (pass3-time, pass4-depgraph, pass5-scc instead of old names)
- The current BlockDefinition structure (missing 'slots' and 'form' properties)

To restore this functionality, it would need to be completely rewritten to:
- Use LinkedGraphIR from pass8-link-resolution
- Use the current Program<T> generic type
- Use the current RuntimeCtx and CompileCtx types
- Use the correct pass names and imports
- Handle the current Block/BlockDefinition structure

For reference, the passes pipeline is:
- pass0-materialize.ts (default sources)
- pass1-normalize.ts (graph normalization)
- pass2-types.ts (type checking)
- pass3-time.ts (time topology)
- pass4-depgraph.ts (dependency graph)
- pass5-scc.ts (strongly connected components)
- pass6-block-lowering.ts (block→IR lowering)
- pass7-bus-lowering.ts (bus→IR lowering)
- pass8-link-resolution.ts (final IR linking)

*/
