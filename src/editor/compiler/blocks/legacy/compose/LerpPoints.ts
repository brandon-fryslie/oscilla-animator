/**
 * LerpPoints Block Compiler
 *
 * Interpolates between two Field<Point> arrays based on per-element progress.
 * Outputs Signal<Point[]> - animated positions for each element.
 */

import type {
  BlockCompiler,
  CompiledOutputs,
  Field,
  RuntimeCtx,
  Vec2,
} from '../../../types';

function lerpVec2(a: Vec2, b: Vec2, t: number): Vec2 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

export const LerpPointsBlock: BlockCompiler = {
  type: 'lerpPoints',
  inputs: [
    { name: 'starts', type: { kind: 'Field:vec2' }, required: true },
    { name: 'ends', type: { kind: 'Field:vec2' }, required: true }, // Also accepts TargetScene
    { name: 'progress', type: { kind: 'Signal:Unit' }, required: true }, // Actually Signal<number[]>
  ],
  outputs: [
    { name: 'positions', type: { kind: 'Signal:vec2' } }, // Actually Signal<Vec2[]>
  ],

  compile({ inputs, ctx }) {
    // Validate starts - accept Field:vec2 or Field:Point
    const startsKind = inputs.starts?.kind;
    if (startsKind !== 'Field:vec2' && startsKind !== 'Field:Point') {
      return {
        positions: { kind: 'Error', message: 'LerpPoints: starts must be Field:vec2 or Field:Point' },
      };
    }

    // Validate ends - accept Field:vec2, Field:Point, or TargetScene
    const endsKind = inputs.ends?.kind;
    if (endsKind !== 'Field:vec2' && endsKind !== 'Field:Point' && endsKind !== 'TargetScene') {
      return {
        positions: { kind: 'Error', message: 'LerpPoints: ends must be Field:vec2, Field:Point, or TargetScene' },
      };
    }

    if (inputs.progress?.kind !== 'Signal:Unit') {
      return {
        positions: { kind: 'Error', message: 'LerpPoints: progress must be Signal:Unit' },
      };
    }

    const fromField: Field<Vec2> = inputs.starts.value;

    // Handle ends - either a Field or extract from TargetScene
    let toField: Field<Vec2>;
    if (endsKind === 'TargetScene') {
      // Extract target positions from TargetScene as a field
      // TargetScene.targets is Vec2[] directly (not {position: Vec2}[])
      const targetScene = inputs.ends.value as unknown as { targets?: Vec2[] };
      const targetPositions = targetScene.targets ?? [];
      toField = (_seed: number, n: number) => {
        // Return target positions, cycling if n > targets.length
        const result: Vec2[] = new Array(n);
        for (let i = 0; i < n; i++) {
          result[i] = targetPositions[i % targetPositions.length] ?? { x: 0, y: 0 };
        }
        return result;
      };
    } else {
      toField = inputs.ends.value;
    }
    const progressSignal = inputs.progress.value as unknown as (tMs: number, ctx: RuntimeCtx) => readonly number[];

    const seed = 42;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const n = (ctx as any).elementCount ?? 10;

    // Evaluate position fields at compile time (BULK form)
    const fromPositions = fromField(seed, n, ctx);
    const toPositions = toField(seed, n, ctx);

    // Create signal that computes interpolated positions at runtime
    const positionsSignal = (tMs: number, rtCtx: RuntimeCtx): readonly Vec2[] => {
      const progressArray = progressSignal(tMs, rtCtx);
      const positions: Vec2[] = new Array(n);

      for (let i = 0; i < n; i++) {
        const from = fromPositions[i] ?? { x: 0, y: 0 };
        const to = toPositions[i] ?? { x: 0, y: 0 };
        const t = progressArray[i] ?? 0;
        positions[i] = lerpVec2(from, to, t);
      }

      return positions;
    };

    return { positions: { kind: 'Signal:vec2', value: positionsSignal } } as unknown as CompiledOutputs;
  },
};
