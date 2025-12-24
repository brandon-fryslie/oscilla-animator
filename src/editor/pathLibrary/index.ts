/**
 * Path Library
 *
 * Extensible SVG path library for the animation editor.
 * Manages built-in paths, user imports, and persistence.
 */

import { makeAutoObservable, runInAction } from 'mobx';
import type { PathEntry, PathLibraryState, PathLibraryEvent, PathLibraryListener } from './types';
import type { LineData } from '../../data/pathData';
import { getBuiltinPaths } from './builtins';
import { loadLibrary, saveLibrary } from './storage';
import { parseSVGString, validateSVG } from './parser';
import { generateThumbnail } from './thumbnail';

const DEFAULT_VIEWBOX = '0 0 600 200';

/**
 * PathLibrary - singleton service for managing SVG paths
 */
class PathLibrary {
  private state: PathLibraryState = {
    entries: [],
    activeId: null,
  };

  private listeners: Set<PathLibraryListener> = new Set();
  private initialized = false;

  constructor() {
    makeAutoObservable(this, {
      // Mark private fields as non-observable
    });
  }

  /**
   * Initialize the library - loads builtins and persisted user paths
   */
  init(): void {
    if (this.initialized) return;

    // Load built-in paths
    const builtins = getBuiltinPaths();

    // Load user paths from localStorage
    const stored = loadLibrary();
    const userPaths = stored?.entries.filter(e => e.source !== 'builtin') ?? [];

    runInAction(() => {
      this.state.entries = [...builtins, ...userPaths];
      this.state.activeId = stored?.activeId ?? 'builtin:logo';
      this.initialized = true;
    });
  }

  /**
   * Get all path entries
   */
  getAll(): readonly PathEntry[] {
    return this.state.entries;
  }

  /**
   * Get built-in paths only
   */
  getBuiltins(): readonly PathEntry[] {
    return this.state.entries.filter(e => e.source === 'builtin');
  }

  /**
   * Get user-added paths only
   */
  getUserPaths(): readonly PathEntry[] {
    return this.state.entries.filter(e => e.source !== 'builtin');
  }

  /**
   * Get a path by ID
   */
  getById(id: string): PathEntry | null {
    return this.state.entries.find(e => e.id === id) ?? null;
  }

  /**
   * Get the currently active path ID
   */
  getActiveId(): string | null {
    return this.state.activeId;
  }

  /**
   * Set the active path ID
   */
  setActiveId(id: string | null): void {
    if (id !== null && !this.getById(id)) {
      console.warn(`PathLibrary: Cannot set active ID to unknown path: ${id}`);
      return;
    }

    runInAction(() => {
      this.state.activeId = id;
    });

    this.emit({ type: 'activeChanged', id });
    this.persist();
  }

