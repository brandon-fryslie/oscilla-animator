import type { DefaultSource, SlotTier, SlotType } from './types';
import type { TypeDomain } from '../compiler/ir/types';

export type IRTypeDesc = {
  world: 'signal' | 'field' | 'scalar' | 'event' | 'special';
  domain: TypeDomain;
  semantics?: string;
  unit?: string;
};

export type PortSpec = {
  id: string;
  label: string;
  slotType: SlotType;
  irType: IRTypeDesc;
  tier?: SlotTier;
  optional?: boolean;
  defaultSource?: DefaultSource;
};

export const OSCILLATOR_PORTS = {
  inputs: {
    phase: {
      id: 'phase',
      label: 'Phase',
      slotType: 'Signal<phase>',
      irType: { world: 'signal', domain: 'phase01' },
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
      },
    } as const,
    shape: {
      id: 'shape',
      label: 'Waveform',
      slotType: 'Scalar:waveform',
      irType: { world: 'scalar', domain: 'waveform' },
      tier: 'primary',
      defaultSource: {
        value: 'sine',
        world: 'config',
        uiHint: {
          kind: 'select',
          options: [
            { value: 'sine', label: 'Sine' },
            { value: 'cosine', label: 'Cosine' },
            { value: 'triangle', label: 'Triangle' },
            { value: 'saw', label: 'Sawtooth' },
          ],
        },
      },
    } as const,
    amplitude: {
      id: 'amplitude',
      label: 'Amplitude',
      slotType: 'Signal<number>',
      irType: { world: 'signal', domain: 'number' },
      tier: 'primary',
      optional: true,
      defaultSource: {
        value: 1,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 10, step: 0.1 },
      },
    } as const,
    bias: {
      id: 'bias',
      label: 'Bias',
      slotType: 'Signal<number>',
      irType: { world: 'signal', domain: 'number' },
      tier: 'secondary',
      optional: true,
      defaultSource: {
        value: 0,
        world: 'signal',
        uiHint: { kind: 'slider', min: -10, max: 10, step: 0.1 },
      },
    } as const,
  },
  inputOrder: ['phase', 'shape', 'amplitude', 'bias'] as const,
  outputs: {
    out: {
      id: 'out',
      label: 'Output',
      slotType: 'Signal<number>',
      irType: { world: 'signal', domain: 'number' },
    } as const,
  },
  outputOrder: ['out'] as const,
} as const satisfies {
  inputs: Record<string, PortSpec>;
  inputOrder: readonly string[];
  outputs: Record<string, PortSpec>;
  outputOrder: readonly string[];
};
