/**
 * Debug Sampler
 *
 * Wraps program render functions to collect debug samples at runtime.
 *
 * This module is imported by the compiler to inject debug sampling
 * into the compiled program. It wraps the main render function to
 * sample signal values before each frame.
 */

import type { Artifact, BlockId, Program, RenderTree } from './types';
import { getBlockDefinition } from '../blocks/registry';

interface DebuggedBlockInfo {
  blockId: BlockId;
  blockType: string;
  signalArtifacts: Array<{
    portName: string;
    artifact: Extract<Artifact, { kind: 'Signal:float' | 'Signal:phase' }>;
  }>;
}

let debugStore: {
  isBlockDebugging: (blockId: string) => boolean;
  getDebuggingBlockIds: () => string[];
  getAutoPosition: (index: number) => { x: number; y: number };
  setEntry: (entry: {
    id: string;
    label: string;
    posX: number;
    posY: number;
    values: {
      signal?: number;
      phase?: number;
      domainCount?: number;
      fieldSample?: float[];
    };
    timestamp: number;
  }) => void;
} | null = null;

// Collect debug info during compilation
const debuggedBlocks = new Map<BlockId, DebuggedBlockInfo>();

/**
 * Set the debug store implementation (called by editor layer)
 */
export function setDebugStore(store: typeof debugStore): void {
  debugStore = store;
}

/**
 * Check if debug sampling is enabled
 */
export function isDebugSamplingEnabled(): boolean {
  return debugStore !== null;
}

/**
 * Check if a block should be debugged
 */
export function isBlockDebugged(blockId: BlockId): boolean {
  if (debugStore === null) return false;
  return debugStore.isBlockDebugging(blockId);
}

/**
 * Get label for a block from its definition
 */
function getBlockLabel(blockType: string): string {
  try {
    const def = getBlockDefinition(blockType);
    return def?.label ?? blockType;
  } catch {
    return blockType;
  }
}

/**
 * Collect output artifacts from a compiled block for runtime debugging
 */
export function sampleBlockOutputs(
  blockId: BlockId,
  blockType: string,
  outputs: Record<string, Artifact>
): void {
  if (debugStore === null) return;
  if (!debugStore.isBlockDebugging(blockId)) {
    // Remove from collection if no longer being debugged
    debuggedBlocks.delete(blockId);
    return;
  }

  // Collect signal artifacts
  const signalArtifacts: DebuggedBlockInfo['signalArtifacts'] = [];

  for (const [portName, artifact] of Object.entries(outputs)) {
    if (artifact.kind === 'Signal:float' || artifact.kind === 'Signal:phase') {
      signalArtifacts.push({
        portName,
        artifact,
      });
    }
  }

  if (signalArtifacts.length > 0) {
    debuggedBlocks.set(blockId, {
      blockId,
      blockType,
      signalArtifacts,
    });
  } else {
    debuggedBlocks.delete(blockId);
  }
}

/**
 * Wrap a program's render function to collect debug samples
 */
export function wrapProgramWithDebug<T extends RenderTree>(
  program: Program<T>
): Program<T> {
  if (debugStore === null || debuggedBlocks.size === 0) {
    return program;
  }

  const lastUpdateTime = new Map<BlockId, number>();
  const UPDATE_INTERVAL_MS = 333; // Throttle to ~3x per second

  return {
    signal: (tMs: number, runtimeCtx) => {
      // Sample debugged blocks
      const debuggedIds = debugStore!.getDebuggingBlockIds();

      for (const [blockId, info] of debuggedBlocks.entries()) {
        // Check if still being debugged
        if (!debugStore!.isBlockDebugging(blockId)) {
          lastUpdateTime.delete(blockId);
          continue;
        }

        // Throttle updates
        if (lastUpdateTime.has(blockId)) {
          const lastUpdate = lastUpdateTime.get(blockId)!;
          if (tMs - lastUpdate < UPDATE_INTERVAL_MS) {
            continue;
          }
        }
        lastUpdateTime.set(blockId, tMs);

        // Sample the first signal artifact (always exists due to filter in sampleBlockOutputs)
        const firstSignal = info.signalArtifacts[0];
        const signalFn = firstSignal.artifact.value;
        if (typeof signalFn !== 'function') continue;

        try {
          const value = signalFn(tMs, runtimeCtx);

          // Get auto position
          const index = debuggedIds.indexOf(blockId);
          const position = debugStore!.getAutoPosition(index);

          // Get label from block type
          const label = getBlockLabel(info.blockType);

          // Determine if it's a phase signal
          const isPhase = firstSignal.artifact.kind === 'Signal:phase' ||
                         firstSignal.portName.toLowerCase().includes('phase');

          debugStore!.setEntry({
            id: blockId,
            label,
            posX: position.x,
            posY: position.y,
            values: isPhase ? { phase: value } : { signal: value },
            timestamp: Date.now(),
          });
        } catch (e) {
          // Silently fail on sampling errors
          console.debug('Debug sampling error:', e);
        }
      }

      // Call original render function
      return program.signal(tMs, runtimeCtx);
    },
    event: program.event,
  };
}

/**
 * Get the number of blocks being debugged (for testing)
 */
export function getDebuggedBlockCount(): number {
  return debuggedBlocks.size;
}
