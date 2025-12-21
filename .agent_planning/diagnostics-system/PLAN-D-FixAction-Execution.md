# Plan: Part D - FixAction Execution System

**Date:** 2025-12-20
**Topic:** Diagnostics System Phase 2 - Part D
**Dependencies:** Parts A-C (completed)

---

## Overview

The FixAction execution system enables diagnostics to provide actionable remediation. When a user clicks on a diagnostic action, the system executes the appropriate store operations to fix the issue.

## Current State

Actions are already defined in the diagnostic types (`src/editor/diagnostics/types.ts`):

```typescript
type DiagnosticAction =
  | { kind: 'goToTarget'; target: TargetRef }
  | { kind: 'insertBlock'; blockType: string; position?: 'before' | 'after'; nearBlockId?: string }
  | { kind: 'removeBlock'; blockId: string }
  | { kind: 'addAdapter'; fromPort: PortTargetRef; adapterType: string }
  | { kind: 'createTimeRoot'; timeRootKind: 'Finite' | 'Cycle' | 'Infinite' }
  | { kind: 'muteDiagnostic'; diagnosticId: string }
  | { kind: 'openDocs'; docUrl: string };
```

The `DiagnosticsConsole` component already has a `handleGoToTarget` callback that logs to console, but no execution logic.

---

## Architecture

### ActionExecutor Service

Create a new service that:
1. Receives action requests from UI
2. Validates the action is safe to execute
3. Executes the action against appropriate stores
4. Emits events for undo/redo integration

```
DiagnosticsConsole
        │
        ▼
  ActionExecutor ─────► PatchStore
        │               BusStore
        │               UIStateStore
        │               DiagnosticHub
        ▼
    EventDispatcher (for undo/redo)
```

### Location

`src/editor/diagnostics/ActionExecutor.ts`

---

## Action Implementations

### 1. goToTarget

Navigate to and select the target entity.

| Target Kind | Action |
|-------------|--------|
| block | Select block, scroll into view, flash highlight |
| port | Select block, expand port panel, highlight port |
| bus | Select bus, switch to bus board tab |
| binding | Select bus, highlight binding row |
| timeRoot | Select block, scroll to time lane |
| graphSpan | Multi-select blocks, zoom to fit |
| composite | Open composite editor (if exists) |

**Implementation:**
- Use `UIStateStore.selectBlock()`, `UIStateStore.selectBus()`
- Fire custom events for scroll/highlight effects
- No undo needed (navigation only)

### 2. insertBlock

Insert a new block near an existing one.

**Implementation:**
- Use `PatchStore.addBlock()` with computed position
- Position: find lane/slot based on nearBlockId
- Auto-wire if position is 'before' input or 'after' output
- Undo: Remove the block

### 3. removeBlock

Remove a problematic block.

**Implementation:**
- Use `PatchStore.removeBlock()`
- Cascade: Remove connected wires
- Undo: Restore block and connections

### 4. addAdapter (addLens)

Insert an adapter/lens between two ports.

**Implementation:**
- Create lens binding through BusStore
- Or insert adapter block between connection
- Complex: may need to break and rewire connections

### 5. createTimeRoot

Add a missing TimeRoot block.

**Implementation:**
- Clear existing TimeRoots (if any)
- Add new TimeRoot to Time lane
- Auto-publish to phaseA/pulse buses
- Undo: Remove TimeRoot

### 6. muteDiagnostic

Silence a diagnostic (already implemented in DiagnosticHub).

**Implementation:**
- Call `DiagnosticHub.muteDiagnostic(id)`
- Already implemented, just wire up UI

### 7. openDocs

Open external documentation.

**Implementation:**
- Open URL in new tab: `window.open(docUrl, '_blank')`
- No undo needed

---

## Execution Flow

