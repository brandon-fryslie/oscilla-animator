import type {Artifact, CompileCtx, Vec2} from '../compiler';
import type { DefaultSourceState, LensParamBinding, LensInstance, AdapterStep } from '../types';

export interface ParamResolutionContext {
  resolveBus: (busId: string) => Artifact;
  resolveWire: (blockId: string, slotId: string) => Artifact;
  defaultSources: Map<string, DefaultSourceState>;
  compileCtx: CompileCtx;
  applyAdapterChain: (artifact: Artifact, chain?: AdapterStep[]) => Artifact;
  applyLensStack: (artifact: Artifact, lensStack?: LensInstance[]) => Artifact;
  // Recursion guard
  visited: Set<string>;
  depth: number;
}

export function resolveLensParam(binding: LensParamBinding, ctx: ParamResolutionContext): Artifact {
  if (ctx.depth > 3) {
    return { kind: 'Error', message: 'Lens param nesting too deep' };
  }

  switch (binding.kind) {
    case 'default': {
      const source = ctx.defaultSources.get(binding.defaultSourceId);
      if (source == null) {
        return { kind: 'Error', message: `Default source not found: ${binding.defaultSourceId}` };
      }
      return artifactFromDefaultSource(source);
    }
    case 'bus': {
      const art = ctx.resolveBus(binding.busId);
      const adapted = ctx.applyAdapterChain(art, binding.adapterChain);
      return ctx.applyLensStack(adapted, binding.lensStack);
    }
    case 'wire': {
      const key = `${binding.from.blockId}:${binding.from.slotId}`;
      if (ctx.visited.has(key)) {
        return { kind: 'Error', message: 'Lens param cycle detected' };
      }
      ctx.visited.add(key);
      const art = ctx.resolveWire(binding.from.blockId, binding.from.slotId);
      const adapted = ctx.applyAdapterChain(art, binding.adapterChain);
      return ctx.applyLensStack(adapted, binding.lensStack);
    }
    case 'literal': {
      // Literal bindings store the value directly
      return { kind: 'Scalar:float', value: binding.value as number };
    }
  }
}

function artifactFromDefaultSource(source: DefaultSourceState): Artifact {
  const { type, value } = source;
  if (type.world === 'scalar') {
    if (type.domain === 'float') return { kind: 'Scalar:float', value: value as number };
    if (type.domain === 'int') return { kind: 'Scalar:int', value: value as number };
    if (type.domain === 'boolean') return { kind: 'Scalar:boolean', value: value as boolean };
    if (type.domain === 'vec2') return { kind: 'Scalar:vec2', value: value as Vec2 };
    if (type.domain === 'color') return { kind: 'Scalar:color', value };
    if (type.domain === 'string') return { kind: 'Scalar:string', value: String(value) };
  }

  if (type.world === 'signal') {
    if (type.domain === 'float') {
      return { kind: 'Signal:float', value: () => value as number };
    }
    if (type.domain === 'int') {
      return { kind: 'Signal:int', value: () => value as number };
    }
    if (type.domain === 'vec2') {
      return { kind: 'Signal:vec2', value: () => value as Vec2 };
    }
    if (type.domain === 'color') {
      return { kind: 'Signal:color', value: () => value as string };
    }
    if (type.domain === 'boolean') {
      return { kind: 'Signal:float', value: () => ((value as number !== 0) ? 1 : 0) };
    }
    if (type.domain === 'phase') {
      return { kind: 'Signal:phase', value: () => value as number };
    }
  }

  return { kind: 'Error', message: `Unsupported default source type: ${type.world}:${type.domain}` };
}
