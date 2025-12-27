/**
 * Execute MaterializePath Step
 *
 * Converts path expressions to PathCommandStream buffers with optional flattening.
 *
 * This is an explicit, cacheable materialization step implementing the contract
 * from design-docs/13-Renderer/09-Materialization-Steps.md.
 *
 * Algorithm:
 * 1. Read source path expression from sourceSlot
 * 2. Encode commands to Uint16Array (0=M, 1=L, 2=Q, 3=C, 4=Z)
 * 3. Pack control points to Float32Array (interleaved xy pairs)
 * 4. Optional: Flatten curves to polylines (if flattenPolicy.kind === 'on')
 * 5. Write commandsSlot and pointsSlot to ValueStore
 * 6. Emit performance counters (deferred to Phase E)
 *
 * Command encoding (canonical u16 opcodes):
 * - 0: MoveTo (M) - consumes 1 point (x, y)
 * - 1: LineTo (L) - consumes 1 point (x, y)
 * - 2: QuadraticTo (Q) - consumes 2 points (ctrl_x, ctrl_y, end_x, end_y)
 * - 3: CubicTo (C) - consumes 3 points (c1_x, c1_y, c2_x, c2_y, end_x, end_y)
 * - 4: Close (Z) - consumes 0 points
 *
 * References:
 * - design-docs/13-Renderer/09-Materialization-Steps.md §MaterializePath
 * - design-docs/13-Renderer/04-Decision-to-IR.md §PathCommandStreamDesc
 * - .agent_planning/renderer-ir/DOD-PHASE-CD-2025-12-26-173641.md §P0.D1
 */

import type { StepMaterializePath, CompiledProgramIR } from "../../../compiler/ir";
import type { RuntimeState } from "../RuntimeState";
import type { FlattenPolicy } from "../../../ir/types/BufferDesc";
import { CANONICAL_FLATTEN_TOL_PX } from "../../../ir/types/BufferDesc";

/**
 * Path command types (abstract representation before encoding)
 */
type PathCommand =
  | { kind: "M"; x: number; y: number }
  | { kind: "L"; x: number; y: number }
  | { kind: "Q"; cx: number; cy: number; x: number; y: number }
  | { kind: "C"; c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number }
  | { kind: "Z" };

/**
 * Path expression representation (simplified for Phase C-D)
 *
 * In full implementation, this would be a proper path AST from the compiler.
 * For now, we support a simple command array.
 */
interface PathExpr {
  commands: PathCommand[];
}

/**
 * Canonical command opcodes (u16)
 */
const enum PathOpcode {
  MoveTo = 0,
  LineTo = 1,
  QuadraticTo = 2,
  CubicTo = 3,
  Close = 4,
}

/**
 * Type guard: check if value is a valid PathExpr
 */
function isPathExpr(value: unknown): value is PathExpr {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return Array.isArray(p.commands);
}

/**
 * Encode path commands to u16 opcodes and f32 points.
 *
 * Produces:
 * - commands: Uint16Array of opcodes (0=M, 1=L, 2=Q, 3=C, 4=Z)
 * - points: Float32Array of interleaved xy pairs
 *
 * Point consumption:
 * - M: 1 point (x, y)
 * - L: 1 point (x, y)
 * - Q: 2 points (ctrl, end)
 * - C: 3 points (c1, c2, end)
 * - Z: 0 points
 *
 * @param pathExpr - Path expression with commands
 * @returns Encoded command and point buffers
 */
function encodePath(pathExpr: PathExpr): {
  commands: Uint16Array;
  points: Float32Array;
} {
  const commandCodes: number[] = [];
  const points: number[] = [];

  for (const cmd of pathExpr.commands) {
    switch (cmd.kind) {
      case "M":
        commandCodes.push(PathOpcode.MoveTo);
        points.push(cmd.x, cmd.y);
        break;

      case "L":
        commandCodes.push(PathOpcode.LineTo);
        points.push(cmd.x, cmd.y);
        break;

      case "Q":
        commandCodes.push(PathOpcode.QuadraticTo);
        points.push(cmd.cx, cmd.cy, cmd.x, cmd.y);
        break;

      case "C":
        commandCodes.push(PathOpcode.CubicTo);
        points.push(cmd.c1x, cmd.c1y, cmd.c2x, cmd.c2y, cmd.x, cmd.y);
        break;

      case "Z":
        commandCodes.push(PathOpcode.Close);
        // Z consumes no points
        break;

      default: {
        const _exhaustive: never = cmd;
        throw new Error(`encodePath: Unknown command kind: ${(_exhaustive as PathCommand).kind}`);
      }
    }
  }

  return {
    commands: new Uint16Array(commandCodes),
    points: new Float32Array(points),
  };
}

