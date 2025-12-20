import type { Slot, SlotType, ParamSchema } from './types';
import { pathLibrary } from '../pathLibrary';

export function input(id: string, label: string, type: SlotType): Slot {
  return { id, label, type, direction: 'input' };
}

export function output(id: string, label: string, type: SlotType): Slot {
  return { id, label, type, direction: 'output' };
}

// =============================================================================
// Common Parameter Schemas
// =============================================================================

/**
 * Create a number parameter schema with common configuration
 */
export function numberParam(key: string, label: string, config: {
  min?: number;
  max?: number;
  step?: number;
  defaultValue: number;
}): ParamSchema {
  return {
    key,
    label,
    type: 'number',
    min: config.min,
    max: config.max,
    step: config.step || 1,
    defaultValue: config.defaultValue,
  };
}

/**
 * Create a coordinate parameter schema (X or Y)
 */
export function coordinateParam(key: string, label: string, defaultValue: number, config: {
  min?: number;
  max?: number;
  step?: number;
} = {}): ParamSchema {
  return numberParam(key, label, {
    min: config.min ?? -1000,
    max: config.max ?? 1000,
    step: config.step ?? 10,
    defaultValue,
  });
}

/**
 * Create a radius parameter schema
 */
export function radiusParam(key: string, label: string, defaultValue: number, config: {
  min?: number;
  max?: number;
  step?: number;
} = {}): ParamSchema {
  return numberParam(key, label, {
    min: config.min ?? 0,
    max: config.max ?? 1000,
    step: config.step ?? 10,
    defaultValue,
  });
}

/**
 * Create a percentage parameter schema (0-1, or 0-100)
 */
export function percentageParam(key: string, label: string, defaultValue: number, config: {
  asPercent?: boolean; // if true, 0-100 range; if false, 0-1 range
  step?: number;
} = {}): ParamSchema {
  const asPercent = config.asPercent ?? false;
  return numberParam(key, label, {
    min: 0,
    max: asPercent ? 100 : 1,
    step: config.step ?? (asPercent ? 1 : 0.01),
    defaultValue,
  });
}

/**
 * Common parameter schemas for frequently used patterns
 */
export const COMMON_PARAMS = {
  // Position/coordinate parameters
  centerX: coordinateParam('centerX', 'Center X', 300, { min: 0, max: 800 }),
  centerY: coordinateParam('centerY', 'Center Y', 100, { min: 0, max: 400 }),

  // Radius parameters
  minRadius: radiusParam('minRadius', 'Min Radius', 200, { max: 500 }),
  maxRadius: radiusParam('maxRadius', 'Max Radius', 400, { max: 800 }),

  // Size parameters
  width: coordinateParam('width', 'Width', 800, { min: 10, max: 2000 }),
  height: coordinateParam('height', 'Height', 600, { min: 10, max: 2000 }),

  // Timing parameters
  baseStagger: numberParam('baseStagger', 'Base Stagger (s)', {
    min: 0,
    max: 0.5,
    step: 0.01,
    defaultValue: 0.08,
  }),

  jitter: percentageParam('jitter', 'Jitter', 0.2),
  spread: numberParam('spread', 'Spread', { min: 0.1, max: 2.0, step: 0.1, defaultValue: 1.0 }),

  // Range parameters
  angleSpread: numberParam('angleSpread', 'Angle Spread', {
    min: 0,
    max: 360,
    step: 10,
    defaultValue: 360,
  }),
} as const;

/**
 * Get dropdown options from the path library.
 * Called at module load and whenever paths change.
 */
export function getPathOptions(): readonly { value: string; label: string }[] {
  return pathLibrary.getAll().map(entry => ({
    value: entry.id,
    label: entry.name,
  }));
}
