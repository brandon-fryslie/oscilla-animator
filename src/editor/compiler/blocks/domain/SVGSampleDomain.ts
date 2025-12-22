/**
 * SVGSampleDomain Block Compiler
 *
 * Samples points from an SVG path and creates a domain with stable element IDs.
 * This combines domain creation with SVG path sampling in a single block.
 *
 * Element IDs are stable: "sample-N" format ensures consistent identity.
 * Sampled positions (pos0) are deterministic based on the SVG path and sample count.
 */

import type { BlockCompiler, Vec2, Domain } from '../../types';
import { createDomain } from '../../unified/Domain';
import { isDefined, isNonEmptyString } from '../../../types/helpers';

type PositionField = (seed: number, n: number) => readonly Vec2[];

/**
 * Simple SVG path parser and sampler.
 * For now, supports basic path commands (M, L, C, Q).
 * Returns array of sampled points.
 */
function sampleSVGPath(
  pathData: string,
  sampleCount: number,
  distribution: 'even' | 'parametric'
): Vec2[] {
  if (!isDefined(pathData) || pathData.trim() === '') {
    // No path data - return a simple line as fallback
    const points: Vec2[] = [];
    for (let i = 0; i < sampleCount; i++) {
      const t = i / Math.max(1, sampleCount - 1);
      points.push({ x: 100 + t * 300, y: 200 });
    }
    return points;
  }

  // Parse SVG path into segments
  const segments = parseSVGPath(pathData);

  // Calculate total length for even distribution
  const totalLength = distribution === 'even'
    ? calculatePathLength(segments)
    : sampleCount;

  // Sample points
  const points: Vec2[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const t = i / Math.max(1, sampleCount - 1);

    if (distribution === 'even') {
      // Sample by arc length
      const targetLength = t * totalLength;
      points.push(sampleAtLength(segments, targetLength));
    } else {
      // Sample by parametric t-value
      points.push(sampleAtT(segments, t));
    }
  }

  return points;
}

interface PathSegment {
  type: 'M' | 'L' | 'C' | 'Q' | 'Z';
  points: Vec2[];
  length?: number;
}

/**
 * Very basic SVG path parser.
 * Supports M (moveto), L (lineto), C (cubic bezier), Q (quadratic bezier), Z (closepath).
 */
function parseSVGPath(pathData: string): PathSegment[] {
  const segments: PathSegment[] = [];
  let currentPos: Vec2 = { x: 0, y: 0 };
  let startPos: Vec2 = { x: 0, y: 0 };

  // Simple regex-based parser (not production-ready, but sufficient for MVP)
  const commands = pathData.match(/[MmLlCcQqZz][^MmLlCcQqZz]*/g);
  if (commands === null || commands === undefined) {
    return [];
  }

  for (const cmd of commands) {
    const type = cmd[0].toUpperCase();
    const coords = cmd
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .filter(isNonEmptyString)
      .map(Number);

    if (type === 'M') {
      // Moveto
      const isRelative = cmd[0] === 'm';
      const x = isRelative ? currentPos.x + coords[0] : coords[0];
      const y = isRelative ? currentPos.y + coords[1] : coords[1];
      currentPos = { x, y };
      startPos = { x, y };
      segments.push({ type: 'M', points: [currentPos] });
    } else if (type === 'L') {
      // Lineto
      const isRelative = cmd[0] === 'l';
      for (let i = 0; i < coords.length; i += 2) {
        const x = isRelative ? currentPos.x + coords[i] : coords[i];
        const y = isRelative ? currentPos.y + coords[i + 1] : coords[i + 1];
        const endPos = { x, y };
        segments.push({ type: 'L', points: [currentPos, endPos] });
        currentPos = endPos;
      }
    } else if (type === 'C') {
      // Cubic bezier
      const isRelative = cmd[0] === 'c';
      for (let i = 0; i < coords.length; i += 6) {
        const cp1 = {
          x: isRelative ? currentPos.x + coords[i] : coords[i],
          y: isRelative ? currentPos.y + coords[i + 1] : coords[i + 1],
        };
        const cp2 = {
          x: isRelative ? currentPos.x + coords[i + 2] : coords[i + 2],
          y: isRelative ? currentPos.y + coords[i + 3] : coords[i + 3],
        };
        const endPos = {
          x: isRelative ? currentPos.x + coords[i + 4] : coords[i + 4],
          y: isRelative ? currentPos.y + coords[i + 5] : coords[i + 5],
        };
        segments.push({ type: 'C', points: [currentPos, cp1, cp2, endPos] });
        currentPos = endPos;
      }
    } else if (type === 'Q') {
      // Quadratic bezier
      const isRelative = cmd[0] === 'q';
      for (let i = 0; i < coords.length; i += 4) {
        const cp = {
          x: isRelative ? currentPos.x + coords[i] : coords[i],
          y: isRelative ? currentPos.y + coords[i + 1] : coords[i + 1],
        };
        const endPos = {
          x: isRelative ? currentPos.x + coords[i + 2] : coords[i + 2],
          y: isRelative ? currentPos.y + coords[i + 3] : coords[i + 3],
        };
        segments.push({ type: 'Q', points: [currentPos, cp, endPos] });
        currentPos = endPos;
      }
    } else if (type === 'Z') {
      // Closepath
      if (currentPos.x !== startPos.x || currentPos.y !== startPos.y) {
        segments.push({ type: 'L', points: [currentPos, startPos] });
      }
      currentPos = startPos;
    }
  }

  return segments;
}

