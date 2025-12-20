/**
 * TextSource Block Compiler
 *
 * Creates a scene from text content, with each character as an element.
 * Used for typewriter effects and character-by-character animations.
 *
 * Outputs: Scene with character positions and content.
 */

import type { BlockCompiler } from '../../../types';

interface CharacterInfo {
  char: string;
  index: number;
  x: number;
  y: number;
  width: number;
}

interface TextScene {
  text: string;
  characters: CharacterInfo[];
  bounds: { width: number; height: number };
}

export const TextSourceBlock: BlockCompiler = {
  type: 'TextSource',
  inputs: [],
  outputs: [{ name: 'scene', type: { kind: 'Scene' } }],

  compile({ params }) {
    const text = (params.text as string) ?? 'LOOM99';
    const fontSize = Number(params.fontSize ?? 48);
    const letterSpacing = Number(params.letterSpacing ?? 4);
    const startX = Number(params.startX ?? 100);
    const startY = Number(params.startY ?? 200);

    // Estimate character width (monospace assumption for simplicity)
    const charWidth = fontSize * 0.6;

    const characters: CharacterInfo[] = [];
    let currentX = startX;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === ' ') {
        currentX += charWidth * 0.5;
        continue;
      }

      characters.push({
        char,
        index: characters.length,
        x: currentX,
        y: startY,
        width: charWidth,
      });

      currentX += charWidth + letterSpacing;
    }

    const scene: TextScene = {
      text,
      characters,
      bounds: {
        width: currentX - startX,
        height: fontSize,
      },
    };

    return {
      scene: {
        kind: 'Scene',
        value: scene,
      },
    };
  },
};
