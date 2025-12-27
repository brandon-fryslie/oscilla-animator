# Op Properties: Idempotency and State Dependencies

This document describes which ops are idempotent vs. state-dependent, and how to use them safely.

## Idempotent Ops

**Idempotent** ops can be applied multiple times with the same result. They are safe to retry.

### Block Ops
- **BlockSetLabel**: Setting the same label twice has no additional effect
- **BlockPatchParams**: Patching the same param values twice has no additional effect

### Wire Ops
- **WireRemove**: Removing an already-removed wire fails (not truly idempotent, but safe)
- **WireRetarget**: Retargeting to the same endpoints twice has no additional effect

### Bus Ops
- **BusUpdate**: Updating a bus with the same values twice has no additional effect

### Binding Ops
- **PublisherUpdate**: Updating with same values has no additional effect
- **ListenerUpdate**: Updating with same values has no additional effect

### Time/Settings Ops
- **TimeRootSet**: Setting the same TimeRoot twice has no additional effect
- **PatchSettingsUpdate**: Updating settings with same values has no additional effect

### Composite Ops
- **CompositeDefUpdate**: Updating with same values has no additional effect
- **CompositeDefReplaceGraph**: Replacing with the same graph has no additional effect

## State-Dependent Ops

**State-dependent** ops depend on current document state and will fail if preconditions aren't met.

### Add Ops (require entity doesn't exist)
- **BlockAdd**: Fails if block ID already exists
- **WireAdd**: Fails if connection ID already exists
- **BusAdd**: Fails if bus ID already exists
- **PublisherAdd**: Fails if publisher ID already exists
- **ListenerAdd**: Fails if listener ID already exists
- **CompositeDefAdd**: Fails if composite ID already exists

### Remove Ops (require entity exists)
- **BlockRemove**: Fails if block doesn't exist
- **WireRemove**: Fails if connection doesn't exist
- **BusRemove**: Fails if bus doesn't exist
- **PublisherRemove**: Fails if publisher doesn't exist
- **ListenerRemove**: Fails if listener doesn't exist
- **CompositeDefRemove**: Fails if composite doesn't exist

### Retype/Retarget Ops (require entity exists, may change semantics)
- **BlockRetype**: Fails if block doesn't exist; changes params based on remap strategy
- **WireRetarget**: Fails if connection doesn't exist

## Inverse Op Properties

All reversible ops generate inverse ops via `invertOp()`. Key properties:

### Perfect Inverses (exact reversal)
- **BlockAdd ↔ BlockRemove**: Perfectly reversible
- **WireAdd ↔ WireRemove**: Perfectly reversible
- **BusAdd ↔ BusRemove**: Perfectly reversible
- **PublisherAdd ↔ PublisherRemove**: Perfectly reversible
- **ListenerAdd ↔ ListenerRemove**: Perfectly reversible
- **CompositeDefAdd ↔ CompositeDefRemove**: Perfectly reversible

### Lossy Inverses (may lose information)
- **BlockRetype**: Inverse restores old type but param remapping may lose data
- **WireRetarget**: Inverse restores old endpoints
- **BlockPatchParams**: Inverse only captures keys that were patched (not full state)
- **BusUpdate**: Inverse only captures keys that were updated
- **PublisherUpdate**: Inverse only captures keys that were updated
- **ListenerUpdate**: Inverse only captures keys that were updated

### Non-Invertible Ops
- **TimeRootSet**: Inverse requires knowing previous TimeRoot (currently limited)
- **Asset Ops**: Not implemented yet

## Safe Usage Patterns

### Retrying Failed Ops

```typescript
// For state-dependent ops, check before retrying
const result = applyOp(doc, { op: 'BlockAdd', block });
if (!result.ok) {
  if (result.error.includes('already exists')) {
    // Block exists - decide if this is acceptable
    console.log('Block already added');
  } else {
    // Other error - may be retryable
    throw new Error(result.error);
  }
}
```

### Building Transactions

```typescript
// Collect ops and their inverses for undo
const ops: Op[] = [];
const inverseOps: Op[] = [];

// Add block
const addOp = { op: 'BlockAdd', block };
inverseOps.push(invertOp(doc, addOp)!); // Capture before applying
const result = applyOp(doc, addOp);
if (result.ok) {
  ops.push(addOp);
} else {
  // Rollback not needed - op didn't mutate
  inverseOps.pop();
  throw new Error(result.error);
}
```

### Handling Partial Failures

```typescript
// If a transaction fails partway, undo what succeeded
const appliedInverses: Op[] = [];

for (const op of transactionOps) {
  const inverse = invertOp(doc, op);
  if (inverse) appliedInverses.push(inverse);

  const result = applyOp(doc, op);
  if (!result.ok) {
    // Rollback
    while (appliedInverses.length > 0) {
      applyOp(doc, appliedInverses.pop()!);
    }
    throw new Error(`Transaction failed: ${result.error}`);
  }
}
```

## Cascade Behavior

Some ops have implicit cascade effects:

### BlockRemove
Currently does NOT cascade. Removing a block leaves dangling references in:
- Connections (from/to the removed block)
- Publishers (from the removed block)
- Listeners (to the removed block)

**Future**: The transaction builder should expand BlockRemove into:
1. WireRemove for all incident connections
2. PublisherRemove for all publishers from this block
3. ListenerRemove for all listeners to this block
4. BlockRemove

This makes the full cascade explicit and invertible.

### BusRemove
Currently does NOT cascade. Removing a bus leaves dangling:
- Publishers (to the removed bus)
- Listeners (from the removed bus)

**Future**: Should expand into explicit Publisher/ListenerRemove ops.

## Future Enhancements

1. **Conflict Detection**: Detect when ops conflict (e.g., two transactions try to add the same block ID)
2. **Merge Ops**: Combine multiple update ops into one (e.g., BlockPatchParams + BlockPatchParams)
3. **Deterministic Ordering**: Define canonical ordering for ops within a transaction
4. **Asset Ops**: Implement when assets are added to Patch type
5. **Schema-Based Remapping**: Implement proper param migration for BlockRetype
