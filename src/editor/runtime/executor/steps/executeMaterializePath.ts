/**
 * Execute MaterializePath Step
 *
 * Converts path expressions to command/param buffers with optional flattening.
 *
 * This is an explicit, cacheable materialization step implementing the contract
 * from design-docs/13-Renderer/11-FINAL-INTEGRATION.md §B4.
 *
 * Algorithm:
 * 1. Read domain handle from domainSlot to get instance count
 * 2. Read path expression/data from pathExprSlot
 * 3. Allocate command buffer (Uint16Array) and params buffer (Float32Array)
 * 4. Encode path commands and coordinates
 * 5. Optional: Flatten curves to line segments using De Casteljau algorithm
 * 6. Store buffers in outCmdsSlot and outParamsSlot
 *
 * Command encoding (u16):
 * - 0: MoveTo (consumes 2 params: x, y)
 * - 1: LineTo (consumes 2 params: x, y)
 * - 2: QuadTo (consumes 4 params: cx, cy, x, y)
 * - 3: CubicTo (consumes 6 params: c1x, c1y, c2x, c2y, x, y)
 * - 4: Close (consumes 0 params)
 *
 * References:
 * - design-docs/13-Renderer/11-FINAL-INTEGRATION.md §B4
 * - design-docs/13-Renderer/09-Materialization-Steps.md
 * - plans/SPEC-04-render-pipeline.md Gap 6 (De Casteljau algorithm)
 */

import type { StepMaterializePath, CompiledProgramIR } from "../../../compiler/ir";
import type { RuntimeState } from "../RuntimeState";

// Path command opcodes
const PATH_CMD_MOVETO = 0;
const PATH_CMD_LINETO = 1;
const PATH_CMD_QUADTO = 2;
const PATH_CMD_CUBICTO = 3;
const PATH_CMD_CLOSE = 4;

/**
 * Domain handle representation
 */
interface DomainHandle {
  kind: "domain";
  count: number;
  ids?: Uint32Array;
}

/**
 * Field expression handle representation
 */
interface FieldExprHandle {
  kind: "fieldExpr";
  exprId: string;
}

/**
 * Path command types (abstract representation)
 */
type PathCommand =
  | { kind: "M"; x: number; y: number }
  | { kind: "L"; x: number; y: number }
  | { kind: "Q"; cx: number; cy: number; x: number; y: number }
  | { kind: "C"; c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number }
  | { kind: "Z" };

/**
 * Path expression representation
 */
interface PathExpr {
  commands: PathCommand[];
}

/**
 * Type guard: check if value is a Domain handle
 */
function isDomainHandle(value: unknown): value is DomainHandle {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.kind === "domain" && typeof v.count === "number";
}

/**
 * Type guard: check if value is a valid PathExpr
 */
function isPathExpr(value: unknown): value is PathExpr {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return Array.isArray(p.commands);
}

/**
 * Type guard: check if value is an array of PathExpr
 */
function isPathExprArray(value: unknown): value is PathExpr[] {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return true;
  return isPathExpr(value[0]);
}

/**
 * Type guard: check if value is a field expression handle
 */
function isFieldExprHandle(value: unknown): value is FieldExprHandle {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.kind === "fieldExpr" && typeof v.exprId === "string";
}

function parseFieldExprId(exprId: string): number {
  const direct = parseInt(exprId, 10);
  if (!isNaN(direct)) {
    return direct;
  }

  const match = exprId.match(/(\d+)$/);
  if (match !== null) {
    return parseInt(match[1], 10);
  }

  throw new Error(`executeMaterializePath: unable to parse field expr id "${exprId}"`);
}

function resolvePathExprFromField(
  program: CompiledProgramIR,
  exprId: string,
): PathExpr | PathExpr[] {
  const fieldId = parseFieldExprId(exprId);
  const fieldNode = program.fieldExprs.nodes[fieldId];
  if (fieldNode === undefined) {
    throw new Error(`executeMaterializePath: missing field expr ${exprId}`);
  }

  if (fieldNode.kind !== "const") {
    throw new Error(
      `executeMaterializePath: path field expr ${exprId} must be const, got ${fieldNode.kind}`
    );
  }

  const value = program.constants.json[fieldNode.constId];
  if (isPathExpr(value) || isPathExprArray(value)) {
    return value;
  }

  throw new Error(
    `executeMaterializePath: const field expr ${exprId} does not contain path data`
  );
}

