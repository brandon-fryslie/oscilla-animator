# Compilation

## Pipeline

```
Patch JSON
    ↓
Graph Build (blocks, connections, bus bindings)
    ↓
Validation (types, topology, constraints)
    ↓
TimeRoot Analysis → TimeModel
    ↓
Bus Resolution (publishers, listeners, combine)
    ↓
SCC Detection (feedback analysis)
    ↓
Artifact Compilation
    ↓
CompiledProgram { program, timeModel }
```

## Output

```typescript
interface CompiledProgram {
  program: Program<RenderTree>
  timeModel: TimeModel
}
```

## TimeModel Inference

| Condition | Result |
|-----------|--------|
| FiniteTimeRoot exists | `{ kind: 'finite', durationMs }` |
| InfiniteTimeRoot exists | `{ kind: 'infinite' }` |
| >1 TimeRoot | Error |
| 0 TimeRoots | Error |

**No fallback. No inference from other blocks.**

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
- Required buses present
- Publisher ordering deterministic

### 4. SCC Analysis
- Detect strongly connected components
- Verify memory boundaries on cycles
- Flag illegal feedback loops

## Error Structure

```typescript
interface CompileError {
  code: string              // e.g., "TR-001"
  severity: 'error' | 'warning'
  title: string
  message: string
  details?: string[]
  locations?: ErrorLocation[]
  help?: { label: string, action: FixAction }[]
}
```

## Error Codes

### TimeRoot Errors (TR-xxx)
| Code | Title | Condition |
|------|-------|-----------|
| TR-001 | No Time Topology | 0 TimeRoot blocks |
| TR-002 | Conflicting Topology | >1 TimeRoot blocks |
| TR-003 | TimeRoot Driven | Inputs connected to TimeRoot |
| TR-004 | TimeRoot in Composite | TimeRoot inside composite |

### Feedback Errors (FB-xxx)
| Code | Title | Condition |
|------|-------|-----------|
| FB-301 | Illegal Feedback | SCC with no memory boundary |
| FB-302 | Partial Buffering | Some paths bypass memory |
| FB-303 | Finite Conflict | Unbounded feedback in finite |

## Compile-Time Assertions

Enforced at compile time (not runtime):
- World mismatches (signal vs field)
- Domain mismatches (phase vs number)
- Illegal cycles (feedback without memory)
