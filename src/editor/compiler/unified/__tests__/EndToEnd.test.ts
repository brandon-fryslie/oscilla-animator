/**
 * @file EndToEnd.test.ts - End-to-end integration test
 * @description Tests complete pipeline from blocks to evaluation.
 */

import { describe, it, expect } from 'vitest';
import { createSimpleDomain } from '../Domain';
import { createRadialOriginExpr } from '../blocks/RadialOriginBlock';
import { createLinearPhaseSignal } from '../blocks/LinearPhaseBlock';
import { batchEvaluateFieldExpr, createFieldExprCtx } from '../FieldExpr';
import { TimeCtxFactory } from '../TimeCtx';

describe('End-to-end integration', () => {
  it('should evaluate RadialOrigin + LinearPhase pipeline', () => {
    // Create domain
    const domain = createSimpleDomain('elements', 4);

    // Create RadialOrigin field
    const originExpr = createRadialOriginExpr(domain, {
      centerX: 100,
      centerY: 50,
      radius: 100,
      angleOffset: 0,
    });

    // Create LinearPhase signal
    const phaseSignal = createLinearPhaseSignal({
      duration: 2.0,
      looping: false,
      offset: 0,
    });

    // Evaluate at different times
    const timeCtx0 = TimeCtxFactory.forPerformance(0, 0, 0);
    const timeCtx1 = TimeCtxFactory.forPerformance(1.0, 0.016, 60);
    const timeCtx2 = TimeCtxFactory.forPerformance(2.0, 0.016, 120);

    const evalCtx = createFieldExprCtx();

    // Evaluate Field
    const positions0 = batchEvaluateFieldExpr(originExpr, domain, timeCtx0, evalCtx);
    const positions1 = batchEvaluateFieldExpr(originExpr, domain, timeCtx1, evalCtx);

    // Field should be time-independent (same positions at all times)
    expect(positions0).toHaveLength(4);
    expect(positions1).toHaveLength(4);
    expect(positions0[0]!.x).toBeCloseTo(positions1[0]!.x, 5);

    // Evaluate Signal
    const phase0 = phaseSignal(timeCtx0);
    const phase1 = phaseSignal(timeCtx1);
    const phase2 = phaseSignal(timeCtx2);

    // Signal should be time-dependent (changes over time)
    expect(phase0).toBeCloseTo(0, 5);
    expect(phase1).toBeCloseTo(0.5, 5);
    expect(phase2).toBeCloseTo(1.0, 5);

    // Verify positions are in radial pattern
    const pos0 = positions0[0]!;
    const dist0 = Math.sqrt((pos0.x - 100) ** 2 + (pos0.y - 50) ** 2);
    expect(dist0).toBeCloseTo(100, 5);
  });

  it('should support scrubbing (deterministic evaluation)', () => {
    const domain = createSimpleDomain('elements', 2);
    const expr = createRadialOriginExpr(domain, {
      centerX: 0,
      centerY: 0,
      radius: 50,
      angleOffset: 0,
    });

    const phaseSignal = createLinearPhaseSignal({
      duration: 1.0,
      looping: false,
      offset: 0,
    });

    // Evaluate same time twice (scrubbing)
    const timeCtx1 = TimeCtxFactory.forScrub(0.5, 0);
    const timeCtx2 = TimeCtxFactory.forScrub(0.5, 1);

    const evalCtx1 = createFieldExprCtx();
    const evalCtx2 = createFieldExprCtx();

    const positions1 = batchEvaluateFieldExpr(expr, domain, timeCtx1, evalCtx1);
    const positions2 = batchEvaluateFieldExpr(expr, domain, timeCtx2, evalCtx2);

    const phase1 = phaseSignal(timeCtx1);
    const phase2 = phaseSignal(timeCtx2);

    // Should be identical (deterministic)
    expect(positions1[0]!.x).toBeCloseTo(positions2[0]!.x, 10);
    expect(phase1).toBeCloseTo(phase2, 10);
  });
});
