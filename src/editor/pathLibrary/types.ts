/**
 * Path Library Types
 *
 * Types for the extensible SVG path library system.
 */

import type { LineData } from '../../data/pathData';

/**
 * Source type for a path entry
 */
export type PathSource = 'builtin' | 'imported' | 'pasted';

/**
 * A single path entry in the library
 */
export interface PathEntry {
  /** Unique identifier (e.g., 'builtin:logo', 'user:abc123') */
  id: string;

  /** Display name shown in UI */
  name: string;

  /** How this path was added to the library */
  source: PathSource;

  /** The actual path data - array of line segments */
  data: LineData[];

  /** SVG string for thumbnail preview */
  thumbnail?: string;

  /** When this entry was created */
  createdAt: number;

  /** Optional metadata */
  meta?: {
    /** Original filename if imported from file */
    originalFile?: string;
    /** SVG viewBox for proper scaling */
    viewBox?: string;
    /** User-provided description */
    description?: string;
    /** Original SVG string (for re-export) */
    originalSVG?: string;
  };
}

/**
 * The complete state of the path library
 */
export interface PathLibraryState {
  /** All path entries (builtins + user-added) */
  entries: PathEntry[];

  /** Currently selected path ID for new blocks */
  activeId: string | null;
}

/**
 * Events emitted by the path library
 */
export type PathLibraryEvent =
  | { type: 'added'; entry: PathEntry }
  | { type: 'removed'; id: string }
  | { type: 'updated'; entry: PathEntry }
  | { type: 'activeChanged'; id: string | null };

/**
 * Listener callback for library changes
 */
export type PathLibraryListener = (event: PathLibraryEvent) => void;
