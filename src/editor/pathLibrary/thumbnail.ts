import type { LineData } from '../../data/pathData';
import { pathPointsToSVGPath } from '../../data/pathData';

/**
 * Generate a simple SVG thumbnail from LineData[]
 */
export function generateThumbnail(
  data: LineData[],
  viewBox: string = '0 0 600 200'
): string {
  const paths = data
    .map((line) => {
      const d = pathPointsToSVGPath(line.points);
      return `<path d="M${line.startX} ${line.startY} ${d}" stroke="${line.color}" fill="none" stroke-width="3" stroke-linecap="round"/>`;
    })
    .join('\n');

  return `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
}
