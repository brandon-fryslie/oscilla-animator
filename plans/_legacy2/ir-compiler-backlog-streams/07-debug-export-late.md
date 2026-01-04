# Workstream 7: Debug + Export (Late)

**Goal:** Add IR-compatible debugging and export pipelines after the core runtime is stable.

## Scope

- DebugDisplay IR lowering (debug probe step, registry, UI).
- Signal history/field visualization in debug UI.
- Export pipeline (image sequence, video, GIF, standalone player).
- Deterministic replay support (seeded randomness + state serialization).

## Dependencies

- Depends on Streams 1–6 for stable runtime and IR semantics.

## Primary References

- `plans/SPEC-11-debug-system.md`
- `plans/SPEC-10-export-pipeline.md`

## Key Files + Line Anchors

- `src/editor/compiler/blocks/debug/DebugDisplay.ts:20-89` (DebugDisplay IR lowering currently throws)
- `src/editor/runtime/canvasRenderer.ts:189-255` (render loop for frame output; needed by export)

## Plan

### 1) DebugDisplay IR lowering

**Goal:** DebugDisplay works in IR without legacy closure fallback.

Steps:

1. Replace `lowerDebugDisplay` error in `src/editor/compiler/blocks/debug/DebugDisplay.ts:20-89` with IR emission:
   - Emit a DebugProbe step in schedule referencing the input slot.
   - Assign labels/format for display.

2. Add a DebugProbe step type in compiler schedule and executor.

3. Add a debug registry in runtime to store latest probe values.

### 2) Debug UI enhancements

**Goal:** Visual inspection for signals and fields in IR mode.

Steps:

1. Add a signal history buffer to sample values over time (ring buffer).
2. Add field visualization (heatmap/histogram/list).
3. Connect debug registry to UI components (avoid performance regressions).

### 3) Export pipeline

**Goal:** Deterministic export of frames to disk or downloadable blobs.

Steps:

1. Add image sequence exporter (PNG/WebP/JPEG) using existing renderer.
2. Add video export (WebCodecs + muxer).
3. Add GIF export (palette + dithering).
4. Add standalone HTML player export with embedded program.

### 4) Deterministic replay

**Goal:** Export and playback are reproducible.

Steps:

1. Seeded PRNG at compile/runtime startup.
2. Serialize state buffer and event history.
3. Provide load/resume for render/export.

## Deliverables

- DebugDisplay works in IR mode with a probe UI.
- Export pipeline for image sequence, video, GIF, standalone player.
- Deterministic replay guarantee for exported frames.

## Validation (No Tests)

- Use Chrome DevTools MCP to:
  - Add DebugDisplay blocks and confirm updates in UI.
  - Trigger export flow and confirm output files match expected frame count.

