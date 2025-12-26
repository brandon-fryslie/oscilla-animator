/**
 * Tests for Closure Instrumentation Wrappers
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  wrapSignalForDebug,
  wrapFieldForDebug,
  wrapBusCombineForDebug,
  FieldStatMask,
} from '../instrumentClosure';
import { DebugIndex } from '../DebugIndex';
import { SpanRing } from '../SpanRing';
import { ValueRing } from '../ValueRing';
import { TraceController } from '../TraceController';
import { SpanKind, SpanFlags } from '../SpanTypes';
import { ValueTag, unpackF32 } from '../ValueRecord';
import type { RuntimeCtx } from '../../compiler/types';

describe('instrumentClosure', () => {
  let debugIndex: DebugIndex;
  let spanRing: SpanRing;
  let valueRing: ValueRing;
  let runtimeCtx: RuntimeCtx & { frameId?: number; tMs?: number };

  beforeEach(() => {
    // Reset TraceController
    TraceController._resetForTesting();

    // Create fresh instances
    debugIndex = new DebugIndex('test-compile-123', 1);
    spanRing = new SpanRing(1000);
    valueRing = new ValueRing(1000);

    // Create runtime context
    runtimeCtx = {
      viewport: { w: 800, h: 600, dpr: 1 },
      reducedMotion: false,
      frameId: 42,
      tMs: 1000,
    };
  });

  afterEach(() => {
    TraceController._resetForTesting();
  });

  // ===========================================================================
  // P1-1: wrapSignalForDebug (Block Timing)
  // ===========================================================================

  describe('wrapSignalForDebug', () => {
    it('should skip instrumentation in "off" mode', () => {
      TraceController.instance.setMode('off');

      const original = (_tMs: number, _ctx: RuntimeCtx) => 42;
      const wrapped = wrapSignalForDebug(original, 'TestBlock#1', debugIndex, spanRing);

      const result = wrapped(1000, runtimeCtx);

      expect(result).toBe(42);
      expect(spanRing.size()).toBe(0); // No span emitted
    });

    it('should emit span in "timing" mode', () => {
      TraceController.instance.setMode('timing');

      const original = (_tMs: number, _ctx: RuntimeCtx) => 42;
      const wrapped = wrapSignalForDebug(original, 'TestBlock#1', debugIndex, spanRing);

      const result = wrapped(1000, runtimeCtx);

      expect(result).toBe(42);
      expect(spanRing.size()).toBe(1);

      const span = spanRing.getSpan(0);
      expect(span).toBeDefined();
      expect(span!.kind).toBe(SpanKind.BlockEval);
      expect(span!.frameId).toBe(42);
      expect(span!.tMs).toBe(1000);
      expect(span!.subjectId).toBe(debugIndex.internBlock('TestBlock#1'));
      expect(span!.durationUs).toBeGreaterThanOrEqual(0);
      expect(span!.flags).toBe(SpanFlags.None);
    });

    it('should detect NaN in result', () => {
      TraceController.instance.setMode('timing');

      const original = (_tMs: number, _ctx: RuntimeCtx) => NaN;
      const wrapped = wrapSignalForDebug(original, 'TestBlock#1', debugIndex, spanRing);

      const result = wrapped(1000, runtimeCtx);

      expect(Number.isNaN(result)).toBe(true);

      const span = spanRing.getSpan(0);
      expect(span!.flags & SpanFlags.HAS_NAN).toBeTruthy();
    });

    it('should detect Infinity in result', () => {
      TraceController.instance.setMode('timing');

      const original = (_tMs: number, _ctx: RuntimeCtx) => Infinity;
      const wrapped = wrapSignalForDebug(original, 'TestBlock#1', debugIndex, spanRing);

      const result = wrapped(1000, runtimeCtx);

      expect(result).toBe(Infinity);

      const span = spanRing.getSpan(0);
      expect(span!.flags & SpanFlags.HAS_INF).toBeTruthy();
    });

    it('should use frameId from context', () => {
      TraceController.instance.setMode('timing');

      const original = (_tMs: number, _ctx: RuntimeCtx) => 42;
      const wrapped = wrapSignalForDebug(original, 'TestBlock#1', debugIndex, spanRing);

      const ctxWithFrame = { ...runtimeCtx, frameId: 99 };
      wrapped(1000, ctxWithFrame);

      const span = spanRing.getSpan(0);
      expect(span!.frameId).toBe(99);
    });

    it('should default to frameId=0 if not in context', () => {
      TraceController.instance.setMode('timing');

      const original = (_tMs: number, _ctx: RuntimeCtx) => 42;
      const wrapped = wrapSignalForDebug(original, 'TestBlock#1', debugIndex, spanRing);

      const ctxNoFrame: RuntimeCtx = {
        viewport: { w: 800, h: 600, dpr: 1 },
        reducedMotion: false,
      };

      wrapped(1000, ctxNoFrame);

      const span = spanRing.getSpan(0);
      expect(span!.frameId).toBe(0);
    });

    it('should intern block ID once', () => {
      TraceController.instance.setMode('timing');

      const original = (_tMs: number, _ctx: RuntimeCtx) => 42;
      const wrapped = wrapSignalForDebug(original, 'TestBlock#1', debugIndex, spanRing);

      // Call multiple times
      wrapped(1000, runtimeCtx);
      wrapped(1001, runtimeCtx);

      // Block ID should be interned once
      expect(debugIndex.blockCount()).toBe(1);
      expect(debugIndex.getBlockId(1)).toBe('TestBlock#1');
    });
  });

  // ===========================================================================
  // P1-2: wrapFieldForDebug (Field Materialization)
  // ===========================================================================

  describe('wrapFieldForDebug', () => {
    it('should skip instrumentation in "off" mode', () => {
      TraceController.instance.setMode('off');

      const original = (_seed: number, _n: number, _ctx: RuntimeCtx) => [1, 2, 3];
      const wrapped = wrapFieldForDebug(
        original,
        'field:test',
        'number',
        debugIndex,
        spanRing,
        valueRing,
      );

      const result = wrapped(42, 3, runtimeCtx);

      expect(result).toEqual([1, 2, 3]);
      expect(spanRing.size()).toBe(0);
      expect(valueRing.size()).toBe(0);
    });

    it('should emit span in "timing" mode', () => {
      TraceController.instance.setMode('timing');

      const original = (_seed: number, _n: number, _ctx: RuntimeCtx) => [1, 2, 3];
      const wrapped = wrapFieldForDebug(
        original,
        'field:test',
        'number',
        debugIndex,
        spanRing,
        valueRing,
      );

      const result = wrapped(42, 3, runtimeCtx);

      expect(result).toEqual([1, 2, 3]);
      expect(spanRing.size()).toBe(1);

      const span = spanRing.getSpan(0);
      expect(span!.kind).toBe(SpanKind.MaterializeField);
      expect(span!.frameId).toBe(42);
      expect(span!.subjectId).toBe(debugIndex.internPort('field:test'));
      expect(span!.durationUs).toBeGreaterThanOrEqual(0);
    });

    it('should emit value record in "full" mode', () => {
      TraceController.instance.setMode('full');

      const original = (_seed: number, _n: number, _ctx: RuntimeCtx) => [1, 2, 3, 4, 5];
      const wrapped = wrapFieldForDebug(
        original,
        'field:test',
        'number',
        debugIndex,
        spanRing,
        valueRing,
      );

      const result = wrapped(42, 5, runtimeCtx);

      expect(result).toEqual([1, 2, 3, 4, 5]);
      expect(spanRing.size()).toBe(1);
      expect(valueRing.size()).toBe(1);

      const value = valueRing.getValue(0);
      expect(value!.tag).toBe(ValueTag.FieldStats);
      expect(value!.b).toBe(5); // element count
      expect(value!.c & FieldStatMask.HasMinMax).toBeTruthy();
      expect(unpackF32(value!.d)).toBe(1); // min
      expect(unpackF32(value!.e)).toBe(5); // max
    });

    it('should compute min/max for number fields', () => {
      TraceController.instance.setMode('full');

      const original = (_seed: number, _n: number, _ctx: RuntimeCtx) => [10, -5, 3, 42, 0];
      const wrapped = wrapFieldForDebug(
        original,
        'field:test',
        'number',
        debugIndex,
        spanRing,
        valueRing,
      );

      wrapped(42, 5, runtimeCtx);

      const value = valueRing.getValue(0);
      expect(unpackF32(value!.d)).toBe(-5); // min
      expect(unpackF32(value!.e)).toBe(42); // max
    });

    it('should detect NaN in number fields', () => {
      TraceController.instance.setMode('full');

      const original = (_seed: number, _n: number, _ctx: RuntimeCtx) => [1, NaN, 3];
      const wrapped = wrapFieldForDebug(
        original,
        'field:test',
        'number',
        debugIndex,
        spanRing,
        valueRing,
      );

      wrapped(42, 3, runtimeCtx);

      const span = spanRing.getSpan(0);
      expect(span!.flags & SpanFlags.HAS_NAN).toBeTruthy();

      const value = valueRing.getValue(0);
      expect(value!.c & FieldStatMask.HasNaN).toBeTruthy();
    });

    it('should not emit value record for non-number fields', () => {
      TraceController.instance.setMode('full');

      const original = (_seed: number, _n: number, _ctx: RuntimeCtx) => [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ];
      const wrapped = wrapFieldForDebug(
        original,
        'field:test',
        'vec2',
        debugIndex,
        spanRing,
        valueRing,
      );

      wrapped(42, 2, runtimeCtx);

      expect(spanRing.size()).toBe(1);
      expect(valueRing.size()).toBe(0); // No value record for vec2
    });
  });

  // ===========================================================================
  // P1-3: wrapBusCombineForDebug (Bus Combine)
  // ===========================================================================

  describe('wrapBusCombineForDebug', () => {
    it('should skip instrumentation in "off" mode', () => {
      TraceController.instance.setMode('off');

      const original = (_tMs: number, _ctx: RuntimeCtx) => 42;
      const wrapped = wrapBusCombineForDebug(
        original,
        '/time/t',
        3,
        debugIndex,
        spanRing,
      );

      const result = wrapped(1000, runtimeCtx);

      expect(result).toBe(42);
      expect(spanRing.size()).toBe(0);
    });

    it('should emit span in "timing" mode', () => {
      TraceController.instance.setMode('timing');

      const original = (_tMs: number, _ctx: RuntimeCtx) => 42;
      const wrapped = wrapBusCombineForDebug(
        original,
        '/time/t',
        3,
        debugIndex,
        spanRing,
      );

      const result = wrapped(1000, runtimeCtx);

      expect(result).toBe(42);
      expect(spanRing.size()).toBe(1);

      const span = spanRing.getSpan(0);
      expect(span!.kind).toBe(SpanKind.BusCombine);
      expect(span!.frameId).toBe(42);
      expect(span!.tMs).toBe(1000);
      expect(span!.subjectId).toBe(debugIndex.internBus('/time/t'));
      expect(span!.durationUs).toBeGreaterThanOrEqual(0);
    });

    it('should intern bus ID once', () => {
      TraceController.instance.setMode('timing');

      const original = (_tMs: number, _ctx: RuntimeCtx) => 42;
      const wrapped = wrapBusCombineForDebug(
        original,
        '/time/t',
        3,
        debugIndex,
        spanRing,
      );

      // Call multiple times
      wrapped(1000, runtimeCtx);
      wrapped(1001, runtimeCtx);

      // Bus ID should be interned once
      expect(debugIndex.busCount()).toBe(1);
      expect(debugIndex.getBusId(1)).toBe('/time/t');
    });
  });

  // ===========================================================================
  // Integration: Multiple Wrappers
  // ===========================================================================

  describe('Integration', () => {
    it('should emit multiple spans from different wrappers', () => {
      TraceController.instance.setMode('timing');

      const signal = (_tMs: number, _ctx: RuntimeCtx) => 42;
      const field = (_seed: number, _n: number, _ctx: RuntimeCtx) => [1, 2, 3];
      const combine = (_tMs: number, _ctx: RuntimeCtx) => 100;

      const wrappedSignal = wrapSignalForDebug(signal, 'Block#1', debugIndex, spanRing);
      const wrappedField = wrapFieldForDebug(
        field,
        'field:test',
        'number',
        debugIndex,
        spanRing,
        valueRing,
      );
      const wrappedCombine = wrapBusCombineForDebug(
        combine,
        '/bus/test',
        2,
        debugIndex,
        spanRing,
      );

      wrappedSignal(1000, runtimeCtx);
      wrappedField(42, 3, runtimeCtx);
      wrappedCombine(1000, runtimeCtx);

      expect(spanRing.size()).toBe(3);

      const spans = spanRing.getSpansInRange(0, 3);
      expect(spans[0].kind).toBe(SpanKind.BlockEval);
      expect(spans[1].kind).toBe(SpanKind.MaterializeField);
      expect(spans[2].kind).toBe(SpanKind.BusCombine);
    });

    it('should emit spans in timing mode without crashing', () => {
      TraceController.instance.setMode('timing');

      const original = (_tMs: number, _ctx: RuntimeCtx) => 42;
      const wrapped = wrapSignalForDebug(original, 'Block#1', debugIndex, spanRing);

      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        wrapped(1000, runtimeCtx);
      }

      // Should have emitted spans
      expect(spanRing.size()).toBe(iterations);
    });
  });
});