```typescript
class ActionExecutor {
  constructor(
    private patchStore: PatchStore,
    private busStore: BusStore,
    private uiStore: UIStateStore,
    private diagnosticHub: DiagnosticHub,
    private events: EventDispatcher
  ) {}

  /**
   * Execute a diagnostic action.
   * Returns true if action was executed successfully.
   */
  execute(action: DiagnosticAction): boolean {
    switch (action.kind) {
      case 'goToTarget':
        return this.goToTarget(action.target);
      case 'insertBlock':
        return this.insertBlock(action);
      case 'removeBlock':
        return this.removeBlock(action.blockId);
      case 'addAdapter':
        return this.addAdapter(action);
      case 'createTimeRoot':
        return this.createTimeRoot(action.timeRootKind);
      case 'muteDiagnostic':
        this.diagnosticHub.muteDiagnostic(action.diagnosticId);
        return true;
      case 'openDocs':
        window.open(action.docUrl, '_blank');
        return true;
      default:
        console.warn('Unknown action kind:', (action as any).kind);
        return false;
    }
  }
}
```

---

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/editor/diagnostics/ActionExecutor.ts` | New: Action execution service |
| `src/editor/diagnostics/index.ts` | Export ActionExecutor |
| `src/editor/stores/RootStore.ts` | Create and expose ActionExecutor instance |
| `src/editor/components/DiagnosticsConsole.tsx` | Wire up action buttons to ActionExecutor |
| `src/editor/diagnostics/__tests__/ActionExecutor.test.ts` | New: Unit tests |

---

## Acceptance Criteria

### Core Execution
- [ ] ActionExecutor class created with execute() method
- [ ] goToTarget action selects appropriate entity
- [ ] insertBlock action adds block with correct positioning
- [ ] removeBlock action removes block and cleans up connections
- [ ] createTimeRoot action adds TimeRoot and auto-publishes
- [ ] muteDiagnostic action mutes the diagnostic
- [ ] openDocs action opens URL in new tab

### UI Integration
- [ ] DiagnosticsConsole shows action buttons for diagnostics with actions
- [ ] Clicking action button calls ActionExecutor.execute()
- [ ] Success/failure feedback shown to user

### Testing
- [ ] Unit tests for each action type
- [ ] Integration test: E_TIME_ROOT_MISSING action creates TimeRoot
- [ ] Integration test: goToTarget selects correct entity

### Polish
- [ ] Actions are logged for debugging
- [ ] Invalid actions fail gracefully with console warning
- [ ] ActionExecuted event emitted for undo integration (future)

---

## Implementation Order

1. **Basic scaffold**: ActionExecutor class with execute() stub
2. **Simple actions first**: muteDiagnostic, openDocs, goToTarget
3. **Store mutations**: insertBlock, removeBlock, createTimeRoot
4. **Complex actions**: addAdapter (may defer to Phase 3)
5. **UI integration**: Wire up DiagnosticsConsole
6. **Tests**: Unit tests for all action types

---

## Complexity Estimate

| Component | Complexity |
|-----------|------------|
| ActionExecutor scaffold | Low |
| goToTarget | Medium (multi-target routing) |
| muteDiagnostic, openDocs | Low |
| insertBlock | Medium (positioning logic) |
| removeBlock | Low |
| createTimeRoot | Medium (auto-publishing) |
| addAdapter | High (connection rewiring) |
| UI integration | Low |
| Tests | Medium |

**Total:** Medium complexity, recommend 1 sprint

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Complex undo/redo integration | Defer to Phase 3, use events for future hook |
| addAdapter action is complex | Start with simpler actions, defer addAdapter |
| Store mutations may have side effects | Use existing store methods, add integration tests |

---

## Dependencies

- Parts A-C completed (runtime diagnostics, mute/unmute, UI console)
- Existing store methods (addBlock, removeBlock, etc.)
- Existing UI selection system

---

## Future Enhancements (Phase 3+)

- Undo/redo for action execution
- Batch actions (fix all of type X)
- Custom action plugins
- AI-suggested fixes
