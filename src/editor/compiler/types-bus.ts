/**
 * Bus-Aware Compiler Types
 *
 * Extensions to the base compiler types to support buses as first-class
 * graph nodes in Phase 2 compilation.
 */

import type {
  Artifact,
  BlockId,
  PortType,
  BlockInstance,
  CompilerConnection,
  CompileError,
  CompileCtx,
  Program,
  RenderTree,
} from './types';
import type { Bus, Publisher, Listener } from '../types';

// =============================================================================
// Bus-Aware Patch Data Model
// =============================================================================

/**
 * Extended CompilerPatch with bus support.
 */
export interface BusAwareCompilerPatch {
  blocks: Map<BlockId, BlockInstance>;
  connections: readonly CompilerConnection[];
  output?: { blockId: BlockId; port: string };

  // Bus-related additions
  buses: Bus[];
  publishers: Publisher[];
  listeners: Listener[];
}

// =============================================================================
// Dependency Graph Types
// =============================================================================

/**
 * Graph node identifiers for bus-aware compilation.
 */
export type GraphNode =
  | { type: 'BlockOut'; blockId: BlockId; port: string }
  | { type: 'BusValue'; busId: string };

/**
 * Graph edges representing different connection types.
 */
export type GraphEdge =
  | { type: 'Wire'; from: GraphNode; to: GraphNode }
  | { type: 'Publisher'; from: GraphNode; to: { type: 'BusValue'; busId: string } }
  | { type: 'Listener'; from: { type: 'BusValue'; busId: string }; to: GraphNode };

/**
 * Dependency graph representation with bidirectional navigation.
 */
export interface DependencyGraph {
  /** All nodes in the graph */
  nodes: Map<string, GraphNode>;

  /** All edges in the graph */
  edges: GraphEdge[];

  /** Forward adjacency: node -> outgoing edges */
  adjacency: Map<string, GraphEdge[]>;

  /** Reverse adjacency: node -> incoming edges */
  reverseAdjacency: Map<string, GraphEdge[]>;

  /** Bus publishers: busId -> publisher edges */
  busPublishers: Map<string, GraphEdge[]>;

  /** Bus listeners: busId -> listener edges */
  busListeners: Map<string, GraphEdge[]>;
}

// =============================================================================
// Field Expression System (Lazy Evaluation)
// =============================================================================

/**
 * FieldExpr AST for lazy field evaluation.
 * Enables zero-copy bus combination and optimization.
 */
export type FieldExpr<T> =
  | { kind: 'const'; value: T }
  | {
      kind: 'map';
      src: FieldExpr<unknown>;
      fnId: string;
      params?: Record<string, unknown>
    }
  | {
      kind: 'zip';
      a: FieldExpr<unknown>;
      b: FieldExpr<unknown>;
      fnId: string;
      params?: Record<string, unknown>
    }
  | { kind: 'source'; blockId: string; port: string }
  | {
      kind: 'bus';
      busId: string;
      publishers: FieldExpr<unknown>[];
      combineMode: string;
    }
  | {
      kind: 'adapter';
      src: FieldExpr<unknown>;
      adapterId: string;
      params: Record<string, unknown>
    };

/**
 * Field expression evaluator context.
 */
export interface FieldExprCtx {
  /** Source artifacts for expression evaluation */
  artifacts: Map<string, Artifact>;

  /** Bus artifacts for bus expressions */
  busArtifacts: Map<string, Artifact>;

  /** Memoization cache for repeated evaluation */
  memoCache: Map<string, readonly unknown[]>;
}

// =============================================================================
// Adapter System Types
// =============================================================================

/**
 * Adapter interface for type conversions.
 */
export interface Adapter {
  /** Unique adapter identifier */
  id: string;

  /** Source type descriptor */
  from: PortType;

  /** Target type descriptor */
  to: PortType;

  /** Compilation function */
  compile: (artifact: Artifact, params: Record<string, unknown>) => Artifact;

  /** Whether this adapter is computationally expensive */
  heavy?: boolean;
}

/**
 * Adapter registry for type conversion discovery.
 */
export type AdapterRegistry = Record<string, Adapter>;

/**
 * Adapter chain step with validation metadata.
 */
export interface AdapterStep {
  adapterId: string;
  params: Record<string, unknown>;
  from: PortType;
  to: PortType;
}

