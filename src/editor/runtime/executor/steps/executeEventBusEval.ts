/**
 * Execute Event Bus Eval Step
 *
 * Combines event streams from multiple publishers into a single event stream.
 *
 * Implementation:
 * - Reads publisher source values from ValueStore (event streams)
 * - Combines event streams using combine mode (merge, first, last)
 * - Handles empty bus case with empty event stream
 * - Writes combined event stream to output slot
 *
 * Event streams are represented as arrays of EventOccurrence objects:
 * { time: number, value: unknown }
 *
 * References:
 * - design-docs/12-Compiler-Final/10-Schedule-Semantics.md §12.2 Step 3b
 */

import type { StepEventBusEval, CompiledProgramIR, PublisherIR } from "../../../compiler/ir";
import type { RuntimeState } from "../RuntimeState";

/**
 * Event occurrence - a discrete event at a specific time.
 * Matches core/types.ts EventOccurrence<A>.
 */
export interface EventOccurrence {
  readonly time: number;
  readonly value: unknown;
}

/**
 * Event stream - sorted array of event occurrences.
 */
export type EventStream = readonly EventOccurrence[];

/**
 * Execute EventBusEval step.
 *
 * Combines event streams from publishers according to event combine specification.
 * Publishers are pre-sorted by compiler (sortKey ascending, then publisherId).
 *
 * Algorithm:
 * 1. Filter enabled publishers
 * 2. Read source event streams from slots
 * 3. Combine streams using combine mode
 * 4. Write result to output slot
 *
 * If no enabled publishers, writes empty event stream.
 *
 * @param step - EventBusEval step specification
 * @param _program - Compiled program (unused, for consistency with other steps)
 * @param runtime - Runtime state (values, frameCache, state)
 */
export function executeEventBusEval(
  step: StepEventBusEval,
  _program: CompiledProgramIR,
  runtime: RuntimeState,
): void {
  // Filter enabled publishers (already sorted by compiler)
  const enabledPublishers = step.publishers.filter((pub: PublisherIR) => pub.enabled);

  // If no enabled publishers, write empty event stream
  if (enabledPublishers.length === 0) {
    runtime.values.write(step.outSlot, [] as EventStream);
    return;
  }

  // Read publisher event streams
  const streams: EventStream[] = [];

  for (const pub of enabledPublishers) {
    // Read source event stream from ValueStore
    const stream = runtime.values.read(pub.srcSlot) as EventStream | undefined;
    if (stream && Array.isArray(stream)) {
      streams.push(stream);
    } else {
      // No stream or invalid stream - treat as empty
      streams.push([]);
    }
  }

  // Combine streams
  const combinedStream = combineEventStreams(streams, step.combine.mode);

  // Write combined stream to bus slot
  runtime.values.write(step.outSlot, combinedStream);
}

/**
 * Combine multiple event streams using specified combine mode.
 *
 * Implements three combine modes:
 * - "merge": Union of all events, sorted by time
 * - "first": Events from first publisher only
 * - "last": Events from last publisher only
 *
 * PRECONDITION: streams.length > 0 (caller handles empty array case)
 *
 * @param streams - Array of event streams to combine (length > 0)
 * @param mode - Combine mode
 * @returns Combined event stream
 */
function combineEventStreams(
  streams: EventStream[],
  mode: "merge" | "first" | "last"
): EventStream {
  if (streams.length === 0) {
    return [];
  }

  switch (mode) {
    case "merge": {
      // Merge all event streams, sorted by time
      const allEvents: EventOccurrence[] = [];
      for (const stream of streams) {
        allEvents.push(...stream);
      }
      // Sort by time (stable sort for determinism)
      allEvents.sort((a, b) => a.time - b.time);
      return allEvents;
    }

    case "first":
      // Return events from first publisher only
      return streams[0];

    case "last":
      // Return events from last publisher only
      return streams[streams.length - 1];

    default: {
      const unknownMode = mode as string;
      throw new Error(`Unknown event combine mode: ${unknownMode}`);
    }
  }
}
