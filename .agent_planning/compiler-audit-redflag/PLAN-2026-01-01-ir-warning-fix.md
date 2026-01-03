# Sprint Plan: Fix IR Warning / Feature Flag Parsing
Generated: 2026-01-01T05:05:00Z

## Sprint Goal
Enable users to disable IR compilation mode by correctly parsing the `VITE_USE_UNIFIED_COMPILER` environment variable.

## Scope
**In scope (this sprint):**
1. Fix feature flag parsing bug in featureFlags.ts
2. Verify the fix works with manual testing

**Explicitly out of scope (future sprints):**
- Adding unit tests for feature flag parsing (nice-to-have, not blocking)
- Removing the unified compiler toggle entirely
- Fixing lens/adapter support in IR mode

## Work Items

### P0: Fix Feature Flag Parsing Bug

**Description:**
The feature flag parser at `src/editor/compiler/featureFlags.ts:113-115` incorrectly sets `useUnifiedCompiler = true` whenever the environment variable exists, regardless of its value.

**Current (broken):**
```typescript
if (env.VITE_USE_UNIFIED_COMPILER !== undefined) {
  currentFlags.useUnifiedCompiler = true;  // Always true!
}
```

**Fixed:**
```typescript
if (env.VITE_USE_UNIFIED_COMPILER !== undefined) {
  currentFlags.useUnifiedCompiler = env.VITE_USE_UNIFIED_COMPILER === 'true';
}
```

This matches the correct pattern already used for other flags on lines 117 and 120.

**Acceptance Criteria (REQUIRED):**
- [ ] Line 114 changed to: `currentFlags.useUnifiedCompiler = env.VITE_USE_UNIFIED_COMPILER === 'true';`
- [ ] TypeScript compilation passes (`pnpm typecheck`)
- [ ] Setting `VITE_USE_UNIFIED_COMPILER=false` in .env disables IR mode
- [ ] Setting `VITE_USE_UNIFIED_COMPILER=true` in .env enables IR mode
- [ ] Omitting the variable uses default (currently `true` per line 42)

**Technical Notes:**
- Single line change in `src/editor/compiler/featureFlags.ts:114`
- Default remains `useUnifiedCompiler: true` (line 42) when env var is not set
- This fix allows users to work around IR mode limitations (lens/adapter unsupported errors)

### P1: Verification

**Description:**
Manually verify the fix works in the development environment.

**Acceptance Criteria (REQUIRED):**
- [ ] Run `VITE_USE_UNIFIED_COMPILER=false pnpm dev` - app starts with legacy compiler
- [ ] Run `VITE_USE_UNIFIED_COMPILER=true pnpm dev` - app starts with IR compiler
- [ ] Check browser console for "[FeatureFlags] Loaded from environment" log showing correct flag value

## Dependencies
- None - this is a standalone fix

## Risks
- **Low:** The fix is a 1-line change following an existing pattern
- **Mitigation:** Other flags on lines 117, 120 already use this pattern successfully

## Files Changed
1. `src/editor/compiler/featureFlags.ts` - Line 114 only

## Testing
```bash
# After fix, verify:
VITE_USE_UNIFIED_COMPILER=false pnpm dev
# Console should show: [FeatureFlags] Loaded from environment: { useUnifiedCompiler: false, ... }

VITE_USE_UNIFIED_COMPILER=true pnpm dev
# Console should show: [FeatureFlags] Loaded from environment: { useUnifiedCompiler: true, ... }
```