/**
 * Flatten path curves to polylines.
 *
 * Converts Q and C commands to sequences of L commands using adaptive subdivision.
 * Tolerance is CANONICAL_FLATTEN_TOL_PX (0.75px in screen space).
 *
 * Phase D P1.D5 work - STUB for now.
 * Full implementation requires adaptive de Casteljau or midpoint subdivision.
 *
 * @param pathExpr - Path with curves
 * @param _tolerancePx - Flattening tolerance (currently ignored, always uses canonical)
 * @returns Flattened path (M, L, Z commands only)
 */
function flattenPath(pathExpr: PathExpr, _tolerancePx: number): PathExpr {
  // STUB: Phase D P1.D5 optional work
  // For now, return path unchanged (curves preserved)
  // Full implementation would:
  // 1. For each Q command: subdivide quadratic bezier to polyline
  // 2. For each C command: subdivide cubic bezier to polyline
  // 3. Check deviation < tolerancePx, recursively subdivide if needed
  // 4. Replace Q/C with L commands

  console.warn(
    `flattenPath: Curve flattening not yet implemented (Phase D P1.D5). ` +
    `Preserving curves. Tolerance=${_tolerancePx}px ignored.`
  );

  return pathExpr;
}

/**
 * Execute MaterializePath step.
 *
 * Converts path expressions to command/point buffers using canonical encoding.
 *
 * Supports:
 * - Curve preservation (flattenPolicy.kind === 'off') - default
 * - Curve flattening (flattenPolicy.kind === 'on') - Phase D P1.D5 stub
 *
 * @param step - MaterializePath step specification
 * @param _program - Compiled program (not used, included for consistency)
 * @param runtime - Runtime state containing ValueStore
 *
 * @throws Error if sourceSlot contains invalid path data
 * @throws Error if flattenPolicy uses non-canonical tolerance
 */
export function executeMaterializePath(
  step: StepMaterializePath,
  _program: CompiledProgramIR,
  runtime: RuntimeState,
): void {
  // Performance tracking (Phase E will use this)
  const startTime = performance.now();

  // 1. Read source path expression from sourceSlot
  const sourceValue = runtime.values.read(step.sourceSlot);

  if (!isPathExpr(sourceValue)) {
    throw new Error(
      `executeMaterializePath: sourceSlot contains invalid value. ` +
      `Expected PathExpr, got: ${typeof sourceValue}`
    );
  }

  let pathExpr = sourceValue;

  // 2. Optional: Flatten curves to polylines
  if (step.flattenPolicy.kind === 'on') {
    // Validate canonical tolerance
    if (step.flattenPolicy.tolerancePx !== CANONICAL_FLATTEN_TOL_PX) {
      throw new Error(
        `executeMaterializePath: flattenPolicy must use canonical tolerance ` +
        `(${CANONICAL_FLATTEN_TOL_PX}px), got ${step.flattenPolicy.tolerancePx}px`
      );
    }

    pathExpr = flattenPath(pathExpr, step.flattenPolicy.tolerancePx);
  }

  // 3. Encode path to command/point buffers
  const { commands, points } = encodePath(pathExpr);

  // 4. Write buffers to ValueStore
  runtime.values.write(step.commandsSlot, commands);
  runtime.values.write(step.pointsSlot, points);

  // 5. Performance counters (Phase E work - stubbed for now)
  const cpuMs = performance.now() - startTime;

  // Future Phase E: Emit performance counters
  // - cpuMs: time spent in encoding/flattening
  // - bytesCommands: commands.byteLength
  // - bytesPoints: points.byteLength
  // - cacheHit: false (no caching yet)
  // - flattenedSegments: number of L commands generated (if flattened)

  // Debug logging (can be removed in production)
  if (step.debugLabel && cpuMs > 1.0) {
    console.debug(
      `MaterializePath[${step.debugLabel}]: ${cpuMs.toFixed(2)}ms, ` +
      `${commands.length} commands, ${points.length / 2} points`
    );
  }

  // Silence unused variable warnings
  void cpuMs;
}
