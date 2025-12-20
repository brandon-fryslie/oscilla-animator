/**
 * SVGPathSource Block Compiler
 *
 * Loads SVG path data from the path library.
 * Outputs: TargetScene with sampled points from paths.
 */

import type { BlockCompiler, TargetScene, Vec2 } from '../../../types';
import type { LineData } from '../../../../../data/pathData';
import { pathLibrary } from '../../../../pathLibrary';

/**
 * Sample points along a path defined by LineData.
 * Returns approximate points along the path for particle targets.
 *
 * Logic:
 * - If first point is a curve (Q, A), use startX/startY as actual start
 * - If first point is a line point, use it as start (startX/startY is spawn origin)
 */
function samplePathPoints(line: LineData, density: number = 1.0): Vec2[] {
  const points: Vec2[] = [];
  const { startX, startY, points: pathPoints } = line;

  if (pathPoints.length === 0) return points;

  const firstPoint = pathPoints[0]!;
  const firstIsCurve = firstPoint.type === 'Q' || firstPoint.type === 'A';

  // Determine starting point
  let lastX: number;
  let lastY: number;
  let startIndex: number;

  if (firstIsCurve) {
    // First point is a curve - startX/startY is the actual shape start
    lastX = startX;
    lastY = startY;
    startIndex = 0;
  } else {
    // First point is a line point - use it as start
    lastX = firstPoint.x;
    lastY = firstPoint.y;
    startIndex = 1;
  }

  points.push({ x: lastX, y: lastY });

  for (let pi = startIndex; pi < pathPoints.length; pi++) {
    const point = pathPoints[pi]!;
    const steps = Math.max(1, Math.floor(10 * density));

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;

      if (point.type === 'Q' && point.cx !== undefined && point.cy !== undefined) {
        // Quadratic bezier
        const x =
          (1 - t) * (1 - t) * lastX +
          2 * (1 - t) * t * point.cx +
          t * t * point.x;
        const y =
          (1 - t) * (1 - t) * lastY +
          2 * (1 - t) * t * point.cy +
          t * t * point.y;
        points.push({ x, y });
      } else if (point.type === 'A' && point.rx !== undefined && point.ry !== undefined) {
        // Arc - sample actual arc curve
        const cx = (lastX + point.x) / 2;
        const cy = (lastY + point.y) / 2;
        const rx = point.rx;
        const ry = point.ry;
        const startAngle = Math.atan2(lastY - cy, lastX - cx);
        const endAngle = Math.atan2(point.y - cy, point.x - cx);
        const sweep = point.sweep === 1 ? 1 : -1;
        let deltaAngle = endAngle - startAngle;
        if (point.largeArc === 1) {
          if (Math.abs(deltaAngle) < Math.PI) {
            deltaAngle += sweep * 2 * Math.PI;
          }
        }
        const angle = startAngle + deltaAngle * t;
        const x = cx + rx * Math.cos(angle);
        const y = cy + ry * Math.sin(angle);
        points.push({ x, y });
      } else {
        // Line segment
        const x = lastX + (point.x - lastX) * t;
        const y = lastY + (point.y - lastY) * t;
        points.push({ x, y });
      }
    }

    lastX = point.x;
    lastY = point.y;
  }

  return points;
}

/**
 * Get color for each sampled point based on the path it came from.
 */
function getPathColors(paths: LineData[], pointsPerPath: number[]): string[] {
  const colors: string[] = [];
  for (let i = 0; i < paths.length; i++) {
    const count = pointsPerPath[i] ?? 0;
    for (let j = 0; j < count; j++) {
      colors.push(paths[i]!.color);
    }
  }
  return colors;
}

/**
 * Migrate old target values to new library ID format.
 * Called at compile time to handle legacy patches.
 */
function migrateTargetId(target: string): string {
  // Map old hardcoded values to new library IDs
  if (target === 'logo') return 'builtin:logo';
  if (target === 'text') return 'builtin:text';
  if (target === 'heart') return 'builtin:heart';
  // Already in new format or user-defined path
  return target;
}

export const SVGPathSourceBlock: BlockCompiler = {
  type: 'SVGPathSource',
  inputs: [],
  outputs: [{ name: 'scene', type: { kind: 'TargetScene' } }],

  compile({ id, params }) {
    const rawTarget = String(params.target ?? 'builtin:logo');
    const targetId = migrateTargetId(rawTarget);
    const density = Number(params.density ?? 1.0);

    // Get path data from library
    const entry = pathLibrary.getById(targetId);
    if (!entry) {
      throw new Error(`SVGPathSource: Path not found in library: "${targetId}"`);
    }

    const paths = entry.data;

    // Sample points from all paths
    const allPoints: Vec2[] = [];
    const pointsPerPath: number[] = [];
    const groups: number[] = [];

    for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
      const pathData = paths[pathIndex]!;
      const pathPoints = samplePathPoints(pathData, density);
      pointsPerPath.push(pathPoints.length);

      for (const point of pathPoints) {
        allPoints.push(point);
        groups.push(pathIndex);
      }
    }

    // Get colors for each point
    const colors = getPathColors(paths, pointsPerPath);

    // Compute bounds
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of allPoints) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    const scene: TargetScene = {
      id: `${id}-scene`,
      targets: allPoints,
      groups,
      bounds: {
        min: { x: minX, y: minY },
        max: { x: maxX, y: maxY },
      },
      meta: {
        source: targetId,
        colors,
        pathCount: paths.length,
      },
    };

    return { scene: { kind: 'TargetScene', value: scene } };
  },
};
