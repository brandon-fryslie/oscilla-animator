/**
 * Control Surface Store
 *
 * Observable state for Control Surfaces.
 * Handles control value changes and binding application.
 *
 * Key responsibilities:
 * - Manage surface/section/control state
 * - Apply bindings when control values change
 * - Reset controls to defaults
 * - Randomize chaos controls (seed dice)
 */

import { makeObservable, observable, action, computed } from 'mobx';
import type { RootStore } from '../stores/RootStore';
import type {
  ControlSurface,
//  SurfaceSection,
  SurfaceControl,
  ControlId,
  SectionId,
  Binding,
  ValueMap,
  Combine,
  NumberControl,
//  EnumControl,
//  ToggleControl,
//  XYControl,
//  ColorControl,
} from './types';
import {
  createDefaultSurface,
  isNumberControl,
  isEnumControl,
  isToggleControl,
  isXYControl,
  isColorControl,
  isBindParam,
} from './types';
import { createPRNG } from '../../core/rand';

// =============================================================================
// Value Mapping
// =============================================================================

/**
 * Apply a value map transformation to a raw control value.
 * Order: curve → scale → offset → clamp
 */
export function applyValueMap(value: number, map: ValueMap | undefined): number {
  if (!map) return value;

  let result = value;

  // Apply curve (for normalized values only - skip for now, use at control level)
  // Curve is typically applied at the control UI level, not here

  // Scale
  if (map.scale !== undefined) {
    result *= map.scale;
  }

  // Offset
  if (map.offset !== undefined) {
    result += map.offset;
  }

  // Clamp
  if (map.clamp) {
    result = Math.max(map.clamp[0], Math.min(map.clamp[1], result));
  }

  return result;
}

/**
 * Combine two values using the specified operation.
 */
export function combineValues(
  existing: number,
  incoming: number,
  combine: Combine | undefined
): number {
  if (!combine) {
    // Default: override (last writer wins)
    return incoming;
  }

  switch (combine.op) {
    case 'add':
      return existing + incoming;
    case 'multiply':
      return existing * incoming;
    case 'lerp':
      return existing * (1 - combine.t) + incoming * combine.t;
    case 'min':
      return Math.min(existing, incoming);
    case 'max':
      return Math.max(existing, incoming);
    case 'override':
    default:
      return incoming;
  }
}

// =============================================================================
// Control Surface Store
// =============================================================================

export class ControlSurfaceStore {
  /** The current control surface */
  surface: ControlSurface | null = null;

  /** Reference to the root store (for applying bindings) */
  private rootStore: RootStore;

  /** Tracks which controls are being modulated (for UI display) */
  modulatedControls: Set<ControlId> = new Set();

