# Post-Event Retrospective: DefaultSourceValues Lost During Composite Expansion

**Date:** 2026-01-01
**Bug ID:** N/A
**Severity:** High
**Status:** Fixed

## Summary

Block input default values (like Grid Domain spacing) were not being applied during compilation. Users could change slider values in the Inspector, but the animation would not reflect those changes.

## Symptoms

- User changes spacing slider on GridDomain block from default (20) to new value (100)
- DefaultSourceStore correctly updates to hold the new value
- Recompilation is triggered (MobX reaction fires correctly)
- But the compiled animation still uses the old/default value (20)
- Visual output shows circles at 20px spacing instead of 100px

## Root Cause Analysis

### The Data Flow

1. **Inspector** → User changes slider → calls `DefaultSourceStore.setDefaultValueForInput(blockId, slotId, value)`
2. **DefaultSourceStore** → Stores the value correctly (verified: store held spacing=100)
3. **MobX Reaction** → Triggers recompilation via `setupAutoCompile` (verified: tracking includes `defaultSources`)
4. **editorToPatch()** → Builds patch including `defaultSourceValues` map with key `"blockId:slotId"` → value
5. **compile()** → Processes the patch...

### The Bug Location

In `src/editor/compiler/integration.ts`, inside the `compile()` method:

```typescript
// Step 1: Expand composites and build rewrite map
const { expandedPatch, rewriteMap, newPublishers, newListeners } = expandComposites(patch);

// Step 2: Apply rewrite map to bus publishers/listeners and merge new bus bindings
const { patch: rewrittenPatch, errors: rewriteErrors } = rewriteBusBindings(
  {
    ...expandedPatch,   // <-- expandedPatch does NOT contain defaultSourceValues!
    buses: patch.buses,
    publishers: [...patch.publishers, ...newPublishers],
    listeners: [...patch.listeners, ...newListeners],
    // ❌ MISSING: defaultSources and defaultSourceValues from original patch
  },
  rewriteMap
);
```

The `expandComposites()` function returns an `expandedPatch` that only includes:
- `blocks`
- `connections`
- `buses`
- `publishers` (empty array)
- `listeners` (empty array)

It does **NOT** preserve:
- `defaultSources`
- `defaultSourceValues`

When this incomplete patch was passed through `rewriteBusBindings()` and then to `compilePatch()`, the `defaultSourceValues` was `undefined`, causing `resolveDefaultSource()` to fall back to static default values from block definitions.

### Debug Evidence

Console log from `resolveDefaultSource()`:
```json
{
  "blockId": "block-247",
  "lookupKey": "block-247:spacing",
  "runtimeValue": undefined,       // ❌ Should be 100!
  "slotDefaultValue": 20,
  "finalValue": 20,
  "defaultSourceValuesKeys": []    // ❌ Empty! Values were lost
}
```

## The Fix

Add the missing `defaultSources` and `defaultSourceValues` to the object passed to `rewriteBusBindings()`:

```typescript
const { patch: rewrittenPatch, errors: rewriteErrors } = rewriteBusBindings(
  {
    ...expandedPatch,
    buses: patch.buses,
    publishers: [...patch.publishers, ...newPublishers],
    listeners: [...patch.listeners, ...newListeners],
    // ✅ Preserve defaultSources for default value resolution during compilation
    defaultSources: patch.defaultSources,
    defaultSourceValues: patch.defaultSourceValues,
  },
  rewriteMap
);
```

## Files Changed

1. **`src/editor/compiler/integration.ts`** (lines 817-819)
   - Added `defaultSources: patch.defaultSources`
   - Added `defaultSourceValues: patch.defaultSourceValues`

## Testing

### Before Fix
```javascript
// After changing spacing to 100 in Inspector:
{ actualColumnSpacing: 20, expectedSpacing: 100, isCorrect: false }
```

### After Fix
```javascript
// After changing spacing to 50 in Inspector:
{ actualColumnSpacing: 50, expectedSpacing: 50, isCorrect: true }
```

## Prevention

1. **TypeScript Strictness**: The `CompilerPatch` type should require all fields, not make them optional. This would have caught the missing fields at compile time.

2. **Integration Test**: Add a test that verifies changing a default source value via the Inspector results in the compiled output using that value.

3. **Code Review Checklist**: When adding new fields to `CompilerPatch`, verify they are preserved through all transformation steps (composite expansion, bus binding rewrite, etc.)

## Lessons Learned

1. **Data can be lost in transformation chains** - When a value passes through multiple transformation functions, each function must explicitly preserve the data it receives.

2. **Debug by tracing data flow** - Adding a simple console.log at `resolveDefaultSource` immediately revealed that `defaultSourceValuesKeys: []` was the problem.

3. **The bug wasn't in the obvious place** - Initial investigation focused on `DefaultSourceStore`, `editorToPatch`, and `resolveDefaultSource`. The actual bug was in the intermediate transformation step (`expandComposites` → `rewriteBusBindings`).

## Related Issues

This fix was requested by the user who reported: "When I click on the Grid block and change the spacing, it is not reflecting in the animation."

## Regression Risk

Low. The change only adds data preservation - it doesn't change any logic. The fields are read-only during the rewrite process.
