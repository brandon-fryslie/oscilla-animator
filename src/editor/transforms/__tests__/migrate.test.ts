/**
 * Transform Migration Tests
 *
 * Phase 0.5 Track A: Transform Storage Unification
 * Tests for convertLegacyTransforms, convertToLegacyTransforms, and getEdgeTransforms.
 *
 * References:
 * - .agent_planning/phase0.5-compat-cleanup/PLAN-2026-01-01-000000.md (Track A)
 * - .agent_planning/phase0.5-compat-cleanup/DOD-2026-01-01-000000.md (Deliverable A.2)
 */

import { describe, it, expect } from 'vitest';
import {
  convertLegacyTransforms,
  convertToLegacyTransforms,
  getEdgeTransforms,
} from '../migrate';
import type { LensInstance, AdapterStep, TransformStep } from '../../types';

describe('convertLegacyTransforms', () => {
  it('converts empty inputs to empty array', () => {
    const result = convertLegacyTransforms(undefined, undefined);
    expect(result).toEqual([]);
  });

  it('converts only lensStack', () => {
    const lensStack: LensInstance[] = [
      {
        lensId: 'mul',
        params: { factor: { type: 'literal', value: 2 } },
        enabled: true,
        sortKey: 0,
      },
    ];

    const result = convertLegacyTransforms(lensStack, undefined);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      kind: 'lens',
      lens: lensStack[0],
    });
  });

  it('converts only adapterChain', () => {
    const adapterChain: AdapterStep[] = [
      { adapterId: 'float-to-vec2', params: {} },
    ];

    const result = convertLegacyTransforms(undefined, adapterChain);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(adapterChain[0]);
  });

  it('converts both lensStack and adapterChain in correct order (adapters first)', () => {
    const lensStack: LensInstance[] = [
      {
        lensId: 'mul',
        params: { factor: { type: 'literal', value: 2 } },
        enabled: true,
      },
      {
        lensId: 'add',
        params: { offset: { type: 'literal', value: 1 } },
        enabled: true,
      },
    ];

    const adapterChain: AdapterStep[] = [
      { adapterId: 'float-to-vec2', params: {} },
      { adapterId: 'signal-promotion', params: {} },
    ];

    const result = convertLegacyTransforms(lensStack, adapterChain);

    expect(result).toHaveLength(4);

    // Adapters first
    expect(result[0]).toEqual(adapterChain[0]);
    expect(result[1]).toEqual(adapterChain[1]);

    // Then lenses
    expect(result[2]).toEqual({ kind: 'lens', lens: lensStack[0] });
    expect(result[3]).toEqual({ kind: 'lens', lens: lensStack[1] });
  });

  it('handles empty arrays (as opposed to undefined)', () => {
    const result = convertLegacyTransforms([], []);
    expect(result).toEqual([]);
  });

  it('preserves lens metadata (enabled, sortKey)', () => {
    const lensStack: LensInstance[] = [
      {
        lensId: 'clamp',
        params: {
          min: { type: 'literal', value: 0 },
          max: { type: 'literal', value: 1 },
        },
        enabled: false,
        sortKey: 42,
      },
    ];

    const result = convertLegacyTransforms(lensStack, undefined);

    expect(result).toHaveLength(1);
    const lensTransform = result[0] as { kind: 'lens'; lens: LensInstance };
    expect(lensTransform.kind).toBe('lens');
    expect(lensTransform.lens.enabled).toBe(false);
    expect(lensTransform.lens.sortKey).toBe(42);
  });

  it('preserves adapter parameters', () => {
    const adapterChain: AdapterStep[] = [
      {
        adapterId: 'custom-adapter',
        params: { foo: 'bar', count: 42, nested: { a: 1 } },
      },
    ];

    const result = convertLegacyTransforms(undefined, adapterChain);

    expect(result).toHaveLength(1);
    const adapter = result[0] as AdapterStep;
    expect(adapter.params).toEqual({ foo: 'bar', count: 42, nested: { a: 1 } });
  });
});

describe('convertToLegacyTransforms', () => {
  it('converts empty array to empty legacy arrays', () => {
    const result = convertToLegacyTransforms([]);
    expect(result.lensStack).toEqual([]);
    expect(result.adapterChain).toEqual([]);
  });

  it('converts lens transforms to lensStack', () => {
    const transforms: TransformStep[] = [
      {
        kind: 'lens',
        lens: {
          lensId: 'mul',
          params: { factor: { type: 'literal', value: 2 } },
          enabled: true,
        },
      },
    ];

    const result = convertToLegacyTransforms(transforms);

    expect(result.lensStack).toHaveLength(1);
    expect(result.lensStack[0]).toEqual(transforms[0].lens);
    expect(result.adapterChain).toEqual([]);
  });

  it('converts adapter transforms to adapterChain', () => {
    const transforms: TransformStep[] = [
      { adapterId: 'float-to-vec2', params: {} },
    ];

    const result = convertToLegacyTransforms(transforms);

    expect(result.adapterChain).toHaveLength(1);
    expect(result.adapterChain[0]).toEqual(transforms[0]);
    expect(result.lensStack).toEqual([]);
  });

  it('splits mixed transforms into lensStack and adapterChain', () => {
    const transforms: TransformStep[] = [
      { adapterId: 'float-to-vec2', params: {} },
      {
        kind: 'lens',
        lens: {
          lensId: 'mul',
          params: { factor: { type: 'literal', value: 2 } },
          enabled: true,
        },
      },
      { adapterId: 'signal-promotion', params: {} },
      {
        kind: 'lens',
        lens: {
          lensId: 'add',
          params: { offset: { type: 'literal', value: 1 } },
          enabled: true,
        },
      },
    ];

    const result = convertToLegacyTransforms(transforms);

    expect(result.adapterChain).toHaveLength(2);
    expect(result.adapterChain[0]).toEqual(transforms[0]);
    expect(result.adapterChain[1]).toEqual(transforms[2]);

    expect(result.lensStack).toHaveLength(2);
    expect(result.lensStack[0]).toEqual((transforms[1] as any).lens);
    expect(result.lensStack[1]).toEqual((transforms[3] as any).lens);
  });

  it('preserves all lens metadata during conversion', () => {
    const lens: LensInstance = {
      lensId: 'clamp',
      params: {
        min: { type: 'literal', value: 0 },
        max: { type: 'literal', value: 1 },
      },
      enabled: false,
      sortKey: 99,
    };

    const transforms: TransformStep[] = [{ kind: 'lens', lens }];

    const result = convertToLegacyTransforms(transforms);

    expect(result.lensStack).toHaveLength(1);
    expect(result.lensStack[0]).toEqual(lens);
    expect(result.lensStack[0].enabled).toBe(false);
    expect(result.lensStack[0].sortKey).toBe(99);
  });
});

