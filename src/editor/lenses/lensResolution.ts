import type {Artifact, CompileCtx, Vec2} from '../compiler';
import type { DefaultSourceState, LensParamBinding } from '../types';

export interface ParamResolutionContext {
  defaultSources: Map<string, DefaultSourceState>;
  compileCtx: CompileCtx;
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
  }

  return { kind: 'Error', message: `Unsupported default source type: ${type.world}:${type.domain}` };
}
