/**
 * Control Surface Generators
 *
 * Generates default control surfaces for macro types.
 * Each macro gets a curated set of controls that bind to its blocks.
 *
 * Key principle: Surfaces expose the "interesting dimensions" without
 * overwhelming the user with every possible parameter.
 */

import type { ControlSurface, Binding, SurfaceSection } from './types';
import {
  createSurface,
  createSection,
  createNumberControl,
  createEnumControl,
  createToggleControl,
  createXYControl,
  createColorControl,
} from './types';

/**
 * Generator function signature.
 * Takes block IDs created by the macro expansion and returns a surface.
 */
export type MacroSurfaceGenerator = (blockIds: Map<string, string>) => ControlSurface;

/**
 * Registry of surface generators by macro type.
 */
const generators: Record<string, MacroSurfaceGenerator> = {};

/**
 * Generate a control surface for a macro type.
 * Returns null if no generator is registered.
 */
export function generateSurfaceForMacro(
  macroType: string,
  blockIds: Map<string, string>
): ControlSurface | null {
  const generator = generators[macroType];
  if (!generator) {
    // Return a default surface for unknown macros
    return generateDefaultSurface(macroType, blockIds);
  }
  return generator(blockIds);
}

/**
 * Register a surface generator for a macro type.
 */
export function registerGenerator(macroType: string, generator: MacroSurfaceGenerator): void {
  generators[macroType] = generator;
}

// =============================================================================
// Default Surface Generator
// =============================================================================

/**
 * Generate a basic surface with common controls for unknown macros.
 */
function generateDefaultSurface(macroType: string, blockIds: Map<string, string>): ControlSurface {
  const sections: SurfaceSection[] = [];

  // TIME section - always useful
  const timeSection = createSection('time', 'TIME', [
    createNumberControl(
      'Speed',
      { min: 0.1, max: 3.0, default: 1.0, unit: 'x', curve: 'exp' },
      findPhaseBindings(blockIds, 'timeScale')
    ),
    createNumberControl(
      'Duration',
      { min: 0.5, max: 10, default: 2.5, unit: 's' },
      findPhaseBindings(blockIds, 'entranceDuration')
    ),
    createNumberControl(
      'Stagger',
      { min: 0, max: 0.5, default: 0.08, unit: 's', step: 0.01 },
      findFieldBindings(blockIds, 'LinearStagger', 'baseStagger')
    ),
  ]);
  sections.push(timeSection);

  // MOTION section
  const motionSection = createSection('motion', 'MOTION', [
    createXYControl(
      'Origin',
      {
        x: { min: 0, max: 800, default: 300 },
        y: { min: 0, max: 400, default: 100 },
        boundsHint: 'viewport',
      },
      findFieldBindings(blockIds, 'RadialOrigin', 'centerX', 'centerY')
    ),
    createNumberControl(
      'Spread',
      { min: 0.1, max: 2.0, default: 1.0 },
      findFieldBindings(blockIds, 'RadialOrigin', 'spread')
    ),
  ]);
  sections.push(motionSection);

  // STYLE section
  const styleSection = createSection('style', 'STYLE', [
    createColorControl(
      'Color',
      { default: '#ffffff' },
      findRenderBindings(blockIds, 'fill')
    ),
    createNumberControl(
      'Size',
      { min: 1, max: 20, default: 5, unit: 'px' },
      findRenderBindings(blockIds, 'radius')
    ),
    createToggleControl(
      'Glow',
      true,
      findRenderBindings(blockIds, 'glow')
    ),
  ]);
  sections.push(styleSection);

  // CHAOS section
  const chaosSection = createSection('chaos', 'CHAOS', [
    createNumberControl(
      'Seed',
      { min: 1, max: 9999, default: 42, step: 1 },
      [] // Seed binding needs special handling
    ),
    createNumberControl(
      'Jitter',
      { min: 0, max: 1.0, default: 0.2 },
      findFieldBindings(blockIds, 'LinearStagger', 'jitter')
    ),
  ]);
  sections.push(chaosSection);

  return createSurface(macroType, sections, { macroType });
}

