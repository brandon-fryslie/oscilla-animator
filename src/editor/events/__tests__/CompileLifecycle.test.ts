/**
 * @file Compile Lifecycle Event Tests
 * @description Tests for CompileStarted and CompileFinished event payload structures.
 */
import { describe, it, expect } from 'vitest';
import type { CompileStartedEvent, CompileFinishedEvent, CompileTrigger, CompileStatus } from '../types';
import {randomUUID} from "../../crypto.ts";

describe('CompileStarted Event Payload', () => {
  it('should have required compileId field', () => {
    const event: CompileStartedEvent = {
      type: 'CompileStarted',
      compileId: randomUUID(),
      patchId: randomUUID(),
      patchRevision: 1,
      trigger: 'graphCommitted',
    };

    expect(event).toHaveProperty('compileId');
    expect(typeof event.compileId).toBe('string');
    expect(event.compileId.length).toBeGreaterThan(0);
  });

  it('should have required patchId field', () => {
    const event: CompileStartedEvent = {
      type: 'CompileStarted',
      compileId: randomUUID(),
      patchId: randomUUID(),
      patchRevision: 1,
      trigger: 'graphCommitted',
    };

    expect(event).toHaveProperty('patchId');
    expect(typeof event.patchId).toBe('string');
  });

  it('should have required patchRevision field', () => {
    const event: CompileStartedEvent = {
      type: 'CompileStarted',
      compileId: randomUUID(),
      patchId: randomUUID(),
      patchRevision: 42,
      trigger: 'graphCommitted',
    };

    expect(event).toHaveProperty('patchRevision');
    expect(typeof event.patchRevision).toBe('number');
    expect(event.patchRevision).toBe(42);
  });

  it('should have required trigger field', () => {
    const event: CompileStartedEvent = {
      type: 'CompileStarted',
      compileId: randomUUID(),
      patchId: randomUUID(),
      patchRevision: 1,
      trigger: 'manual',
    };

    expect(event).toHaveProperty('trigger');
    expect(event.trigger).toBe('manual');
  });

  it('should accept all valid trigger values', () => {
    const triggers: CompileTrigger[] = ['graphCommitted', 'manual', 'startup', 'hotReload'];

    triggers.forEach((trigger) => {
      const event: CompileStartedEvent = {
        type: 'CompileStarted',
        compileId: randomUUID(),
        patchId: randomUUID(),
        patchRevision: 1,
        trigger,
      };

      expect(event.trigger).toBe(trigger);
    });
  });

  it('should have type field equal to "CompileStarted"', () => {
    const event: CompileStartedEvent = {
      type: 'CompileStarted',
      compileId: randomUUID(),
      patchId: randomUUID(),
      patchRevision: 1,
      trigger: 'graphCommitted',
    };

    expect(event.type).toBe('CompileStarted');
  });
});

