export * from './LensRegistry';
export * from './lensResolution';

// Placeholder for easing names - should be moved to a central geometry/math module
export function getEasingNames(): string[] {
  return [
    'linear',
    'easeInQuad',
    'easeOutQuad',
    'easeInOutQuad',
    'easeInSine',
    'easeOutSine',
    'easeInOutSine',
    'easeInExpo',
    'easeOutExpo',
    'easeInOutExpo',
    'easeInElastic',
    'easeOutElastic',
    'easeInOutElastic',
    'easeInBounce',
    'easeOutBounce',
    'easeInOutBounce'
  ];
}

// Placeholder for applyLens if needed by legacy code
export function applyLens(value: unknown, lens: any): unknown {
  return value; // Implementation moved to LensRegistry and runtime
}

export function isValidLensType(type: string): boolean {
  return true; // Use LensRegistry.getLens(type) in production
}
