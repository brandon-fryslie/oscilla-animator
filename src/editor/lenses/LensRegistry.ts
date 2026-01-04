import type { CoreDomain } from '../ir/types/TypeDesc';
import type { UIControlHint } from '../types';
import type { TypeDesc } from '../ir/types/TypeDesc';
import type { Artifact, RuntimeCtx } from '../compiler/types';
import { getEasingFunction } from './easing';
import { pushPrintLog } from './printSink';

export interface LensParamSpec {
  type: TypeDesc; // Typically 'scalar:number' etc.
  default: unknown;
  uiHint: UIControlHint;
}

export type LensScope = 'publisher' | 'listener';

export interface LensDef {
  id: string;
  label: string;
  domain: CoreDomain; // Lenses are domain-specific
  allowedScopes: LensScope[];
  params: Record<string, LensParamSpec>;
  costHint?: 'cheap' | 'medium' | 'heavy';
  stabilityHint?: 'scrubSafe' | 'transportOnly' | 'either';

  // Execution logic
  apply?: (value: Artifact, params: Record<string, Artifact>) => Artifact;
}

const lenses = new Map<string, LensDef>();
const lensAliases = new Map<string, string>();

export function registerLens(def: LensDef): void {
  lenses.set(def.id, def);
}

export function registerLensAlias(aliasId: string, canonicalId: string): void {
  lensAliases.set(aliasId, canonicalId);
}

export function getLens(id: string): LensDef | undefined {
  return lenses.get(lensAliases.get(id) ?? id);
}

export function getAllLenses(): LensDef[] {
  return Array.from(lenses.values());
}

// Helpers for params
const SCALAR_NUM: TypeDesc = { world: 'scalar', domain: 'float', category: 'core', busEligible: false };
const SCALAR_VEC2: TypeDesc = { world: 'scalar', domain: 'vec2', category: 'core', busEligible: false };
const SCALAR_BOOL: TypeDesc = { world: 'scalar', domain: 'boolean', category: 'core', busEligible: false };
const SCALAR_ENUM: TypeDesc = { world: 'scalar', domain: 'string', category: 'internal', busEligible: false };

const DEFAULT_RUNTIME_CTX: RuntimeCtx = { viewport: { w: 0, h: 0, dpr: 1 } };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function wrapPhase(value: number): number {
  return ((value % 1) + 1) % 1;
}

function resolveNumberParam(param: Artifact | undefined, t: number, ctx: RuntimeCtx): number {
  if (param == null) return 0;
  if (param.kind === 'Scalar:float') return param.value;
  if (param.kind === 'Signal:float') return param.value(t, ctx);
  if (param.kind === 'Scalar:boolean') return param.value ? 1 : 0;
  return 0;
}

function resolveBooleanParam(param: Artifact | undefined, t: number, ctx: RuntimeCtx): boolean {
  if (param == null) return false;
  if (param.kind === 'Scalar:boolean') return param.value;
  if (param.kind === 'Signal:float') return param.value(t, ctx) !== 0;
  if (param.kind === 'Scalar:float') return param.value !== 0;
  return false;
}

function resolveEnumParam(param: Artifact | undefined): string {
  if (param == null) return '';
  if (param.kind === 'Scalar:string') return param.value;
  return '';
}

function mapNumberArtifact(
  artifact: Artifact,
  map: (value: number, t?: number, ctx?: RuntimeCtx) => number
): Artifact {
  switch (artifact.kind) {
    case 'Scalar:float':
      return { kind: 'Scalar:float', value: map(artifact.value) };
    case 'Signal:float':
      return {
        kind: 'Signal:float',
        value: (t, ctx) => map(artifact.value(t, ctx), t, ctx),
      };
    case 'Signal:Unit':
      return {
        kind: 'Signal:float',
        value: (t, ctx) => map(artifact.value(t, ctx), t, ctx),
      };
    case 'Signal:phase':
      // Phase is numerically 0-1, can be treated as number for mapping
      return {
        kind: 'Signal:float',
        value: (t, ctx) => map(artifact.value(t, ctx), t, ctx),
      };
    case 'Field:float':
      return {
        kind: 'Field:float',
        value: (seed, n, ctx) => {
          const values = artifact.value(seed, n, ctx);
          return values.map((v) => map(v));
        },
      };
    default:
      return { kind: 'Error', message: `Lens expected number artifact, got ${artifact.kind}` };
  }
}

