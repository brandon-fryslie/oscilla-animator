# FieldExpr Systems - Stable Knowledge

**Cached**: 2025-12-25 22:55
**Source**: project-evaluator (fieldexpr-integration)
**Confidence**: HIGH

---

## Three FieldExpr Systems (Parallel Implementations)

### 1. Runtime Field System (src/editor/runtime/field/)

**Purpose**: Runtime evaluation and materialization of field expressions.

**Key Files**:
| File | Purpose |
|------|---------|
| `types.ts` | FieldHandle, FieldExprIR, TypeDesc (runtime variant) |
| `FieldHandle.ts` | evalFieldHandle(), per-frame caching |
| `Materializer.ts` | materialize() central function, fill algorithms |
| `BufferPool.ts` | Typed array allocation and reuse |
| `BroadcastReduce.ts` | Field -> Signal reduce operations |
| `RenderSinkMaterializer.ts` | Render sink execution |

**TypeDesc Definition**:
```typescript
type TypeDesc =
  | { kind: 'number' }
  | { kind: 'vec2' }
  | { kind: 'vec3' }
  | { kind: 'vec4' }
  | { kind: 'color' }
  | { kind: 'boolean' }
  | { kind: 'string' };
```

**FieldHandle Kinds**: Const, Op, Zip, Broadcast, Combine, Source

### 2. Compiler IR FieldExpr (src/editor/compiler/ir/fieldExpr.ts)

**Purpose**: IR representation for the 8-pass compiler.

**Key Types**:
- `FieldExprIR` - Discriminated union of node kinds
- `FieldExprTable` - Dense array of nodes
- `FieldExprId` - Numeric index (branded type)

**TypeDesc Definition** (from types.ts):
```typescript
interface TypeDesc {
  world: 'signal' | 'field' | 'scalar' | 'event' | 'special';
  domain: 'number' | 'vec2' | 'color' | ... ;
  semantics?: string;
  unit?: string;
}
```

**FieldExprIR Kinds**: const, broadcastSig, map, zip, select, transform, busCombine

### 3. UnifiedCompiler FieldExpr (src/editor/compiler/unified/FieldExpr.ts)

**Purpose**: Lazy expression trees for domain blocks (FlowFieldOrigin, RadialOrigin).

**Pattern**: AST-based with FunctionRegistry

**FieldExpr Kinds**: const, domain, source, map, zip, bus, adapter

---

## Type Mapping (NOT YET IMPLEMENTED)

| Runtime | Compiler IR | Unified |
|---------|-------------|---------|
| `{ kind: 'number' }` | `{ world: 'field', domain: 'number' }` | N/A |
| `{ kind: 'vec2' }` | `{ world: 'field', domain: 'vec2' }` | Domain.elements |
| FieldHandle | FieldExprIR | FieldExpr<T> |
| FieldExprId (number) | FieldExprId (number, branded) | nodeId (string) |

---

## Integration Status

| Connection | Status | Notes |
|------------|--------|-------|
| Compiler IR -> Runtime | NOT CONNECTED | No imports, no adapter |
| UnifiedCompiler -> Runtime | NOT CONNECTED | Separate evaluation |
| UnifiedCompiler -> Compiler IR | NOT CONNECTED | Different representations |

---

## Test Locations

- Runtime: `src/editor/runtime/field/__tests__/` (63 tests)
- Passes: `src/editor/compiler/passes/__tests__/` (144 tests)
- Unified: `src/editor/compiler/unified/__tests__/FieldExpr.test.ts`

---

## Known Issues

1. **evalSig stub** in Materializer.ts returns 0 (blocks broadcast)
2. **Type mismatch** - runtime TypeDesc != compiler TypeDesc
3. **No select/transform** in runtime FieldHandle kinds
4. **Three separate evaluation paths** for same concept

---

**Used by**: fieldexpr-integration evaluation, Phase 5 planning
