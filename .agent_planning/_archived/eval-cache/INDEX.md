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

### Architecture & Design

- **multi-input-architecture.md** - Multi-input architecture reference
  - Confidence: HIGH (2026-01-01)
  - Scope: Multi-input blocks architecture
  - Key findings: CombinePolicy types, writer resolution, shared utilities, integration points

- **render-pipeline-status.md** - Render pipeline status
  - Confidence: RECENT (2025-12-31)
  - Scope: Render pipeline (RenderInstances3D, etc.)
  - Key findings: Field materialization, render sinks

### Workstream Alignment

- **workstream-alignment.md** - Sprint coordination findings
  - Confidence: RECENT (2025-12-31)
  - Scope: Multi-sprint coordination
  - Key findings: Edge unification + multi-input + V2 adapter alignment

## Invalidated (2026-01-02)

Removed due to IR architecture changes:
- **ir-primitives-status.md** - IR types changed (CombineSpec, TimeSignals, patches)
- **runtime-v2-adapter.md** - Runtime executor changed (bus steps removed)
- **runtime-multi-input-blocks.md** - Runtime executor changed (bus steps removed)

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
