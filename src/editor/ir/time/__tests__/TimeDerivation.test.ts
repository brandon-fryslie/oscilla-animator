import { describe, it, expect } from 'vitest';
import {
  deriveTimeSignals,
  validateTimeModel,
  calculateTimeDerivedValues,
  getTimeModelPeriod,
  isTimeModelBounded,
  isTimeModelLooping,
} from '../TimeDerivation';
import type {
  CyclicTimeModelIR,
  FiniteTimeModelIR,
  InfiniteTimeModelIR,
} from '../../schema/CompiledProgramIR';

describe('TimeDerivation', () => {
  describe('deriveTimeSignals', () => {
    it('cyclic model has phase and wrap', () => {
      const model: CyclicTimeModelIR = {
        kind: 'cyclic',
        periodMs: 4000,
        mode: 'loop',
        phaseDomain: '0..1',
      };

      const signals = deriveTimeSignals(model);
      expect(signals.tAbsMs).toBe(true);
      expect(signals.tModelMs).toBe(true);
      expect(signals.phase01).toBe(true);
      expect(signals.wrapEvent).toBe(true);
      expect(signals.progress).toBe(false);
      expect(signals.endEvent).toBe(false);
    });

    it('finite model has progress and end', () => {
      const model: FiniteTimeModelIR = {
        kind: 'finite',
        durationMs: 5000,
      };

      const signals = deriveTimeSignals(model);
      expect(signals.tAbsMs).toBe(true);
      expect(signals.tModelMs).toBe(true);
      expect(signals.phase01).toBe(true);
      expect(signals.progress).toBe(true);
      expect(signals.endEvent).toBe(true);
      expect(signals.wrapEvent).toBe(false);
    });

    it('infinite model only has absolute and model time', () => {
      const model: InfiniteTimeModelIR = {
        kind: 'infinite',
        windowMs: 10000,
      };

      const signals = deriveTimeSignals(model);
      expect(signals.tAbsMs).toBe(true);
      expect(signals.tModelMs).toBe(true);
      expect(signals.phase01).toBe(false);
      expect(signals.wrapEvent).toBe(false);
      expect(signals.progress).toBe(false);
      expect(signals.endEvent).toBe(false);
    });
  });

  describe('validateTimeModel', () => {
    it('accepts valid cyclic model', () => {
      const model: CyclicTimeModelIR = {
        kind: 'cyclic',
        periodMs: 4000,
        mode: 'loop',
        phaseDomain: '0..1',
      };

      const result = validateTimeModel(model);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects cyclic with zero period', () => {
      const model: CyclicTimeModelIR = {
        kind: 'cyclic',
        periodMs: 0,
        mode: 'loop',
        phaseDomain: '0..1',
      };

      const result = validateTimeModel(model);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cyclic time model must have periodMs > 0');
    });

    it('rejects cyclic with negative period', () => {
      const model: CyclicTimeModelIR = {
        kind: 'cyclic',
        periodMs: -1000,
        mode: 'loop',
        phaseDomain: '0..1',
      };

      const result = validateTimeModel(model);
      expect(result.valid).toBe(false);
    });

    it('accepts valid finite model', () => {
      const model: FiniteTimeModelIR = {
        kind: 'finite',
        durationMs: 5000,
        cuePoints: [
          { id: 'intro', label: 'Intro', tMs: 1000 },
          { id: 'outro', label: 'Outro', tMs: 4500 },
        ],
      };

      const result = validateTimeModel(model);
      expect(result.valid).toBe(true);
    });

    it('rejects finite with zero duration', () => {
      const model: FiniteTimeModelIR = {
        kind: 'finite',
        durationMs: 0,
      };

      const result = validateTimeModel(model);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Finite time model must have durationMs > 0');
    });

    it('rejects cue point outside duration', () => {
      const model: FiniteTimeModelIR = {
        kind: 'finite',
        durationMs: 5000,
        cuePoints: [
          { id: 'bad', label: 'Bad', tMs: 6000 },
        ],
      };

      const result = validateTimeModel(model);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('outside duration');
    });

    it('rejects negative cue point time', () => {
      const model: FiniteTimeModelIR = {
        kind: 'finite',
        durationMs: 5000,
        cuePoints: [
          { id: 'bad', label: 'Bad', tMs: -100 },
        ],
      };

      const result = validateTimeModel(model);
      expect(result.valid).toBe(false);
    });

    it('accepts valid infinite model', () => {
      const model: InfiniteTimeModelIR = {
        kind: 'infinite',
        windowMs: 10000,
      };

      const result = validateTimeModel(model);
      expect(result.valid).toBe(true);
    });

    it('rejects infinite with zero window', () => {
      const model: InfiniteTimeModelIR = {
        kind: 'infinite',
        windowMs: 0,
      };

      const result = validateTimeModel(model);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Infinite time model must have windowMs > 0');
    });
  });

  describe('calculateTimeDerivedValues', () => {
    describe('cyclic', () => {
      const model: CyclicTimeModelIR = {
        kind: 'cyclic',
        periodMs: 4000,
        mode: 'loop',
        phaseDomain: '0..1',
      };

      it('calculates phase correctly at 25%', () => {
        const values = calculateTimeDerivedValues(model, 1000, 0);
        expect(values.tAbsMs).toBe(1000);
        expect(values.tModelMs).toBe(1000);
        expect(values.phase01).toBeCloseTo(0.25);
        expect(values.wrapEvent).toBe(false);
      });

      it('calculates phase correctly at 50%', () => {
        const values = calculateTimeDerivedValues(model, 2000, 1000);
        expect(values.phase01).toBeCloseTo(0.5);
        expect(values.wrapEvent).toBe(false);
      });

      it('calculates phase correctly at 75%', () => {
        const values = calculateTimeDerivedValues(model, 3000, 2000);
        expect(values.phase01).toBeCloseTo(0.75);
      });

      it('wraps phase at period boundary', () => {
        const values = calculateTimeDerivedValues(model, 4100, 3900);
        expect(values.tAbsMs).toBe(4100);
        expect(values.tModelMs).toBe(100); // Wrapped
        expect(values.phase01).toBeCloseTo(0.025);
        expect(values.wrapEvent).toBe(true);
      });

      it('detects wrap event when crossing period', () => {
        // Time went from 3900 to 4100, so phase wrapped from 0.975 to 0.025
        const values = calculateTimeDerivedValues(model, 4100, 3900);
        expect(values.wrapEvent).toBe(true);
      });

      it('no wrap event within same period', () => {
        const values = calculateTimeDerivedValues(model, 2000, 1000);
        expect(values.wrapEvent).toBe(false);
      });

      it('handles multiple periods correctly', () => {
        const values = calculateTimeDerivedValues(model, 10000, 9900);
        expect(values.tAbsMs).toBe(10000);
        expect(values.tModelMs).toBe(2000); // 10000 % 4000
        expect(values.phase01).toBeCloseTo(0.5);
      });
    });

    describe('cyclic pingpong', () => {
      const model: CyclicTimeModelIR = {
        kind: 'cyclic',
        periodMs: 4000,
        mode: 'pingpong',
        phaseDomain: '0..1',
      };

      it('phase goes forward in first half', () => {
        const values = calculateTimeDerivedValues(model, 1000, 0);
        expect(values.phase01).toBeCloseTo(0.25);
      });

      it('phase goes backward in second half', () => {
        const values = calculateTimeDerivedValues(model, 5000, 4000);
        // At 5000ms, rawPhase = 5000/4000 = 1.25
        // cyclePhase = 1.25 % 2 = 1.25
        // Since 1.25 > 1, phase = 2 - 1.25 = 0.75
        expect(values.phase01).toBeCloseTo(0.75);
      });
    });

    describe('finite', () => {
      const model: FiniteTimeModelIR = {
        kind: 'finite',
        durationMs: 5000,
      };

      it('calculates progress correctly at 50%', () => {
        const values = calculateTimeDerivedValues(model, 2500, 0);
        expect(values.tAbsMs).toBe(2500);
        expect(values.tModelMs).toBe(2500);
        expect(values.progress).toBeCloseTo(0.5);
        expect(values.phase01).toBeCloseTo(0.5); // phase01 === progress for finite
        expect(values.endEvent).toBe(false);
      });

      it('clamps at duration', () => {
        const values = calculateTimeDerivedValues(model, 6000, 4900);
        expect(values.tModelMs).toBe(5000); // Clamped
        expect(values.progress).toBe(1.0);
      });

      it('detects end event at 100%', () => {
        const values = calculateTimeDerivedValues(model, 5100, 4900);
        expect(values.progress).toBe(1.0);
        expect(values.endEvent).toBe(true);
      });

      it('no end event if already past 100%', () => {
        const values = calculateTimeDerivedValues(model, 6000, 5100);
        expect(values.progress).toBe(1.0);
        expect(values.endEvent).toBe(false); // Already past
      });

      it('no end event before reaching 100%', () => {
        const values = calculateTimeDerivedValues(model, 4000, 3000);
        expect(values.progress).toBeCloseTo(0.8);
        expect(values.endEvent).toBe(false);
      });
    });

    describe('infinite', () => {
      const model: InfiniteTimeModelIR = {
        kind: 'infinite',
        windowMs: 10000,
      };

      it('passes through time values', () => {
        const values = calculateTimeDerivedValues(model, 15000, 14000);
        expect(values.tAbsMs).toBe(15000);
        expect(values.tModelMs).toBe(15000);
      });

      it('has no phase or events', () => {
        const values = calculateTimeDerivedValues(model, 5000, 0);
        expect(values.phase01).toBeUndefined();
        expect(values.wrapEvent).toBeUndefined();
        expect(values.progress).toBeUndefined();
        expect(values.endEvent).toBeUndefined();
      });

      it('handles large time values', () => {
        const values = calculateTimeDerivedValues(model, 1000000, 999000);
        expect(values.tAbsMs).toBe(1000000);
        expect(values.tModelMs).toBe(1000000);
      });
    });
  });

  describe('Helper functions', () => {
    describe('getTimeModelPeriod', () => {
      it('returns periodMs for cyclic', () => {
        const model: CyclicTimeModelIR = {
          kind: 'cyclic',
          periodMs: 4000,
          mode: 'loop',
          phaseDomain: '0..1',
        };
        expect(getTimeModelPeriod(model)).toBe(4000);
      });

      it('returns durationMs for finite', () => {
        const model: FiniteTimeModelIR = {
          kind: 'finite',
          durationMs: 5000,
        };
        expect(getTimeModelPeriod(model)).toBe(5000);
      });

      it('returns undefined for infinite', () => {
        const model: InfiniteTimeModelIR = {
          kind: 'infinite',
          windowMs: 10000,
        };
        expect(getTimeModelPeriod(model)).toBeUndefined();
      });
    });

    describe('isTimeModelBounded', () => {
      it('returns true for cyclic', () => {
        expect(isTimeModelBounded({ kind: 'cyclic', periodMs: 4000, mode: 'loop', phaseDomain: '0..1' })).toBe(true);
      });

      it('returns true for finite', () => {
        expect(isTimeModelBounded({ kind: 'finite', durationMs: 5000 })).toBe(true);
      });

      it('returns false for infinite', () => {
        expect(isTimeModelBounded({ kind: 'infinite', windowMs: 10000 })).toBe(false);
      });
    });

    describe('isTimeModelLooping', () => {
      it('returns true for cyclic', () => {
        expect(isTimeModelLooping({ kind: 'cyclic', periodMs: 4000, mode: 'loop', phaseDomain: '0..1' })).toBe(true);
      });

      it('returns false for finite', () => {
        expect(isTimeModelLooping({ kind: 'finite', durationMs: 5000 })).toBe(false);
      });

      it('returns false for infinite', () => {
        expect(isTimeModelLooping({ kind: 'infinite', windowMs: 10000 })).toBe(false);
      });
    });
  });
});
