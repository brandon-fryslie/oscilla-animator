/**
 * Error Decorations
 *
 * Converts CompileError[] into a "decoration model" the editor can render.
 * Supports:
 * - Block-level errors (missing compiler, cycle)
 * - Port-level errors (unwired required input, type mismatch)
 * - Wire-level errors (mismatch on that connection)
 */

import type { CompileError, PortRef } from './types';

// =============================================================================
// Types
// =============================================================================

export type Severity = 'error' | 'warning';

export interface BlockDecoration {
  blockId: string;
  severity: Severity;
  messages: string[];
}

export interface PortDecoration {
  blockId: string;
  port: string;
  severity: Severity;
  messages: string[];
}

export interface WireDecoration {
  from: PortRef;
  to: PortRef;
  severity: Severity;
  messages: string[];
}

export interface DecorationSet {
  blocks: Record<string, BlockDecoration>;
  ports: Record<string, PortDecoration>; // key = `${blockId}:${port}`
  wires: WireDecoration[];
  global: { severity: Severity; message: string }[];
}

// =============================================================================
// Helpers
// =============================================================================

function portKey(blockId: string, port: string): string {
  return `${blockId}:${port}`;
}

// =============================================================================
// Build Decorations
// =============================================================================

/**
 * Build decoration set from compile errors.
 * Routes errors to blocks, ports, wires, or global based on error context.
 */
export function buildDecorations(errors: readonly CompileError[]): DecorationSet {
  const blocks: DecorationSet['blocks'] = {};
  const ports: DecorationSet['ports'] = {};
  const wires: WireDecoration[] = [];
  const global: DecorationSet['global'] = [];

  const addBlock = (blockId: string, msg: string, severity: Severity = 'error') => {
    const e = (blocks[blockId] ??= { blockId, severity, messages: [] });
    e.messages.push(msg);
    // Escalate severity if needed
    if (severity === 'error') e.severity = 'error';
  };

  const addPort = (blockId: string, port: string, msg: string, severity: Severity = 'error') => {
    const k = portKey(blockId, port);
    const e = (ports[k] ??= { blockId, port, severity, messages: [] });
    e.messages.push(msg);
    if (severity === 'error') e.severity = 'error';
  };

  for (const err of errors) {
    const w = err.where;

    // Wire-attached errors (type mismatch on connection)
    if (w?.connection) {
      wires.push({
        from: w.connection.from,
        to: w.connection.to,
        severity: 'error',
        messages: [err.message],
      });

      // Also mark the destination port
      addPort(w.connection.to.blockId, w.connection.to.port, err.message, 'error');
      continue;
    }

    // Port-attached errors (unwired required input)
    if (w?.blockId && w?.port) {
      addPort(w.blockId, w.port, err.message, 'error');
      addBlock(w.blockId, err.message, 'error');
      continue;
    }

    // Block-attached errors (missing compiler, unknown block type)
    if (w?.blockId) {
      addBlock(w.blockId, err.message, 'error');
      continue;
    }

    // Global errors (cycle, ambiguous outputs, etc.)
    global.push({ severity: 'error', message: err.message });
  }

  return { blocks, ports, wires, global };
}

// =============================================================================
// Query Helpers
// =============================================================================

/**
 * Check if a block has errors.
 */
export function hasBlockError(decorations: DecorationSet, blockId: string): boolean {
  return blockId in decorations.blocks;
}

/**
 * Check if a port has errors.
 */
export function hasPortError(decorations: DecorationSet, blockId: string, port: string): boolean {
  return portKey(blockId, port) in decorations.ports;
}

/**
 * Check if a wire has errors.
 */
export function hasWireError(
  decorations: DecorationSet,
  fromBlockId: string,
  fromPort: string,
  toBlockId: string,
  toPort: string
): boolean {
  return decorations.wires.some(
    (w) =>
      w.from.blockId === fromBlockId &&
      w.from.port === fromPort &&
      w.to.blockId === toBlockId &&
      w.to.port === toPort
  );
}

/**
 * Get messages for a block.
 */
export function getBlockMessages(decorations: DecorationSet, blockId: string): string[] {
  return decorations.blocks[blockId]?.messages ?? [];
}

/**
 * Get messages for a port.
 */
export function getPortMessages(
  decorations: DecorationSet,
  blockId: string,
  port: string
): string[] {
  return decorations.ports[portKey(blockId, port)]?.messages ?? [];
}

/**
 * Create an empty decoration set.
 */
export function emptyDecorations(): DecorationSet {
  return { blocks: {}, ports: {}, wires: [], global: [] };
}