function mapPhaseArtifact(
  artifact: Artifact,
  map: (value: number, t?: number, ctx?: RuntimeCtx) => number
): Artifact {
  switch (artifact.kind) {
    case 'Scalar:float':
      return { kind: 'Scalar:float', value: map(artifact.value) };
    case 'Signal:phase':
      return {
        kind: 'Signal:phase',
        value: (t, ctx) => wrapPhase(map(artifact.value(t, ctx), t, ctx)),
      };
    default:
      return { kind: 'Error', message: `Lens expected phase artifact, got ${artifact.kind}` };
  }
}

/**
 * Initialize the registry with canonical lenses.
 * Ref: @design-docs/10-Refactor-for-UI-prep/17-CanonicalLenses.md
 */
export function initLensRegistry(): void {
  if (lenses.size > 0) return;

  // =========================================================================
  // 0) Domain: number
  // =========================================================================

  // Gain (Pub + List)
  registerLens({
    id: 'scale',
    label: 'Gain',
    domain: 'float',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      scale: {
        type: SCALAR_NUM,
        default: 1,
        uiHint: { kind: 'number', step: 0.1 },
      },
      offset: {
        type: SCALAR_NUM,
        default: 0,
        uiHint: { kind: 'number', step: 0.1 },
      },
    },
    apply: (artifact, params) =>
      mapNumberArtifact(artifact, (value, t, ctx) => {
        const time = t ?? 0;
        const runtime = ctx ?? DEFAULT_RUNTIME_CTX;
        const scale = resolveNumberParam(params.scale, time, runtime);
        const offset = resolveNumberParam(params.offset, time, runtime);
        return value * scale + offset;
      }),
  });

  // Polarity (Pub + List)
  registerLens({
    id: 'polarity',
    label: 'Polarity',
    domain: 'float',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      invert: { type: SCALAR_BOOL, default: false, uiHint: { kind: 'boolean' } },
    },
    apply: (artifact, params) =>
      mapNumberArtifact(artifact, (value, t, ctx) => {
        const time = t ?? 0;
        const runtime = ctx ?? DEFAULT_RUNTIME_CTX;
        const invert = resolveBooleanParam(params.invert, time, runtime);
        return invert ? -value : value;
      }),
  });

  // Clamp (Pub + List)
  registerLens({
    id: 'clamp',
    label: 'Clamp',
    domain: 'float',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      min: { type: SCALAR_NUM, default: 0, uiHint: { kind: 'number' } },
      max: { type: SCALAR_NUM, default: 1, uiHint: { kind: 'number' } },
    },
    apply: (artifact, params) =>
      mapNumberArtifact(artifact, (value, t, ctx) => {
        const time = t ?? 0;
        const runtime = ctx ?? DEFAULT_RUNTIME_CTX;
        const min = resolveNumberParam(params.min, time, runtime);
        const max = resolveNumberParam(params.max, time, runtime);
        return clamp(value, Math.min(min, max), Math.max(min, max));
      }),
  });

  // Softclip (Pub + List)
  registerLens({
    id: 'softclip',
    label: 'Softclip',
    domain: 'float',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'medium',
    stabilityHint: 'scrubSafe',
    params: {
      amount: { type: SCALAR_NUM, default: 0.5, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
      shape: {
        type: SCALAR_ENUM,
        default: 'tanh',
        uiHint: {
          kind: 'select',
          options: [
            { value: 'tanh', label: 'tanh' },
            { value: 'sigmoid', label: 'sigmoid' },
          ],
        },
      },
    },
    apply: (artifact, params) =>
      mapNumberArtifact(artifact, (value, t, ctx) => {
        const time = t ?? 0;
        const runtime = ctx ?? DEFAULT_RUNTIME_CTX;
        const amount = clamp(resolveNumberParam(params.amount, time, runtime), 0, 1);
        const shape = resolveEnumParam(params.shape) !== '' ? resolveEnumParam(params.shape) : 'tanh';
        if (amount <= 0) return value;
        const strength = 1 + amount * 4;
        if (shape === 'sigmoid') {
          const sigmoid = 1 / (1 + Math.exp(-value * strength));
          return (sigmoid - 0.5) * 2;
        }
        return Math.tanh(value * strength) / Math.tanh(strength);
      }),
  });

  // Deadzone (Pub + List)
  registerLens({
    id: 'deadzone',
    label: 'Deadzone',
    domain: 'float',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      width: { type: SCALAR_NUM, default: 0.05, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    },
    apply: (artifact, params) =>
      mapNumberArtifact(artifact, (value, t, ctx) => {
        const time = t ?? 0;
        const runtime = ctx ?? DEFAULT_RUNTIME_CTX;
        const width = Math.max(0, resolveNumberParam(params.width, time, runtime));
        return Math.abs(value) <= width ? 0 : value;
      }),
  });

  // Slew (Pub + List, stateful)
  registerLens({
    id: 'slew',
    label: 'Slew',
    domain: 'float',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'medium',
    stabilityHint: 'transportOnly',
    params: {
      riseMs: { type: SCALAR_NUM, default: 120, uiHint: { kind: 'number', min: 0 } },
      fallMs: { type: SCALAR_NUM, default: 120, uiHint: { kind: 'number', min: 0 } },
    },
    apply: (artifact, params) => {
      if (artifact.kind !== 'Signal:float') {
        return { kind: 'Error', message: 'Slew lens requires Signal:number input' };
      }

      let lastT: number | null = null;
      let lastValue = 0;

      return {
        kind: 'Signal:float',
        value: (t, ctx) => {
          const input = artifact.value(t, ctx);
          if (lastT === null) {
            lastT = t;
            lastValue = input;
            return input;
          }

          const dtMs = Math.max(0, t - lastT);
          const dt = dtMs / 1000;
          const riseMs = Math.max(0, resolveNumberParam(params.riseMs, t, ctx));
          const fallMs = Math.max(0, resolveNumberParam(params.fallMs, t, ctx));
          const riseRate = riseMs > 0 ? 1 / (riseMs / 1000) : Infinity;
          const fallRate = fallMs > 0 ? 1 / (fallMs / 1000) : Infinity;
          const delta = input - lastValue;
          const maxDelta = delta >= 0 ? riseRate * dt : fallRate * dt;

          if (Math.abs(delta) <= maxDelta) {
            lastValue = input;
          } else {
            lastValue += Math.sign(delta) * maxDelta;
          }

          lastT = t;
          return lastValue;
        },
      };
    },
  });

  // Quantize (Pub + List)
  registerLens({
    id: 'quantize',
    label: 'Quantize',
    domain: 'float',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      steps: { type: SCALAR_NUM, default: 4, uiHint: { kind: 'number', min: 1, step: 1 } },
      mode: {
        type: SCALAR_ENUM,
        default: 'round',
        uiHint: {
          kind: 'select',
          options: [
            { value: 'round', label: 'round' },
            { value: 'floor', label: 'floor' },
            { value: 'ceil', label: 'ceil' },
          ],
        },
      },
    },
    apply: (artifact, params) =>
      mapNumberArtifact(artifact, (value, t, ctx) => {
        const time = t ?? 0;
        const runtime = ctx ?? DEFAULT_RUNTIME_CTX;
        const steps = Math.max(1, resolveNumberParam(params.steps, time, runtime));
        const mode = resolveEnumParam(params.mode) !== '' ? resolveEnumParam(params.mode) : 'round';
        const scaled = value * steps;
        const quantized = mode === 'floor'
          ? Math.floor(scaled)
          : mode === 'ceil'
            ? Math.ceil(scaled)
            : Math.round(scaled);
        return quantized / steps;
      }),
  });

  // Ease (List only)
  registerLens({
    id: 'ease',
    label: 'Ease',
    domain: 'float',
    allowedScopes: ['listener'],
    costHint: 'medium',
    stabilityHint: 'scrubSafe',
    params: {
      easing: { type: SCALAR_ENUM, default: 'easeInOutSine', uiHint: { kind: 'text' } },
    },
    apply: (artifact, params) => {
      if (artifact.kind !== 'Signal:float' && artifact.kind !== 'Signal:Unit') {
        return { kind: 'Error', message: 'Ease lens requires Signal:number input' };
      }

      const easingName = resolveEnumParam(params.easing) !== '' ? resolveEnumParam(params.easing) : 'easeInOutSine';
      const easing = getEasingFunction(easingName);
      const signal = artifact.value;

      return {
        kind: 'Signal:float',
        value: (t, ctx) => {
          const v = clamp(signal(t, ctx), 0, 1);
          return easing(v);
        },
      };
    },
  });

  // MapRange (List only)
  registerLens({
    id: 'mapRange',
    label: 'Map Range',
    domain: 'float',
    allowedScopes: ['listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      inMin: { type: SCALAR_NUM, default: 0, uiHint: { kind: 'number' } },
      inMax: { type: SCALAR_NUM, default: 1, uiHint: { kind: 'number' } },
      outMin: { type: SCALAR_NUM, default: 0, uiHint: { kind: 'number' } },
      outMax: { type: SCALAR_NUM, default: 1, uiHint: { kind: 'number' } },
      clamp: { type: SCALAR_BOOL, default: true, uiHint: { kind: 'boolean' } },
    },
    apply: (artifact, params) =>
      mapNumberArtifact(artifact, (value, t, ctx) => {
        const time = t ?? 0;
        const runtime = ctx ?? DEFAULT_RUNTIME_CTX;
        const inMin = resolveNumberParam(params.inMin, time, runtime);
        const inMax = resolveNumberParam(params.inMax, time, runtime);
        const outMin = resolveNumberParam(params.outMin, time, runtime);
        const outMax = resolveNumberParam(params.outMax, time, runtime);
        const doClamp = resolveBooleanParam(params.clamp, time, runtime);
        const safeMin = Math.min(inMin, inMax);
        const safeMax = Math.max(inMin, inMax);
        const clamped = doClamp ? clamp(value, safeMin, safeMax) : value;
        const range = safeMax - safeMin;
        const u = range === 0 ? 0 : (clamped - safeMin) / range;
        return outMin + (outMax - outMin) * u;
      }),
  });

  // Hysteresis (List only)
  registerLens({
    id: 'hysteresis',
    label: 'Hysteresis',
    domain: 'float',
    allowedScopes: ['listener'],
    costHint: 'medium',
    stabilityHint: 'transportOnly',
    params: {
      low: { type: SCALAR_NUM, default: 0.4, uiHint: { kind: 'number' } },
      high: { type: SCALAR_NUM, default: 0.6, uiHint: { kind: 'number' } },
    },
    apply: (artifact, params) => {
      if (artifact.kind !== 'Signal:float') {
        return { kind: 'Error', message: 'Hysteresis lens requires Signal:number input' };
      }

      let state = false;

      return {
        kind: 'Signal:float',
        value: (t, ctx) => {
          const low = resolveNumberParam(params.low, t, ctx);
          const high = resolveNumberParam(params.high, t, ctx);
          const v = artifact.value(t, ctx);
          if (state) {
            if (v <= low) state = false;
          } else if (v >= high) {
            state = true;
          }
          return state ? high : low;
        },
      };
    },
  });

  // Print (Pub + List) - Debug lens for logging values
  registerLens({
    id: 'print',
    label: 'Print',
    domain: 'float',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      label: {
        type: SCALAR_ENUM,
        default: 'value',
        uiHint: { kind: 'text' },
      },
    },
    apply: (artifact, params) => {
      const label = resolveEnumParam(params.label) || 'value';
      const THROTTLE_MS = 333; // ~3x per second
      let lastLogTime = 0;

      switch (artifact.kind) {
        case 'Scalar:float':
          pushPrintLog(label, artifact.value);
          return artifact;

        case 'Signal:float':
        case 'Signal:Unit':
        case 'Signal:phase': {
          const signal = artifact.value;
          return {
            kind: artifact.kind,
            value: (t, ctx) => {
              const value = signal(t, ctx);
              if (t - lastLogTime >= THROTTLE_MS) {
                lastLogTime = t;
                pushPrintLog(label, value);
              }
              return value;
            },
          } as typeof artifact;
        }

        case 'Field:float': {
          let logged = false;
          return {
            kind: 'Field:float',
            value: (seed, n, ctx) => {
              const values = artifact.value(seed, n, ctx);
              if (!logged) {
                logged = true;
                pushPrintLog(label, { type: 'field', count: n, sample: values.slice(0, 5) });
              }
              return values;
            },
          };
        }

        default:
          return artifact;
      }
    },
  });

  // =========================================================================
  // 1) Domain: phase
  // =========================================================================

  registerLens({
    id: 'phaseOffset',
    label: 'Phase Offset',
    domain: 'float',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      offset: { type: SCALAR_NUM, default: 0, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    },
    apply: (artifact, params) =>
      mapPhaseArtifact(artifact, (value, t, ctx) => {
        const time = t ?? 0;
        const runtime = ctx ?? DEFAULT_RUNTIME_CTX;
        return wrapPhase(value + resolveNumberParam(params.offset, time, runtime));
      }),
  });

  registerLens({
    id: 'pingPong',
    label: 'Ping Pong',
    domain: 'float',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      enabled: { type: SCALAR_BOOL, default: true, uiHint: { kind: 'boolean' } },
    },
    apply: (artifact, params) =>
      mapPhaseArtifact(artifact, (value, t, ctx) => {
        const time = t ?? 0;
        const runtime = ctx ?? DEFAULT_RUNTIME_CTX;
        if (!resolveBooleanParam(params.enabled, time, runtime)) return wrapPhase(value);
        const p = wrapPhase(value);
        return p < 0.5 ? p * 2 : 2 - p * 2;
      }),
  });

  registerLens({
    id: 'phaseScale',
    label: 'Phase Scale',
    domain: 'float',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      scale: { type: SCALAR_NUM, default: 1, uiHint: { kind: 'number', min: 0.001, step: 0.01 } },
    },
    apply: (artifact, params) =>
      mapPhaseArtifact(artifact, (value, t, ctx) => {
        const time = t ?? 0;
        const runtime = ctx ?? DEFAULT_RUNTIME_CTX;
        return wrapPhase(value * resolveNumberParam(params.scale, time, runtime));
      }),
  });

  registerLens({
    id: 'phaseQuantize',
    label: 'Phase Quantize',
    domain: 'float',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      steps: { type: SCALAR_NUM, default: 8, uiHint: { kind: 'number', min: 1, step: 1 } },
    },
    apply: (artifact, params) =>
      mapPhaseArtifact(artifact, (value, t, ctx) => {
        const time = t ?? 0;
        const runtime = ctx ?? DEFAULT_RUNTIME_CTX;
        const steps = Math.max(1, resolveNumberParam(params.steps, time, runtime));
        const q = Math.round(value * steps) / steps;
        return wrapPhase(q);
      }),
  });

  registerLens({
    id: 'wrapMode',
    label: 'Wrap Mode',
    domain: 'float',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      mode: {
        type: SCALAR_ENUM,
        default: 'wrap',
        uiHint: {
          kind: 'select',
          options: [
            { value: 'wrap', label: 'wrap' },
            { value: 'clamp', label: 'clamp' },
            { value: 'pingpong', label: 'pingpong' },
          ],
        },
      },
    },
    apply: (artifact, params) =>
      mapPhaseArtifact(artifact, (value) => {
        const mode = resolveEnumParam(params.mode) ?? 'wrap';
        if (mode === 'clamp') return clamp(value, 0, 1);
        if (mode === 'pingpong') {
          const p = wrapPhase(value);
          return p < 0.5 ? p * 2 : 2 - p * 2;
        }
        return wrapPhase(value);
      }),
  });

  registerLens({
    id: 'phaseWindow',
    label: 'Phase Window',
    domain: 'float',
    allowedScopes: ['listener'],
    costHint: 'medium',
    stabilityHint: 'scrubSafe',
    params: {
      start: { type: SCALAR_NUM, default: 0, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
      end: { type: SCALAR_NUM, default: 1, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
      softness: { type: SCALAR_NUM, default: 0, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    },
    apply: (artifact, params) =>
      mapPhaseArtifact(artifact, (value, t, ctx) => {
        const time = t ?? 0;
        const runtime = ctx ?? DEFAULT_RUNTIME_CTX;
        const start = clamp(resolveNumberParam(params.start, time, runtime), 0, 1);
        const end = clamp(resolveNumberParam(params.end, time, runtime), 0, 1);
        const softness = clamp(resolveNumberParam(params.softness, time, runtime), 0, 1);
        const lo = Math.min(start, end);
        const hi = Math.max(start, end);
        const width = Math.max(1e-6, hi - lo);
        const u = clamp((wrapPhase(value) - lo) / width, 0, 1);
        const smooth = u * u * (3 - 2 * u);
        const mixed = u * (1 - softness) + smooth * softness;
        return wrapPhase(lo + mixed * width);
      }),
  });

  // =========================================================================
  // 2) Domain: vec2
  // =========================================================================

  registerLens({
    id: 'rotate2d',
    label: 'Rotate',
    domain: 'vec2',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      turns: { type: SCALAR_NUM, default: 0, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    },
  });

  registerLens({
    id: 'vec2GainBias',
    label: 'Vec2 Gain/Bias',
    domain: 'vec2',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      gain: { type: SCALAR_NUM, default: 1, uiHint: { kind: 'number', step: 0.1 } },
      bias: { type: SCALAR_VEC2, default: { x: 0, y: 0 }, uiHint: { kind: 'xy' } },
    },
  });

  registerLens({
    id: 'translate2d',
    label: 'Translate',
    domain: 'vec2',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      delta: { type: SCALAR_VEC2, default: { x: 0, y: 0 }, uiHint: { kind: 'xy' } },
    },
  });

  registerLens({
    id: 'clampBounds',
    label: 'Clamp Bounds',
    domain: 'vec2',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      min: { type: SCALAR_VEC2, default: { x: 0, y: 0 }, uiHint: { kind: 'xy' } },
      max: { type: SCALAR_VEC2, default: { x: 1, y: 1 }, uiHint: { kind: 'xy' } },
    },
  });

  registerLens({
    id: 'swirl',
    label: 'Swirl',
    domain: 'vec2',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'medium',
    stabilityHint: 'scrubSafe',
    params: {
      strength: { type: SCALAR_NUM, default: 0.5, uiHint: { kind: 'number', step: 0.1 } },
      center: { type: SCALAR_VEC2, default: { x: 0, y: 0 }, uiHint: { kind: 'xy' } },
    },
  });

  registerLens({
    id: 'normalize',
    label: 'Normalize',
    domain: 'vec2',
    allowedScopes: ['listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {},
  });

  registerLens({
    id: 'smoothPath',
    label: 'Smooth Path',
    domain: 'vec2',
    allowedScopes: ['listener'],
    costHint: 'medium',
    stabilityHint: 'transportOnly',
    params: {
      smoothingMs: { type: SCALAR_NUM, default: 120, uiHint: { kind: 'number', min: 0 } },
    },
  });

  // =========================================================================
  // 3) Domain: color
  // =========================================================================

  registerLens({
    id: 'hueShift',
    label: 'Hue Shift',
    domain: 'color',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      turns: { type: SCALAR_NUM, default: 0, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    },
  });

  registerLens({
    id: 'colorGain',
    label: 'Color Gain',
    domain: 'color',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      gain: { type: SCALAR_NUM, default: 1, uiHint: { kind: 'number', step: 0.1 } },
      alphaGain: { type: SCALAR_NUM, default: 1, uiHint: { kind: 'number', step: 0.1 } },
    },
  });

  registerLens({
    id: 'saturate',
    label: 'Saturate',
    domain: 'color',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      amount: { type: SCALAR_NUM, default: 1, uiHint: { kind: 'slider', min: 0, max: 2, step: 0.01 } },
    },
  });

  registerLens({
    id: 'contrast',
    label: 'Contrast',
    domain: 'color',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      amount: { type: SCALAR_NUM, default: 1, uiHint: { kind: 'slider', min: 0, max: 2, step: 0.01 } },
    },
  });

  registerLens({
    id: 'clampGamut',
    label: 'Clamp Gamut',
    domain: 'color',
    allowedScopes: ['publisher', 'listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {},
  });

  /**
   * Legacy Lens Aliases (Backward Compatibility)
   *
   * These aliases map old PascalCase lens IDs to canonical camelCase IDs.
   * They exist to support loading saved patches that reference the old IDs.
   *
   * Status: Safe to keep indefinitely - additive aliases that don't block anything.
   * Migration: Can be removed after all production patches use camelCase IDs.
   *
   * Canonical IDs: Always use camelCase in new code (e.g., 'polarity' not 'Polarity')
   */
  registerLensAlias('Polarity', 'polarity');
  registerLensAlias('Softclip', 'softclip');
  registerLensAlias('Hysteresis', 'hysteresis');
  registerLensAlias('PhaseOffset', 'phaseOffset');
  registerLensAlias('PhaseScale', 'phaseScale');
  registerLensAlias('PhaseQuantize', 'phaseQuantize');
  registerLensAlias('WrapMode', 'wrapMode');
  registerLensAlias('PhaseWindow', 'phaseWindow');
  registerLensAlias('PingPong', 'pingPong');
  registerLensAlias('Rotate2D', 'rotate2d');
  registerLensAlias('Vec2GainBias', 'vec2GainBias');
  registerLensAlias('Translate2D', 'translate2d');
  registerLensAlias('ClampBounds', 'clampBounds');
  registerLensAlias('Swirl', 'swirl');
  registerLensAlias('Normalize', 'normalize');
  registerLensAlias('SmoothPath', 'smoothPath');
  registerLensAlias('HueShift', 'hueShift');
  registerLensAlias('ColorGain', 'colorGain');
  registerLensAlias('Saturate', 'saturate');
  registerLensAlias('Contrast', 'contrast');
  registerLensAlias('ClampGamut', 'clampGamut');
}

// Auto-initialize registry
initLensRegistry();
