/**
 * Debug Module
 *
 * Runtime debugging and value inspection infrastructure.
 * Provides probe-based inspection of blocks, buses, and bindings.
 *
 * Core Components:
 * - DebugIndex: String interning for port keys, bus IDs, block IDs
 * - SpanRing: Zero-allocation ring buffer for span records
 * - ValueRing: Ring buffer for value samples
 * - TypeKeyEncoding: Compact TypeDesc → u16 encoding
 * - TraceController: Mode control (off/timing/full)
 * - instrumentClosure: Closure wrapping for tracing
 */

export * from './types';
export * from './RingBuffer';
export * from './DebugIndex';
export * from './SpanRing';
export * from './SpanTypes';
export * from './ValueRing';
export * from './ValueRecord';
export * from './TypeKeyEncoding';
export * from './TraceController';
export * from './TraceContext';
export * from './instrumentClosure';
