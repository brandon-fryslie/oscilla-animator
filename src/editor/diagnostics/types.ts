/**
 * @file Diagnostic System Types
 * @description Core type definitions for the diagnostic system.
 *
 * Design principles:
 * - Diagnostics are stable, addressable facts about system health
 * - TargetRef is a discriminated union for type-safe targeting
 * - DiagnosticCode uses string enums for readability
 * - Severity and Domain classify diagnostics for filtering
 *
 * Reference: design-docs/4-Event-System/3.5-Events-and-Payloads-Schema.md
 */

// ============================================================================
// Target Reference Types (discriminated union)
// ============================================================================

/**
 * Reference to a block in the patch graph.
 */
export interface BlockTargetRef {
  kind: 'block';
  blockId: string;
}

/**
 * Reference to a specific port on a block.
 */
export interface PortTargetRef {
  kind: 'port';
  blockId: string;
  portId: string;
}

/**
 * Reference to a bus.
 */
export interface BusTargetRef {
  kind: 'bus';
  busId: string;
}

/**
 * Reference to a bus binding (publisher or listener).
 */
export interface BindingTargetRef {
  kind: 'binding';
  bindingId: string;
  busId: string;
  blockId: string;
  direction: 'publish' | 'subscribe';
}

/**
 * Reference to the TimeRoot block.
 */
export interface TimeRootTargetRef {
  kind: 'timeRoot';
  blockId: string;
}

/**
 * Reference to a span of the graph (multiple blocks forming a group, e.g., SCC cycle).
 */
export interface GraphSpanTargetRef {
  kind: 'graphSpan';
  blockIds: string[];
  /** Optional description of what this span represents */
  spanKind?: 'cycle' | 'island' | 'subgraph';
}

/**
 * Reference to a composite definition or instance.
 */
export interface CompositeTargetRef {
  kind: 'composite';
  compositeDefId: string;
  instanceId?: string;
}

/**
 * Union of all target reference types.
 * Discriminated by the 'kind' field.
 */
export type TargetRef =
  | BlockTargetRef
  | PortTargetRef
  | BusTargetRef
  | BindingTargetRef
  | TimeRootTargetRef
  | GraphSpanTargetRef
  | CompositeTargetRef;

// ============================================================================
// Severity and Domain Enums
// ============================================================================

/**
 * Diagnostic severity levels, from least to most severe.
 *
 * - hint: Suggestions for improvement (dismissible)
 * - info: Informational, no action required
 * - warn: Something may be wrong, user should review
 * - error: Something is definitely wrong, prevents correct operation
 * - fatal: Critical failure, compilation/runtime cannot continue
 */
export type Severity = 'hint' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Diagnostic domains - where the diagnostic originated.
 *
 * - authoring: Fast graph validation (immediate feedback during editing)
 * - compile: Compiler validation (type checking, topology, semantics)
 * - runtime: Runtime observations (NaN, frame budget, etc.)
 * - perf: Performance warnings (heavy field materialization, etc.)
 */
export type Domain = 'authoring' | 'compile' | 'runtime' | 'perf';

// ============================================================================
// Diagnostic Codes
// ============================================================================

/**
 * Diagnostic codes - machine-readable identifiers for diagnostic types.
 *
 * Naming convention:
 * - E_ prefix: Error (severity: error or fatal)
 * - W_ prefix: Warning (severity: warn)
 * - I_ prefix: Info (severity: info or hint)
 * - P_ prefix: Performance (severity: warn, domain: perf)
 */
export type DiagnosticCode =
  // Time-related errors
  | 'E_TIME_ROOT_MISSING'
  | 'E_TIME_ROOT_MULTIPLE'
  | 'E_TIME_ROOT_INVALID_TOPOLOGY'
  // Type-related errors
  | 'E_TYPE_MISMATCH'
  | 'E_WORLD_MISMATCH'
  | 'E_DOMAIN_MISMATCH'
  // Graph topology errors
  | 'E_CYCLE_DETECTED'
  | 'E_MISSING_INPUT'
  | 'E_INVALID_CONNECTION'
  // Bus-related warnings
  | 'W_BUS_EMPTY'
  | 'W_BUS_NO_PUBLISHERS'
  | 'W_BUS_COMBINE_CONFLICT'
  // Graph structure warnings
  | 'W_GRAPH_UNUSED_OUTPUT'
  | 'W_GRAPH_DISCONNECTED_BLOCK'
  | 'W_GRAPH_DEAD_CHANNEL'
  // Authoring hints
  | 'I_REDUCE_REQUIRED'
  | 'I_SILENT_VALUE_USED'
  | 'I_DEPRECATED_PRIMITIVE'
  // Performance warnings
  | 'P_FIELD_MATERIALIZATION_HEAVY'
  | 'P_FRAME_BUDGET_EXCEEDED'
  | 'P_NAN_DETECTED'
  | 'P_INFINITY_DETECTED';

// ============================================================================
// Diagnostic Payload Types
// ============================================================================

/**
 * Type mismatch diagnostic payload.
 */
export interface TypeMismatchPayload {
  kind: 'typeMismatch';
  expected: string; // TypeDesc serialized or summary
  actual: string;
  suggestedAdapter?: string;
}

/**
 * Cycle detection diagnostic payload.
 */
export interface CyclePayload {
  kind: 'cycle';
  cycleMembers: string[]; // Block IDs in the cycle
}

/**
 * Performance threshold diagnostic payload.
 */
