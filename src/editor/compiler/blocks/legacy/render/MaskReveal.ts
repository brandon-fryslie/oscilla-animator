/**
 * MaskReveal Block Compiler
 *
 * Creates a mask-based reveal effect.
 * Used for wipe transitions where content is progressively revealed.
 *
 * Accepts RenderTreeProgram and outputs RenderTreeProgram with mask applied.
 */

import type { BlockCompiler, RuntimeCtx, Program } from '../../../types';
import type { RenderTree, DrawNode } from '../../../../runtime/renderTree';
import { group } from '../../../../runtime/renderTree';

type WipeDirection = 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top' | 'radial';

export const MaskRevealBlock: BlockCompiler = {
  type: 'MaskReveal',
  inputs: [
    { name: 'content', type: { kind: 'RenderTreeProgram' }, required: true },
    { name: 'progress', type: { kind: 'Signal:Unit' }, required: true },
  ],
  outputs: [{ name: 'tree', type: { kind: 'RenderTreeProgram' } }],

  compile({ inputs, params, id }) {
    const direction = (params.direction as WipeDirection) ?? 'left-to-right';
    const softEdge = Number(params.softEdge ?? 20);
    const sceneWidth = Number(params.sceneWidth ?? 400);
    const sceneHeight = Number(params.sceneHeight ?? 300);

    // Get content program and progress signal from inputs
    const contentProgram = inputs.content?.kind === 'RenderTreeProgram'
      ? inputs.content.value as Program<RenderTree>
      : null;
    const progressSignal = inputs.progress?.kind === 'Signal:Unit'
      ? inputs.progress.value as (t: number, ctx: RuntimeCtx) => number
      : null;

    if (!contentProgram) {
      return {
        tree: { kind: 'Error', message: 'MaskReveal: content must be RenderTreeProgram' },
      };
    }

    // Create the masked program
    const program: Program<RenderTree> = {
      signal: (tMs: number, rt: RuntimeCtx): RenderTree => {
        const progress = progressSignal ? progressSignal(tMs, rt) : 1;

        // Calculate clip rect based on direction and progress
        let clipX = 0, clipY = 0, clipWidth = sceneWidth, clipHeight = sceneHeight;

        switch (direction) {
          case 'left-to-right':
            clipWidth = progress * sceneWidth;
            break;
          case 'right-to-left':
            clipX = (1 - progress) * sceneWidth;
            clipWidth = progress * sceneWidth;
            break;
          case 'top-to-bottom':
            clipHeight = progress * sceneHeight;
            break;
          case 'bottom-to-top':
            clipY = (1 - progress) * sceneHeight;
            clipHeight = progress * sceneHeight;
            break;
          case 'radial': {
            // Radial reveal from center
            // For radial, we'll use a different approach - apply opacity based on distance
            break;
          }
        }

        // Get the content tree at this time
        const contentTree = contentProgram.signal(tMs, rt);

        // Create a clipped group wrapper
        // Note: clip is an experimental extension not in base DrawNode type
        const clippedGroup = {
          kind: 'group' as const,
          id: `mask-reveal-${id}`,
          children: [contentTree as DrawNode],
          clip: {
            kind: 'rect',
            x: clipX,
            y: clipY,
            width: Math.max(0, clipWidth),
            height: Math.max(0, clipHeight),
          },
        } as DrawNode;

        // Add glow line at reveal edge for visual effect
        const glowNodes: DrawNode[] = [];
        if (softEdge > 0 && progress > 0 && progress < 1) {
          let lineX1 = 0, lineY1 = 0, lineX2 = 0, lineY2 = 0;

          switch (direction) {
            case 'left-to-right':
              lineX1 = lineX2 = clipWidth;
              lineY1 = 0;
              lineY2 = sceneHeight;
              break;
            case 'right-to-left':
              lineX1 = lineX2 = clipX;
              lineY1 = 0;
              lineY2 = sceneHeight;
              break;
            case 'top-to-bottom':
              lineX1 = 0;
              lineX2 = sceneWidth;
              lineY1 = lineY2 = clipHeight;
              break;
            case 'bottom-to-top':
              lineX1 = 0;
              lineX2 = sceneWidth;
              lineY1 = lineY2 = clipY;
              break;
          }

          // Edge glow intensity peaks at middle of reveal
          const glowIntensity = Math.sin(progress * Math.PI);

          // Note: 'line' geometry is an experimental extension
          const glowLine = {
            kind: 'shape' as const,
            id: `mask-glow-${id}`,
            geom: {
              kind: 'line',
              x1: lineX1,
              y1: lineY1,
              x2: lineX2,
              y2: lineY2,
            },
            style: {
              stroke: '#00ffff',
              strokeWidth: softEdge * 0.5,
              opacity: glowIntensity * 0.8,
              filter: `blur(${softEdge}px)`,
            },
          } as unknown as DrawNode;
          glowNodes.push(glowLine);
        }

        return group(`mask-reveal-root-${id}`, [clippedGroup, ...glowNodes]);
      },
      event: contentProgram.event,
    };

    return { tree: { kind: 'RenderTreeProgram', value: program } };
  },
};