// =============================================================================
// Binding Helpers
// =============================================================================

/**
 * Find bindings for PhaseMachine parameters.
 */
function findPhaseBindings(blockIds: Map<string, string>, paramKey: string): Binding[] {
  const bindings: Binding[] = [];
  Array.from(blockIds.entries()).forEach(([ref, blockId]) => {
    if (ref.toLowerCase().includes('phase')) {
      bindings.push({ target: { blockId, paramKey } });
    }
  });
  return bindings;
}

/**
 * Find bindings for Field block parameters.
 */
function findFieldBindings(
  blockIds: Map<string, string>,
  blockType: string,
  ...paramKeys: string[]
): Binding[] {
  const bindings: Binding[] = [];
  Array.from(blockIds.entries()).forEach(([ref, blockId]) => {
    if (ref.toLowerCase().includes(blockType.toLowerCase())) {
      for (const paramKey of paramKeys) {
        bindings.push({ target: { blockId, paramKey } });
      }
    }
  });
  return bindings;
}

/**
 * Find bindings for Render block parameters.
 */
function findRenderBindings(blockIds: Map<string, string>, paramKey: string): Binding[] {
  const bindings: Binding[] = [];
  Array.from(blockIds.entries()).forEach(([ref, blockId]) => {
    if (ref.toLowerCase().includes('render') || ref.toLowerCase().includes('particle')) {
      bindings.push({ target: { blockId, paramKey } });
    }
  });
  return bindings;
}

// =============================================================================
// Specific Macro Generators
// =============================================================================

/**
 * Surface generator for lineDrawing macro.
 */
registerGenerator('lineDrawing', (blockIds) => {
  return createSurface('Line Drawing', [
    createSection('time', 'TIME', [
      createNumberControl(
        'Speed',
        { min: 0.1, max: 3.0, default: 1.0, unit: 'x', curve: 'exp' },
        findPhaseBindings(blockIds, 'timeScale')
      ),
      createNumberControl(
        'Entrance',
        { min: 0.5, max: 5, default: 2.5, unit: 's' },
        findPhaseBindings(blockIds, 'entranceDuration')
      ),
      createNumberControl(
        'Hold',
        { min: 0, max: 5, default: 1.5, unit: 's' },
        findPhaseBindings(blockIds, 'holdDuration')
      ),
      createNumberControl(
        'Stagger',
        { min: 0, max: 0.3, default: 0.03, unit: 's', step: 0.01 },
        findFieldBindings(blockIds, 'LinearStagger', 'baseStagger')
      ),
    ]),
    createSection('motion', 'MOTION', [
      createXYControl(
        'Origin',
        {
          x: { min: 0, max: 800, default: 300 },
          y: { min: 0, max: 400, default: 100 },
          boundsHint: 'viewport',
        },
        findFieldBindings(blockIds, 'RadialOrigin', 'centerX', 'centerY')
      ),
      createNumberControl(
        'Min Radius',
        { min: 0, max: 400, default: 150, unit: 'px' },
        findFieldBindings(blockIds, 'RadialOrigin', 'minRadius')
      ),
      createNumberControl(
        'Max Radius',
        { min: 100, max: 600, default: 350, unit: 'px' },
        findFieldBindings(blockIds, 'RadialOrigin', 'maxRadius')
      ),
      createNumberControl(
        'Spread',
        { min: 0.1, max: 2.0, default: 1.0 },
        findFieldBindings(blockIds, 'RadialOrigin', 'spread')
      ),
    ]),
    createSection('style', 'STYLE', [
      createColorControl(
        'Particle Color',
        { default: '#ffffff' },
        findRenderBindings(blockIds, 'fill')
      ),
      createNumberControl(
        'Size',
        { min: 1, max: 15, default: 2.5, unit: 'px' },
        findRenderBindings(blockIds, 'radius')
      ),
      createToggleControl(
        'Glow',
        true,
        findRenderBindings(blockIds, 'glow')
      ),
      createNumberControl(
        'Glow Radius',
        { min: 0, max: 30, default: 10, unit: 'px' },
        findRenderBindings(blockIds, 'glowRadius')
      ),
    ]),
    createSection('chaos', 'CHAOS', [
      createNumberControl(
        'Seed',
        { min: 1, max: 9999, default: 42, step: 1 },
        []
      ),
      createNumberControl(
        'Jitter',
        { min: 0, max: 0.5, default: 0.15 },
        findFieldBindings(blockIds, 'LinearStagger', 'jitter')
      ),
    ]),
  ], { macroType: 'lineDrawing' });
});