/**
 * Calculate total path length
 */
function calculatePathLength(segments: PathSegment[]): number {
  let total = 0;
  for (const seg of segments) {
    seg.length = getSegmentLength(seg);
    total += seg.length;
  }
  return total;
}

/**
 * Get length of a single segment
 */
function getSegmentLength(seg: PathSegment): number {
  if (seg.type === 'M') return 0;
  if (seg.type === 'L') {
    const [p0, p1] = seg.points;
    return Math.hypot(p1.x - p0.x, p1.y - p0.y);
  }
  if (seg.type === 'C' || seg.type === 'Q') {
    // Approximate bezier length by sampling
    const samples = 20;
    let length = 0;
    let prev = seg.points[0];
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const curr = sampleBezier(seg, t);
      length += Math.hypot(curr.x - prev.x, curr.y - prev.y);
      prev = curr;
    }
    return length;
  }
  return 0;
}

/**
 * Sample point at specific arc length
 */
function sampleAtLength(segments: PathSegment[], targetLength: number): Vec2 {
  let accumulated = 0;

  for (const seg of segments) {
    if (seg.type === 'M') continue;

    const segLength = seg.length ?? 0;
    if (accumulated + segLength >= targetLength) {
      // Target is in this segment
      const localT = segLength > 0 ? (targetLength - accumulated) / segLength : 0;
      return sampleSegmentAt(seg, localT);
    }
    accumulated += segLength;
  }

  // Return last point if we overshot
  const lastSeg = segments[segments.length - 1];
  const lastPoint = lastSeg.points[lastSeg.points.length - 1];
  return isDefined(lastPoint) ? lastPoint : { x: 0, y: 0 };
}

/**
 * Sample point at parametric t across entire path
 */
function sampleAtT(segments: PathSegment[], t: number): Vec2 {
  const validSegs = segments.filter(s => s.type !== 'M');
  if (validSegs.length === 0) return { x: 0, y: 0 };

  const segIndex = Math.min(
    Math.floor(t * validSegs.length),
    validSegs.length - 1
  );
  const seg = validSegs[segIndex];
  const localT = (t * validSegs.length) - segIndex;

  return sampleSegmentAt(seg, localT);
}

/**
 * Sample a single segment at local t [0,1]
 */
function sampleSegmentAt(seg: PathSegment, t: number): Vec2 {
  t = Math.max(0, Math.min(1, t));

  if (seg.type === 'L') {
    const [p0, p1] = seg.points;
    return {
      x: p0.x + (p1.x - p0.x) * t,
      y: p0.y + (p1.y - p0.y) * t,
    };
  }

  if (seg.type === 'Q' || seg.type === 'C') {
    return sampleBezier(seg, t);
  }

  const firstPoint = seg.points[0];
  return isDefined(firstPoint) ? firstPoint : { x: 0, y: 0 };
}

/**
 * Sample bezier curve at t using de Casteljau's algorithm
 */
function sampleBezier(seg: PathSegment, t: number): Vec2 {
  const { points } = seg;

  if (seg.type === 'Q') {
    // Quadratic bezier
    const [p0, p1, p2] = points;
    const s = 1 - t;
    return {
      x: s * s * p0.x + 2 * s * t * p1.x + t * t * p2.x,
      y: s * s * p0.y + 2 * s * t * p1.y + t * t * p2.y,
    };
  }

  if (seg.type === 'C') {
    // Cubic bezier
    const [p0, p1, p2, p3] = points;
    const s = 1 - t;
    const s2 = s * s;
    const s3 = s2 * s;
    const t2 = t * t;
    const t3 = t2 * t;
    return {
      x: s3 * p0.x + 3 * s2 * t * p1.x + 3 * s * t2 * p2.x + t3 * p3.x,
      y: s3 * p0.y + 3 * s2 * t * p1.y + 3 * s * t2 * p2.y + t3 * p3.y,
    };
  }

  const firstPoint = points[0];
  return isDefined(firstPoint) ? firstPoint : { x: 0, y: 0 };
}

export const SVGSampleDomainBlock: BlockCompiler = {
  type: 'SVGSampleDomain',

  inputs: [],

  outputs: [
    { name: 'domain', type: { kind: 'Domain' } },
    { name: 'pos0', type: { kind: 'Field:vec2' } },
  ],

  compile({ id, params }) {
    const asset = typeof params.asset === 'string' ? params.asset : '';
    const sampleCount = Math.max(1, Math.floor(Number(params.sampleCount ?? 100)));
    const seed = Number(params.seed ?? 0);
    const distribution = (typeof params.distribution === 'string' ? params.distribution as 'even' | 'parametric' : undefined) ?? 'even';

    // Create stable element IDs: "sample-N"
    const elementIds: string[] = [];
    for (let i = 0; i < sampleCount; i++) {
      elementIds.push(`sample-${i}`);
    }

    // Create domain with stable IDs
    const domainId = `svg-domain-${id}-${sampleCount}-${seed}`;
    const domain: Domain = createDomain(domainId, elementIds);

    // Sample the SVG path to get positions
    const sampledPoints = sampleSVGPath(asset, sampleCount, distribution);

    // Create position field (sampled positions)
    const positionField: PositionField = (_seed, n) => {
      const count = Math.min(n, sampleCount);
      return sampledPoints.slice(0, count);
    };

    return {
      domain: { kind: 'Domain', value: domain },
      pos0: { kind: 'Field:vec2', value: positionField },
    };
  },
};
