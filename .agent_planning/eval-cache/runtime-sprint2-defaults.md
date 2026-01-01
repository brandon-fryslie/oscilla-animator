# Runtime Behavior: Sprint 2 Default Source Materialization

**Cached**: 2026-01-01-012945
**Source**: work-evaluator (sprint2-default-sources final)
**Confidence**: FRESH

## What Was Discovered

### materializeDefaultSources() Behavior (VERIFIED)

**Function**: `src/editor/compiler/passes/pass0-materialize.ts:112-195`

**Runtime behavior:**
1. Scans all block inputs for missing edges (wires OR listeners)
2. Creates hidden provider blocks (`role: 'defaultSourceProvider'`, `hidden: true`)
3. Creates CompilerConnection edges from provider to input
4. Returns NEW patch (immutable transformation)

**Connection Detection** (lines 63-80):
```typescript
function isInputDriven(blockId, slotId, patch) {
  // Check 1: Wire connection exists?
  if (hasWireConnection(...)) return true;
  
  // Check 2: Enabled bus listener exists?
  if (hasEnabledListener(...)) return true;
  
  // Not driven
  return false;
}
```

**Provider Type Selection**:
- Mapping: `${world}:${domain}` → DSConst* block type
- Supports 11 combinations (verified in tests)
- Fallback: DSConstSignalFloat if unknown

**Edge Cases Handled**:
- Empty patch → no providers, no errors
- Unknown block types → skipped gracefully
- Disabled listeners → treated as "not driven", provider created
- Multiple unconnected inputs → multiple providers
- Existing connections → preserved (no duplication)

### Dual System Architecture (IMPORTANT)

**System 1 (Legacy)**: `injectDefaultSourceProviders()`
- Reads `Patch.defaultSources` metadata
- Used by compileBusAware.ts (active compiler)
- NOT removed (backward compatibility)

**System 2 (New)**: `materializeDefaultSources()`
- Reads same metadata, creates hidden blocks
- Runs FIRST (integration.ts:1049)
- Prepares patch for new IR compiler

**Why Both Exist**:
- compileBusAware.ts is ACTIVE compiler (compile.ts:38)
- Removing old metadata would BREAK legacy compiler
- Dual system is migration strategy, not a bug
- Cleanup deferred to Phase 0.5 (per ROADMAP.md)

### Test Coverage (31 tests passing)

**Verified scenarios:**
- Basic: creates providers, preserves existing connections
- Connection detection: wires, listeners (enabled/disabled)
- Multiple inputs: per block, multiple blocks
- Type selection: all 11 DSConst* types
- Parameters: simple values, complex objects
- Edge cases: empty patch, unknown types, deterministic IDs
- Immutability: doesn't mutate input patch

**File**: `src/editor/compiler/passes/__tests__/pass0-materialize.test.ts`

### Special Case Removal (VERIFIED)

**Pass 6** (block-lowering.ts:309-314):
- NOW throws error if unmaterialized input found
- OLD fallback to defaultSource REMOVED (commit 1c92653)

**Pass 8** (link-resolution.ts):
- Doc comments explain Pass 0 handles defaults
- NO fallback logic remains (commit dcf66de)

### Integration Point

**File**: `src/editor/compiler/integration.ts:1049`
```typescript
// System 2 (new) runs FIRST
patch = materializeDefaultSources(patch);

// System 1 (legacy) runs AFTER
patch = injectDefaultSourceProviders(patch);
```

**Sequence matters**: New system prepares patch, legacy system still works.

## Reuse Guidance

**When evaluating default source work:**
- Check if materializeDefaultSources() is being called (should be at integration.ts:1049)
- Verify dual system still works (both old and new paths)
- Don't expect old metadata removed until Phase 0.5
- Legacy compiler (compileBusAware.ts) still needs old metadata

**Known limitations:**
- signal:Point domain falls back to DSConstSignalFloat (not signal:vec2)
- No provider for event world (not yet implemented)
- Config world normalized to scalar (by design)

**Test expectations:**
- 31 tests should pass in pass0-materialize.test.ts
- Overall test suite: ~2798 passing (16 pre-existing failures unrelated to Sprint 2)

## What NOT to Cache (ephemeral)

- Specific test pass/fail counts (re-run to verify)
- Whether Sprint 2 is "complete" (point-in-time decision)
- DoD compliance percentage (changes with requirements)
