/**
 * IR Serialization
 *
 * Serialize and deserialize CompiledProgramIR to/from JSON.
 *
 * This allows:
 * - Saving compiled programs to disk
 * - Embedding programs in standalone HTML players
 * - Network transmission of compiled programs
 *
 * Key challenges:
 * - Typed arrays (Float32Array, etc.) need conversion to regular arrays for JSON
 * - Maintain all type information for deserialization
 * - Preserve determinism (no Map/Set iteration order issues)
 */

import type { CompiledProgramIR } from './program';

/**
 * Serializable representation of CompiledProgramIR.
 *
 * This is the JSON-compatible version where typed arrays are converted to regular arrays.
 */
export interface SerializedProgramIR {
  /** IR format version */
  irVersion: number;
  /** Patch ID */
  patchId: string;
  /** Patch revision */
  patchRevision: number;
  /** Compile ID */
  compileId: string;
  /** Random seed */
  seed: number;
  /** Time model (already JSON-compatible) */
  timeModel: CompiledProgramIR['timeModel'];
  /** Type table (already JSON-compatible) */
  types: CompiledProgramIR['types'];
  /** Node table (already JSON-compatible) */
  nodes: CompiledProgramIR['nodes'];
  /** Bus table (already JSON-compatible) */
  buses: CompiledProgramIR['buses'];
  /** Lens table (already JSON-compatible) */
  lenses: CompiledProgramIR['lenses'];
  /** Adapter table (already JSON-compatible) */
  adapters: CompiledProgramIR['adapters'];
  /** Field table (already JSON-compatible) */
  fields: CompiledProgramIR['fields'];
  /** Signal table (already JSON-compatible) */
  signalTable?: CompiledProgramIR['signalTable'];
  /** Constant pool (needs typed array conversion) */
  constants: {
    json: unknown[];
    f64: number[];
    f32: number[];
    i32: number[];
    constIndex: CompiledProgramIR['constants']['constIndex'];
  };
  /** State layout (already JSON-compatible) */
  stateLayout: CompiledProgramIR['stateLayout'];
  /** Slot metadata (already JSON-compatible) */
  slotMeta?: CompiledProgramIR['slotMeta'];
  /** Camera table (already JSON-compatible) */
  cameras?: CompiledProgramIR['cameras'];
  /** Default camera ID (already JSON-compatible) */
  defaultCameraId?: CompiledProgramIR['defaultCameraId'];
  /** Mesh table (already JSON-compatible) */
  meshes?: CompiledProgramIR['meshes'];
  /** Schedule (already JSON-compatible) */
  schedule: CompiledProgramIR['schedule'];
  /** Outputs (already JSON-compatible) */
  outputs: CompiledProgramIR['outputs'];
  /** Metadata (already JSON-compatible) */
  meta: CompiledProgramIR['meta'];
}

/**
 * Serialize CompiledProgramIR to JSON-compatible object.
 *
 * Converts typed arrays to regular arrays for JSON serialization.
 *
 * @param program - Compiled program to serialize
 * @returns Serializable program object
 */
export function serializeProgram(program: CompiledProgramIR): SerializedProgramIR {
  return {
    irVersion: program.irVersion,
    patchId: program.patchId,
    patchRevision: program.patchRevision,
    compileId: program.compileId,
    seed: program.seed,
    timeModel: program.timeModel,
    types: program.types,
    nodes: program.nodes,
    buses: program.buses,
    lenses: program.lenses,
    adapters: program.adapters,
    fields: program.fields,
    signalTable: program.signalTable,
    constants: {
      json: program.constants.json,
      f64: Array.from(program.constants.f64),
      f32: Array.from(program.constants.f32),
      i32: Array.from(program.constants.i32),
      constIndex: program.constants.constIndex,
    },
    stateLayout: program.stateLayout,
    slotMeta: program.slotMeta,
    cameras: program.cameras,
    defaultCameraId: program.defaultCameraId,
    meshes: program.meshes,
    schedule: program.schedule,
    outputs: program.outputs,
    meta: program.meta,
  };
}

/**
 * Deserialize JSON-compatible object to CompiledProgramIR.
 *
 * Converts regular arrays back to typed arrays.
 *
 * @param serialized - Serialized program object
 * @returns Deserialized CompiledProgramIR
 */
export function deserializeProgram(serialized: SerializedProgramIR): CompiledProgramIR {
  return {
    irVersion: serialized.irVersion,
    patchId: serialized.patchId,
    patchRevision: serialized.patchRevision,
    compileId: serialized.compileId,
    seed: serialized.seed,
    timeModel: serialized.timeModel,
    types: serialized.types,
    nodes: serialized.nodes,
    buses: serialized.buses,
    lenses: serialized.lenses,
    adapters: serialized.adapters,
    fields: serialized.fields,
    signalTable: serialized.signalTable,
    constants: {
      json: serialized.constants.json,
      f64: new Float64Array(serialized.constants.f64),
      f32: new Float32Array(serialized.constants.f32),
      i32: new Int32Array(serialized.constants.i32),
      constIndex: serialized.constants.constIndex,
    },
    stateLayout: serialized.stateLayout,
    slotMeta: serialized.slotMeta,
    cameras: serialized.cameras,
    defaultCameraId: serialized.defaultCameraId,
    meshes: serialized.meshes,
    schedule: serialized.schedule,
    outputs: serialized.outputs,
    meta: serialized.meta,
  };
}

/**
 * Serialize CompiledProgramIR to JSON string.
 *
 * @param program - Compiled program to serialize
 * @param pretty - If true, use pretty-printed JSON (default: false)
 * @returns JSON string
 */
export function serializeProgramToJSON(program: CompiledProgramIR, pretty = false): string {
  const serialized = serializeProgram(program);
  return pretty ? JSON.stringify(serialized, null, 2) : JSON.stringify(serialized);
}

/**
 * Deserialize CompiledProgramIR from JSON string.
 *
 * @param json - JSON string
 * @returns Deserialized CompiledProgramIR
 */
export function deserializeProgramFromJSON(json: string): CompiledProgramIR {
  const serialized = JSON.parse(json) as SerializedProgramIR;
  return deserializeProgram(serialized);
}
