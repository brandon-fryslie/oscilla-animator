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
 * - Map objects need conversion to plain objects for JSON
 * - Maintain all type information for deserialization
 * - Preserve determinism (no Map/Set iteration order issues)
 */

import type { CompiledProgramIR } from './program';

/**
 * Serializable representation of CompiledProgramIR.
 *
 * This is the JSON-compatible version where Maps are converted to plain objects.
 */
export interface SerializedProgramIR {
  /** IR format version (literal 1) */
  irVersion: 1;
  /** Patch ID */
  patchId: string;
  /** Random seed */
  seed: number;
  /** Time model (already JSON-compatible) */
  timeModel: CompiledProgramIR['timeModel'];
  /** Type table (already JSON-compatible) */
  types: CompiledProgramIR['types'];
  /** Signal expression table (already JSON-compatible) */
  signalExprs: CompiledProgramIR['signalExprs'];
  /** Field expression table (already JSON-compatible) */
  fieldExprs: CompiledProgramIR['fieldExprs'];
  /** Event expression table (already JSON-compatible) */
  eventExprs: CompiledProgramIR['eventExprs'];
  /** Constant pool (JSON-only, no typed arrays) */
  constants: {
    readonly json: unknown[];
  };
  /** State layout (already JSON-compatible) */
  stateLayout: CompiledProgramIR['stateLayout'];
  /** Slot metadata (already JSON-compatible) */
  slotMeta: CompiledProgramIR['slotMeta'];
  /** Render IR (already JSON-compatible) */
  render: CompiledProgramIR['render'];
  /** Camera table (already JSON-compatible) */
  cameras: CompiledProgramIR['cameras'];
  /** Mesh table (already JSON-compatible) */
  meshes: CompiledProgramIR['meshes'];
  /** Primary camera ID (optional) */
  primaryCameraId?: CompiledProgramIR['primaryCameraId'];
  /** Schedule (already JSON-compatible) */
  schedule: CompiledProgramIR['schedule'];
  /** Outputs (already JSON-compatible) */
  outputs: CompiledProgramIR['outputs'];
  /** Debug index (Maps converted to objects) */
  debugIndex: {
    stepToBlock: Record<string, string>;
    slotToBlock: Record<string, string>;
    labels?: Record<string, string>;
  };
  /** Optional source map */
  sourceMap?: CompiledProgramIR['sourceMap'];
  /** Optional compiler warnings */
  warnings?: CompiledProgramIR['warnings'];
}

/**
 * Serialize CompiledProgramIR to JSON-compatible object.
 *
 * Converts Maps to plain objects for JSON serialization.
 *
 * @param program - Compiled program to serialize
 * @returns Serializable program object
 */
export function serializeProgram(program: CompiledProgramIR): SerializedProgramIR {
  return {
    irVersion: program.irVersion,
    patchId: program.patchId,
    seed: program.seed,
    timeModel: program.timeModel,
    types: program.types,
    signalExprs: program.signalExprs,
    fieldExprs: program.fieldExprs,
    eventExprs: program.eventExprs,
    constants: {
      json: [...program.constants.json],
    },
    stateLayout: program.stateLayout,
    slotMeta: program.slotMeta,
    render: program.render,
    cameras: program.cameras,
    meshes: program.meshes,
    primaryCameraId: program.primaryCameraId,
    schedule: program.schedule,
    outputs: program.outputs,
    debugIndex: {
      stepToBlock: Object.fromEntries(program.debugIndex.stepToBlock),
      slotToBlock: Object.fromEntries(
        Array.from(program.debugIndex.slotToBlock.entries()).map(([slot, block]) => [
          String(slot),
          block,
        ])
      ),
      labels: program.debugIndex.labels !== undefined
        ? Object.fromEntries(program.debugIndex.labels)
        : undefined,
    },
    sourceMap: program.sourceMap,
    warnings: program.warnings,
  };
}

/**
 * Deserialize JSON-compatible object to CompiledProgramIR.
 *
 * Converts plain objects back to Maps.
 *
 * @param serialized - Serialized program object
 * @returns Deserialized CompiledProgramIR
 */
export function deserializeProgram(serialized: SerializedProgramIR): CompiledProgramIR {
  return {
    irVersion: serialized.irVersion,
    patchId: serialized.patchId,
    seed: serialized.seed,
    timeModel: serialized.timeModel,
    types: serialized.types,
    signalExprs: serialized.signalExprs,
    fieldExprs: serialized.fieldExprs,
    eventExprs: serialized.eventExprs,
    constants: {
      json: serialized.constants.json,
    },
    stateLayout: serialized.stateLayout,
    slotMeta: serialized.slotMeta,
    render: serialized.render,
    cameras: serialized.cameras,
    meshes: serialized.meshes,
    primaryCameraId: serialized.primaryCameraId,
    schedule: serialized.schedule,
    outputs: serialized.outputs,
    debugIndex: {
      stepToBlock: new Map(Object.entries(serialized.debugIndex.stepToBlock)),
      slotToBlock: new Map(
        Object.entries(serialized.debugIndex.slotToBlock).map(([slotStr, block]) => [
          Number(slotStr),
          block,
        ])
      ),
      labels: serialized.debugIndex.labels !== undefined
        ? new Map(Object.entries(serialized.debugIndex.labels))
        : undefined,
    },
    sourceMap: serialized.sourceMap,
    warnings: serialized.warnings,
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
