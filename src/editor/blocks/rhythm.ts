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
 */
export const PulseDivider = createBlock({
  type: 'PulseDivider',
  label: 'Pulse Divider',
  subcategory: 'Time',
  category: 'Events',
  description: 'Generate tick events at phase subdivisions (e.g., quarter notes)',
  inputs: [
    input('phase', 'Phase', 'Signal<phase>'),
  ],
  outputs: [
    output('tick', 'Tick', 'Signal<Unit>'),
  ],
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
});

/**
 * EnvelopeAD - Attack/Decay envelope from trigger events
 *
 * Generates an envelope that rises on trigger and decays over time.
 * Stateful block that tracks trigger time for envelope generation.
 */
export const EnvelopeAD = createBlock({
  type: 'EnvelopeAD',
  label: 'Envelope (AD)',
  subcategory: 'Time',
  category: 'Events',
  description: 'Attack/Decay envelope triggered by events',
  inputs: [
    input('trigger', 'Trigger', 'Signal<Unit>'),
  ],
  outputs: [
    output('env', 'Envelope', 'Signal<number>'),
  ],
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
});