/**
 * Flatten a cubic Bezier curve to line segments using recursive De Casteljau subdivision.
 *
 * Algorithm:
 * - Check flatness using control point distance test
 * - If flat enough or max depth reached: emit line segment
 * - Otherwise: subdivide at midpoint and recurse on both halves
 *
 * @param x0 Start point x
 * @param y0 Start point y
 * @param x1 First control point x
 * @param y1 First control point y
 * @param x2 Second control point x
 * @param y2 Second control point y
 * @param x3 End point x
 * @param y3 End point y
 * @param tolerance Flatness tolerance in pixels (smaller = more segments)
 * @returns Array of [x, y] coordinates for line segments (excluding start point)
 */
function flattenCubicBezier(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  tolerance: number,
): number[] {
  const points: number[] = [];

  function subdivide(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
    dx: number,
    dy: number,
    depth: number,
  ): void {
    // Check flatness using control point distance from baseline
    // This is a fast approximation: max distance of control points from line segment
    const ux = 3 * bx - 2 * ax - dx;
    const uy = 3 * by - 2 * ay - dy;
    const vx = 3 * cx - ax - 2 * dx;
    const vy = 3 * cy - ay - 2 * dy;
    const flatness = Math.max(ux * ux + uy * uy, vx * vx + vy * vy);

    // If flat enough or max depth reached: emit line segment
    if (flatness <= tolerance * tolerance || depth > 10) {
      points.push(dx, dy);
      return;
    }

    // Subdivide at midpoint using De Casteljau
    const abx = (ax + bx) / 2;
    const aby = (ay + by) / 2;
    const bcx = (bx + cx) / 2;
    const bcy = (by + cy) / 2;
    const cdx = (cx + dx) / 2;
    const cdy = (cy + dy) / 2;
    const abcx = (abx + bcx) / 2;
    const abcy = (aby + bcy) / 2;
    const bcdx = (bcx + cdx) / 2;
    const bcdy = (bcy + cdy) / 2;
    const midx = (abcx + bcdx) / 2;
    const midy = (abcy + bcdy) / 2;

    // Recurse on both halves
    subdivide(ax, ay, abx, aby, abcx, abcy, midx, midy, depth + 1);
    subdivide(midx, midy, bcdx, bcdy, cdx, cdy, dx, dy, depth + 1);
  }

  subdivide(x0, y0, x1, y1, x2, y2, x3, y3, 0);
  return points;
}

/**
 * Flatten a quadratic Bezier curve to line segments using recursive De Casteljau subdivision.
 *
 * Algorithm:
 * - Check flatness using control point distance test
 * - If flat enough or max depth reached: emit line segment
 * - Otherwise: subdivide at midpoint and recurse on both halves
 *
 * @param x0 Start point x
 * @param y0 Start point y
 * @param cx Control point x
 * @param cy Control point y
 * @param x1 End point x
 * @param y1 End point y
 * @param tolerance Flatness tolerance in pixels (smaller = more segments)
 * @returns Array of [x, y] coordinates for line segments (excluding start point)
 */
function flattenQuadraticBezier(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  tolerance: number,
): number[] {
  const points: number[] = [];

  function subdivide(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    dx: number,
    dy: number,
    depth: number,
  ): void {
    // Check flatness using control point distance from baseline
    const ux = 2 * bx - ax - dx;
    const uy = 2 * by - ay - dy;
    const flatness = ux * ux + uy * uy;

    // If flat enough or max depth reached: emit line segment
    if (flatness <= tolerance * tolerance || depth > 10) {
      points.push(dx, dy);
      return;
    }

    // Subdivide at midpoint using De Casteljau
    const abx = (ax + bx) / 2;
    const aby = (ay + by) / 2;
    const bdx = (bx + dx) / 2;
    const bdy = (by + dy) / 2;
    const midx = (abx + bdx) / 2;
    const midy = (aby + bdy) / 2;

    // Recurse on both halves
    subdivide(ax, ay, abx, aby, midx, midy, depth + 1);
    subdivide(midx, midy, bdx, bdy, dx, dy, depth + 1);
  }

  subdivide(x0, y0, cx, cy, x1, y1, 0);
  return points;
}

/**
 * Calculate buffer sizes needed for paths (before flattening)
 */
