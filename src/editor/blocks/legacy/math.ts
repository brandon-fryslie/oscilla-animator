import { createBlock } from '../factory';
import { input, output } from '../utils';

export const MathConstNumber = createBlock({
  type: 'math.constNumber',
  label: 'Const Number',
  form: 'primitive',
  category: 'Math',
  description: 'Constant scalar number',
  outputs: [output('out', 'Out', 'Scalar:number')],
  paramSchema: [
    { key: 'value', label: 'Value', type: 'number', min: -1000, max: 1000, step: 0.1, defaultValue: 0 },
  ],
  color: '#8b5cf6',
  laneKind: 'Scalars',
  priority: 1,
});

export const MathAddScalar = createBlock({
  type: 'math.addScalar',
  label: 'Add',
  form: 'primitive',
  category: 'Math',
  description: 'Add two scalar numbers',
  inputs: [
    input('a', 'A', 'Scalar:number'),
    input('b', 'B', 'Scalar:number'),
  ],
  outputs: [output('out', 'Out', 'Scalar:number')],
  color: '#8b5cf6',
  laneKind: 'Scalars',
  priority: 2,
});

export const MathMulScalar = createBlock({
  type: 'math.mulScalar',
  label: 'Multiply',
  form: 'primitive',
  category: 'Math',
  description: 'Multiply two scalar numbers',
  inputs: [
    input('a', 'A', 'Scalar:number'),
    input('b', 'B', 'Scalar:number'),
  ],
  outputs: [output('out', 'Out', 'Scalar:number')],
  color: '#8b5cf6',
  laneKind: 'Scalars',
  priority: 2,
});

export const MathSinScalar = createBlock({
  type: 'math.sinScalar',
  label: 'Sin',
  form: 'primitive',
  category: 'Math',
  description: 'Sine of a scalar number',
  inputs: [input('x', 'X', 'Scalar:number')],
  outputs: [output('out', 'Out', 'Scalar:number')],
  color: '#8b5cf6',
  laneKind: 'Scalars',
  priority: 3,
});
