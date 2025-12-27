/**
 * Assemble Path Geometry Buffers for Paths2D Rendering
 *
 * This module provides helpers to assemble PathGeometryBufferIR from materialized
 * path command and point buffers.
 *
 * Design:
 * - Handles multiple paths (pathCount > 1)
 * - Generates per-path indexing arrays (pathCommandStart, pathCommandLen, etc.)
 * - Concatenates all path commands into single Uint16Array
 * - Concatenates all path points into single Float32Array
 * - Produces PathGeometryBufferIR with correct BufferRefIR references
 *
 * References:
 * - design-docs/13-Renderer/01-RendererIR.md §4 (Paths2D)
 * - .agent_planning/renderer-ir/DOD-PHASE-CD-2025-12-26-173641.md §P0.D3
 */

import type { ValueSlot } from "../../compiler/ir/types";
import type {
  PathGeometryBufferIR,
  BufferRefIR,
  PathEncodingIR,
} from "../../compiler/ir/renderIR";
import type { RuntimeState } from "./RuntimeState";

/**
 * Single path specification for assembly
 *
 * Each path has command and point buffers in separate ValueStore slots.
 */
export interface PathSpec {
  /** Command buffer slot (Uint16Array) */
  commandsSlot: ValueSlot;

  /** Points buffer slot (Float32Array, interleaved xy pairs) */
  pointsSlot: ValueSlot;
}

/**
 * Assemble path geometry buffer from materialized path buffers.
 *
 * Takes multiple paths (each with commands and points) and packs them into
 * a single PathGeometryBufferIR with per-path indexing.
 *
 * Algorithm:
 * 1. For each path:
 *    a. Read commands and points from ValueStore
 *    b. Validate buffer types and shapes
 *    c. Record start indices and lengths
 * 2. Concatenate all commands into single Uint16Array
 * 3. Concatenate all points into single Float32Array
 * 4. Write concatenated buffers to ValueStore
 * 5. Write indexing arrays to ValueStore
 * 6. Return PathGeometryBufferIR with BufferRefIR references
 *
 * Indexing scheme (per PathGeometryBufferIR spec):
 * For path i:
 *   commands[pathCommandStart[i] .. pathCommandStart[i] + pathCommandLen[i]]
 *   points[pathPointStart[i]*2 .. (pathPointStart[i] + pathPointLen[i])*2]
 *
 * @param paths - Array of path specifications
 * @param runtime - Runtime state containing ValueStore
 * @returns Assembled PathGeometryBufferIR ready for renderer
 * @throws Error if buffer types or shapes are invalid
 *
 * @example
 * ```typescript
 * const geometry = assemblePathGeometry([
 *   { commandsSlot: 10, pointsSlot: 11 }, // path 0
 *   { commandsSlot: 12, pointsSlot: 13 }, // path 1
 * ], runtime);
 * ```
 */
export function assemblePathGeometry(
  paths: readonly PathSpec[],
  runtime: RuntimeState,
): PathGeometryBufferIR {
  const pathCount = paths.length;

  if (pathCount === 0) {
    throw new Error(`assemblePathGeometry: paths array cannot be empty`);
  }

  // Arrays to build per-path indexing
  const pathCommandStarts: number[] = [];
  const pathCommandLengths: number[] = [];
  const pathPointStarts: number[] = [];
  const pathPointLengths: number[] = [];

  // Arrays to accumulate concatenated buffers
  const allCommands: number[] = [];
  const allPoints: number[] = [];

  // Process each path
  for (let i = 0; i < pathCount; i++) {
    const path = paths[i];

    // Read commands buffer
    const commands = runtime.values.read(path.commandsSlot);
    if (!(commands instanceof Uint16Array)) {
      throw new Error(
        `assemblePathGeometry: path ${i} commands must be Uint16Array, ` +
        `got ${commands?.constructor.name}`
      );
    }

    // Read points buffer
    const points = runtime.values.read(path.pointsSlot);
    if (!(points instanceof Float32Array)) {
      throw new Error(
        `assemblePathGeometry: path ${i} points must be Float32Array, ` +
        `got ${points?.constructor.name}`
      );
    }

    // Validate points length is even (interleaved xy pairs)
    if (points.length % 2 !== 0) {
      throw new Error(
        `assemblePathGeometry: path ${i} points length must be even (xy pairs), ` +
        `got ${points.length}`
      );
    }

    // Record indexing for this path
    pathCommandStarts.push(allCommands.length);
    pathCommandLengths.push(commands.length);
    pathPointStarts.push(allPoints.length / 2); // Start index in xy pairs, not floats
    pathPointLengths.push(points.length / 2);   // Length in xy pairs, not floats

    // Append to concatenated buffers
    allCommands.push(...commands);
    allPoints.push(...points);
  }

  // Create typed arrays from accumulated data
  const commandsBuffer = new Uint16Array(allCommands);
  const pointsBuffer = new Float32Array(allPoints);
  const pathCommandStartBuffer = new Uint32Array(pathCommandStarts);
  const pathCommandLenBuffer = new Uint32Array(pathCommandLengths);
  const pathPointStartBuffer = new Uint32Array(pathPointStarts);
  const pathPointLenBuffer = new Uint32Array(pathPointLengths);

  // Write buffers to ValueStore
  // In full implementation, ValueStore would allocate buffer IDs
  // For now, use negative slot numbers to avoid collisions with regular slots
  const commandsBufferId = -1000;
  const pointsBufferId = -1001;
  const pathCommandStartBufferId = -1002;
  const pathCommandLenBufferId = -1003;
  const pathPointStartBufferId = -1004;
  const pathPointLenBufferId = -1005;

  runtime.values.write(commandsBufferId, commandsBuffer);
  runtime.values.write(pointsBufferId, pointsBuffer);
  runtime.values.write(pathCommandStartBufferId, pathCommandStartBuffer);
  runtime.values.write(pathCommandLenBufferId, pathCommandLenBuffer);
  runtime.values.write(pathPointStartBufferId, pathPointStartBuffer);
  runtime.values.write(pathPointLenBufferId, pathPointLenBuffer);

  // Create BufferRefIR for each buffer
  const pathCommandStart: BufferRefIR = {
    bufferId: pathCommandStartBufferId,
    type: "u32",
    length: pathCommandStartBuffer.length,
  };

  const pathCommandLen: BufferRefIR = {
    bufferId: pathCommandLenBufferId,
    type: "u32",
    length: pathCommandLenBuffer.length,
  };

  const pathPointStart: BufferRefIR = {
    bufferId: pathPointStartBufferId,
    type: "u32",
    length: pathPointStartBuffer.length,
  };

  const pathPointLen: BufferRefIR = {
    bufferId: pathPointLenBufferId,
    type: "u32",
    length: pathPointLenBuffer.length,
  };

  const commands: BufferRefIR = {
    bufferId: commandsBufferId,
    type: "u16",
    length: commandsBuffer.length,
  };

  const pointsXY: BufferRefIR = {
    bufferId: pointsBufferId,
    type: "f32",
    length: pointsBuffer.length,
  };

  // Create path encoding specification
  const encoding: PathEncodingIR = {
    kind: "v1",
    commands: ["M", "L", "Q", "C", "Z"], // Supported command set
  };

  // Assemble final PathGeometryBufferIR
  const geometry: PathGeometryBufferIR = {
    pathCount,
    pathCommandStart,
    pathCommandLen,
    pathPointStart,
    pathPointLen,
    commands,
    pointsXY,
    encoding,
  };

  return geometry;
}
