# Replace Block Feature - Cached Knowledge

**Cached:** 2025-12-21 14:35:00
**Source:** project-evaluator STATUS-20251221-133500.md
**Confidence:** HIGH

---

## Feature Architecture

### Core Components

1. **replaceUtils.ts** - Pure compatibility logic
   - `findCompatibleReplacements()` - Filters by lane kind + type compatibility
   - `mapConnections()` - Preserves/drops connections with reasons
   - `copyCompatibleParams()` - Transfers matching parameters
   - O(n*m) complexity where n=blocks, m=connections

2. **PatchStore.replaceBlock()** - State management
   - Creates new block in same lane/position
   - Remaps connections using mapConnections()
   - Preserves bus publishers/listeners with adapter chains
   - Emits BlockReplaced event before removal
   - Atomic operation (all-or-nothing)

3. **BlockContextMenu.tsx** - UI component
   - Right-click on block → opens menu at cursor
   - Shows compatible blocks grouped by subcategory
   - Displays visual feedback (preserved/dropped counts)
   - Auto-dismisses (800ms clean, 2000ms with warnings)

4. **UIStateStore** - Menu state
   - `blockContextMenu: { isOpen, x, y, blockId }`
   - `openBlockContextMenu(x, y, blockId)`
   - `closeBlockContextMenu()`

### Compatibility Rules

A block can replace another if:
1. **Same lane kind** (Phase, Domain, Field, Signal, Program)
2. **Can accept all connected inputs** (type-compatible input slots exist)
3. **Can provide all connected outputs** (type-compatible output slots exist)
4. **Not same block type** (excluded from suggestions)
5. **Not a macro** (macros expand to multiple blocks, can't be single replacement)

### What Gets Preserved

- ✅ Connections (if compatible slots exist)
- ✅ Bus publishers (with adapter chains)
- ✅ Bus listeners (with adapter chains + lenses)
- ✅ Parameters (matching keys only)
- ✅ Lane assignment
- ✅ Lane position (index in lane)
- ❌ Block ID (new ID generated)
- ❌ Custom labels (uses new block's default label)
- ❌ Visual position (if any)

### Event Flow

```
User right-clicks block
  → UIStore.openBlockContextMenu(x, y, blockId)
  → BlockContextMenu renders
  → User selects replacement
  → PatchStore.replaceBlock(oldId, newType)
    → Create new block
    → Map connections
    → Preserve bus routing
    → Emit BlockReplaced event
    → Remove old block
  → UIStore updates selection (via event listener)
  → Visual feedback displays
```

---

## Known Issues

### CRITICAL: UI Integration Bug (AS OF 2025-12-21)

**Problem:** BlockContextMenu not rendered at top level
**Current:** Rendered inside PatchBay component (line 612)
**Required:** Render in Editor.tsx (top-level overlay) OR use React portal

**Fix:**
```typescript
// In Editor.tsx
import { BlockContextMenu } from './BlockContextMenu';

// In render, after <ContextMenu />
<ContextMenu />
<BlockContextMenu />  // ADD THIS
```

**Impact:** Feature is 100% non-functional until fixed

### Test Coverage Gaps

- ❌ No unit tests for replaceUtils.ts functions
- ❌ No component tests for BlockContextMenu
- ✅ Event emission tested in PatchStore.events.test.ts
- ✅ Selection update tested in RootStore.events.test.ts

### CSS Dependency

- BlockContextMenu.tsx uses `.context-menu-overlay` from ContextMenu.css
- No explicit import (relies on ContextMenu.css being imported elsewhere)
- Works but fragile (could break if ContextMenu removed)

---

## Performance Characteristics

**Compatibility Calculation:**
- O(n*m) where n = block definitions, m = connections
- Recalculated on every menu open (no caching)
- Not profiled - unknown threshold for "too slow"

**Potential Optimization:**
- Memoize compatible blocks for each (blockId, connections) pair
- Invalidate cache on block registry or connection changes

---

## Testing Checklist

### Unit Tests Needed
- [ ] findCompatibleReplacements filters by lane kind
- [ ] findCompatibleReplacements requires all inputs satisfiable
- [ ] findCompatibleReplacements requires all outputs satisfiable
- [ ] mapConnections preserves compatible connections
- [ ] mapConnections drops incompatible with reasons
- [ ] copyCompatibleParams copies matching keys

### Manual Tests Needed
- [ ] Menu appears at cursor on right-click
- [ ] Compatible blocks listed correctly
- [ ] Connection wires remap visually
- [ ] Bus routing preserved (check Bus Board)
- [ ] Parameters transferred (check Inspector)
- [ ] Feedback message displays
- [ ] Edge case: no connections
- [ ] Edge case: no compatible blocks
- [ ] Edge case: spam-click replacement

---

## Design Decisions

1. **Why exclude macros?**
   - Macros expand into multiple blocks
   - Cannot be single-block replacements
   - Check: `getBlockForm(def) === 'macro'` (line 81)

2. **Why use type compatibility instead of exact type match?**
   - Allows Signal<number> → Signal<number> replacements
   - Allows Signal<phase> → Signal<phase> replacements
   - Reuses port connection logic (areTypesCompatible)

3. **Why preserve bus adapter chains?**
   - User may have configured lenses/adapters
   - Removing them would break behavior
   - No UI for re-adding them easily

4. **Why emit event before removal?**
   - Listeners can check if removed block was selected
   - Allows for selection update before block disappears
   - Enables future undo support

---

## Future Enhancements (Not Implemented)

- **Undo/Redo** - Replacement is currently permanent
- **Performance** - No memoization or caching
- **Same-type replacement** - Could allow "reset to defaults"
- **Preserve custom labels** - Currently uses new block's default
- **Visual position** - Could preserve x,y coordinates if stored
- **Replace within composites** - Could allow replacing internal blocks

---

## Files to Check When Debugging

| File | Purpose | Key Lines |
|------|---------|-----------|
| replaceUtils.ts | Compatibility logic | 47-101, 135-208 |
| PatchStore.ts | replaceBlock method | 647-784 |
| BlockContextMenu.tsx | UI component | 19-192 |
| UIStateStore.ts | Menu state | 24-29, 242-258 |
| PatchBay.tsx | Right-click handler | 298-302, 316 |
| portUtils.ts | Type compatibility | 168-170 |

---

## Invalidation Triggers

Cache this entry STALE if:
- Block registry system changes (getBlockDefinition API)
- Port type system changes (areTypesCompatible behavior)
- Lane system changes (laneKind values)
- Event system changes (BlockReplaced payload)
- Any file in "Files to Check" section is modified

**Expected lifetime:** 30-90 days (stable feature)
