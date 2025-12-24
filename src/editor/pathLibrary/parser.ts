/**
 * SVG Path Parser
 *
 * Parses SVG path strings and converts them to LineData format.
 * Handles common path commands: M, L, H, V, Q, C, S, T, A, Z
 */

import type { LineData, PathPoint } from '../../data/pathData';

/**
 * Result of parsing an SVG string
 */
export interface ParseResult {
  success: boolean;
  data: LineData[];
  viewBox?: string;
  errors: string[];
}

function deriveViewBoxFromSize(widthRaw?: string | null, heightRaw?: string | null): string | undefined {
  if (widthRaw === undefined || widthRaw === null || widthRaw === '' || heightRaw === undefined || heightRaw === null || heightRaw === '') return undefined;
  const width = parseFloat(widthRaw);
  const height = parseFloat(heightRaw);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }
  return `0 0 ${width} ${height}`;
}

/**
 * Parse a complete SVG string to LineData[]
 */
export function parseSVGString(svgString: string): ParseResult {
  const errors: string[] = [];
  const data: LineData[] = [];

  try {
    // Extract viewBox
    const viewBoxMatch = svgString.match(/viewBox=["']([^"']+)["']/i);
    let viewBox = viewBoxMatch?.[1];

    if (viewBox === undefined || viewBox === null || viewBox === '') {
      const widthMatch = svgString.match(/width=["']([^"']+)["']/i);
      const heightMatch = svgString.match(/height=["']([^"']+)["']/i);
      viewBox = deriveViewBoxFromSize(widthMatch?.[1], heightMatch?.[1]);
    }

    // Find all path elements
    const pathRegex = /<path[^>]*\sd=["']([^"']+)["'][^>]*>/gi;
    let pathMatch: RegExpExecArray | null;
    let pathIndex = 0;

    while ((pathMatch = pathRegex.exec(svgString)) !== null) {
      const d = pathMatch[1];

      // Try to extract color from the path element
      const fullPath = pathMatch[0];
      const strokeMatch = fullPath.match(/stroke=["']([^"']+)["']/i);
      const fillMatch = fullPath.match(/fill=["']([^"']+)["']/i);
      const color = strokeMatch?.[1] ?? fillMatch?.[1] ?? getDefaultColor(pathIndex);

      try {
        const lineData = parsePathD(d, color, pathIndex);
        if (lineData) {
          data.push(lineData);
        }
      } catch (err) {
        errors.push(`Path ${pathIndex}: ${err instanceof Error ? err.message : 'Parse error'}`);
      }

      pathIndex++;
    }

    // Also handle path elements with single quotes or other formats
    if (data.length === 0 && pathIndex === 0) {
      // Try parsing as just a path d string (not full SVG)
      const cleanD = svgString.trim();
      if (cleanD.match(/^[MmLlHhVvQqCcSsTtAaZz\d\s,.-]+$/)) {
        try {
          const lineData = parsePathD(cleanD, getDefaultColor(0), 0);
          if (lineData) {
            data.push(lineData);
          }
        } catch (err) {
          errors.push(`Direct path parse: ${err instanceof Error ? err.message : 'Parse error'}`);
        }
      }
    }

    return {
      success: data.length > 0,
      data,
      viewBox,
      errors,
    };
  } catch (err) {
    return {
      success: false,
      data: [],
      errors: [`SVG parse error: ${err instanceof Error ? err.message : 'Unknown error'}`],
    };
  }
}

/**
 * Parse a path d attribute to LineData
 */
