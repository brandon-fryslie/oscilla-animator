# Compilation

## Source: 05-Compilation.md

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
}
```


**UI Integration**: UI reads `CompileResult.compiledPortMap` and `CompileResult.timeModel` for introspection. No separate binding layer needed.
## TimeModel Inference

The compiler analyzes the patch graph and infers the time model.

**Rules (deterministic):**
1. If FiniteTimeRoot exists -> finite
2. If InfiniteTimeRoot exists -> infinite
3. If conflicting models exist -> error (patch invalid)
4. If zero TimeRoots -> error (patch invalid)

**Note:** There is NO `cyclic` TimeModel. Cycles are produced by Time Console Global Rails, not by time topology.

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
| TM-103 | Reserved bus has wrong type | Type mismatch on reserved bus |
| TM-104 | Missing required system bus | Required bus not bound |



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