  /** Deterministic PRNG for seed randomization (seeded from timestamp at creation) */
  private seedPRNG = createPRNG(Date.now() >>> 0);

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      surface: observable.deep,  // Deep observation for nested control values
      modulatedControls: observable,
      setSurface: action,
      updateControlValue: action,
      resetControl: action,
      resetSection: action,
      resetAll: action,
      toggleSection: action,
      randomizeSeed: action,
      allControls: computed,
      controlsBySection: computed,
    });

    // Auto-apply bindings when control values change
    this.setupBindingReactions();
  }

  // ===========================================================================
  // Computed
  // ===========================================================================

  /** Get all controls across all sections */
  get allControls(): SurfaceControl[] {
    if (!this.surface) return [];
    return this.surface.sections.flatMap((s) => s.controls);
  }

  /** Get controls organized by section */
  get controlsBySection(): Map<SectionId, SurfaceControl[]> {
    const map = new Map<SectionId, SurfaceControl[]>();
    if (!this.surface) return map;
    for (const section of this.surface.sections) {
      map.set(section.id, section.controls);
    }
    return map;
  }

  // ===========================================================================
  // Actions
  // ===========================================================================

  /**
   * Set the current control surface.
   */
  setSurface(surface: ControlSurface | null): void {
    this.surface = surface;
    // Apply all bindings when surface is set
    if (surface) {
      this.applyAllBindings();
    }
  }

  /**
   * Update a control's value and apply its bindings.
   */
  updateControlValue(controlId: ControlId, value: unknown): void {
    const control = this.findControl(controlId);
    if (!control) return;

    // Update the control's value based on type
    if (isNumberControl(control)) {
      control.value = value as number;
    } else if (isEnumControl(control)) {
      control.value = value as string;
    } else if (isToggleControl(control)) {
      control.value = value as boolean;
    } else if (isXYControl(control)) {
      const v = value as { x: number; y: number };
      control.x.value = v.x;
      control.y.value = v.y;
    } else if (isColorControl(control)) {
      control.value = value as string;
    }

    // Apply bindings for this control
    this.applyBindings(control);
  }

  /**
   * Reset a single control to its default value.
   */
  resetControl(controlId: ControlId): void {
    const control = this.findControl(controlId);
    if (!control) return;

    if (isNumberControl(control)) {
      control.value = control.default;
    } else if (isEnumControl(control)) {
      control.value = control.default;
    } else if (isToggleControl(control)) {
      control.value = control.default;
    } else if (isXYControl(control)) {
      control.x.value = control.x.default;
      control.y.value = control.y.default;
    } else if (isColorControl(control)) {
      control.value = control.default;
    }

    this.applyBindings(control);
  }

  /**
   * Reset all controls in a section to defaults.
   */
  resetSection(sectionId: SectionId): void {
    const section = this.surface?.sections.find((s) => s.id === sectionId);
    if (!section) return;

    for (const control of section.controls) {
      this.resetControl(control.id);
    }
  }

  /**
   * Reset all controls to defaults.
   */
  resetAll(): void {
    if (!this.surface) return;
    for (const section of this.surface.sections) {
      this.resetSection(section.id);
    }
  }

  /**
   * Toggle section collapsed state.
   */
  toggleSection(sectionId: SectionId): void {
    const section = this.surface?.sections.find((s) => s.id === sectionId);
    if (section) {
      section.collapsed = !section.collapsed;
    }
  }

  /**
   * Randomize seed (dice button on chaos controls).
   *
   * Uses a deterministic PRNG seeded at store creation time (not Math.random()).
   * This ensures export reproducibility while still providing randomness for interactive use.
   *
   * For export: The PRNG seed can be captured and restored to get the same sequence.
   * For interactive use: The seed changes each time, giving varied results.
   */
  randomizeSeed(): void {
    // Find seed control in chaos section
    const chaosSection = this.surface?.sections.find((s) => s.kind === 'chaos');
    if (!chaosSection) return;

    const seedControl = chaosSection.controls.find(
      (c) => c.label.toLowerCase().includes('seed') && isNumberControl(c)
    ) as NumberControl | undefined;

    if (seedControl) {
      // Generate a new random seed using the deterministic PRNG
      // This replaces Math.random() to ensure export determinism
      const range = seedControl.max - seedControl.min;
      const newSeed = Math.floor(this.seedPRNG.next() * range) + seedControl.min;
      this.updateControlValue(seedControl.id, newSeed);
    }
  }

  // ===========================================================================
  // Binding Application
  // ===========================================================================

  /**
   * Apply all bindings for all controls.
   */
  private applyAllBindings(): void {
    for (const control of this.allControls) {
      this.applyBindings(control);
    }
  }

  /**
   * Apply all bindings for a single control.
   */
  private applyBindings(control: SurfaceControl): void {
    for (const binding of control.bindings) {
      this.applyBinding(control, binding);
    }
  }

  /**
   * Apply a single binding from a control.
   */
  private applyBinding(control: SurfaceControl, binding: Binding): void {
    if (!isBindParam(binding)) {
      // Port bindings are more complex - skip for now
      // They would need to create virtual wires or inject values
      console.warn('Port bindings not yet implemented');
      return;
    }

    const { blockId, paramKey } = binding.target;
    const block = this.rootStore.patchStore.blocks.find((b) => b.id === blockId);
    if (!block) {
      // Block might not exist (was deleted, macro changed, etc.)
      return;
    }

    // Get the raw value from the control
    let value: unknown;
    if (isNumberControl(control)) {
      value = applyValueMap(control.value, binding.map);
    } else if (isEnumControl(control)) {
      value = control.value;
    } else if (isToggleControl(control)) {
      value = control.value;
    } else if (isXYControl(control)) {
      // XY controls bind x and y to separate params based on param key name
      // Convention: paramKey ending in 'X' or 'x' uses x value, 'Y' or 'y' uses y value
      const lowerKey = paramKey.toLowerCase();
      if (lowerKey.endsWith('x') || lowerKey.includes('centerx') || lowerKey.includes('startx')) {
        value = control.x.value;
      } else if (lowerKey.endsWith('y') || lowerKey.includes('centery') || lowerKey.includes('starty')) {
        value = control.y.value;
      } else {
        // Fallback: bind as object (for params that expect {x, y})
        value = { x: control.x.value, y: control.y.value };
      }
    } else if (isColorControl(control)) {
      value = control.value;
    } else {
      return;
    }

    // Apply combine logic if there's an existing value
    if (binding.combine && isNumberControl(control)) {
      const existingValue = block.params[paramKey];
      if (typeof existingValue === 'number') {
        value = combineValues(existingValue, value as number, binding.combine);
      }
    }

    // Validate value before updating - prevent NaN from propagating
    if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) {
      console.warn(`ControlSurface: Skipping NaN/Infinity value for ${paramKey}`);
      return;
    }

    // Update the block param using updateBlock instead of non-existent updateBlockParams
    this.rootStore.patchStore.updateBlock(blockId, {
      params: { ...block.params, [paramKey]: value }
    });
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /**
   * Find a control by ID.
   */
  private findControl(controlId: ControlId): SurfaceControl | undefined {
    return this.allControls.find((c) => c.id === controlId);
  }

  /**
   * Set up MobX reactions to apply bindings on value changes.
   * This is called once in constructor.
   */
  private setupBindingReactions(): void {
    // The binding application happens directly in updateControlValue
    // but we could add debouncing or batching here if needed
  }

  // ===========================================================================
  // Surface Generation
  // ===========================================================================

  /**
   * Load a default surface (empty canonical sections).
   */
  loadDefaultSurface(): void {
    this.setSurface(createDefaultSurface());
  }
}
