# Bus Cleanup Deletion Tracking

## Status: TypeScript compiles with 0 errors (RootStore + PatchStore cleaned)

## Remaining Files with busStore refs (38 files):

### Production Code (priority):
- compiler/integration.ts
- modulation-table/ModulationTableStore.ts
- transactions/applyOps.ts
- transactions/TxBuilder.ts
- defaultSources/validate.ts
- bindings/write.ts, read.ts
- stores/DebugStore.ts, TutorialStore.ts, EmphasisStore.ts
- semantic/patchAdapter.ts

### UI Components:
- BusInspector.tsx, BusChannel.tsx, BusPicker.tsx, BusBoard.tsx
- BusCreationDialog.tsx, PublishMenu.tsx, PatchBay.tsx
- ConnectionInspector.tsx, Inspector.tsx
- board/GraphWorkspace.tsx
- debug-ui/ProbeCard.tsx, BusesTab.tsx, OverviewTab.tsx, IRTab.tsx

### Test Files:
- Various .test.ts files

## Deleted Files
- `src/editor/stores/BusStore.ts` - DELETED entirely

## Key Functionality Removed

### BusStore Properties (were in BusStore.ts)
- `buses: Bus[]` - NOW: computed from `patchStore.busBlocks`

### BusStore Methods (were in BusStore.ts)
- `createDefaultBuses()` - Created "Breath" and "Pulse" default buses
- `addBus(name, options)` - Created new bus
- `removeBus(id)` - Deleted bus

### Routing Architecture (DELETED)
The old system had:
```
```

The new system uses:
```
SignalBlock.output → Connection → BusBlock.input → BusBlock.output → Connection → SignalBlock.input
```

BusBlocks are pass-through blocks with one input and one output of the same type.

## Files That Need Fixing

### RootStore.ts
- Remove all commented busStore code

### types.ts
- `Endpoint.kind: 'bus'` - DELETE (simplify to just PortRef)

### UI Components
- `BusBoard.tsx` - May need rework to show BusBlocks instead
- `BusPicker.tsx` - May need rework
- `PublishMenu.tsx` - May need removal or rework
- `BusInspector.tsx` - May need rework

### Compiler
- `pass7-bus-lowering.ts` - Handles BusBlock compilation
- `compileBusAware.ts` - Already skips BusBlocks

## Serialization Impact
Old saved patches may have:
```json
{
  "buses": [...],
}
```

These should be:
1. `buses` - Migrated to BusBlocks on load
