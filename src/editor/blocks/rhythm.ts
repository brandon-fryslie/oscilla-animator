/**
 * @file Rhythm blocks - Event generation and envelopes
 *
 * These blocks create rhythmic accents and envelope shapes from phase signals.
 */
import { createBlock } from './factory';
import { input, output } from './utils';

/**
 * PulseDivider - Subdivide phase into tick events
 *
 * Generates discrete tick events at regular subdivisions of a phase signal.
 * Useful for creating rhythmic accents synced to a master phase.
 *
 * Inputs with defaultSource:
 * - divisions: Scalar world (compile-time constant, triggers rebuild)
 */
export const PulseDivider = createBlock({

  type: 'PulseDivider',
  label: 'Pulse Divider',
  description: 'Generate tick events at phase subdivisions (e.g., quarter notes)',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [
    input('phase', 'Phase', 'Signal<phase>', {
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
      },
    }),
    input('divisions', 'Divisions', 'Scalar:number', {
      tier: 'primary',
      defaultSource: {
        value: 4,
        world: 'scalar', // Compile-time count value
        uiHint: { kind: 'slider', min: 1, max: 64, step: 1 },
      },
    }),
  ],
  outputs: [
    output('tick', 'Tick', 'Signal<Unit>'),
  ],
  // TODO: Remove paramSchema after compiler updated to use defaultSource (Phase 4)
  paramSchema: [
    {
      key: 'divisions',
      label: 'Divisions',
      type: 'number',
      min: 1,
      max: 64,
      step: 1,
      defaultValue: 4,
    },
  ],
  color: '#F59E0B',
  laneKind: 'Phase',
  priority: 15,
  // Auto-subscribe phase to phaseA bus when no explicit connection
  autoBusSubscriptions: {
    phase: 'phaseA',
  },});

/**
 * EnvelopeAD - Attack/Decay envelope from trigger events
 *
 * Generates an envelope that rises on trigger and decays over time.
 * Stateful block that tracks trigger time for envelope generation.
 *
 * Inputs with defaultSource:
 * - attack/decay/peak: Signal world (can be animated for dynamic envelopes)
 */
export const EnvelopeAD = createBlock({

  type: 'EnvelopeAD',
  label: 'Envelope (AD)',
  description: 'Attack/Decay envelope triggered by events',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [
    input('trigger', 'Trigger', 'Signal<Unit>', {
      tier: 'primary',
      defaultSource: {
        value: false,
        world: 'signal',
      },
    }),
    input('attack', 'Attack (s)', 'Signal<number>', {
      tier: 'primary',
      defaultSource: {
        value: 0.05,
        world: 'signal', // Envelope timing can be modulated
        uiHint: { kind: 'slider', min: 0.001, max: 2.0, step: 0.01 },
      },
    }),
    input('decay', 'Decay (s)', 'Signal<number>', {
      tier: 'primary',
      defaultSource: {
        value: 0.5,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0.001, max: 5.0, step: 0.01 },
      },
    }),
    input('peak', 'Peak Value', 'Signal<number>', {
      tier: 'secondary',
      defaultSource: {
        value: 1.0,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 10, step: 0.1 },
      },
    }),
  ],
  outputs: [
    output('env', 'Envelope', 'Signal<number>'),
  ],
  // TODO: Remove paramSchema after compiler updated to use defaultSource (Phase 4)
  paramSchema: [
    {
      key: 'attack',
      label: 'Attack (s)',
      type: 'number',
      min: 0.001,
      max: 2.0,
      step: 0.01,
      defaultValue: 0.05,
    },
    {
      key: 'decay',
      label: 'Decay (s)',
      type: 'number',
      min: 0.001,
      max: 5.0,
      step: 0.01,
      defaultValue: 0.5,
    },
    {
      key: 'peak',
      label: 'Peak Value',
      type: 'number',
      min: 0,
      max: 10,
      step: 0.1,
      defaultValue: 1.0,
    },
  ],
  color: '#F59E0B',
  laneKind: 'Phase',
  priority: 16,
  // Note: trigger input requires explicit wire connection from PulseDivider.tick
  // The pulse bus type (event:trigger) is incompatible with Signal<Unit>
});
