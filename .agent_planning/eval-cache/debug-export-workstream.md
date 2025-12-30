# Debug + Export Workstream - Cached Findings

**Cached**: 2025-12-30 03:06
**Source**: project-evaluator (workstream 7 evaluation)
**Confidence**: FRESH

---

## Debug Infrastructure (Stable Knowledge)

### StepDebugProbe Type
**Location**: `src/editor/compiler/ir/schedule.ts:682-710`

Type definition:
```typescript
interface StepDebugProbe extends StepBase {
  kind: "debugProbe";
  probe: DebugProbeIR;
}

interface DebugProbeIR {
  id: string;
  slots: ValueSlot[];
  mode: "value" | "trace" | "breakpoint";
}
```

### executeDebugProbe Implementation
**Location**: `src/editor/runtime/executor/steps/executeDebugProbe.ts`

**Features**:
- Zero overhead when TraceController.mode === 'off'
- Type conversion (TypeDesc → artifact kind)
- Value encoding (ValueRecord32 format)
- Ring buffer writes

**Integration**: ScheduleExecutor.ts imports and dispatches (line 31, 224-225)

### TraceController Infrastructure
**Files**:
- `TraceController.ts` - Mode switching (off/timing/full)
- `ValueRing.ts` - Value record storage
- `SpanRing.ts` - Span record storage
- `ValueRecord.ts` - Binary encoding (scalar, vec2, color, FieldStats)
- `DebugIndex.ts` - String interning

**Test Coverage**: 121 tests across 8 files, all passing

### Debug UI Components
**Location**: `src/editor/debug-ui/`

**Components**:
- DebugDrawer.tsx - Main drawer
- IRTab.tsx - IR visualization (19870 bytes)
- ScheduleTab.tsx - Schedule visualization
- ProbeCard.tsx - Probe display
- BusValueMeter.tsx - Bus meters

### DebugStore
**Location**: `src/editor/stores/DebugStore.ts`

**Purpose**: MobX store for probe management, REPL, command execution

**Status**: Complete, used by legacy closure compiler

---

## Canvas Renderer (Stable)

### Canvas2DRenderer
**Location**: `src/editor/runtime/canvasRenderer.ts:189-234`

**Method**: `renderFrame(frame: RenderFrameIR, valueStore: ValueStore): RenderStats`

**Process**:
1. Clear canvas based on clear spec
2. Sort passes by z-order (header.z)
3. Execute render passes (instances2d, paths2d)
4. Return stats (draw calls, state changes, timing)

**Status**: Complete, ready for export pipeline

---

## Deterministic Replay (Partial)

### Seeded PRNG
**Location**: `src/core/rand.ts:26-75`

**Algorithm**: Mulberry32 (fast, statistically sound)

**Features**:
- createPRNG(seed: Seed): PRNG
- Same seed → same sequence
- fork() for derived PRNGs
- range(), int(), pick(), vary() helpers

**Status**: Complete, ready to use

### Math.random() Audit Results
**Findings**: 3 uses found (2025-12-30)

1. `src/editor/pathLibrary/index.ts` - User path ID generation (compile-time, safe)
2. `src/editor/stores/DefaultSourceStore.ts` - Default source ID generation (compile-time, safe)
3. `src/editor/controlSurface/store.ts` - Random seed generation (NEEDS FIX for export)

**Risk**: LOW - Only controlSurface needs fixing for export determinism

---

## DebugDisplay IR Status (Known Issue)

### Current State
**File**: `src/editor/compiler/blocks/debug/DebugDisplay.ts:33-39`

**Status**: **BLOCKED** - Explicitly throws error

**Error Message**:
```
DebugDisplay block cannot be lowered to IR yet.
Reason: DebugDisplay has side-effects (updates DebugStore) that don't fit the pure IR model.
Workaround: DebugDisplay continues to use the legacy closure compiler.
```

**Why This Matters**: Users cannot debug IR-compiled patches

