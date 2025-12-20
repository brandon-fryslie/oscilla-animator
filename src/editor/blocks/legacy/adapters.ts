import { createBlock } from '../factory';
import { input, output } from '../utils';

export const SceneToTargets = createBlock({
  type: 'SceneToTargets',
  label: 'Scene → Targets',
  form: 'primitive',
  category: 'Adapters',
  description: 'Convert Scene to SceneTargets (sample points from paths)',
  inputs: [input('scene', 'Scene', 'Scene')],
  outputs: [output('targets', 'Targets', 'SceneTargets')],
  color: '#71717a',
  laneKind: 'Scene',
  priority: 10,
});

export const FieldToSignal = createBlock({
  type: 'FieldToSignal',
  label: 'Field → Signal',
  form: 'primitive',
  category: 'Adapters',
  description: 'Convert Field<A> to Signal<A> by freezing at compilation time',
  inputs: [input('field', 'Field', 'Field<number>')],
  outputs: [output('signal', 'Signal', 'Signal<number>')],
  color: '#71717a',
  laneKind: 'Fields',
  priority: 10,
});

export const ScalarToSignalNumber = createBlock({
  type: 'scalarToSignalNumber',
  label: 'Scalar → Signal',
  form: 'primitive',
  category: 'Adapters',
  description: 'Lift Scalar:number to a constant Signal<number>',
  inputs: [input('x', 'X', 'Scalar:number')],
  outputs: [output('signal', 'Signal', 'Signal<number>')],
  paramSchema: [
    { key: 'value', label: 'Value', type: 'number', defaultValue: 0 },
  ],
  color: '#71717a',
  laneKind: 'Scalars',
  priority: 10,
});

export const SignalToScalarNumber = createBlock({
  type: 'signalToScalarNumber',
  label: 'Signal → Scalar',
  form: 'primitive',
  category: 'Adapters',
  description: 'Sample Signal<number> at t=0 to produce Scalar:number',
  inputs: [input('signal', 'Signal', 'Signal<number>')],
  outputs: [output('scalar', 'Scalar', 'Scalar:number')],
  color: '#71717a',
  laneKind: 'Scalars',
  priority: 10,
});

export const TimeToPhase = createBlock({
  type: 'timeToPhase',
  label: 'Time → Phase',
  form: 'primitive',
  category: 'Adapters',
  description: 'Convert Signal:Time to cyclic Signal:Unit using a period',
  inputs: [
    input('time', 'Time', 'Signal<Time>'),
    input('period', 'Period (s)', 'Scalar:number'),
  ],
  outputs: [output('phase', 'Phase', 'Signal<Unit>')],
  paramSchema: [
    { key: 'period', label: 'Period', type: 'number', defaultValue: 1 },
  ],
  color: '#71717a',
  laneKind: 'Phase',
  priority: 10,
});

export const PhaseToTime = createBlock({
  type: 'phaseToTime',
  label: 'Phase → Time',
  form: 'primitive',
  category: 'Adapters',
  description: 'Convert Signal:Unit to Signal:Time using a period',
  inputs: [
    input('phase', 'Phase', 'Signal<Unit>'),
    input('period', 'Period (s)', 'Scalar:number'),
  ],
  outputs: [output('time', 'Time', 'Signal<Time>')],
  paramSchema: [
    { key: 'period', label: 'Period', type: 'number', defaultValue: 1 },
  ],
  color: '#71717a',
  laneKind: 'Phase',
  priority: 10,
});

export const WrapPhase = createBlock({
  type: 'wrapPhase',
  label: 'Wrap Phase',
  form: 'primitive',
  category: 'Adapters',
  description: 'Wrap Signal:Unit to [0,1)',
  inputs: [input('phase', 'Phase', 'Signal<Unit>')],
  outputs: [output('wrapped', 'Wrapped', 'Signal<Unit>')],
  color: '#71717a',
  laneKind: 'Phase',
  priority: 10,
});

export const ElementCount = createBlock({
  type: 'elementCount',
  label: 'Element Count',
  form: 'primitive',
  category: 'Adapters',
  description: 'Get the number of elements from scene targets',
  inputs: [input('targets', 'Targets', 'SceneTargets')],
  outputs: [output('count', 'Count', 'ElementCount')],
  color: '#71717a',
  laneKind: 'Scene',
  priority: 10,
});

export const LiftScalarToField = createBlock({
  type: 'lift.scalarToFieldNumber',
  label: 'Scalar → Field',
  form: 'primitive',
  category: 'Adapters',
  description: 'Lift Scalar:number to Field<number>',
  inputs: [input('x', 'X', 'Scalar:number')],
  outputs: [output('out', 'Out', 'Field<number>')],
  color: '#71717a',
  laneKind: 'Fields',
  priority: 10,
});
