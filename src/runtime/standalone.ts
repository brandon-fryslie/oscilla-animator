/**
 * Standalone Player Runtime
 *
 * Minimal runtime bundle for standalone HTML player export.
 *
 * This entry point exports only what's needed to execute
 * a compiled IR program in a browser:
 * - ScheduleExecutor (execute schedule steps)
 * - Canvas2DRenderer (render to canvas)
 * - RuntimeState creation
 * - IR deserialization
 *
 * Tree-shaking will remove all editor, compiler, and UI code.
 * Target bundle size: <100KB minified+gzipped
 */

// Core runtime exports
export { ScheduleExecutor } from '../editor/runtime/executor/ScheduleExecutor';
export { Canvas2DRenderer } from '../editor/runtime/canvasRenderer';
export { createRuntimeState } from '../editor/runtime/executor/RuntimeState';

// IR deserialization
export { deserializeProgram, deserializeProgramFromJSON } from '../editor/compiler/ir/serialize';

// Types needed by player
export type { CompiledProgramIR } from '../editor/compiler/ir/program';
export type { RenderFrameIR } from '../editor/compiler/ir/renderIR';
export type { RuntimeState } from '../editor/runtime/executor/RuntimeState';