/**
 * Surface generator for particles macro.
 */
registerGenerator('particles', (blockIds) => {
  return createSurface('Particles', [
    createSection('time', 'TIME', [
      createNumberControl(
        'Speed',
        { min: 0.1, max: 3.0, default: 1.0, unit: 'x', curve: 'exp' },
        findPhaseBindings(blockIds, 'timeScale')
      ),
      createNumberControl(
        'Entrance',
        { min: 0.5, max: 5, default: 2.5, unit: 's' },
        findPhaseBindings(blockIds, 'entranceDuration')
      ),
      createNumberControl(
        'Stagger',
        { min: 0, max: 0.5, default: 0.08, unit: 's', step: 0.01 },
        findFieldBindings(blockIds, 'LinearStagger', 'baseStagger')
      ),
    ]),
    createSection('motion', 'MOTION', [
      createXYControl(
        'Origin',
        {
          x: { min: 0, max: 800, default: 300 },
          y: { min: 0, max: 400, default: 100 },
          boundsHint: 'viewport',
        },
        findFieldBindings(blockIds, 'RadialOrigin', 'centerX', 'centerY')
      ),
      createNumberControl(
        'Spread',
        { min: 0.1, max: 2.0, default: 1.0 },
        findFieldBindings(blockIds, 'RadialOrigin', 'spread')
      ),
    ]),
    createSection('style', 'STYLE', [
      createColorControl(
        'Particle Color',
        { default: '#ffffff' },
        findRenderBindings(blockIds, 'fill')
      ),
      createNumberControl(
        'Size',
        { min: 1, max: 15, default: 5, unit: 'px' },
        findRenderBindings(blockIds, 'radius')
      ),
      createToggleControl(
        'Glow',
        true,
        findRenderBindings(blockIds, 'glow')
      ),
    ]),
    createSection('chaos', 'CHAOS', [
      createNumberControl(
        'Seed',
        { min: 1, max: 9999, default: 42, step: 1 },
        []
      ),
      createNumberControl(
        'Jitter',
        { min: 0, max: 1.0, default: 0.2 },
        findFieldBindings(blockIds, 'LinearStagger', 'jitter')
      ),
    ]),
  ], { macroType: 'particles' });
});

/**
 * Surface generator for radialBurst macro.
 */
