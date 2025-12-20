/**
 * Compiler Module Exports
 */

// Core compile function
export { compilePatch, topoSortBlocks, isPortTypeAssignable } from './compile';

// Types
export type {
  // Kernel primitives
  Seed,
  Env,
  GeometryCache,
  CompileCtx,
  RuntimeCtx,
  KernelEvent,
  Program,
  Vec2,
  Bounds,
  NodeId,
  DrawNode,
  RenderTree,
  Field,

  // Port typing
  ValueKind,
  PortType,
  PortDef,

  // Patch graph
  BlockId,
  PortRef,
  CompilerConnection,
  BlockInstance,
  CompilerPatch,

  // Artifacts
  Artifact,
  CompiledOutputs,

  // Phase machine + scene
  PhaseSample,
  PhaseMachine,
  TargetScene,

  // Block compiler
  BlockCompiler,
  BlockRegistry,

  // Errors
  CompileErrorCode,
  CompileError,
  CompileResult,

  // TimeModel (Phase 3: TimeRoot)
  TimeModel,
  FiniteTimeModel,
  CyclicTimeModel,
  InfiniteTimeModel,
  CompiledProgram,
} from './types';

// Block implementations (domain blocks only)
export {
  // Registry
  DEFAULT_BLOCK_REGISTRY,
  createBlockRegistry,
  registerDynamicBlock,
} from './blocks';

// Context utilities
export {
  SimpleGeometryCache,
  createCompileCtx,
  createRuntimeCtx,
} from './context';

// Integration with editor
export {
  editorToPatch,
  createCompilerService,
  setupAutoCompile,
  type CompilerService,
  type AutoCompileOptions,
  type Viewport,
  type PortRefRewriteMap,
  type CompositeExpansionResult,
} from './integration';

// Error decorations (Slice 2.5)
export {
  buildDecorations,
  hasBlockError,
  hasPortError,
  hasWireError,
  getBlockMessages,
  getPortMessages,
  emptyDecorations,
  type Severity,
  type BlockDecoration,
  type PortDecoration,
  type WireDecoration,
  type DecorationSet,
} from './error-decorations';

// Feature flags for unified architecture
export {
  getFeatureFlags,
  setFeatureFlags,
  resetFeatureFlags,
  enableUnifiedArchitecture,
  initializeFeatureFlags,
  saveFeatureFlagsToLocalStorage,
  type CompilerFeatureFlags,
} from './featureFlags';

// Unified compiler (behind feature flag)
export { UnifiedCompiler } from './unified/UnifiedCompiler';
export type {
  BlockInstance as UnifiedBlockInstance,
  ConnectionDef,
  BusDef,
  PublisherDef,
  ListenerDef,
  PatchDefinition,
  CompilationResult,
  CompilationError,
  CompiledBlock,
  CompiledBus,
} from './unified/UnifiedCompiler';

// TimeCtx for unified architecture
export { TimeCtxManager, TimeCtxFactory } from './unified/TimeCtx';
export type { TimeCtx, TimeMode } from './unified/TimeCtx';

// State blocks
export { stateBlockRegistry } from './unified/StateBlock';
export type { StateBlock } from './unified/StateBlock';

// Export bus-aware compilation and runtime
export {
  compileBusAwarePatch,
} from './compileBusAware';