describe('roundtrip conversion', () => {
  it('preserves transforms through legacy→new→legacy conversion', () => {
    const originalLensStack: LensInstance[] = [
      {
        lensId: 'mul',
        params: { factor: { type: 'literal', value: 2 } },
        enabled: true,
        sortKey: 1,
      },
    ];

    const originalAdapterChain: AdapterStep[] = [
      { adapterId: 'float-to-vec2', params: {} },
    ];

    // Convert to new format
    const transforms = convertLegacyTransforms(
      originalLensStack,
      originalAdapterChain
    );

    // Convert back to legacy format
    const legacy = convertToLegacyTransforms(transforms);

    // Should match original
    expect(legacy.lensStack).toEqual(originalLensStack);
    expect(legacy.adapterChain).toEqual(originalAdapterChain);
  });

  it('preserves complex transform chains with metadata', () => {
    const originalLensStack: LensInstance[] = [
      {
        lensId: 'mul',
        params: { factor: { type: 'literal', value: 2 } },
        enabled: true,
        sortKey: 1,
      },
      {
        lensId: 'clamp',
        params: {
          min: { type: 'literal', value: 0 },
          max: { type: 'literal', value: 1 },
        },
        enabled: false,
        sortKey: 2,
      },
    ];

    const originalAdapterChain: AdapterStep[] = [
      { adapterId: 'float-to-vec2', params: {} },
      {
        adapterId: 'custom',
        params: { a: 1, b: 'test', c: { nested: true } },
      },
    ];

    const transforms = convertLegacyTransforms(
      originalLensStack,
      originalAdapterChain
    );
    const legacy = convertToLegacyTransforms(transforms);

    expect(legacy.lensStack).toEqual(originalLensStack);
    expect(legacy.adapterChain).toEqual(originalAdapterChain);
  });
});

describe('getEdgeTransforms', () => {
  it('returns empty array for edge with no transforms', () => {
    const edge = {};
    const result = getEdgeTransforms(edge);
    expect(result).toEqual([]);
  });

  it('prefers transforms field when present', () => {
    const transforms: TransformStep[] = [
      { adapterId: 'new-adapter', params: {} },
    ];

    const edge = {
      transforms,
      lensStack: [
        {
          lensId: 'old-lens',
          params: {},
          enabled: true,
        },
      ],
      adapterChain: [{ adapterId: 'old-adapter', params: {} }],
    };

    const result = getEdgeTransforms(edge);
    expect(result).toEqual(transforms);
  });

  it('falls back to legacy fields when transforms is empty', () => {
    const lensStack: LensInstance[] = [
      {
        lensId: 'mul',
        params: { factor: { type: 'literal', value: 2 } },
        enabled: true,
      },
    ];

    const edge = {
      transforms: [],
      lensStack,
      adapterChain: undefined,
    };

    const result = getEdgeTransforms(edge);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ kind: 'lens', lens: lensStack[0] });
  });

  it('falls back to legacy fields when transforms is undefined', () => {
    const adapterChain: AdapterStep[] = [
      { adapterId: 'float-to-vec2', params: {} },
    ];

    const edge = {
      transforms: undefined,
      lensStack: undefined,
      adapterChain,
    };

    const result = getEdgeTransforms(edge);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(adapterChain[0]);
  });

  it('falls back to both legacy fields when transforms is empty', () => {
    const lensStack: LensInstance[] = [
      {
        lensId: 'mul',
        params: { factor: { type: 'literal', value: 2 } },
        enabled: true,
      },
    ];

    const adapterChain: AdapterStep[] = [
      { adapterId: 'float-to-vec2', params: {} },
    ];

    const edge = {
      transforms: [],
      lensStack,
      adapterChain,
    };

    const result = getEdgeTransforms(edge);

    expect(result).toHaveLength(2);
    // Adapters first, then lenses
    expect(result[0]).toEqual(adapterChain[0]);
    expect(result[1]).toEqual({ kind: 'lens', lens: lensStack[0] });
  });

  it('returns empty array when all fields are empty/undefined', () => {
    const edge1 = { transforms: [], lensStack: [], adapterChain: [] };
    const edge2 = {
      transforms: undefined,
      lensStack: undefined,
      adapterChain: undefined,
    };

    expect(getEdgeTransforms(edge1)).toEqual([]);
    expect(getEdgeTransforms(edge2)).toEqual([]);
  });
});