  /**
   * Add a new path entry
   */
  add(entry: Omit<PathEntry, 'id' | 'createdAt'>): PathEntry {
    const id = entry.source === 'builtin'
      ? `builtin:${entry.name.toLowerCase().replace(/\s+/g, '-')}`
      : `user:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const newEntry: PathEntry = {
      ...entry,
      id,
      createdAt: Date.now(),
    };

    runInAction(() => {
      this.state.entries.push(newEntry);
    });

    this.emit({ type: 'added', entry: newEntry });
    this.persist();

    return newEntry;
  }

  /**
   * Remove a path entry by ID
   * Note: Cannot remove built-in paths
   */
  remove(id: string): boolean {
    const entry = this.getById(id);
    if (!entry) return false;

    if (entry.source === 'builtin') {
      console.warn('PathLibrary: Cannot remove built-in paths');
      return false;
    }

    runInAction(() => {
      this.state.entries = this.state.entries.filter(e => e.id !== id);

      // If we removed the active path, reset to default
      if (this.state.activeId === id) {
        this.state.activeId = 'builtin:logo';
      }
    });

    this.emit({ type: 'removed', id });
    this.persist();

    return true;
  }

  /**
   * Update a path entry
   */
  update(id: string, updates: Partial<Omit<PathEntry, 'id' | 'source' | 'createdAt'>>): PathEntry | null {
    const index = this.state.entries.findIndex(e => e.id === id);
    if (index === -1) return null;

    const entry = this.state.entries[index];

    // Cannot update built-in paths (except name for display)
    if (entry.source === 'builtin' && Object.keys(updates).some(k => k !== 'name')) {
      console.warn('PathLibrary: Cannot modify built-in path data');
      return null;
    }

    const updated: PathEntry = { ...entry, ...updates };

    runInAction(() => {
      this.state.entries[index] = updated;
    });

    this.emit({ type: 'updated', entry: updated });
    this.persist();

    return updated;
  }

  /**
   * Export a path entry as JSON string
   */
  exportAsJSON(id: string): string | null {
    const entry = this.getById(id);
    if (!entry) return null;

    return JSON.stringify({
      name: entry.name,
      data: entry.data,
      meta: entry.meta,
      thumbnail: entry.thumbnail,
    }, null, 2);
  }

  /**
   * Import a path from an SVG string (paste from clipboard)
   */
  importFromString(svgString: string, name?: string): { success: boolean; entry?: PathEntry; error?: string } {
    // Validate first
    const validation = validateSVG(svgString);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Parse the SVG
    const result = parseSVGString(svgString);
    if (!result.success || result.data.length === 0) {
      return {
        success: false,
        error: result.errors.length > 0
          ? result.errors.join('; ')
          : 'No valid paths found in SVG'
      };
    }

    // Create the entry
    const entryName = this.ensureUniqueName((name !== undefined && name !== null && name !== '') ? name : `Imported ${new Date().toLocaleTimeString()}`);
    const viewBox = (result.viewBox !== undefined && result.viewBox !== null && result.viewBox !== '') ? result.viewBox : DEFAULT_VIEWBOX;
    const entry = this.add({
      name: entryName,
      source: 'pasted',
      data: result.data,
      thumbnail: generateThumbnail(result.data, viewBox),
      meta: {
        viewBox,
        originalSVG: svgString,
      },
    });

    return { success: true, entry };
  }

  /**
   * Import a path from JSON string (exported from another user)
   */
  importFromJSON(jsonString: string): { success: boolean; entry?: PathEntry; error?: string } {
    try {
      const parsed = JSON.parse(jsonString) as unknown;

      // Type guard for parsed JSON
      if (typeof parsed !== 'object' || parsed === null) {
        return { success: false, error: 'Invalid JSON format: not an object' };
      }

      const parsedObj = parsed as Record<string, unknown>;

      // Validate structure
      if (typeof parsedObj.name !== 'string' || parsedObj.name === '' || !Array.isArray(parsedObj.data)) {
        return { success: false, error: 'Invalid JSON format: missing name or data' };
      }

      // Validate data array
      if (parsedObj.data.length === 0) {
        return { success: false, error: 'Invalid JSON format: data array is empty' };
      }

      const meta = (parsedObj.meta !== undefined && parsedObj.meta !== null && typeof parsedObj.meta === 'object') ? parsedObj.meta as Record<string, unknown> : {};
      const viewBox = (typeof meta.viewBox === 'string' && meta.viewBox !== '') ? meta.viewBox : DEFAULT_VIEWBOX;
      const name = this.ensureUniqueName(parsedObj.name);
      // parsedObj.data validated as Array above; runtime structure is user-provided JSON
      const validatedData: LineData[] = parsedObj.data as LineData[];
      const thumbnail = (typeof parsedObj.thumbnail === 'string') ? parsedObj.thumbnail : generateThumbnail(validatedData, viewBox);

      // Create the entry
      const entry = this.add({
        name,
        source: 'imported',
        data: validatedData,
        thumbnail,
        meta: { ...meta, viewBox },
      });

      return { success: true, entry };
    } catch (err) {
      return {
        success: false,
        error: `JSON parse error: ${err instanceof Error ? err.message : 'Invalid JSON'}`
      };
    }
  }

  /**
   * Subscribe to library changes
   */
  subscribe(listener: PathLibraryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: PathLibraryEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (err) {
        console.error('PathLibrary listener error:', err);
      }
    });
  }

  /**
   * Ensure path names remain unique for display
   */
  private ensureUniqueName(baseName: string): string {
    const names = this.state.entries.map(e => e.name);
    if (!names.includes(baseName)) return baseName;

    let counter = 2;
    while (names.includes(`${baseName} ${counter}`)) {
      counter++;
    }

    return `${baseName} ${counter}`;
  }

  /**
   * Persist user paths to localStorage
   */
  private persist(): void {
    // Only persist user paths (builtins are recreated on load)
    const userEntries = this.state.entries.filter(e => e.source !== 'builtin');
    saveLibrary({
      entries: userEntries,
      activeId: this.state.activeId,
    });
  }
}

// Singleton instance
export const pathLibrary = new PathLibrary();

// Auto-initialize on import
pathLibrary.init();

// Re-export types
export type { PathEntry, PathLibraryState, PathSource } from './types';
