/**
 * DemoProgram Block Compiler
 *
 * Creates visual proof programs for testing the editor.
 * Supports multiple variants: lineDrawing, pulsingLine, bouncingCircle, particles, oscillator.
 */

import type { BlockCompiler, Program } from '../../../types';
import type { RenderTree, DrawNode } from '../../../../runtime/renderTree';
import { group, path, circle, withOpacity, withTransform2D } from '../../../../runtime/renderTree';

export const DemoProgramBlock: BlockCompiler = {
  type: 'demoProgram',
  inputs: [
    { name: 'speed', type: { kind: 'Scalar:number' }, required: false },
    { name: 'amp', type: { kind: 'Scalar:number' }, required: false },
  ],
  outputs: [{ name: 'program', type: { kind: 'RenderTreeProgram' } }],

  compile({ id, params, inputs }) {
    const variant = String(params.variant ?? 'lineDrawing');

    // For 'oscillator' variant: use inputs if wired, else params
    const speed =
      inputs.speed?.kind === 'Scalar:number' ? inputs.speed.value : Number(params.speed ?? 1);
    const amp =
      inputs.amp?.kind === 'Scalar:number' ? inputs.amp.value : Number(params.amp ?? 30);
    const stroke = String(params.stroke ?? '#ffffff');
    const cx = Number(params.cx ?? 200);
    const cy = Number(params.cy ?? 120);
    const r = Number(params.r ?? 8);

    const program: Program<RenderTree> = {
      signal: (tMs: number): RenderTree => {
        const t = tMs / 1000;

        switch (variant) {
          case 'oscillator': {
            const tScaled = t * speed;
            const x = cx + Math.sin(tScaled) * amp;

            return group(`${id}-root`, [
              circle(`${id}-dot`, x, cy, r, {
                fill: stroke,
              }),
              withOpacity(
                `${id}-baseline-op`,
                0.4,
                path(`${id}-baseline`, `M ${cx - amp} ${cy} L ${cx + amp} ${cy}`, {
                  stroke,
                  strokeWidth: 2,
                })
              ),
            ]);
          }

          case 'pulsingLine': {
            const opacity = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 2));
            return withOpacity(
              `${id}-pulse`,
              opacity,
              path(`${id}-line`, 'M 100 200 L 700 200', {
                stroke: '#4a9eff',
                strokeWidth: 4,
                strokeLinecap: 'round',
              })
            );
          }

          case 'bouncingCircle': {
            const y = Math.sin(t * 3) * 100;
            const scale = 0.8 + 0.4 * (0.5 + 0.5 * Math.sin(t * 6));
            return withTransform2D(
              `${id}-bounce`,
              {
                translate: { x: 400, y: 300 + y },
                scale,
              },
              circle(`${id}-ball`, 0, 0, 50, {
                fill: '#ff6b6b',
                stroke: '#fff',
                strokeWidth: 2,
              })
            );
          }

          case 'particles': {
            const particles: DrawNode[] = [];
            for (let i = 0; i < 15; i++) {
              const phase = (i / 15) * Math.PI * 2;
              const particleSpeed = 0.5 + (i % 5) * 0.3;
              const radius = 80 + Math.sin(t * particleSpeed + phase) * 40;
              const angle = t * particleSpeed + phase;
              const px = 400 + Math.cos(angle) * radius;
              const py = 300 + Math.sin(angle) * radius;
              const size = 5 + Math.sin(t * 2 + phase) * 3;
              const opacity = 0.5 + 0.5 * Math.sin(t + phase);

              particles.push(
                withOpacity(
                  `${id}-p-op-${i}`,
                  opacity,
                  circle(`${id}-p-${i}`, px, py, size, {
                    fill: `hsl(${(i * 24) % 360}, 70%, 60%)`,
                  })
                )
              );
            }
            return group(`${id}-particles`, particles);
          }

          case 'lineDrawing':
          default: {
            const duration = 3;
            const progress = Math.min(1, (t % (duration + 1)) / duration);
            const pathLength = 1000;
            const lines: DrawNode[] = [];

            for (let i = 0; i < 5; i++) {
              const lineProgress = Math.max(0, Math.min(1, progress * 5 - i));
              const dashOffset = pathLength * (1 - lineProgress);
              const y = 150 + i * 80;

              lines.push(
                path(`${id}-line-${i}`, `M 100 ${y} Q 400 ${y - 50} 700 ${y}`, {
                  stroke: `hsl(${200 + i * 30}, 70%, 60%)`,
                  strokeWidth: 4,
                  strokeLinecap: 'round',
                  strokeDasharray: String(pathLength),
                  strokeDashoffset: dashOffset,
                })
              );
            }
            return group(`${id}-drawing`, lines);
          }
        }
      },

      event: () => [],
    };

    return { program: { kind: 'RenderTreeProgram', value: program } };
  },
};