registerGenerator('radialBurst', (blockIds) => {
  return createSurface('Radial Burst', [
    createSection('time', 'TIME', [
      createNumberControl(
        'Speed',
        { min: 0.1, max: 3.0, default: 1.0, unit: 'x', curve: 'exp' },
        findPhaseBindings(blockIds, 'timeScale')
      ),
      createNumberControl(
        'Entrance',
        { min: 0.5, max: 5, default: 2.5, unit: 's' },
        findPhaseBindings(blockIds, 'entranceDuration')
      ),
      createNumberControl(
        'Hold',
        { min: 0, max: 5, default: 2.0, unit: 's' },
        findPhaseBindings(blockIds, 'holdDuration')
      ),
      createNumberControl(
        'Stagger',
        { min: 0, max: 0.3, default: 0.05, unit: 's', step: 0.01 },
        findFieldBindings(blockIds, 'LinearStagger', 'baseStagger')
      ),
    ]),
    createSection('motion', 'MOTION', [
      createEnumControl(
        'Mode',
        {
          options: ['radial', 'cascade', 'diagonal'] as const,
          default: 'radial',
          presentation: 'segmented',
        },
        []
      ),
      createXYControl(
        'Origin',
        {
          x: { min: 0, max: 800, default: 300 },
          y: { min: 0, max: 400, default: 100 },
          boundsHint: 'viewport',
        },
        findFieldBindings(blockIds, 'RadialOrigin', 'centerX', 'centerY')
      ),
      createNumberControl(
        'Min Radius',
        { min: 0, max: 300, default: 200, unit: 'px' },
        findFieldBindings(blockIds, 'RadialOrigin', 'minRadius')
      ),
      createNumberControl(
        'Max Radius',
        { min: 200, max: 800, default: 400, unit: 'px' },
        findFieldBindings(blockIds, 'RadialOrigin', 'maxRadius')
      ),
    ]),
    createSection('style', 'STYLE', [
      createColorControl(
        'Color',
        { default: '#ffffff' },
        findRenderBindings(blockIds, 'fill')
      ),
      createNumberControl(
        'Size',
        { min: 1, max: 15, default: 2.5, unit: 'px' },
        findRenderBindings(blockIds, 'radius')
      ),
      createToggleControl(
        'Glow',
        true,
        findRenderBindings(blockIds, 'glow')
      ),
      createNumberControl(
        'Glow Size',
        { min: 0, max: 30, default: 10, unit: 'px' },
        findRenderBindings(blockIds, 'glowRadius')
      ),
    ]),
    createSection('chaos', 'CHAOS', [
      createNumberControl(
        'Seed',
        { min: 1, max: 9999, default: 42, step: 1 },
        []
      ),
      createNumberControl(
        'Jitter',
        { min: 0, max: 0.5, default: 0.15 },
        findFieldBindings(blockIds, 'LinearStagger', 'jitter')
      ),
    ]),
  ], { macroType: 'radialBurst' });
});

/**
 * Surface generator for cascade macro.
 */
registerGenerator('cascade', (blockIds) => {
  return createSurface('Cascade', [
    createSection('time', 'TIME', [
      createNumberControl(
        'Speed',
        { min: 0.1, max: 3.0, default: 1.0, unit: 'x', curve: 'exp' },
        findPhaseBindings(blockIds, 'timeScale')
      ),
      createNumberControl(
        'Duration',
        { min: 0.5, max: 5, default: 2.5, unit: 's' },
        findPhaseBindings(blockIds, 'entranceDuration')
      ),
      createNumberControl(
        'Stagger',
        { min: 0, max: 0.3, default: 0.05, unit: 's', step: 0.01 },
        findFieldBindings(blockIds, 'LinearStagger', 'baseStagger')
      ),
    ]),
    createSection('motion', 'MOTION', [
      createNumberControl(
        'Drop Height',
        { min: -500, max: 0, default: -150, unit: 'px' },
        findFieldBindings(blockIds, 'TopDropOrigin', 'dropHeight')
      ),
      createNumberControl(
        'X Spread',
        { min: 0.1, max: 2, default: 1.0 },
        findFieldBindings(blockIds, 'TopDropOrigin', 'xSpread')
      ),
    ]),
    createSection('style', 'STYLE', [
      createColorControl(
        'Color',
        { default: '#ffffff' },
        findRenderBindings(blockIds, 'fill')
      ),
      createNumberControl(
        'Size',
        { min: 1, max: 15, default: 3, unit: 'px' },
        findRenderBindings(blockIds, 'radius')
      ),
      createToggleControl(
        'Glow',
        true,
        findRenderBindings(blockIds, 'glow')
      ),
    ]),
    createSection('chaos', 'CHAOS', [
      createNumberControl(
        'Seed',
        { min: 1, max: 9999, default: 42, step: 1 },
        []
      ),
      createNumberControl(
        'Height Variation',
        { min: 0, max: 100, default: 50, unit: 'px' },
        findFieldBindings(blockIds, 'TopDropOrigin', 'heightVariation')
      ),
    ]),
  ], { macroType: 'cascade' });
});

/**
 * Surface generator for nebula macro.
 */
