/**
 * @file Default Source Provider Blocks
 * @description Hidden blocks that provide constant values for undriven inputs.
 *
 * These blocks:
 * - Have ZERO inputs (constants come from block.params, set by GraphNormalizer)
 * - Have one output of the appropriate type
 * - Are hidden (never shown in palette or PatchBay)
 * - Are injected by GraphNormalizer for undriven inputs with defaultSource
 */

import { createBlock } from './factory';
import { output } from './utils';
import { parseTypeDesc } from '../ir/types/TypeDesc';

/**
 * DSConstSignalFloat - Constant provider for Signal<float> inputs
 * Value comes from block.params.value (set by GraphNormalizer)
 */
export const DSConstSignalFloat = createBlock({
  type: 'DSConstSignalFloat',
  label: 'Constant (Signal<float>)',
  description: 'Hidden provider block for Signal<float> default sources',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [],
  outputs: [output('out', 'Output', parseTypeDesc('Signal:float'))],
  tags: { role: 'defaultSourceProvider', hidden: true },
  color: '#6B7280',
  priority: 1000,
});

/**
 * DSConstSignalInt - Constant provider for Signal<int> inputs
 */
export const DSConstSignalInt = createBlock({
  type: 'DSConstSignalInt',
  label: 'Constant (Signal<int>)',
  description: 'Hidden provider block for Signal<int> default sources',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [],
  outputs: [output('out', 'Output', parseTypeDesc('Signal:int'))],
  tags: { role: 'defaultSourceProvider', hidden: true },
  color: '#6B7280',
  priority: 1000,
});

/**
 * DSConstSignalColor - Constant provider for Signal<color> inputs
 */
export const DSConstSignalColor = createBlock({
  type: 'DSConstSignalColor',
  label: 'Constant (Signal<color>)',
  description: 'Hidden provider block for Signal<color> default sources',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [],
  outputs: [output('out', 'Output', parseTypeDesc('Signal:color'))],
  tags: { role: 'defaultSourceProvider', hidden: true },
  color: '#6B7280',
  priority: 1000,
});

/**
 * DSConstSignalPoint - Constant provider for Signal<point> inputs
 */
export const DSConstSignalPoint = createBlock({
  type: 'DSConstSignalPoint',
  label: 'Constant (Signal<point>)',
  description: 'Hidden provider block for Signal<point> default sources',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [],
  outputs: [output('out', 'Output', parseTypeDesc('Signal:point'))],
  tags: { role: 'defaultSourceProvider', hidden: true },
  color: '#6B7280',
  priority: 1000,
});

/**
 * DSConstSignalPhase - Constant provider for Signal<phase> inputs
 */
export const DSConstSignalPhase = createBlock({
  type: 'DSConstSignalPhase',
  label: 'Constant (Signal<phase>)',
  description: 'Hidden provider block for Signal<phase> default sources',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [],
  outputs: [output('out', 'Output', parseTypeDesc('Signal:phase'))],
  tags: { role: 'defaultSourceProvider', hidden: true },
  color: '#6B7280',
  priority: 1000,
});

/**
 * DSConstSignalTime - Constant provider for Signal<time> inputs
 */
export const DSConstSignalTime = createBlock({
  type: 'DSConstSignalTime',
  label: 'Constant (Signal<time>)',
  description: 'Hidden provider block for Signal<time> default sources',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [],
  outputs: [output('out', 'Output', parseTypeDesc('Signal:time'))],
  tags: { role: 'defaultSourceProvider', hidden: true },
  color: '#6B7280',
  priority: 1000,
});

/**
 * DSConstFieldFloat - Constant provider for Field<float> inputs
 */
export const DSConstFieldFloat = createBlock({
  type: 'DSConstFieldFloat',
  label: 'Constant (Field<float>)',
  description: 'Hidden provider block for Field<float> default sources',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [],
  outputs: [output('out', 'Output', parseTypeDesc('Field:float'))],
  tags: { role: 'defaultSourceProvider', hidden: true },
  color: '#6B7280',
  priority: 1000,
});

/**
 * DSConstFieldVec2 - Constant provider for Field<vec2> inputs
 */
export const DSConstFieldVec2 = createBlock({
  type: 'DSConstFieldVec2',
  label: 'Constant (Field<vec2>)',
  description: 'Hidden provider block for Field<vec2> default sources',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [],
  outputs: [output('out', 'Output', parseTypeDesc('Field:vec2'))],
  tags: { role: 'defaultSourceProvider', hidden: true },
  color: '#6B7280',
  priority: 1000,
});

/**
 * DSConstFieldColor - Constant provider for Field<color> inputs
 */
export const DSConstFieldColor = createBlock({
  type: 'DSConstFieldColor',
  label: 'Constant (Field<color>)',
  description: 'Hidden provider block for Field<color> default sources',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [],
  outputs: [output('out', 'Output', parseTypeDesc('Field:color'))],
  tags: { role: 'defaultSourceProvider', hidden: true },
  color: '#6B7280',
  priority: 1000,
});

/**
 * DSConstScalarFloat - Constant provider for Scalar<float> inputs
 */
export const DSConstScalarFloat = createBlock({
  type: 'DSConstScalarFloat',
  label: 'Constant (Scalar<float>)',
  description: 'Hidden provider block for Scalar<float> default sources',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [],
  outputs: [output('out', 'Output', parseTypeDesc('Scalar:float'))],
  tags: { role: 'defaultSourceProvider', hidden: true },
  color: '#6B7280',
  priority: 1000,
});

/**
 * DSConstScalarInt - Constant provider for Scalar<int> inputs
 */
export const DSConstScalarInt = createBlock({
  type: 'DSConstScalarInt',
  label: 'Constant (Scalar<int>)',
  description: 'Hidden provider block for Scalar<int> default sources',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [],
  outputs: [output('out', 'Output', parseTypeDesc('Scalar:int'))],
  tags: { role: 'defaultSourceProvider', hidden: true },
  color: '#6B7280',
  priority: 1000,
});

/**
 * DSConstScalarString - Constant provider for Scalar<string> inputs
 */
export const DSConstScalarString = createBlock({
  type: 'DSConstScalarString',
  label: 'Constant (Scalar<string>)',
  description: 'Hidden provider block for Scalar<string> default sources',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [],
  outputs: [output('out', 'Output', parseTypeDesc('Scalar:string'))],
  tags: { role: 'defaultSourceProvider', hidden: true },
  color: '#6B7280',
  priority: 1000,
});

/**
 * DSConstScalarWaveform - Constant provider for Scalar<waveform> inputs
 */
export const DSConstScalarWaveform = createBlock({
  type: 'DSConstScalarWaveform',
  label: 'Constant (Scalar<waveform>)',
  description: 'Hidden provider block for Scalar<waveform> default sources',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [],
  outputs: [output('out', 'Output', parseTypeDesc('Scalar:waveform'))],
  tags: { role: 'defaultSourceProvider', hidden: true },
  color: '#6B7280',
  priority: 1000,
});
