/**
 * Path Library Storage
 *
 * localStorage persistence for user-added paths.
 */

import type { PathLibraryState, PathEntry } from './types';

const STORAGE_KEY = 'loom99-path-library';

/**
 * Stored format (without built-ins)
 */
interface StoredLibrary {
  version: number;
  entries: PathEntry[];
  activeId: string | null;
}

/**
 * Save the library state to localStorage
 * Note: Only saves user paths, not built-ins
 */
export function saveLibrary(state: Pick<PathLibraryState, 'entries' | 'activeId'>): void {
  try {
    const stored: StoredLibrary = {
      version: 1,
      entries: state.entries,
      activeId: state.activeId,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch (err) {
    console.error('PathLibrary: Failed to save to localStorage:', err);
  }
}

/**
 * Load the library state from localStorage
 * Returns null if nothing stored or invalid
 */
export function loadLibrary(): Pick<PathLibraryState, 'entries' | 'activeId'> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null || raw === undefined || raw === '') return null;

    const stored = JSON.parse(raw) as StoredLibrary;

    // Version check for future migrations
    if (stored.version !== 1) {
      console.warn('PathLibrary: Unknown storage version, ignoring');
      return null;
    }

    // Validate entries structure
    if (!Array.isArray(stored.entries)) {
      console.warn('PathLibrary: Invalid stored entries');
      return null;
    }

    // Filter out any invalid entries
    const validEntries = stored.entries.filter(entry =>
      entry !== null &&
      entry !== undefined &&
      typeof entry.id === 'string' &&
      typeof entry.name === 'string' &&
      Array.isArray(entry.data)
    );

    return {
      entries: validEntries,
      activeId: stored.activeId,
    };
  } catch (err) {
    console.error('PathLibrary: Failed to load from localStorage:', err);
    return null;
  }
}

/**
 * Clear all stored path library data
 */
export function clearLibrary(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('PathLibrary: Failed to clear localStorage:', err);
  }
}