describe('CompileFinished Event Payload', () => {
  it('should have required compileId field matching CompileStarted', () => {
    const compileId = randomUUID();
    const event: CompileFinishedEvent = {
      type: 'CompileFinished',
      compileId,
      patchId: randomUUID(),
      patchRevision: 1,
      status: 'ok',
      durationMs: 42,
      diagnostics: [],
    };

    expect(event).toHaveProperty('compileId');
    expect(event.compileId).toBe(compileId);
  });

  it('should have required patchId field', () => {
    const event: CompileFinishedEvent = {
      type: 'CompileFinished',
      compileId: randomUUID(),
      patchId: randomUUID(),
      patchRevision: 1,
      status: 'ok',
      durationMs: 42,
      diagnostics: [],
    };

    expect(event).toHaveProperty('patchId');
    expect(typeof event.patchId).toBe('string');
  });

  it('should have required patchRevision field', () => {
    const event: CompileFinishedEvent = {
      type: 'CompileFinished',
      compileId: randomUUID(),
      patchId: randomUUID(),
      patchRevision: 5,
      status: 'ok',
      durationMs: 42,
      diagnostics: [],
    };

    expect(event).toHaveProperty('patchRevision');
    expect(event.patchRevision).toBe(5);
  });

  it('should have required status field', () => {
    const event: CompileFinishedEvent = {
      type: 'CompileFinished',
      compileId: randomUUID(),
      patchId: randomUUID(),
      patchRevision: 1,
      status: 'failed',
      durationMs: 42,
      diagnostics: [],
    };

    expect(event).toHaveProperty('status');
    expect(event.status).toBe('failed');
  });

  it('should accept all valid status values', () => {
    const statuses: CompileStatus[] = ['ok', 'failed'];

    statuses.forEach((status) => {
      const event: CompileFinishedEvent = {
        type: 'CompileFinished',
        compileId: randomUUID(),
        patchId: randomUUID(),
        patchRevision: 1,
        status,
        durationMs: 42,
        diagnostics: [],
      };

      expect(event.status).toBe(status);
    });
  });

  it('should have required durationMs field', () => {
    const event: CompileFinishedEvent = {
      type: 'CompileFinished',
      compileId: randomUUID(),
      patchId: randomUUID(),
      patchRevision: 1,
      status: 'ok',
      durationMs: 123.456,
      diagnostics: [],
    };

    expect(event).toHaveProperty('durationMs');
    expect(typeof event.durationMs).toBe('number');
    expect(event.durationMs).toBe(123.456);
  });

  it('should have required diagnostics array', () => {
    const event: CompileFinishedEvent = {
      type: 'CompileFinished',
      compileId: randomUUID(),
      patchId: randomUUID(),
      patchRevision: 1,
      status: 'ok',
      durationMs: 42,
      diagnostics: [],
    };

    expect(event).toHaveProperty('diagnostics');
    expect(Array.isArray(event.diagnostics)).toBe(true);
  });

  it('should have diagnostics array on success', () => {
    const event: CompileFinishedEvent = {
      type: 'CompileFinished',
      compileId: randomUUID(),
      patchId: randomUUID(),
      patchRevision: 1,
      status: 'ok',
      durationMs: 42,
      diagnostics: [],
    };

    expect(event.diagnostics).toEqual([]);
  });

  it('should have diagnostics array on failure', () => {
    const event: CompileFinishedEvent = {
      type: 'CompileFinished',
      compileId: randomUUID(),
      patchId: randomUUID(),
      patchRevision: 1,
      status: 'failed',
      durationMs: 42,
      diagnostics: [],
    };

    expect(event.diagnostics).toEqual([]);
  });

  it('should have optional programMeta field on success', () => {
    const event: CompileFinishedEvent = {
      type: 'CompileFinished',
      compileId: randomUUID(),
      patchId: randomUUID(),
      patchRevision: 1,
      status: 'ok',
      durationMs: 42,
      diagnostics: [],
      programMeta: {
        timeModelKind: 'cyclic',
        timeRootKind: 'InfiniteTimeRoot',
      },
    };

    expect(event).toHaveProperty('programMeta');
    expect(event.programMeta?.timeModelKind).toBe('cyclic');
    expect(event.programMeta?.timeRootKind).toBe('InfiniteTimeRoot');
  });

  it('should support programMeta with all timeModelKind values', () => {
    const timeModelKinds: Array<'finite' | 'cyclic' | 'infinite'> = ['finite', 'cyclic', 'infinite'];

    timeModelKinds.forEach((kind) => {
      const event: CompileFinishedEvent = {
        type: 'CompileFinished',
        compileId: randomUUID(),
        patchId: randomUUID(),
        patchRevision: 1,
        status: 'ok',
        durationMs: 42,
        diagnostics: [],
        programMeta: {
          timeModelKind: kind,
          timeRootKind: 'InfiniteTimeRoot',
        },
      };

      expect(event.programMeta?.timeModelKind).toBe(kind);
    });
  });

  it('should support programMeta with all timeRootKind values', () => {
    const timeRootKinds: Array<'FiniteTimeRoot' | 'InfiniteTimeRoot' | 'InfiniteTimeRoot' | 'none'> = [
      'FiniteTimeRoot',
      'InfiniteTimeRoot',
      'InfiniteTimeRoot',
      'none',
    ];

    timeRootKinds.forEach((kind) => {
      const event: CompileFinishedEvent = {
        type: 'CompileFinished',
        compileId: randomUUID(),
        patchId: randomUUID(),
        patchRevision: 1,
        status: 'ok',
        durationMs: 42,
        diagnostics: [],
        programMeta: {
          timeModelKind: 'cyclic',
          timeRootKind: kind,
        },
      };

      expect(event.programMeta?.timeRootKind).toBe(kind);
    });
  });

  it('should support optional busUsageSummary in programMeta', () => {
    const event: CompileFinishedEvent = {
      type: 'CompileFinished',
      compileId: randomUUID(),
      patchId: randomUUID(),
      patchRevision: 1,
      status: 'ok',
      durationMs: 42,
      diagnostics: [],
      programMeta: {
        timeModelKind: 'cyclic',
        timeRootKind: 'InfiniteTimeRoot',
        busUsageSummary: {
          phaseA: { publishers: 1, listeners: 3 },
          energy: { publishers: 2, listeners: 1 },
        },
      },
    };

    expect(event.programMeta?.busUsageSummary).toBeDefined();
    expect(event.programMeta?.busUsageSummary?.phaseA).toEqual({ publishers: 1, listeners: 3 });
  });

  it('should have type field equal to "CompileFinished"', () => {
    const event: CompileFinishedEvent = {
      type: 'CompileFinished',
      compileId: randomUUID(),
      patchId: randomUUID(),
      patchRevision: 1,
      status: 'ok',
      durationMs: 42,
      diagnostics: [],
    };

    expect(event.type).toBe('CompileFinished');
  });
});

describe('CompileStarted and CompileFinished correlation', () => {
  it('should use same compileId for paired events', () => {
    const compileId = randomUUID();
    const patchId = randomUUID();
    const patchRevision = 1;

    const startedEvent: CompileStartedEvent = {
      type: 'CompileStarted',
      compileId,
      patchId,
      patchRevision,
      trigger: 'graphCommitted',
    };

    const finishedEvent: CompileFinishedEvent = {
      type: 'CompileFinished',
      compileId,
      patchId,
      patchRevision,
      status: 'ok',
      durationMs: 42,
      diagnostics: [],
    };

    expect(startedEvent.compileId).toBe(finishedEvent.compileId);
    expect(startedEvent.patchId).toBe(finishedEvent.patchId);
    expect(startedEvent.patchRevision).toBe(finishedEvent.patchRevision);
  });
});
