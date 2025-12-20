/**
 * Control Surface Module Index
 *
 * A Control Surface is a curated set of high-leverage controls that bind to
 * parameters and/or ports in the underlying patch.
 *
 * Key exports:
 * - Types for Control Surface, Controls, Bindings
 * - ControlSurfaceStore for state management
 * - ControlSurfacePanel for UI
 * - Factory functions for creating surfaces
 */

// Types
export * from './types';

// Store
export { ControlSurfaceStore, applyValueMap, combineValues } from './store';

// UI Components
export { ControlSurfacePanel } from './ControlSurfacePanel';

// Surface generators (for macros)
export { generateSurfaceForMacro, type MacroSurfaceGenerator } from './generators';
