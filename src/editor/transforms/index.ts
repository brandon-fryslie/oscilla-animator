/**
 * Unified Transform Abstraction
 *
 * This module provides a single abstraction over adapters and lenses,
 * eliminating fragmentation across the compiler and UI.
 *
 * Modules:
 * - types: Core type definitions
 * - normalize: Convert between storage and normalized representations
 * - catalog: Discovery of available transforms
 * - validate: Scope, type, and structural validation
 * - apply: Transform execution engine
 */

export * from './types';
export * from './normalize';
export * from './catalog';
export * from './validate';
export * from './apply';
