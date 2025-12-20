# Compilation

## Compiler Pipeline

```
Patch JSON
    |
    v
Graph Build (blocks, connections, bus bindings)
    |
    v
Validation (types, topology, constraints)
    |
    v
TimeRoot Analysis -> TimeModel
    |
    v
Bus Resolution (publishers, listeners, combine)
    |
    v
SCC Detection (feedback analysis)
    |
    v
Artifact Compilation
    |
    v
CompiledProgram { program, timeModel, uiBindings }
```

## Compiler Output Contract

```typescript
interface CompiledProgram {
  program: Program<RenderTree>
  timeModel: TimeModel
  uiBindings: UiSignalBindings
}
```

## TimeModel Inference

The compiler analyzes the patch graph and infers the time model.

**Rules (deterministic):**
1. If any CycleTimeRoot exists -> cyclic
2. If any feedback loop crosses memory blocks without full cycle closure -> infinite
3. If only FiniteTimeRoot exists -> finite
4. If conflicting models exist -> error (patch invalid)

**There is no fallback.**

## Validation Passes

### 1. Type Checking
- Port type compatibility
- Bus type matching
- Adapter validity
- World/domain agreement

### 2. Topology Validation
- Exactly one TimeRoot
- TimeRoot has no upstream dependencies
- No TimeRoot in composites
- Time-derived blocks connect to TimeRoot

### 3. Bus Validation
- Reserved bus type enforcement
- Required buses present for TimeRoot kind
- Publisher ordering deterministic

### 4. SCC Analysis
- Detect strongly connected components
- Verify memory boundaries on cycles
- Flag illegal feedback loops

## Error System

### Error Structure

```typescript
interface CompileError {
  code: string
  severity: 'error' | 'warning'
  title: string
  message: string
  details?: string[]
  locations?: ErrorLocation[]
  help?: { label: string, action: FixAction }[]
}
```

### Error Locations

```typescript
type ErrorLocation =
  | { kind: 'Block', blockId: string }
  | { kind: 'Port', blockId: string, portId: string }
  | { kind: 'Bus', busId: string }
  | { kind: 'Edge', from: PortRef, to: PortRef }
  | { kind: 'SCC', nodes: GraphNodeId[] }
```

## Error Taxonomy

### TimeRoot Errors (TR-xxx)

| Code | Title | Condition |
|------|-------|-----------|
| TR-001 | No Time Topology | 0 TimeRoot blocks |
| TR-002 | Conflicting Time Topology | >1 TimeRoot blocks |
| TR-003 | TimeRoot cannot be driven | Inputs connected to TimeRoot |
| TR-004 | Invalid Composite Definition | TimeRoot inside composite |

### TimeModel Errors (TM-xxx)

| Code | Title | Condition |
|------|-------|-----------|
| TM-101 | Missing primary phase | CycleTimeRoot no phase output |
| TM-102 | Missing cycle pulse | CycleTimeRoot no wrap output |
| TM-103 | Reserved bus has wrong type | Type mismatch on reserved bus |
| TM-104 | Missing required system bus | Required bus not bound |

### PhaseClock Errors (PC-xxx)

| Code | Title | Condition |
|------|-------|-----------|
| PC-201 | PhaseClock needs time input | Neither tIn nor phaseIn connected |
| PC-202 | Ambiguous PhaseClock input | Both tIn and phaseIn connected |
| PC-203 | Invalid clock period | period <= 0 |

### Feedback Errors (FB-xxx)

| Code | Title | Condition |
|------|-------|-----------|
| FB-301 | Illegal feedback loop | SCC with no memory boundary |
| FB-302 | Feedback loop not fully buffered | Some cycle paths bypass memory |
| FB-303 | Finite topology conflicts with feedback | Unbounded feedback in FiniteRoot |

## Composite Resolution

Composites are resolved (expanded) during compilation:
- Internal nodes get stable IDs from composite instance + internal key
- Bus bindings are preserved through expansion
- State keys are derived from composite context

## Dependency Graph

The compiler builds a unified dependency graph with:
- BlockOut nodes (block outputs)
- BusValue nodes (combined bus values)
- Publisher edges
- Listener edges

Deterministic ordering via sortKey + stable ID.

## Compile-Time Assertions

The compiler enforces at compile time:
- World mismatches (signal vs field)
- Domain mismatches (phase vs number)
- Illegal cycles (feedback without memory)

These become compile errors, not runtime issues.