export interface PerfPayload {
  kind: 'perf';
  metric: string;
  value: number;
  threshold: number;
}

/**
 * Generic diagnostic payload for simple cases.
 */
export interface GenericPayload {
  kind: 'generic';
  data: Record<string, unknown>;
}

/**
 * Union of all diagnostic payload types.
 */
export type DiagnosticPayload =
  | TypeMismatchPayload
  | CyclePayload
  | PerfPayload
  | GenericPayload;

// ============================================================================
// Diagnostic Actions
// ============================================================================

/**
 * Actions that can be suggested to fix a diagnostic.
 */
export type DiagnosticAction =
  | { kind: 'goToTarget'; target: TargetRef }
  | { kind: 'insertBlock'; blockType: string; position?: 'before' | 'after'; nearBlockId?: string }
  | { kind: 'removeBlock'; blockId: string }
  | { kind: 'addAdapter'; fromPort: PortTargetRef; adapterType: string }
  | { kind: 'createTimeRoot'; timeRootKind: 'Finite' | 'Cycle' | 'Infinite' }
  | { kind: 'muteDiagnostic'; diagnosticId: string }
  | { kind: 'openDocs'; docUrl: string };

// ============================================================================
// Core Diagnostic Type
// ============================================================================

/**
 * Metadata about diagnostic lifecycle.
 */
export interface DiagnosticMetadata {
  /** When the diagnostic was first observed */
  firstSeenAt: number;
  /** When the diagnostic was last observed (for deduplication) */
  lastSeenAt: number;
  /** Number of times this diagnostic was observed (for runtime aggregation) */
  occurrenceCount: number;
  /** Patch revision when this diagnostic was emitted */
  patchRevision: number;
}

/**
 * A diagnostic is a structured, addressable fact about system health.
 *
 * Key properties:
 * - id: Stable hash for deduplication (code + primaryTarget + signature)
 * - code: Machine-readable enum
 * - severity: How severe is this issue
 * - domain: Where did it originate
 * - primaryTarget: What node/bus/binding does it attach to
 * - affectedTargets: Related targets (e.g., both ends of a type mismatch)
 * - message: Human-readable description
 * - payload: Structured data for UI rendering
 * - actions: Suggested fixes
 * - metadata: Lifecycle information
 */
export interface Diagnostic {
  /** Stable ID: hash(code + primaryTarget + signature) */
  id: string;
  /** Machine-readable diagnostic code */
  code: DiagnosticCode;
  /** Severity level */
  severity: Severity;
  /** Domain where the diagnostic originated */
  domain: Domain;
  /** Primary target in the patch graph */
  primaryTarget: TargetRef;
  /** Related targets (optional) */
  affectedTargets?: TargetRef[];
  /** Short human-readable title */
  title: string;
  /** Detailed human-readable message */
  message: string;
  /** Structured payload for UI/tooling */
  payload?: DiagnosticPayload;
  /** Suggested fix actions */
  actions?: DiagnosticAction[];
  /** Lifecycle metadata */
  metadata: DiagnosticMetadata;
}

// ============================================================================
// Diagnostic Status (for DiagnosticHub)
// ============================================================================

/**
 * Status of a diagnostic in the hub.
 */
export type DiagnosticStatus = 'active' | 'resolved' | 'muted';

/**
 * A diagnostic with its status (used by DiagnosticHub).
 */
export interface TrackedDiagnostic extends Diagnostic {
  /** Current status of the diagnostic */
  status: DiagnosticStatus;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a stable ID for a diagnostic.
 * Uses a simple hash of code + primaryTarget + optional signature.
 */
export function generateDiagnosticId(
  code: DiagnosticCode,
  primaryTarget: TargetRef,
  signature?: string
): string {
  const targetStr = serializeTargetRef(primaryTarget);
  const base = `${code}:${targetStr}`;
  return signature ? `${base}:${signature}` : base;
}

/**
 * Serialize a TargetRef to a string for ID generation.
 */
export function serializeTargetRef(target: TargetRef): string {
  switch (target.kind) {
    case 'block':
      return `block:${target.blockId}`;
    case 'port':
      return `port:${target.blockId}.${target.portId}`;
    case 'bus':
      return `bus:${target.busId}`;
    case 'binding':
      return `binding:${target.bindingId}`;
    case 'timeRoot':
      return `timeRoot:${target.blockId}`;
    case 'graphSpan':
      return `graphSpan:${target.blockIds.sort().join(',')}`;
    case 'composite':
      return `composite:${target.compositeDefId}${target.instanceId ? `:${target.instanceId}` : ''}`;
  }
}

/**
 * Create a diagnostic with defaults for optional fields.
 */
export function createDiagnostic(
  params: Pick<Diagnostic, 'code' | 'severity' | 'domain' | 'primaryTarget' | 'title' | 'message'> &
    Partial<Omit<Diagnostic, 'id' | 'metadata'>> & {
      patchRevision: number;
      signature?: string;
    }
): Diagnostic {
  const now = Date.now();
  const id = generateDiagnosticId(params.code, params.primaryTarget, params.signature);

  return {
    id,
    code: params.code,
    severity: params.severity,
    domain: params.domain,
    primaryTarget: params.primaryTarget,
    affectedTargets: params.affectedTargets,
    title: params.title,
    message: params.message,
    payload: params.payload,
    actions: params.actions,
    metadata: {
      firstSeenAt: now,
      lastSeenAt: now,
      occurrenceCount: 1,
      patchRevision: params.patchRevision,
    },
  };
}
