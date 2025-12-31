import type { TypeDesc, UIControlHint, CoreDomain } from '../types';
import type { Artifact, RuntimeCtx } from '../compiler/types';
import { getEasingFunction } from './easing';
import type { ValueRefPacked } from '../compiler/passes/pass6-block-lowering';
import type { IRBuilder } from '../compiler/ir/IRBuilder';
import { OpCode } from '../compiler/ir/opcodes';
import type { TypeDesc as IRTypeDesc } from '../compiler/ir/types';
import { asTypeDesc } from '../compiler/ir/types';

export interface LensParamSpec {
  type: TypeDesc; // Typically 'scalar:number' etc.
  default: unknown;
  uiHint: UIControlHint;
}

export type LensScope = 'wire' | 'publisher' | 'listener' | 'lensParam';

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
  // IR compilation (Sprint 5 Deliverable 6)
  // Returns null if the lens cannot be compiled to IR
  compileToIR?: (input: ValueRefPacked, params: Record<string, ValueRefPacked>, ctx: { builder: IRBuilder }) => ValueRefPacked | null;
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

/**
 * Check if a lens is allowed in a given scope.
 */
export function isLensAllowedInScope(lensId: string, scope: LensScope): boolean {
  const def = getLens(lensId);
  if (def === null || def === undefined) return false;
  return def.allowedScopes.includes(scope);
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
  if (param.kind === 'Scalar:float' || param.kind === 'Scalar:int') return param.value;
  if (param.kind === 'Signal:float' || param.kind === 'Signal:int') return param.value(t, ctx);
  if (param.kind === 'Scalar:boolean') return param.value ? 1 : 0;
  return 0;
}

