/**
 * Log Store (MobX)
 *
 * Observable state for the editor's logging system.
 * Manages log entries, filters, and system status.
 */

import { makeObservable, observable, action, computed } from 'mobx';
import type {
  LogEntry,
  LogLevel,
  LogComponent,
  SystemStatus,
} from './logTypes';
import { LOG_COMPONENTS } from './logTypes';

/**
 * Maximum number of log entries to keep (prevents memory bloat).
 */
const MAX_LOG_ENTRIES = 500;

/**
 * LogStore manages log entries and filtering.
 */
export class LogStore {
  // =============================================================================
  // Observable State
  // =============================================================================

  /** All log entries (newest first) */
  entries: LogEntry[] = [];

  /** Enabled log levels (visible in UI) */
  enabledLevels: Set<LogLevel> = new Set(['info', 'warning', 'error']);

  /** Enabled components (visible in UI) */
  enabledComponents: Set<LogComponent> = new Set(LOG_COMPONENTS);

  /** Auto-scroll to newest entry */
  autoScroll: boolean = true;

  /** Auto-clear logs when a macro is loaded */
  autoClearOnMacro: boolean = true;

  /** ID counter */
  private nextId = 1;

  // =============================================================================
  // Constructor
  // =============================================================================

  constructor() {
    makeObservable(this, {
      entries: observable,
      enabledLevels: observable,
      enabledComponents: observable,
      autoScroll: observable,
      autoClearOnMacro: observable,
      log: action,
      debug: action,
      info: action,
      warn: action,
      error: action,
      clear: action,
      toggleLevel: action,
      setLevels: action,
      toggleComponent: action,
      setComponents: action,
      setAutoScroll: action,
      setAutoClearOnMacro: action,
      filteredEntries: computed,
      status: computed,
      errorCount: computed,
      warningCount: computed,
      recentErrors: computed,
    });

    // Initial log
    this.info('system', 'Editor initialized');
  }

  // =============================================================================
  // Computed Values
  // =============================================================================

  /**
   * Entries filtered by enabled levels and components.
   */
  get filteredEntries(): LogEntry[] {
    return this.entries.filter(
      (entry) =>
        this.enabledLevels.has(entry.level) &&
        this.enabledComponents.has(entry.component)
    );
  }

  /**
   * Current system status based on recent errors/warnings.
   * Looks at last 30 seconds of logs.
   */
  get status(): SystemStatus {
    const thirtySecondsAgo = new Date(Date.now() - 30_000);

    const recentEntries = this.entries.filter(
      (e) => e.timestamp > thirtySecondsAgo
    );

    const hasError = recentEntries.some((e) => e.level === 'error');
    const hasWarning = recentEntries.some((e) => e.level === 'warning');

    if (hasError) return 'error';
    if (hasWarning) return 'warning';
    return 'ok';
  }

  /**
   * Total error count in all entries.
   */
  get errorCount(): number {
    return this.entries.filter((e) => e.level === 'error').length;
  }

  /**
   * Total warning count in all entries.
   */
  get warningCount(): number {
    return this.entries.filter((e) => e.level === 'warning').length;
  }

  /**
   * Most recent errors (for status badge popup).
   */
  get recentErrors(): LogEntry[] {
    return this.entries
      .filter((e) => e.level === 'error' || e.level === 'warning')
      .slice(0, 5);
  }

  // =============================================================================
  // Actions - Logging
  // =============================================================================

  /**
   * Add a log entry.
   */
  log(level: LogLevel, component: LogComponent, message: string, details?: string): void {
    const entry: LogEntry = {
      id: `log-${this.nextId++}`,
      timestamp: new Date(),
      level,
      component,
      message,
      details,
    };

    // Add to front (newest first)
    this.entries.unshift(entry);

    // Trim if too many entries
    if (this.entries.length > MAX_LOG_ENTRIES) {
      this.entries.pop();
    }
  }

  /**
   * Log debug message.
   */
  debug(component: LogComponent, message: string, details?: string): void {
    this.log('debug', component, message, details);
  }

  /**
   * Log info message.
   */
  info(component: LogComponent, message: string, details?: string): void {
    this.log('info', component, message, details);
  }

  /**
   * Log warning message.
   */
  warn(component: LogComponent, message: string, details?: string): void {
    this.log('warning', component, message, details);
  }

  /**
   * Log error message.
   */
  error(component: LogComponent, message: string, details?: string): void {
    this.log('error', component, message, details);
  }

  /**
   * Clear all log entries.
   */
  clear(): void {
    this.entries = [];
    this.nextId = 1;
  }

  // =============================================================================
  // Actions - Filtering
  // =============================================================================

  /**
   * Toggle a log level on/off.
   */
  toggleLevel(level: LogLevel): void {
    if (this.enabledLevels.has(level)) {
      this.enabledLevels.delete(level);
    } else {
      this.enabledLevels.add(level);
    }
  }

  /**
   * Set all enabled levels at once.
   */
  setLevels(levels: LogLevel[]): void {
    this.enabledLevels = new Set(levels);
  }

  /**
   * Toggle a component on/off.
   */
  toggleComponent(component: LogComponent): void {
    if (this.enabledComponents.has(component)) {
      this.enabledComponents.delete(component);
    } else {
      this.enabledComponents.add(component);
    }
  }

  /**
   * Set all enabled components at once.
   */
  setComponents(components: LogComponent[]): void {
    this.enabledComponents = new Set(components);
  }

  /**
   * Toggle auto-scroll.
   */
  setAutoScroll(enabled: boolean): void {
    this.autoScroll = enabled;
  }

  /**
   * Toggle auto-clear on macro load.
   */
  setAutoClearOnMacro(enabled: boolean): void {
    this.autoClearOnMacro = enabled;
  }
}

/**
 * Singleton log store instance.
 * Use this for logging from anywhere in the editor.
 */
export const logStore = new LogStore();