registerGenerator('nebula', (blockIds) => {
  return createSurface('Nebula', [
    createSection('time', 'TIME', [
      createNumberControl(
        'Speed',
        { min: 0.1, max: 3.0, default: 1.0, unit: 'x', curve: 'exp' },
        findPhaseBindings(blockIds, 'timeScale')
      ),
      createNumberControl(
        'Duration',
        { min: 1, max: 10, default: 4, unit: 's' },
        findPhaseBindings(blockIds, 'entranceDuration')
      ),
    ]),
    createSection('motion', 'MOTION', [
      createXYControl(
        'Origin',
        {
          x: { min: 0, max: 800, default: 400 },
          y: { min: 0, max: 600, default: 300 },
          boundsHint: 'viewport',
        },
        findFieldBindings(blockIds, 'RadialOrigin', 'centerX', 'centerY')
      ),
      createNumberControl(
        'Spread',
        { min: 0.5, max: 3.0, default: 1.5 },
        findFieldBindings(blockIds, 'RadialOrigin', 'spread')
      ),
    ]),
    createSection('style', 'STYLE', [
      createEnumControl(
        'Palette',
        {
          options: ['rainbow', 'cosmic', 'fire', 'ice'] as const,
          default: 'rainbow',
          presentation: 'segmented',
        },
        []
      ),
      createNumberControl(
        'Min Size',
        { min: 1, max: 10, default: 3, unit: 'px' },
        findRenderBindings(blockIds, 'minRadius')
      ),
      createNumberControl(
        'Max Size',
        { min: 5, max: 20, default: 12, unit: 'px' },
        findRenderBindings(blockIds, 'maxRadius')
      ),
      createToggleControl(
        'Glow',
        true,
        findRenderBindings(blockIds, 'glow')
      ),
    ]),
    createSection('chaos', 'CHAOS', [
      createNumberControl(
        'Seed',
        { min: 1, max: 9999, default: 42, step: 1 },
        []
      ),
      createNumberControl(
        'Size Variation',
        { min: 0, max: 1, default: 0.5 },
        findFieldBindings(blockIds, 'SizeVariation', 'variation')
      ),
    ]),
  ], { macroType: 'nebula' });
});

/**
 * Surface generator for glitchStorm macro.
 */
registerGenerator('glitchStorm', (blockIds) => {
  return createSurface('Glitch Storm', [
    createSection('time', 'TIME', [
      createNumberControl(
        'Speed',
        { min: 0.1, max: 3.0, default: 1.0, unit: 'x', curve: 'exp' },
        findPhaseBindings(blockIds, 'timeScale')
      ),
      createNumberControl(
        'Duration',
        { min: 0.5, max: 5, default: 2, unit: 's' },
        findPhaseBindings(blockIds, 'entranceDuration')
      ),
    ]),
    createSection('motion', 'MOTION', [
      createNumberControl(
        'Cell Width',
        { min: 20, max: 100, default: 50, unit: 'px' },
        findFieldBindings(blockIds, 'GridPositions', 'cellWidth')
      ),
      createNumberControl(
        'Cell Height',
        { min: 20, max: 100, default: 50, unit: 'px' },
        findFieldBindings(blockIds, 'GridPositions', 'cellHeight')
      ),
      createNumberControl(
        'Jitter',
        { min: 0, max: 30, default: 10, unit: 'px' },
        findFieldBindings(blockIds, 'GridPositions', 'jitter')
      ),
    ]),
    createSection('style', 'STYLE', [
      createColorControl(
        'Primary Color',
        { default: '#00ff00' },
        findRenderBindings(blockIds, 'fill')
      ),
      createNumberControl(
        'Size',
        { min: 2, max: 20, default: 6, unit: 'px' },
        findRenderBindings(blockIds, 'radius')
      ),
      createNumberControl(
        'RGB Split',
        { min: 0, max: 20, default: 3, unit: 'px' },
        findFieldBindings(blockIds, 'RGBSplitFilter', 'redOffsetX')
      ),
    ]),
    createSection('chaos', 'CHAOS', [
      createNumberControl(
        'Seed',
        { min: 1, max: 9999, default: 42, step: 1 },
        []
      ),
      createNumberControl(
        'Glitch Intensity',
        { min: 0, max: 1, default: 0.5 },
        []
      ),
    ]),
  ], { macroType: 'glitchStorm' });
});
