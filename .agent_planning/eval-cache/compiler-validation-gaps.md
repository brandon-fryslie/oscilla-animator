# Compiler Validation Gaps

**Cached**: 2025-12-21 (project-evaluator)
**Confidence**: HIGH (architectural finding, stable)
**Source**: Port identity investigation

---

## Gap 1: Port Validation Missing in compileBusAware.ts

### What compile.ts Has (Wire-Only Compilation)

**Lines 241-259** in `src/editor/compiler/compile.ts`:

```typescript
// Validate outputs and store
for (const outDef of compiler.outputs) {
  const produced = outs[outDef.name];
  if (!produced) {
    errors.push({
      code: 'PortMissing',
      message: `Compiler did not produce required output port ${blockId}.${outDef.name}`,
      where: { blockId, port: outDef.name },
    });
    continue;
  }
  if (produced.kind === 'Error') {
    errors.push({
      code: 'UpstreamError',
      message: produced.message,
      where: produced.where ?? { blockId, port: outDef.name },
    });
    continue;
  }
  // Type checking...
  compiledPortMap.set(keyOf(blockId, outDef.name), produced);
}
```

### What compileBusAware.ts Lacks

**Lines 634-656** in `src/editor/compiler/compileBusAware.ts`:

```typescript
// Validate and store outputs
for (const outDef of compiler.outputs) {
  const produced = outs[outDef.name];
  if (!produced) {
    errors.push({
      code: 'PortMissing',  // ✅ Has this
      message: `Compiler did not produce required output port ${blockId}.${outDef.name}`,
      where: { blockId, port: outDef.name },
    });
    continue;
  }
  if (produced.kind === 'Error') {
    errors.push({
      code: 'UpstreamError',  // ✅ Has this
      message: produced.message,
      where: produced.where ?? { blockId, port: outDef.name },
    });
    continue;
  }
  compiledPortMap.set(keyOf(blockId, outDef.name), produced);
  // ❌ MISSING: Type validation (isKindAssignable check)
}
```

**Missing validation**:
- No type checking (`isKindAssignable`) like compile.ts has
- Stores artifacts without verifying type matches declaration

### Impact

**Cryptic errors instead of clear ones**:
```
UpstreamError: Missing upstream artifact for block-88:phase
```

**Should be**:
```
PortMissing: Block CycleTimeRoot does not have output port 'phase' (available: systemTime, phaseA)
```

---

## Gap 2: SlotId Stability Not Enforced

### Spec Requirement

Per `design-docs/10-Refactor-for-UI-prep/2-PortIdentity.md` section 9:

> **Invariant 1: SlotIds are stable and unique within a block**
>
> No "radius2" by index. No "port0". If a port is removed, migrate.

### Current State

**No enforcement**. Block definitions can:
- Add/remove ports freely
- Rename slotIds without migration
- Use generated names (port0, port1, etc.)

**Example** - Nothing prevents this:
```typescript
// Version 1
outputs: [output('phase', 'Phase', 'Signal<phase>')]

// Version 2 (breaks all existing patches)
outputs: [output('phaseA', 'Phase A', 'Signal<phase>')]
```

### What's Needed

1. **Block definition versioning**:
   ```typescript
   interface BlockDefinition {
     type: string;
     version: number;  // NEW
     migrations?: {     // NEW
       [fromVersion: number]: PortMigration[];
     };
     // ...
   }
   ```

2. **Migration types**:
   ```typescript
   type PortMigration =
     | { type: 'rename'; from: string; to: string }
     | { type: 'remove'; slotId: string; replacement?: string }
     | { type: 'split'; from: string; to: [string, string] };
   ```

3. **Compile-time migration**:
   - Load patch with old block version references
   - Apply migrations to bring patch up to current version
   - Emit warnings for deprecated slotIds

---

## Gap 3: Composite Port Maps Not Enforced

### Spec Requirement

Per `design-docs/10-Refactor-for-UI-prep/2-PortIdentity.md` section 4:

> **CompositeDefinition must contain:**
> - external slots (inputs/outputs) with slotIds
> - internal graph (nodes, edges)
> - **portMap: where each external port goes internally**

### Current State

**No portMap in composite definitions.**

**Current structure** (`src/editor/composites.ts`):
```typescript
interface CompositeGraph {
  nodes: { [ref: string]: CompositeNode };
  edges: { from: string; to: string }[];
  inputMap: { [externalId: string]: string };   // ← Partial mapping
  outputMap: { [externalId: string]: string };  // ← Partial mapping
}
```

**Missing**:
- Explicit `portMap` from external slotId → internal port ref
- Direction information (input vs output)
- Type validation (external port type must match internal target type)

### Impact

**Bus listeners targeting composite ports fail**:
```typescript
// User creates listener:
{ busName: 'phaseA', to: { blockId: 'composite-1', slotId: 'phase', dir: 'input' } }

// After composite expansion:
// - 'composite-1' no longer exists (replaced by internal blocks)
// - Listener reference is now invalid
// - No mapping to internal port that should receive the bus value
```

**What spec requires**:
```typescript
interface CompositeDefinition {
  // ...
  portMap: {
    [externalSlotId: string]: {
      dir: 'input' | 'output';
      internalRef: string;  // e.g., "render.radius"
      type: PortType;       // Validated at compile time
    };
  };
}
```

**Then compiler can**:
- Resolve bus listener through composite boundary
- Map external `composite-1:phase:input` → internal `block-123:phase:input`
- Preserve binding even if composite internals change

---

## Gap 4: No Implicit Phase Binding

### Spec Suggestion

Per `design-docs/10-Refactor-for-UI-prep/3.5-PhaseClock-Fix.md` section 3:

> **Add a compatibility rule: any missing phase input defaults to phaseA**
>
> If a block has an input slot whose TypeDesc is:
> - world=signal, domain=phase (or your equivalent)
>
> and it is unconnected / unbound:
>
> Compiler injects an implicit listener to phaseA for that input.

### Current State

**No implicit bindings.**

**Unconnected phase inputs** → `UpstreamError: Missing required input`

**Users must**:
- Manually wire phase from TimeRoot, OR
- Manually create bus listener to phaseA

### What Spec Recommends

**Compiler rule**:
```typescript
// During input resolution:
if (input is unwired && input.type.domain === 'phase') {
  // Inject implicit listener to phaseA bus
  inputs[inputName] = getBusValue('phaseA', buses, publishers, compiledPortMap);
}
```

**Result**:
- Patches "just work" - phase is available by default
- Users can override by explicit wiring if needed
- Matches musical instrument UX (everything has access to main clock)

### Why Not Implemented?

**Unclear from handoff**. Possible reasons:
1. Wanted explicit wiring for clarity
2. Didn't implement bus auto-publication from TimeRoot yet (prerequisite)
3. Waiting for type-based resolution (Fix 3) before adding implicit bindings

**Recommendation**: Defer until after Fix 2A (TimeRoot outputs `phase`) + auto-publication to `phaseA` bus.

---

## Reuse Guidance

**When evaluating compiler issues:**
1. Check if compileBusAware.ts has same validation as compile.ts (currently: NO for type checking)
2. Check if error messages are specific (PortMissing vs generic UpstreamError)
3. Check if composite boundaries are respected (currently: NO - no portMap)

**When implementing compiler fixes:**
- Add type validation to compileBusAware.ts (same as compile.ts has)
- Consider adding implicit phase binding (optional, but ergonomic)
- Composite portMap is major feature (separate epic)

**Fresh validation needed if:**
- New compiler passes added
- Composite system implemented
- Block versioning/migration system added
