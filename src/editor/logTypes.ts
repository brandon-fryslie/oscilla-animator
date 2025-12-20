/**
 * Log System Types
 *
 * Types for the editor's logging/status system.
 */

// =============================================================================
// Log Levels
// =============================================================================

/**
 * Log severity levels (ordered by severity).
 */
export type LogLevel = 'debug' | 'info' | 'warning' | 'error';

/**
 * All log levels in order of severity.
 */
export const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warning', 'error'] as const;

/**
 * Log level display names and colors.
 */
export const LOG_LEVEL_CONFIG: Record<LogLevel, { label: string; color: string }> = {
  debug: { label: 'DEBUG', color: '#888' },
  info: { label: 'INFO', color: '#4a9eff' },
  warning: { label: 'WARN', color: '#ffaa00' },
  error: { label: 'ERROR', color: '#ff4444' },
};

// =============================================================================
// Component Sources
// =============================================================================

/**
 * Components that can emit log messages.
 */
export type LogComponent =
  | 'compiler'
  | 'store'
  | 'renderer'
  | 'inspector'
  | 'patchbay'
  | 'transport'
  | 'system';

/**
 * All component sources.
 */
export const LOG_COMPONENTS: readonly LogComponent[] = [
  'compiler',
  'store',
  'renderer',
  'inspector',
  'patchbay',
  'transport',
  'system',
] as const;

/**
 * Component display names.
 */
export const LOG_COMPONENT_CONFIG: Record<LogComponent, { label: string }> = {
  compiler: { label: 'Compiler' },
  store: { label: 'Store' },
  renderer: { label: 'Renderer' },
  inspector: { label: 'Inspector' },
  patchbay: { label: 'PatchBay' },
  transport: { label: 'Transport' },
  system: { label: 'System' },
};

// =============================================================================
// Log Entry
// =============================================================================

/**
 * A single log entry.
 */
export interface LogEntry {
  /** Unique ID */
  readonly id: string;

  /** When the log was created */
  readonly timestamp: Date;

  /** Severity level */
  readonly level: LogLevel;

  /** Which component emitted this log */
  readonly component: LogComponent;

  /** Log message */
  readonly message: string;

  /** Optional details (expandable) */
  readonly details?: string;
}

// =============================================================================
// System Status
// =============================================================================

/**
 * Overall system status derived from logs.
 */
export type SystemStatus = 'ok' | 'warning' | 'error';

/**
 * Status badge configuration.
 */
export const STATUS_CONFIG: Record<SystemStatus, { label: string; color: string; borderColor: string }> = {
  ok: { label: 'OK', color: '#0a0a0a', borderColor: '#22c55e' },
  warning: { label: 'Warning', color: '#0a0a0a', borderColor: '#ffaa00' },
  error: { label: 'Error', color: '#0a0a0a', borderColor: '#ff4444' },
};