function calculateBufferSizes(paths: PathExpr[]): { cmdCount: number; paramCount: number } {
  let cmdCount = 0;
  let paramCount = 0;

  for (const path of paths) {
    for (const cmd of path.commands) {
      cmdCount++;
      switch (cmd.kind) {
        case "M":
        case "L":
          paramCount += 2; // x, y
          break;
        case "Q":
          paramCount += 4; // cx, cy, x, y
          break;
        case "C":
          paramCount += 6; // c1x, c1y, c2x, c2y, x, y
          break;
        case "Z":
          // No params
          break;
      }
    }
  }

  return { cmdCount, paramCount };
}


/**
 * Execute MaterializePath step.
 *
 * Converts path expressions to command/param buffers with optional curve flattening.
 *
 * @param step - MaterializePath step specification
 * @param program - Compiled program (for resolving field expressions)
 * @param runtime - Runtime state containing ValueStore
 *
 * @throws Error if domainSlot contains invalid domain
 * @throws Error if pathExprSlot contains invalid path data
 */
export function executeMaterializePath(
  step: StepMaterializePath,
  program: CompiledProgramIR,
  runtime: RuntimeState,
): void {
  // Performance tracking
  const startTime = performance.now();

  // 1. Read domain handle from domainSlot
  const domainValue = runtime.values.read(step.domainSlot);
  let instanceCount: number;

  if (isDomainHandle(domainValue)) {
    instanceCount = domainValue.count;
  } else if (typeof domainValue === "number") {
    instanceCount = domainValue;
  } else {
    throw new Error(
      `executeMaterializePath: domainSlot contains invalid value. ` +
        `Expected Domain handle or count, got: ${typeof domainValue}`
    );
  }

  // 2. Read path data from pathExprSlot
  const pathValue = runtime.values.read(step.pathExprSlot);

  // 3. Determine paths to encode
  let paths: PathExpr[];

  if (isPathExpr(pathValue)) {
    // Single path - replicate for all instances
    paths = new Array<PathExpr>(instanceCount).fill(pathValue);
  } else if (isPathExprArray(pathValue)) {
    // Array of paths
    if (pathValue.length !== instanceCount) {
      throw new Error(
        `executeMaterializePath: path array length mismatch. ` +
          `Expected ${instanceCount}, got ${pathValue.length}.`
      );
    }
    paths = pathValue;
  } else if (isFieldExprHandle(pathValue)) {
    const resolved = resolvePathExprFromField(program, pathValue.exprId);
    if (isPathExpr(resolved)) {
      paths = new Array<PathExpr>(instanceCount).fill(resolved);
    } else if (isPathExprArray(resolved)) {
      if (resolved.length !== instanceCount) {
        throw new Error(
          `executeMaterializePath: path array length mismatch. ` +
            `Expected ${instanceCount}, got ${resolved.length}.`
        );
      }
      paths = resolved;
    } else {
      throw new Error(
        `executeMaterializePath: fieldExpr ${pathValue.exprId} did not resolve to path data`
      );
    }
  } else {
    throw new Error(
      `executeMaterializePath: pathExprSlot contains invalid value. ` +
        `Expected PathExpr, PathExpr[], or FieldExprHandle, got: ${typeof pathValue}`
    );
  }

  // 4. Determine if we should flatten curves
  const shouldFlatten = step.flattenTolerancePx !== undefined;
  const tolerance = step.flattenTolerancePx ?? 0.5;

  // 5. Calculate initial buffer sizes (may grow if flattening)
  const { cmdCount, paramCount } = calculateBufferSizes(paths);

  // Allocate with extra space if flattening (curves expand to many lines)
  const estimatedCmdSize = shouldFlatten ? cmdCount * 10 : cmdCount;
  const estimatedParamSize = shouldFlatten ? paramCount * 10 : paramCount;

  // 6. Allocate buffers with minimum sizes
  const minCmdSize = Math.max(estimatedCmdSize, 64);
  const minParamSize = Math.max(estimatedParamSize, 128);

  const cmdsBuffer = runtime.values.ensureU16(step.outCmdsSlot, minCmdSize);
  const paramsBuffer = runtime.values.ensureF32(step.outParamsSlot, minParamSize);
  const cmdStartBuffer = runtime.values.ensureU32(step.outCmdStartSlot, instanceCount);
  const cmdLenBuffer = runtime.values.ensureU32(step.outCmdLenSlot, instanceCount);
  const pointStartBuffer = runtime.values.ensureU32(step.outPointStartSlot, instanceCount);
  const pointLenBuffer = runtime.values.ensureU32(step.outPointLenSlot, instanceCount);

  // 7. Encode paths to buffers (with optional flattening)
  let cmdIdx = 0;
  let paramIdx = 0;
  let currentX = 0;
  let currentY = 0;

  for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
    const path = paths[pathIndex];
    const cmdStart = cmdIdx;
    const pointStart = paramIdx / 2;
    let pointCount = 0;

    for (const cmd of path.commands) {
      switch (cmd.kind) {
        case "M":
          cmdsBuffer[cmdIdx++] = PATH_CMD_MOVETO;
          paramsBuffer[paramIdx++] = cmd.x;
          paramsBuffer[paramIdx++] = cmd.y;
          pointCount += 1;
          currentX = cmd.x;
          currentY = cmd.y;
          break;

        case "L":
          cmdsBuffer[cmdIdx++] = PATH_CMD_LINETO;
          paramsBuffer[paramIdx++] = cmd.x;
          paramsBuffer[paramIdx++] = cmd.y;
          pointCount += 1;
          currentX = cmd.x;
          currentY = cmd.y;
          break;

        case "Q":
          if (shouldFlatten) {
            // Flatten quadratic bezier to line segments
            const flatPoints = flattenQuadraticBezier(
              currentX,
              currentY,
              cmd.cx,
              cmd.cy,
              cmd.x,
              cmd.y,
              tolerance,
            );

            // Emit line segments for flattened curve
            for (let i = 0; i < flatPoints.length; i += 2) {
              cmdsBuffer[cmdIdx++] = PATH_CMD_LINETO;
              paramsBuffer[paramIdx++] = flatPoints[i];
              paramsBuffer[paramIdx++] = flatPoints[i + 1];
              pointCount += 1;
            }

            currentX = cmd.x;
            currentY = cmd.y;
          } else {
            // Keep curve as-is
            cmdsBuffer[cmdIdx++] = PATH_CMD_QUADTO;
            paramsBuffer[paramIdx++] = cmd.cx;
            paramsBuffer[paramIdx++] = cmd.cy;
            paramsBuffer[paramIdx++] = cmd.x;
            paramsBuffer[paramIdx++] = cmd.y;
            pointCount += 2;
            currentX = cmd.x;
            currentY = cmd.y;
          }
          break;

        case "C":
          if (shouldFlatten) {
            // Flatten cubic bezier to line segments
            const flatPoints = flattenCubicBezier(
              currentX,
              currentY,
              cmd.c1x,
              cmd.c1y,
              cmd.c2x,
              cmd.c2y,
              cmd.x,
              cmd.y,
              tolerance,
            );

            // Emit line segments for flattened curve
            for (let i = 0; i < flatPoints.length; i += 2) {
              cmdsBuffer[cmdIdx++] = PATH_CMD_LINETO;
              paramsBuffer[paramIdx++] = flatPoints[i];
              paramsBuffer[paramIdx++] = flatPoints[i + 1];
              pointCount += 1;
            }

            currentX = cmd.x;
            currentY = cmd.y;
          } else {
            // Keep curve as-is
            cmdsBuffer[cmdIdx++] = PATH_CMD_CUBICTO;
            paramsBuffer[paramIdx++] = cmd.c1x;
            paramsBuffer[paramIdx++] = cmd.c1y;
            paramsBuffer[paramIdx++] = cmd.c2x;
            paramsBuffer[paramIdx++] = cmd.c2y;
            paramsBuffer[paramIdx++] = cmd.x;
            paramsBuffer[paramIdx++] = cmd.y;
            pointCount += 3;
            currentX = cmd.x;
            currentY = cmd.y;
          }
          break;

        case "Z":
          cmdsBuffer[cmdIdx++] = PATH_CMD_CLOSE;
          // No params for close, and it doesn't change current position
          break;
      }
    }

    cmdStartBuffer[pathIndex] = cmdStart;
    cmdLenBuffer[pathIndex] = cmdIdx - cmdStart;
    pointStartBuffer[pathIndex] = pointStart;
    pointLenBuffer[pathIndex] = pointCount;
  }

  // 8. Performance logging (debug mode)
  const cpuMs = performance.now() - startTime;
  if (cpuMs > 1.0) {
    console.debug(
      `MaterializePath: ${cpuMs.toFixed(2)}ms for ${instanceCount} paths, ` +
        `${cmdIdx} commands, ${paramIdx} params` +
        (shouldFlatten ? ` (flattened, tolerance=${tolerance}px)` : " (curves preserved)")
    );
  }
}