### Solution Path (Clear)
1. Replace throw with StepDebugProbe emission
2. Map inputs (signal/phase/domain/field) → slots
3. Assign probe IDs: `${instanceId}:${portId}`
4. Set probe mode to "value"

**Complexity**: LOW (2-4 hours)

**Dependencies**: All infrastructure exists (StepDebugProbe type, executeDebugProbe, TraceController)

---

## Export Pipeline Status (Not Started)

### What Exists
- ✅ Canvas2DRenderer.renderFrame() - Ready for frame capture
- ✅ OffscreenCanvas API - Browser support available
- ✅ Seeded PRNG - Determinism foundation

### What's Missing
- ❌ ImageSequenceExporter class
- ❌ VideoExporter class (WebCodecs + muxer)
- ❌ GifExporter class
- ❌ StandaloneExporter class
- ❌ Export UI/controls
- ❌ State serialization for pause/resume

### Recommended Order (from SPEC-10)
1. Deterministic replay verification
2. Image sequence export (simplest, validates infrastructure)
3. Video export (most requested)
4. GIF export (social sharing)
5. Standalone player (self-contained sharing)

---

## Test Infrastructure

### Test Quality
**Score**: 4/5

**Strengths**:
- Debug infrastructure: 121 tests, comprehensive coverage
- Runtime executor: Tests for executeDebugProbe
- Real logic testing (not stubs)
- Error condition coverage

**Weaknesses**:
- No end-to-end tests (mocked RuntimeCtx)
- No export tests (not implemented)
- No DebugDisplay IR integration tests (blocked)

### Missing Tests
1. DebugDisplay IR lowering test
2. End-to-end debug flow (patch → TraceController → UI)
3. Image export determinism test
4. Frame sequence correctness test

---

## Spec Gap Analysis

### SPEC-11 (Debug System) Gaps
1. ✅ **DebugDisplay IR** - Infrastructure exists, lowering blocked
2. ❌ **Signal visualization** - No waveform rendering
3. ❌ **Field visualization** - Only text display (first 5 values)
4. ❌ **Runtime inspector** - No slot/state viewer
5. ❌ **Compile diagnostics** - Limited IR visualization

### SPEC-10 (Export Pipeline) Gaps
1. ❌ **Image sequence** - Not implemented
2. ❌ **Video export** - Not implemented
3. ❌ **GIF export** - Not implemented
4. ❌ **Standalone player** - Not implemented
5. ⚠️ **Deterministic replay** - PRNG exists, needs verification

---

## Critical Dependencies

1. **DebugDisplay IR → TraceController**
   - StepDebugProbe type ✅
   - executeDebugProbe ✅
   - lowerDebugDisplay ❌ (BLOCKED)

2. **Export → Deterministic Replay**
   - Seeded PRNG ✅
   - Math.random() audit ⚠️ (3 uses, 1 needs fix)
   - State serialization ❌

3. **Export → Canvas Renderer**
   - renderFrame() ✅
   - OffscreenCanvas ✅

---

## Key File Locations

### Debug Infrastructure
- `src/editor/compiler/ir/schedule.ts` - StepDebugProbe type
- `src/editor/runtime/executor/steps/executeDebugProbe.ts` - Executor
- `src/editor/debug/TraceController.ts` - Controller
- `src/editor/debug-ui/` - UI components
- `src/editor/stores/DebugStore.ts` - Legacy store

### Rendering
- `src/editor/runtime/canvasRenderer.ts` - Canvas2DRenderer

### Randomness
- `src/core/rand.ts` - Seeded PRNG

### Blocked Files
- `src/editor/compiler/blocks/debug/DebugDisplay.ts` - Throws error at line 34

### Missing Files (Export)
- `src/editor/export/` - Directory doesn't exist
- `src/editor/export/ImageSequenceExporter.ts` - Needs creation
- `src/editor/export/VideoExporter.ts` - Needs creation
- `src/editor/export/GifExporter.ts` - Needs creation
- `src/editor/export/StandaloneExporter.ts` - Needs creation
