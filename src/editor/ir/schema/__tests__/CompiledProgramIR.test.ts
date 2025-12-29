import { describe, it, expect } from 'vitest';
import type {
  CompiledProgramIR,
  NodeIR,
  BusIR,
  ScheduleIR,
  StepIR,
  CyclicTimeModelIR,
} from '../CompiledProgramIR';
import { nodeId, busId, nodeIndex, busIndex, valueSlot, stepId, stateId } from '../../types/Indices';

describe('CompiledProgramIR Schema', () => {
  describe('Minimal Program', () => {
    it('can construct a minimal valid program', () => {
      const program: CompiledProgramIR = {
        irVersion: 1,
        patchId: 'test-patch',
        patchRevision: 1,
        compileId: 'compile-1',
        seed: 42,

        timeModel: {
          kind: 'cyclic',
          periodMs: 4000,
          mode: 'loop',
          phaseDomain: '0..1',
        },

        types: { types: [] },
        nodes: { nodes: [], nodeIdToIndex: new Map() },
        buses: { buses: [], busIdToIndex: new Map() },
        constPool: { entries: new Map() },
        defaultSources: { sources: new Map() },
        transforms: { chains: new Map() },

        schedule: {
          steps: [],
          phasePartition: {
            timeDerive: [],
            preBus: [],
            bus: [],
            postBus: [],
            materializeRender: [],
            renderAssemble: [],
          },
        },

        outputs: [],
        debugIndex: {
          compileId: 'compile-1',
          patchRevision: 1,
          nodeIdToIndex: new Map(),
          nodeIndexToId: [],
          busIdToIndex: new Map(),
          busIndexToId: [],
          portKeyToSlot: new Map(),
          slotToPortKey: [],
          nodeIdToBlockId: new Map(),
        },
        meta: {
          names: {
            nodes: new Map(),
            buses: new Map(),
            steps: new Map(),
          },
        },
      };

      expect(program.irVersion).toBe(1);
      expect(program.timeModel.kind).toBe('cyclic');
      expect(program.nodes.nodes.length).toBe(0);
    });
  });

  describe('NodeIR', () => {
    it('types a node with math operation correctly', () => {
      const node: NodeIR = {
        id: nodeId('osc-1'),
        index: nodeIndex(0),
        capability: 'pure',
        op: { op: 'math.sin' },
        inputs: [
          {
            name: 'phase',
            type: { world: 'signal', domain: 'float', semantics: 'phase(0..1)' },
            source: { kind: 'slot', slot: valueSlot(0) },
          },
        ],
        outputs: [
          {
            name: 'out',
            type: { world: 'signal', domain: 'float' },
            slot: valueSlot(1),
          },
        ],
      };

      expect(node.op.op).toBe('math.sin');
      expect(node.inputs[0].source.kind).toBe('slot');
      expect(node.capability).toBe('pure');
    });

    it('types a time node correctly', () => {
      const node: NodeIR = {
        id: nodeId('time-phase'),
        index: nodeIndex(0),
        capability: 'time',
        op: { op: 'time.phase01' },
        inputs: [],
        outputs: [
          {
            name: 'phase',
            type: { world: 'signal', domain: 'float', semantics: 'phase(0..1)' },
            slot: valueSlot(0),
          },
        ],
      };

      expect(node.capability).toBe('time');
      expect(node.op.op).toBe('time.phase01');
    });

    it('types a stateful node correctly', () => {
      const node: NodeIR = {
        id: nodeId('integrator'),
        index: nodeIndex(0),
        capability: 'state',
        op: { op: 'state.integrate' },
        inputs: [
          {
            name: 'input',
            type: { world: 'signal', domain: 'float' },
            source: { kind: 'slot', slot: valueSlot(0) },
          },
        ],
        outputs: [
          {
            name: 'out',
            type: { world: 'signal', domain: 'float' },
            slot: valueSlot(1),
          },
        ],
        state: [
          {
            stateId: stateId('int-state'),
            type: { world: 'signal', domain: 'float' },
            policy: 'frame',
          },
        ],
      };

      expect(node.capability).toBe('state');
      expect(node.state).toBeDefined();
      expect(node.state![0].policy).toBe('frame');
    });

    it('types a render node correctly', () => {
      const node: NodeIR = {
        id: nodeId('renderer'),
        index: nodeIndex(0),
        capability: 'render',
        op: { op: 'render.instances2d' },
        inputs: [
          {
            name: 'positions',
            type: { world: 'field', domain: 'vec2', semantics: 'point' },
            source: { kind: 'slot', slot: valueSlot(0) },
          },
        ],
        outputs: [
          {
            name: 'out',
            type: { world: 'signal', domain: 'renderTree' },
            slot: valueSlot(1),
          },
        ],
      };

      expect(node.capability).toBe('render');
      expect(node.op.op).toBe('render.instances2d');
    });
  });

  describe('BusIR', () => {
    it('types a bus correctly', () => {
      const bus: BusIR = {
        id: busId('phaseA'),
        index: busIndex(0),
        type: { world: 'signal', domain: 'float', semantics: 'phase(0..1)' },
        combineMode: 'last',
        publishers: [
          {
            sourceSlot: valueSlot(1),
            sortKey: 0,
            enabled: true,
          },
        ],
        listeners: [],
        outputSlot: valueSlot(100),
      };

      expect(bus.combineMode).toBe('last');
      expect(bus.publishers.length).toBe(1);
      expect(bus.publishers[0].enabled).toBe(true);
    });

    it('types a bus with multiple publishers', () => {
      const bus: BusIR = {
        id: busId('energy'),
        index: busIndex(1),
        type: { world: 'signal', domain: 'float' },
        combineMode: 'sum',
        publishers: [
          { sourceSlot: valueSlot(10), sortKey: 0, enabled: true },
          { sourceSlot: valueSlot(11), sortKey: 1, enabled: true, weight: 0.5 },
          { sourceSlot: valueSlot(12), sortKey: 2, enabled: false },
        ],
        listeners: [
          {
            targetNodeIndex: nodeIndex(5),
            targetInputIndex: 0,
            enabled: true,
          },
        ],
        outputSlot: valueSlot(101),
      };

      expect(bus.combineMode).toBe('sum');
      expect(bus.publishers.length).toBe(3);
      expect(bus.publishers[1].weight).toBe(0.5);
      expect(bus.listeners.length).toBe(1);
    });
  });

  describe('ScheduleIR', () => {
    it('types a schedule with various steps', () => {
      const schedule: ScheduleIR = {
        steps: [
          {
            kind: 'timeDerive',
            id: stepId('time-0'),
            outputSlots: [valueSlot(0), valueSlot(1)],
          },
          {
            kind: 'nodeEval',
            id: stepId('node-0'),
            nodeIndex: nodeIndex(0),
          },
          {
            kind: 'busEval',
            id: stepId('bus-0'),
            busIndex: busIndex(0),
          },
          {
            kind: 'renderAssemble',
            id: stepId('render-0'),
            rootNodeIndices: [nodeIndex(2)],
          },
        ],
        phasePartition: {
          timeDerive: [stepId('time-0')],
          preBus: [stepId('node-0')],
          bus: [stepId('bus-0')],
          postBus: [],
          materializeRender: [],
          renderAssemble: [stepId('render-0')],
        },
      };

      expect(schedule.steps.length).toBe(4);
      expect(schedule.steps[0].kind).toBe('timeDerive');
      expect(schedule.phasePartition.timeDerive.length).toBe(1);
    });

    it('types a materialize step', () => {
      const step: StepIR = {
        kind: 'materialize',
        id: stepId('mat-0'),
        exprId: 'field-expr-1',
        targetBuffer: 'positions',
        domainSize: valueSlot(50),
      };

      expect(step.kind).toBe('materialize');
      if (step.kind === 'materialize') {
        expect(step.exprId).toBe('field-expr-1');
        expect(step.targetBuffer).toBe('positions');
      }
    });

    it('types a debug probe step', () => {
      const step: StepIR = {
        kind: 'debugProbe',
        id: stepId('probe-0'),
        targetSlot: valueSlot(5),
        probeId: 'inspect-phase',
      };

      expect(step.kind).toBe('debugProbe');
      if (step.kind === 'debugProbe') {
        expect(step.probeId).toBe('inspect-phase');
      }
    });
  });

  describe('TimeModelIR', () => {
    it('types cyclic time model', () => {
      const model: CyclicTimeModelIR = {
        kind: 'cyclic',
        periodMs: 4000,
        mode: 'loop',
        phaseDomain: '0..1',
      };

      expect(model.kind).toBe('cyclic');
      expect(model.periodMs).toBe(4000);
      expect(model.mode).toBe('loop');
    });
  });

  describe('InputSourceIR', () => {
    it('types all input source variants', () => {
      const slotSource = { kind: 'slot' as const, slot: valueSlot(0) };
      const busSource = { kind: 'bus' as const, busIndex: busIndex(0) };
      const constSource = { kind: 'const' as const, constId: 'default-value' };
      const defaultSource = { kind: 'defaultSource' as const, defaultId: 'param-x' };
      const railSource = { kind: 'rail' as const, railId: 'time-rail' };
      const externalSource = { kind: 'external' as const, externalId: 'viewport' };

      expect(slotSource.kind).toBe('slot');
      expect(busSource.kind).toBe('bus');
      expect(constSource.kind).toBe('const');
      expect(defaultSource.kind).toBe('defaultSource');
      expect(railSource.kind).toBe('rail');
      expect(externalSource.kind).toBe('external');
    });
  });

  describe('OpCode', () => {
    it('types various operation codes', () => {
      const timeOp = { op: 'time.phase01' as const };
      const mathOp = { op: 'math.sin' as const };
      const vecOp = { op: 'vec.normalize' as const };
      const stateOp = { op: 'state.slew' as const };
      const renderOp = { op: 'render.instances2d' as const };
      const fieldOp = { op: 'field.broadcast' as const };
      const customOp = { op: 'custom' as const, kernelId: 'my-kernel' };

      expect(timeOp.op).toBe('time.phase01');
      expect(mathOp.op).toBe('math.sin');
      expect(vecOp.op).toBe('vec.normalize');
      expect(stateOp.op).toBe('state.slew');
      expect(renderOp.op).toBe('render.instances2d');
      expect(fieldOp.op).toBe('field.broadcast');
      expect(customOp.kernelId).toBe('my-kernel');
    });
  });
});
