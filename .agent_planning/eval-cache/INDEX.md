# Eval Cache Index

This directory contains reusable evaluation findings that persist across evaluations.

## Purpose

Cache runtime knowledge and patterns discovered during evaluations:
- Runtime behavior per scope
- Break-it test patterns
- Data flow verification results
- Common failure modes

**Do NOT cache**:
- Specific verdicts (COMPLETE/INCOMPLETE) - point-in-time
- Test pass/fail counts - re-run to verify
- Bug details (keep in WORK-EVALUATION files)

## Files

### Runtime Behavior

- **runtime-sprint2-defaults.md** - Default source materialization behavior
  - Confidence: RECENT (2026-01-01)
  - Scope: Sprint 2 default sources
  - Key findings: materializeDefaultSources(), hidden provider blocks

- **runtime-v2-adapter.md** - V2 adapter runtime behavior
  - Confidence: FRESH (2026-01-01)
  - Scope: V2 adapter (SignalExprClosure nodes)
  - Key findings: artifactToSigExprId(), evalSig() closure case

- **runtime-multi-input-blocks.md** - Multi-input blocks runtime behavior
  - Confidence: FRESH (2026-01-01, updated after Pass 7 refactor)
  - Scope: Multi-input blocks implementation
  - Key findings: resolveWriters, combine-utils, Pass 6 integration, Pass 7 refactor

- **multi-input-architecture.md** - Multi-input architecture reference
  - Confidence: HIGH (2026-01-01)
  - Scope: Multi-input blocks architecture
  - Key findings: CombinePolicy types, writer resolution, shared utilities, integration points

### Architecture & Design

- **ir-primitives-status.md** - IR primitive lowering status
  - Confidence: RECENT (2025-12-30)
  - Scope: IR primitives (Phase 3)
  - Key findings: Primitive blocks with IR lowering functions

- **render-pipeline-status.md** - Render pipeline status
  - Confidence: RECENT (2025-12-31)
  - Scope: Render pipeline (RenderInstances3D, etc.)
  - Key findings: Field materialization, render sinks

### Workstream Alignment

- **workstream-alignment.md** - Sprint coordination findings
  - Confidence: RECENT (2025-12-31)
  - Scope: Multi-sprint coordination
  - Key findings: Edge unification + multi-input + V2 adapter alignment

### Phase 0 Cleanup

- **phase0-compat-cleanup.md** - Legacy code inventory after Phase 0
  - Confidence: FRESH (2026-01-01)
  - Scope: Phase 0.5 compatibility cleanup
  - Key findings: 7 categories of legacy code, removal sequence, 3-5 week effort

## Confidence Levels

- **FRESH**: Just evaluated (< 1 day old)
- **RECENT**: Evaluated recently, no known changes (< 3 days old)
- **RISKY**: Related code changed since evaluation (> 3 days old)
- **STALE**: Files in scope changed significantly (re-evaluate)

## Usage

Evaluators should:
1. Check this index before evaluation
2. Read relevant cache files for context
3. Update cache files with new findings
4. Update confidence levels when code changes
