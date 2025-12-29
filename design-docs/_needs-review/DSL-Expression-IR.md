# DSL Expression to IR Specification (Draft)

## Purpose
Provide an artist-friendly expression language that compiles to Oscilla IR without executing arbitrary JavaScript. The DSL must be deterministic, portable (WASM/GPU-compatible), and analyzable at compile time.

## Non-Goals
- Executing arbitrary JavaScript or accessing global state.
- Runtime code generation or dynamic evaluation.
- Side effects (I/O, logging, mutation).

## Scope
- **Primary target:** `FieldFromExpression` and other user-authored expression blocks.
- **Secondary target:** future “custom” generator blocks (e.g., CustomOscillator) that use the same DSL.

## Domain
- **World:** `scalar`
- **Domain:** `expression`

## Core Principles
- **Determinism:** Same inputs and seed must yield the same output.
- **Purity:** Expressions are pure functions of their inputs.
- **Static Lowering:** Expressions compile into IR nodes (no runtime evaluator).
- **Type Safety:** Expressions are type-checked before lowering.

## Expression Model
The DSL defines a pure function with a fixed set of inputs and a single output.

### Function Signatures
- **Field expressions:**
  - `f(i: number, n: number, signal: number, phase?: number, time?: number, seed?: number) -> number`
- **Signal expressions (future):**
  - `g(t: number, seed?: number) -> number`

### Built-In Symbols
- `i` : element index (0..n-1)
- `n` : element count
- `signal` : upstream signal value (per frame)
- `phase` : optional phase signal (0..1)
- `time` : optional time in seconds or milliseconds (define explicitly per block)
- `seed` : optional compile-time seed (integer)

Block definitions must specify which symbols are available; missing symbols are compile-time errors.

## Allowed Operations
### Arithmetic
- `+ - * / %`
- Unary `+ -`

### Comparisons
- `< <= > >= == !=`

### Boolean
- `&& || !`

### Ternary
- `cond ? a : b`

### Math Functions
- `abs`, `min`, `max`, `clamp`
- `floor`, `ceil`, `round`, `fract`
- `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`
- `sqrt`, `pow`, `exp`, `log`

Each function must map to an IR opcode or a small IR subgraph.

## Type System
- **Base types:** `number`, `bool`
- **No strings in IR expressions.**
- **No vector types in v1.** (Optional v2: `vec2`, `vec3`)

Type errors are compile errors; no implicit string/boolean coercion.

## Lowering Rules
1. Parse expression into AST.
2. Type-check AST with known symbol types.
3. Lower AST to IR nodes (signal/field ops).
4. Emit deterministic constants into the IR constant pool.

## Determinism and Randomness
- No access to `Math.random()`.
- Deterministic randomness can be exposed via `hash(i, seed)` or `rand(i, seed)` that lowers to `FieldHash01ById`-style ops.

## Error Handling
- Parse errors and type errors must be returned as compile errors.
- Unsupported functions/operators must fail compilation with a clear message.

## Example (Field Expression)
Expression:
```
sin(i / n * 6.28318 + signal * 6.28318) * 0.5 + 0.5
```
Lowering:
- `i`, `n`, `signal` are symbols
- Expand to arithmetic and `sin` opcode nodes
- Emits a `Field<number>` IR expression

## Compatibility with Existing Blocks
- `FieldFromExpression` becomes a thin adapter that parses and lowers the DSL.
- Existing block graphs remain unchanged.

## Future Extensions
- Vector math (`vec2`, `vec3`)
- Color expressions (compiled to `Field<color>` via color ops)
- User-defined functions (macros) compiled to IR subgraphs
- Symbol packs for domain-specific blocks (e.g., `u`, `v`, `r`, `theta`)

## Open Questions
- Exact unit for `time` symbol (ms vs seconds).
- Numeric precision guarantees (float32 vs float64).
- Whether to allow `if` statements vs ternary only.
- How to expose bus values in expressions (if at all).