function parsePathD(d: string, color: string, index: number): LineData | null {
  const commands = tokenizePathD(d);
  if (commands.length === 0) return null;

  const points: PathPoint[] = [];
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let lastControlX = 0;
  let lastControlY = 0;
  let foundStart = false;

  for (const cmd of commands) {
    const { type, args, relative } = cmd;

    switch (type.toUpperCase()) {
      case 'M': {
        // Move to
        const x = relative ? currentX + args[0] : args[0];
        const y = relative ? currentY + args[1] : args[1];

        if (!foundStart) {
          startX = x;
          startY = y;
          foundStart = true;
        } else {
          // Additional M commands act as L
          points.push({ x, y, type: 'L' });
        }

        currentX = x;
        currentY = y;

        // Handle implicit lineto for additional coordinate pairs
        for (let i = 2; i < args.length; i += 2) {
          const lx = relative ? currentX + args[i] : args[i];
          const ly = relative ? currentY + args[i + 1] : args[i + 1];
          points.push({ x: lx, y: ly, type: 'L' });
          currentX = lx;
          currentY = ly;
        }
        break;
      }

      case 'L': {
        // Line to
        for (let i = 0; i < args.length; i += 2) {
          const x = relative ? currentX + args[i] : args[i];
          const y = relative ? currentY + args[i + 1] : args[i + 1];
          points.push({ x, y, type: 'L' });
          currentX = x;
          currentY = y;
        }
        break;
      }

      case 'H': {
        // Horizontal line
        for (const arg of args) {
          const x = relative ? currentX + arg : arg;
          points.push({ x, y: currentY, type: 'L' });
          currentX = x;
        }
        break;
      }

      case 'V': {
        // Vertical line
        for (const arg of args) {
          const y = relative ? currentY + arg : arg;
          points.push({ x: currentX, y, type: 'L' });
          currentY = y;
        }
        break;
      }

      case 'Q': {
        // Quadratic bezier
        for (let i = 0; i < args.length; i += 4) {
          const cx = relative ? currentX + args[i] : args[i];
          const cy = relative ? currentY + args[i + 1] : args[i + 1];
          const x = relative ? currentX + args[i + 2] : args[i + 2];
          const y = relative ? currentY + args[i + 3] : args[i + 3];

          points.push({ x, y, type: 'Q', cx, cy });
          lastControlX = cx;
          lastControlY = cy;
          currentX = x;
          currentY = y;
        }
        break;
      }

      case 'T': {
        // Smooth quadratic (reflect previous control point)
        for (let i = 0; i < args.length; i += 2) {
          const cx = 2 * currentX - lastControlX;
          const cy = 2 * currentY - lastControlY;
          const x = relative ? currentX + args[i] : args[i];
          const y = relative ? currentY + args[i + 1] : args[i + 1];

          points.push({ x, y, type: 'Q', cx, cy });
          lastControlX = cx;
          lastControlY = cy;
          currentX = x;
          currentY = y;
        }
        break;
      }

      case 'C': {
        // Cubic bezier - approximate with quadratic
        for (let i = 0; i < args.length; i += 6) {
          const c1x = relative ? currentX + args[i] : args[i];
          const c1y = relative ? currentY + args[i + 1] : args[i + 1];
          const c2x = relative ? currentX + args[i + 2] : args[i + 2];
          const c2y = relative ? currentY + args[i + 3] : args[i + 3];
          const x = relative ? currentX + args[i + 4] : args[i + 4];
          const y = relative ? currentY + args[i + 5] : args[i + 5];

          // Approximate cubic with quadratic using midpoint of control points
          const cx = (c1x + c2x) / 2;
          const cy = (c1y + c2y) / 2;

          points.push({ x, y, type: 'Q', cx, cy });
          lastControlX = c2x;
          lastControlY = c2y;
          currentX = x;
          currentY = y;
        }
        break;
      }

      case 'S': {
        // Smooth cubic - approximate with quadratic
        for (let i = 0; i < args.length; i += 4) {
          const c1x = 2 * currentX - lastControlX;
          const c1y = 2 * currentY - lastControlY;
          const c2x = relative ? currentX + args[i] : args[i];
          const c2y = relative ? currentY + args[i + 1] : args[i + 1];
          const x = relative ? currentX + args[i + 2] : args[i + 2];
          const y = relative ? currentY + args[i + 3] : args[i + 3];

          const cx = (c1x + c2x) / 2;
          const cy = (c1y + c2y) / 2;

          points.push({ x, y, type: 'Q', cx, cy });
          lastControlX = c2x;
          lastControlY = c2y;
          currentX = x;
          currentY = y;
        }
        break;
      }

      case 'A': {
        // Arc - convert to our arc format
        for (let i = 0; i < args.length; i += 7) {
          const rx = args[i];
          const ry = args[i + 1];
          const rotation = args[i + 2];
          const largeArc = args[i + 3] as 0 | 1;
          const sweep = args[i + 4] as 0 | 1;
          const x = relative ? currentX + args[i + 5] : args[i + 5];
          const y = relative ? currentY + args[i + 6] : args[i + 6];

          points.push({
            x, y, type: 'A',
            rx, ry, rotation, largeArc, sweep
          });
          currentX = x;
          currentY = y;
        }
        break;
      }

      case 'Z': {
        // Close path - line back to start
        if (currentX !== startX || currentY !== startY) {
          points.push({ x: startX, y: startY, type: 'L' });
        }
        currentX = startX;
        currentY = startY;
        break;
      }
    }
  }

  if (!foundStart) return null;

  return {
    startX,
    startY,
    points,
    color,
    delay: index * 0.1, // Stagger by default
    duration: 1.0,
  };
}

/**
 * Tokenize a path d attribute into commands
 */
interface PathCommand {
  type: string;
  args: number[];
  relative: boolean;
}

function tokenizePathD(d: string): PathCommand[] {
  const commands: PathCommand[] = [];

  // Split into command segments
  const regex = /([MmLlHhVvQqTtCcSsAaZz])([^MmLlHhVvQqTtCcSsAaZz]*)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(d)) !== null) {
    const type = match[1];
    const argsStr = match[2].trim();

    // Parse numbers from args string
    const args: number[] = [];
    if (argsStr) {
      // Handle various number formats: 1.5, -2, .5, 1e-5, comma/space separated
      const numRegex = /-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi;
      let numMatch: RegExpExecArray | null;
      while ((numMatch = numRegex.exec(argsStr)) !== null) {
        args.push(parseFloat(numMatch[0]));
      }
    }

    commands.push({
      type,
      args,
      relative: type === type.toLowerCase(),
    });
  }

  return commands;
}

/**
 * Get a default color for a path index
 */
function getDefaultColor(index: number): string {
  const colors = [
    '#00d4ff', // Cyan
    '#ff00ff', // Magenta
    '#00ff88', // Green
    '#ffaa00', // Orange
    '#ff4488', // Pink
    '#8844ff', // Purple
  ];
  return colors[index % colors.length];
}

/**
 * Validate an SVG string
 */
export function validateSVG(svgString: string): { valid: boolean; error?: string } {
  if (!svgString || typeof svgString !== 'string') {
    return { valid: false, error: 'SVG string is required' };
  }

  const trimmed = svgString.trim();

  // Check if it looks like SVG or path data
  const hasSVGTag = trimmed.includes('<svg') || trimmed.includes('<path');
  const hasPathCommands = /^[MmLlHhVvQqCcSsTtAaZz\d\s,.-]+$/.test(trimmed);

  if (!hasSVGTag && !hasPathCommands) {
    return { valid: false, error: 'Input does not appear to be valid SVG or path data' };
  }

  return { valid: true };
}
