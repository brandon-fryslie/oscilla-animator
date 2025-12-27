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
 * 5. Store buffers in outCmdsSlot and outParamsSlot
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
  const fieldNode = program.fields.nodes[fieldId];
  if (!fieldNode) {
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
 * Calculate buffer sizes needed for paths
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
 * Encode command kind to opcode
 */
function encodeCommandKind(kind: string): number {
  switch (kind) {
    case "M":
      return PATH_CMD_MOVETO;
    case "L":
      return PATH_CMD_LINETO;
    case "Q":
      return PATH_CMD_QUADTO;
    case "C":
      return PATH_CMD_CUBICTO;
    case "Z":
      return PATH_CMD_CLOSE;
    default:
      throw new Error(`Unknown path command kind: ${kind}`);
  }
}

/**
 * Execute MaterializePath step.
 *
 * Converts path expressions to command/param buffers.
 *
 * @param step - MaterializePath step specification
 * @param _program - Compiled program (not used, included for consistency)
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
    paths = new Array(instanceCount).fill(pathValue);
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
      paths = new Array(instanceCount).fill(resolved);
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

  // 4. Calculate buffer sizes
  const { cmdCount, paramCount } = calculateBufferSizes(paths);

  // 5. Allocate buffers with minimum sizes
  const minCmdSize = Math.max(cmdCount, 64);
  const minParamSize = Math.max(paramCount, 128);

  const cmdsBuffer = runtime.values.ensureU16(step.outCmdsSlot, minCmdSize);
  const paramsBuffer = runtime.values.ensureF32(step.outParamsSlot, minParamSize);
  const cmdStartBuffer = runtime.values.ensureU32(step.outCmdStartSlot, instanceCount);
  const cmdLenBuffer = runtime.values.ensureU32(step.outCmdLenSlot, instanceCount);
  const pointStartBuffer = runtime.values.ensureU32(step.outPointStartSlot, instanceCount);
  const pointLenBuffer = runtime.values.ensureU32(step.outPointLenSlot, instanceCount);

  // 6. Encode paths to buffers
  let cmdIdx = 0;
  let paramIdx = 0;

  for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
    const path = paths[pathIndex];
    const cmdStart = cmdIdx;
    const pointStart = paramIdx / 2;
    let pointCount = 0;

    for (const cmd of path.commands) {
      cmdsBuffer[cmdIdx++] = encodeCommandKind(cmd.kind);

      switch (cmd.kind) {
        case "M":
        case "L":
          paramsBuffer[paramIdx++] = cmd.x;
          paramsBuffer[paramIdx++] = cmd.y;
          pointCount += 1;
          break;
        case "Q":
          paramsBuffer[paramIdx++] = cmd.cx;
          paramsBuffer[paramIdx++] = cmd.cy;
          paramsBuffer[paramIdx++] = cmd.x;
          paramsBuffer[paramIdx++] = cmd.y;
          pointCount += 2;
          break;
        case "C":
          paramsBuffer[paramIdx++] = cmd.c1x;
          paramsBuffer[paramIdx++] = cmd.c1y;
          paramsBuffer[paramIdx++] = cmd.c2x;
          paramsBuffer[paramIdx++] = cmd.c2y;
          paramsBuffer[paramIdx++] = cmd.x;
          paramsBuffer[paramIdx++] = cmd.y;
          pointCount += 3;
          break;
        case "Z":
          // No params for close
          break;
      }
    }

    cmdStartBuffer[pathIndex] = cmdStart;
    cmdLenBuffer[pathIndex] = cmdIdx - cmdStart;
    pointStartBuffer[pathIndex] = pointStart;
    pointLenBuffer[pathIndex] = pointCount;
  }

  // 7. Optional flattening (future work)
  if (step.flattenTolerancePx !== undefined) {
    console.warn(
      `executeMaterializePath: Curve flattening not implemented yet. ` +
        `Preserving curves. Tolerance=${step.flattenTolerancePx}px ignored.`
    );
  }

  // 8. Performance logging (debug mode)
  const cpuMs = performance.now() - startTime;
  if (cpuMs > 1.0) {
    console.debug(
      `MaterializePath: ${cpuMs.toFixed(2)}ms for ${instanceCount} paths, ` +
        `${cmdCount} commands, ${paramCount} params`
    );
  }
}
