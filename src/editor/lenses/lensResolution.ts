import type { Artifact, CompileCtx } from '../compiler/types';
import type { DefaultSource } from '../types';

export interface ParamResolutionContext {
  resolveBus: (busId: string) => Artifact;
  resolveWire: (blockId: string, slotId: string) => Artifact;
  defaultSources: Map<string, DefaultSource>;
  compileCtx: CompileCtx;
  // Recursion guard
  visited: Set<string>;
}