// =============================================================================
// SCC Detection Types
// =============================================================================

/**
 * Strongly Connected Component (SCC) for feedback loop detection.
 */
export interface StronglyConnectedComponent {
  /** Nodes in this component */
  nodes: GraphNode[];

  /** Whether this component contains a memory block */
  hasMemoryBlock: boolean;

  /** Memory blocks found in this component */
  memoryBlocks: string[];
}

/**
 * Memory block registry for feedback loop validation.
 */
export interface MemoryBlockRegistry {
  /** Set of block types that break causality */
  memoryTypes: Set<string>;

  /** Check if a block type is a memory block */
  isMemoryBlock: (blockType: string) => boolean;
}

// =============================================================================
// Bus Compilation Context
// =============================================================================

/**
 * Extended compilation context for bus-aware compilation.
 */
export interface BusCompileCtx {
  /** Bus artifacts cache */
  busArtifacts: Map<string, Artifact>;

  /** Adapter registry */
  adapters: AdapterRegistry;

  /** Memory block registry */
  memoryBlocks: MemoryBlockRegistry;

  /** Compilation errors collected during process */
  errors: CompileError[];

  /** Dependency graph for validation */
  graph?: DependencyGraph;
}

// =============================================================================
// Compilation Result Extensions
// =============================================================================

/**
 * Extended compilation result with bus metadata.
 */
export interface BusCompileResult {
  ok: boolean;
  program?: Program<RenderTree>;
  errors: readonly CompileError[];

  // Bus-specific additions
  compiledPortMap?: Map<string, Artifact>;
  busArtifacts?: Map<string, Artifact>;
  dependencyGraph?: DependencyGraph;
  sccs?: StronglyConnectedComponent[];
}
// =============================================================================
// Element Domain System (Phase 2 Preparation)
// =============================================================================

/**
 * Element Domain: authoritative set of elements that a Field refers to.
 * 
 * Key concepts from ELEMENT-DOMAIN-CONTRACT.md:
 * - ID: stable identity for deterministic per-element variation and state
 * - Index: 0..N-1 evaluation slot in current frame (where to write output)
 * - These are NOT the same
 * 
 * @see ELEMENT-DOMAIN-CONTRACT.md for full specification
 */
export interface ElementDomain {
  /** 
   * Domain identifier for type checking.
   * Format: "type:instanceId" (e.g., "svg-path:abc123")
   */
  readonly domainTag: string;

  /** Number of elements in this domain (right now) */
  readonly count: number;

  /**
   * Get stable IDs for all elements.
   * These IDs are used for:
   * - Deterministic per-element variation (seeding)
   * - State lookup (delays, integrators)
   * - Per-element configuration
   * 
   * NOT used for output buffer position (use index for that).
   */
  getIds(): Uint32Array;

  /**
   * Get deterministic iteration order.
   * Usually same as ids array order, but separated for future optimization.
   * This is the order in which dense fields are evaluated.
   */
  getOrder(): Uint32Array;

  /**
   * Optional: Get stable key for an element (used in ID generation).
   * Implementation-specific, defined by domain owner.
   */
  getStableKey?(elementIndex: number): number | string;
}

/**
 * Arc-Length Domain: specialized for sampled geometry (SVG paths, curves).
 * Uses arc-length bucket scheme to preserve identity across resampling.
 */
export interface ArcLengthDomain extends ElementDomain {
  /**
   * Canonical parameterization: normalized arc-length s ∈ [0,1).
   * Points defined as k/N buckets preserve identity under resolution changes.
   */
  readonly resolution: number;

  /**
   * Get bucket index for an element.
   * Used for stable ID generation across resampling.
   */
  getBucketIndex(elementIndex: number): number;
}

/**
 * Domain Owner: declares ownership of an element population.
 * Every element population has a single, declared owner.
 */
export interface DomainOwner {
  /** Unique instance identifier (stable across frames) */
  readonly instanceId: string;

  /** Domain type for compatibility checking */
  readonly domainType: 'svg-path' | 'text-glyphs' | 'particles' | 'custom';

  /** Get element domain for current context */
  getDomain(ctx: CompileCtx): ElementDomain;

  /** Get stable key for element (required for ID generation) */
  getStableKey(elementIndex: number): number;
}
