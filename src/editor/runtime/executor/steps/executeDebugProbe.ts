/**
 * Execute Debug Probe Step
 *
 * Instruments execution for debugging/tracing by recording values to ring buffers.
 *
 * References:
 * - HANDOFF.md Topic 3 (ScheduleExecutor - Debug Probe)
 * - design-docs/12-Compiler-Final/10-Schedule-Semantics.md §12.2 Step 6
 * - .agent_planning/debugger/PLAN-2025-12-27-005641.md (Phase 7 Debug Infrastructure)
 */

import type { StepDebugProbe } from "../../../compiler/ir";
import type { RuntimeState } from "../RuntimeState";
import { TraceController } from "../../../debug/TraceController";
import { summarize } from "../../../debug/types";
import { encodeScalar, encodeBoolean, encodeVec2, encodeColor, type ValueRecord32 } from "../../../debug/ValueRecord";

/**
 * Execute DebugProbe step.
 *
 * Records slot values to TraceController ring buffers for debugging/tracing.
 *
 * Performance:
 * - Zero overhead when TraceController.mode === 'off' (early return)
 * - Zero allocation in hot path (uses pre-allocated ring buffers)
 *
 * Strategy:
 * 1. Check TraceController mode (if 'off', return immediately)
 * 2. For each slot in step.probe.slots:
 *    - Read value from runtime.values
 *    - Convert to ValueRecord32 using type-specific encoding
 *    - Write to ValueRing
 * 3. For 'timing' mode: record span begin/end to SpanRing (deferred)
 *
 * @param step - DebugProbe step specification
 * @param runtime - Runtime state
 */
export function executeDebugProbe(step: StepDebugProbe, runtime: RuntimeState): void {
  const controller = TraceController.instance;

  // Fast path: zero overhead when debugging is off
  if (controller.getMode() === 'off') {
    return;
  }

  const { probe } = step;
  const { slots } = probe;

  // Record values for each probed slot
  for (const slot of slots) {
    // Read raw value from ValueStore
    const rawValue = runtime.values.read(slot);

    // Get slot metadata to determine type
    const slotMeta = runtime.values.slotMeta[slot];
    if (!slotMeta) {
      continue; // Skip slots without metadata
    }

    // Convert type descriptor to artifact kind string for summarize()
    const artifactKind = typeDescToArtifactKind(slotMeta.type);

    // Create ValueSummary using existing summarize function
    const summary = summarize(artifactKind, rawValue);

    // Convert ValueSummary to ValueRecord32 for ring buffer storage
    const record = summaryToValueRecord(summary, 0); // typeId=0 for now (Phase 7.2 will use TypeKeyTable)

    if (record) {
      // Write to ValueRing (zero-allocation, uses columnar storage)
      controller.writeValue(record);
    }
  }
}

/**
 * Convert TypeDesc to artifact kind string for summarize().
 *
 * This is a bridge function until we have a unified type system.
 */
function typeDescToArtifactKind(type: import("../../../compiler/ir/types").TypeDesc): string {
  const { world, domain } = type;

  if (world === 'signal') {
    switch (domain) {
      case 'number': return 'Signal:number';
      case 'phase01': return 'Signal:phase';
      case 'vec2': return 'Signal:vec2';
      case 'color': return 'Signal:color';
      case 'timeMs': return 'Signal:Time';
      case 'boolean': return 'Signal:bool';
      default: return 'Signal:number';
    }
  }

  if (world === 'field') {
    switch (domain) {
      case 'number': return 'Field:number';
      case 'vec2': return 'Field:vec2';
      case 'color': return 'Field:color';
      case 'string': return 'Field:string';
      case 'boolean': return 'Field:boolean';
      default: return 'Field:number';
    }
  }

  if (world === 'event') {
    return 'Event';
  }

  return 'Signal:number'; // Default fallback
}

/**
 * Convert ValueSummary to ValueRecord32 for ring buffer storage.
 *
 * Maps high-level ValueSummary types to low-level binary encoding.
 */
function summaryToValueRecord(
  summary: import("../../../debug/types").ValueSummary,
  typeId: number
): ValueRecord32 | null {
  switch (summary.t) {
    case 'num':
    case 'phase':
      return encodeScalar(summary.v, typeId);

    case 'bool':
      return encodeBoolean(summary.v, typeId);

    case 'vec2':
      return encodeVec2(summary.x, summary.y, typeId);

    case 'color':
      // Color is packed as u32 in summary, need to unpack to RGBA
      const r = ((summary.v >>> 24) & 0xff) / 255;
      const g = ((summary.v >>> 16) & 0xff) / 255;
      const b = ((summary.v >>> 8) & 0xff) / 255;
      const a = (summary.v & 0xff) / 255;
      return encodeColor(r, g, b, a, typeId);

    case 'trigger':
      // Encode trigger as boolean
      return encodeBoolean(summary.fired, typeId);

    case 'none':
    case 'err':
      // No encoding for none/error types
      return null;
  }
}
