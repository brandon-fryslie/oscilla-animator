/**
 * Shared helpers for block compilers.
 */

import type { Artifact } from '../types';

/**
 * Type-safe artifact extraction with error messages.
 */
export function expect<A extends Artifact['kind']>(
  a: Artifact,
  kind: A,
  who: string
): Extract<Artifact, { kind: A }> {
  if (a.kind !== kind) throw new Error(`${who}: expected ${kind}, got ${a.kind}`);
  return a as Extract<Artifact, { kind: A }>;
}

/**
 * Extract scalar number from artifact with error context.
 */
export function scalarNum(a: Artifact, who: string): number {
  return expect(a, 'Scalar:number', who).value;
}

/**
 * Clamp a value to [0, 1].
 */
export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Linear interpolation.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Easing: ease out cubic.
 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Easing: ease in cubic.
 */
export function easeInCubic(t: number): number {
  return t * t * t;
}

/**
 * Easing: ease in out cubic.
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Easing: ease out quad.
 */
export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/**
 * Easing: ease in quad.
 */
export function easeInQuad(t: number): number {
  return t * t;
}

/**
 * Easing: ease in out quad.
 */
export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Easing: ease out elastic.
 */
export function easeOutElastic(t: number): number {
  const c4 = (2 * Math.PI) / 3;
  return t === 0
    ? 0
    : t === 1
      ? 1
      : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

/**
 * Get easing function by name.
 */
export function getEasing(name: string): (t: number) => number {
  switch (name) {
    case 'linear':
      return (t) => t;
    case 'easeInQuad':
      return easeInQuad;
    case 'easeOutQuad':
      return easeOutQuad;
    case 'easeInOutQuad':
      return easeInOutQuad;
    case 'easeOutCubic':
      return easeOutCubic;
    case 'easeInCubic':
      return easeInCubic;
    case 'easeInOutCubic':
      return easeInOutCubic;
    case 'easeOutElastic':
      return easeOutElastic;
    default:
      return (t) => t;
  }
}