function resolveBooleanParam(param: Artifact | undefined, t: number, ctx: RuntimeCtx): boolean {
  if (param == null) return false;
  if (param.kind === 'Scalar:boolean') return param.value;
  if (param.kind === 'Signal:float' || param.kind === 'Signal:int') return param.value(t, ctx) !== 0;
  if (param.kind === 'Scalar:float' || param.kind === 'Scalar:int') return param.value !== 0;
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
    case 'Scalar:int':
    case 'Scalar:float':
      return { kind: 'Scalar:float', value: map(artifact.value) };
    case 'Signal:int':
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

  // Gain (Wire + Pub + List)
  registerLens({
    id: 'scale',
    label: 'Gain',
    domain: 'float',
    allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
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
    compileToIR: (input, params, ctx) => {
      // Only compile signal inputs
      if (input.k !== 'sig') {
        return null;
      }

      // Extract scale and offset parameters
      const scaleParam = params.scale;
      const offsetParam = params.offset;

      // Both params must be scalar constants for now
      if (scaleParam?.k !== 'scalarConst' || offsetParam?.k !== 'scalarConst') {
        return null; // Dynamic params not yet supported
      }

      const scaleValue = ctx.builder.getConstPool()[scaleParam.constId] as number;
      const offsetValue = ctx.builder.getConstPool()[offsetParam.constId] as number;

      // Determine output type (same as input)
      const outputType: IRTypeDesc = asTypeDesc({
        world: 'signal',
        domain: 'float',
      });

      // Chain: multiply by scale, then add offset
      let result = input.id;

      // Apply scale if not 1
      if (scaleValue !== 1) {
        const scaleSigId = ctx.builder.sigConst(scaleValue, outputType);
        result = ctx.builder.sigZip(result, scaleSigId, { kind: 'opcode', opcode: OpCode.Mul }, outputType);
      }

      // Apply offset if not 0
      if (offsetValue !== 0) {
        const offsetSigId = ctx.builder.sigConst(offsetValue, outputType);
        result = ctx.builder.sigZip(result, offsetSigId, { kind: 'opcode', opcode: OpCode.Add }, outputType);
      }

      // Allocate slot for final result
      const slot = ctx.builder.allocValueSlot(outputType);
      ctx.builder.registerSigSlot(result, slot);

      return { k: 'sig', id: result, slot };
    },
  });

  // Polarity (Wire + Pub + List)
  registerLens({
    id: 'polarity',
    label: 'Polarity',
    domain: 'float',
    allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
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
    compileToIR: (input, params, ctx) => {
      // Only compile signal inputs
      if (input.k !== 'sig') {
        return null;
      }

      // Extract invert parameter
      const invertParam = params.invert;
      if (invertParam?.k !== 'scalarConst') {
        return null; // Dynamic params not yet supported
      }

      const invertValue = ctx.builder.getConstPool()[invertParam.constId] as boolean;
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> fdebc66 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> 267efc4 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
=======
>>>>>>> e9b0b79 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
=======
>>>>>>> 17ee55e (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> 2a8cbb3 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> 951f918 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
>>>>>>> 7e9a0e4 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> 951f918 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
<<<<<<< HEAD
>>>>>>> fbe850f (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> fdebc66 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> 267efc4 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
=======
>>>>>>> 951f918 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
>>>>>>> fbe850f (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
=======
>>>>>>> 094473c (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
<<<<<<< HEAD
>>>>>>> 17ee55e (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
=======
=======
>>>>>>> fdebc66 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
>>>>>>> 5aae322 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
>>>>>>> 2a8cbb3 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
      const outputType: IRTypeDesc = asTypeDesc({
        world: 'signal',
        domain: 'float',
      });
=======
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 7f98a5f (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> fdebc66 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
=======
>>>>>>> 97d451a (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
>>>>>>> 267efc4 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
=======
>>>>>>> 7e9a0e4 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> 17ee55e (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> 2a8cbb3 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> 97d451a (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> 951f918 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
<<<<<<< HEAD
>>>>>>> fbe850f (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> 7f98a5f (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> fdebc66 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
=======
>>>>>>> 97d451a (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
<<<<<<< HEAD
>>>>>>> 267efc4 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
=======
>>>>>>> 97d451a (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> 951f918 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
<<<<<<< HEAD
>>>>>>> fbe850f (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
=======
>>>>>>> 97d451a (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
>>>>>>> e9b0b79 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
=======
>>>>>>> 951f918 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
>>>>>>> 7e9a0e4 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
=======
=======
>>>>>>> 7f98a5f (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
>>>>>>> 094473c (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
<<<<<<< HEAD
>>>>>>> 17ee55e (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
=======
=======
>>>>>>> 7f98a5f (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> fdebc66 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
>>>>>>> 5aae322 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
>>>>>>> 2a8cbb3 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
      const outputType: IRTypeDesc = {
        world: 'signal',
        domain: 'float',
      };
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
=======
>>>>>>> e9b0b79 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> 7e9a0e4 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> 17ee55e (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> 2a8cbb3 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
>>>>>>> 97d451a (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
>>>>>>> fbe850f (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
=======
>>>>>>> 951f918 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
>>>>>>> 97d451a (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
<<<<<<< HEAD
>>>>>>> 267efc4 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> 97d451a (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
>>>>>>> fbe850f (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
=======
>>>>>>> 951f918 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
>>>>>>> 97d451a (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
<<<<<<< HEAD
>>>>>>> 267efc4 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
=======
>>>>>>> 951f918 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
<<<<<<< HEAD
>>>>>>> 7e9a0e4 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
>>>>>>> 97d451a (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> 7f98a5f (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> 97d451a (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
>>>>>>> fdebc66 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> 7f98a5f (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> 97d451a (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
>>>>>>> fdebc66 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
=======
>>>>>>> 97d451a (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
>>>>>>> e9b0b79 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
=======
>>>>>>> 094473c (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> 5aae322 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
>>>>>>> 97d451a (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
>>>>>>> 7f98a5f (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
<<<<<<< HEAD
>>>>>>> 17ee55e (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
=======
=======
>>>>>>> 97d451a (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
>>>>>>> fdebc66 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))
>>>>>>> 2a8cbb3 (feat(ir): Add compileToIR for ConstToSignal variants and phase adapters (Sprint 1 partial))

      // If not inverted, return input unchanged (identity)
      if (!invertValue) {
        return input;
      }

      // Invert: multiply by -1
      const negOneSig = ctx.builder.sigConst(-1, outputType);
      const result = ctx.builder.sigZip(input.id, negOneSig, { kind: 'opcode', opcode: OpCode.Mul }, outputType);

      const slot = ctx.builder.allocValueSlot(outputType);
      ctx.builder.registerSigSlot(result, slot);

      return { k: 'sig', id: result, slot };
    },
  });

  // Clamp (Wire + Pub + List)
  registerLens({
    id: 'clamp',
    label: 'Clamp',
    domain: 'float',
    allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
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
    compileToIR: (input, params, ctx) => {
      // Only compile signal inputs
      if (input.k !== 'sig') {
        return null;
      }

      // Extract min and max parameters
      const minParam = params.min;
      const maxParam = params.max;

      // Both params must be scalar constants for now
      if (minParam?.k !== 'scalarConst' || maxParam?.k !== 'scalarConst') {
        return null; // Dynamic params not yet supported
      }

      const minValue = ctx.builder.getConstPool()[minParam.constId] as number;
      const maxValue = ctx.builder.getConstPool()[maxParam.constId] as number;

      // Determine output type (same as input)
      const outputType: IRTypeDesc = asTypeDesc({
        world: 'signal',
        domain: 'float',
      });

      // Use OpCode.Clamp which takes (value, min, max)
      const minSigId = ctx.builder.sigConst(Math.min(minValue, maxValue), outputType);
      const maxSigId = ctx.builder.sigConst(Math.max(minValue, maxValue), outputType);

      // Create sigMap with clamp operation
      // For clamp, we need a ternary operation: clamp(value, min, max)
      // We'll use sigMap with a special function that captures min and max
      // Actually, OpCode.Clamp expects 3 inputs, so we need to create a custom node

      // For now, implement clamp as: max(min(value, maxValue), minValue)
      const maxClampSig = ctx.builder.sigZip(input.id, maxSigId, { kind: 'opcode', opcode: OpCode.Min }, outputType);
      const result = ctx.builder.sigZip(maxClampSig, minSigId, { kind: 'opcode', opcode: OpCode.Max }, outputType);

      // Allocate slot for result
      const slot = ctx.builder.allocValueSlot(outputType);
      ctx.builder.registerSigSlot(result, slot);

      return { k: 'sig', id: result, slot };
    },
  });

  // Softclip (Wire + Pub + List)
  registerLens({
    id: 'softclip',
    label: 'Softclip',
    domain: 'float',
    allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
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

  // Deadzone (Wire + Pub + List)
  registerLens({
    id: 'deadzone',
    label: 'Deadzone',
    domain: 'float',
    allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
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

  // Slew (Wire + Pub + List, stateful)
  registerLens({
    id: 'slew',
    label: 'Slew',
    domain: 'float',
    allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
    costHint: 'medium',
    stabilityHint: 'transportOnly',
    params: {
      riseMs: { type: SCALAR_NUM, default: 120, uiHint: { kind: 'number', min: 0 } },
      fallMs: { type: SCALAR_NUM, default: 120, uiHint: { kind: 'number', min: 0 } },
    },
    apply: (artifact, params) => {
      if (artifact.kind !== 'Signal:float' && artifact.kind !== 'Signal:int') {
        return { kind: 'Error', message: 'Slew lens requires Signal:float or Signal:int input' };
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

  // Quantize (Wire + Pub + List)
  registerLens({
    id: 'quantize',
    label: 'Quantize',
    domain: 'float',
    allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
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

  // Ease (List only - post-combine transformation)
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
      if (artifact.kind !== 'Signal:float' && artifact.kind !== 'Signal:int' && artifact.kind !== 'Signal:Unit') {
        return { kind: 'Error', message: 'Ease lens requires Signal:float or Signal:int input' };
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

  // MapRange (List only - post-combine transformation)
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

  // Hysteresis (List only - stateful, post-combine)
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
      if (artifact.kind !== 'Signal:float' && artifact.kind !== 'Signal:int') {
        return { kind: 'Error', message: 'Hysteresis lens requires Signal:float or Signal:int input' };
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

  // =========================================================================
  // 1) Domain: float (phase semantics)
  // =========================================================================

  // Phase Offset (Wire + Pub + List)
  registerLens({
    id: 'phaseOffset',
    label: 'Phase Offset',
    domain: 'float',
    allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
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

  // Ping Pong (Wire + Pub + List)
  registerLens({
    id: 'pingPong',
    label: 'Ping Pong',
    domain: 'float',
    allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
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

  // Phase Scale (Wire + Pub + List)
  registerLens({
    id: 'phaseScale',
    label: 'Phase Scale',
    domain: 'float',
    allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
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

  // Phase Quantize (Wire + Pub + List)
  registerLens({
    id: 'phaseQuantize',
    label: 'Phase Quantize',
    domain: 'float',
    allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
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

  // Wrap Mode (Wire + Pub + List)
  registerLens({
    id: 'wrapMode',
    label: 'Wrap Mode',
    domain: 'float',
    allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
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

  // Phase Window (List only - post-combine transformation)
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

  // Rotate (Wire + Pub + List)
  registerLens({
    id: 'rotate2d',
    label: 'Rotate',
    domain: 'vec2',
    allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      turns: { type: SCALAR_NUM, default: 0, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    },
  });

  // Vec2 Gain/Bias (Wire + Pub + List)
  registerLens({
    id: 'vec2GainBias',
    label: 'Vec2 Gain/Bias',
    domain: 'vec2',
    allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      gain: { type: SCALAR_NUM, default: 1, uiHint: { kind: 'number', step: 0.1 } },
      bias: { type: SCALAR_VEC2, default: { x: 0, y: 0 }, uiHint: { kind: 'xy' } },
    },
  });

  // Translate (Wire + Pub + List)
  registerLens({
    id: 'translate2d',
    label: 'Translate',
    domain: 'vec2',
    allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      delta: { type: SCALAR_VEC2, default: { x: 0, y: 0 }, uiHint: { kind: 'xy' } },
    },
  });

  // Clamp Bounds (Wire + Pub + List)
  registerLens({
    id: 'clampBounds',
    label: 'Clamp Bounds',
    domain: 'vec2',
    allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      min: { type: SCALAR_VEC2, default: { x: 0, y: 0 }, uiHint: { kind: 'xy' } },
      max: { type: SCALAR_VEC2, default: { x: 1, y: 1 }, uiHint: { kind: 'xy' } },
    },
  });

  // Swirl (Wire + Pub + List)
  registerLens({
    id: 'swirl',
    label: 'Swirl',
    domain: 'vec2',
    allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
    costHint: 'medium',
    stabilityHint: 'scrubSafe',
    params: {
      strength: { type: SCALAR_NUM, default: 0.5, uiHint: { kind: 'number', step: 0.1 } },
      center: { type: SCALAR_VEC2, default: { x: 0, y: 0 }, uiHint: { kind: 'xy' } },
    },
  });

  // Normalize (List only - post-combine transformation)
  registerLens({
    id: 'normalize',
    label: 'Normalize',
    domain: 'vec2',
    allowedScopes: ['listener'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {},
  });

  // Smooth Path (List only - stateful, post-combine)
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

  // Hue Shift (Wire + Pub + List)
  registerLens({
    id: 'hueShift',
    label: 'Hue Shift',
    domain: 'color',
    allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      turns: { type: SCALAR_NUM, default: 0, uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    },
  });

  // Color Gain (Wire + Pub + List)
  registerLens({
    id: 'colorGain',
    label: 'Color Gain',
    domain: 'color',
    allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      gain: { type: SCALAR_NUM, default: 1, uiHint: { kind: 'number', step: 0.1 } },
      alphaGain: { type: SCALAR_NUM, default: 1, uiHint: { kind: 'number', step: 0.1 } },
    },
  });

  // Saturate (Wire + Pub + List)
  registerLens({
    id: 'saturate',
    label: 'Saturate',
    domain: 'color',
    allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      amount: { type: SCALAR_NUM, default: 1, uiHint: { kind: 'slider', min: 0, max: 2, step: 0.01 } },
    },
  });

  // Contrast (Wire + Pub + List)
  registerLens({
    id: 'contrast',
    label: 'Contrast',
    domain: 'color',
    allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    params: {
      amount: { type: SCALAR_NUM, default: 1, uiHint: { kind: 'slider', min: 0, max: 2, step: 0.01 } },
    },
  });

  // Clamp Gamut (Wire + Pub + List)
  registerLens({
    id: 'clampGamut',
    label: 'Clamp Gamut',
    domain: 'color',
    allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
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
