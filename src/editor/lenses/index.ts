import type { Artifact } from '../compiler/types';
import type { LensDefinition, TypeDesc } from '../types';
import { getLens } from './LensRegistry';

export * from './LensRegistry';
export * from './lensResolution';
export * from './easing';

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

function paramToArtifact(type: TypeDesc, value: unknown): Artifact {
  if (type.world === 'scalar') {
    switch (type.domain) {
      case 'number':
        return { kind: 'Scalar:number', value: Number(value) };
      case 'boolean':
        return { kind: 'Scalar:boolean', value: Boolean(value) };
      case 'vec2':
        return { kind: 'Scalar:vec2', value: value as { x: number; y: number } };
      case 'color':
        return { kind: 'Scalar:color', value };
      case 'string':
        return { kind: 'Scalar:string', value: String(value) };
      default:
        return { kind: 'Error', message: `Unsupported scalar type: ${type.domain}` };
    }
  }
  if (type.world === 'signal') {
    switch (type.domain) {
      case 'number':
        return { kind: 'Signal:number', value: () => Number(value) };
      case 'phase':
        return { kind: 'Signal:phase', value: () => Number(value) };
      case 'vec2':
        return { kind: 'Signal:vec2', value: () => value as { x: number; y: number } };
      case 'color':
        return { kind: 'Signal:color', value: () => String(value) };
      default:
        return { kind: 'Error', message: `Unsupported signal type: ${type.domain}` };
    }
  }
  return { kind: 'Error', message: `Unsupported param type: ${type.world}:${type.domain}` };
}

export function applyLens(value: Artifact, lens: LensDefinition): Artifact {
  const def = getLens(lens.type);
  if (!def) {
    return { kind: 'Error', message: `Unknown lens: ${lens.type}` };
  }

  if (!def.apply) return value;

  const params: Record<string, Artifact> = {};
  for (const [paramKey, spec] of Object.entries(def.params)) {
    const rawValue = paramKey in lens.params ? lens.params[paramKey] : spec.default;
    params[paramKey] = paramToArtifact(spec.type, rawValue);
  }

  return def.apply(value, params);
}

export function isValidLensType(type: string): boolean {
  return !!getLens(type);
}
