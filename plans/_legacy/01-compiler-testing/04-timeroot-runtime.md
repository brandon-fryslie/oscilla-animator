## Stream 04 — TimeRoot Runtime Contexts (Detailed)

This stream fixes the failing tests around `RuntimeCtx` by ensuring every signal runner receives the full context (`CompileCtx + viewport + defaultSources`). This is critical for deterministic timekeeping and for the player’s invariants (see `design-docs/3-Synthesized/02-Time-Architecture.md`).

### Evidence
- `src/editor/compiler/blocks/domain/__tests__/TimeRoot.test.ts:60-250` invokes the compiled signals with `ctx: CompileCtx` only, lacking `viewport`. The `RuntimeCtx` type at `src/editor/compiler/types.ts:38-70` requires `{ viewport, eror? }`.
- Compiler tests in `bus-compilation`, `field-bus-compilation`, and diagnostics may also instantiate runtime signals for validation but do not yet pass `viewport`.

### Step-by-step plan
1. **Create a shared runtime context helper**
   - Replace `createTestContext()` in `TimeRoot.test.ts` with `createRuntimeCtx()` that builds:
     ```ts
     function createRuntimeCtx(): RuntimeCtx {
       const base: CompileCtx = { env: {}, geom: { get: () => ({}) as any, invalidate: () => {} } };
       return {
         ...base,
         viewport: { w: 800, h: 600, dpr: 1 },
         defaultSources: {},
       };
     }
     ```
   - Export this helper so other tests (`field-bus-compilation.test.ts`, `diagnostic-emission.test.ts`, `bus-compilation.test.ts`) can reuse it. If necessary, move it into `src/editor/compiler/__tests__/helpers.ts`.
2. **Use the helper across TimeRoot tests**
   - Replace each `signal(1000, ctx)` call with `const runtimeCtx = createRuntimeCtx(); signal(1000, runtimeCtx);`.
   - When testing events (wrap/end), pass `runtimeCtx` to the event function and to `applyAdapterChain`/... to keep the runtime input consistent.
3. **Update dependent suites**
   - Ensure tests that evaluate signals outside of TimeRoot (e.g., `field-bus-compilation.test.ts` around lines 90-120, `bus-compilation.test.ts` `const ctx: CompileCtx = {...}`) call `createRuntimeCtx()` before dispatching.
   - If other modules (e.g., `domain` block tests or `ModulationTableStore` runtime helpers) need runtime contexts, import the helper rather than redefining `viewport`.
4. **Document the need**
   - Add a comment referencing `design-docs/3-Synthesized/02-Time-Architecture.md` near the helper explaining that `viewport` must exist so `phase` signals can compute scaled values deterministically.
5. **Validation**
   - Re-run `just test` to confirm the `RuntimeCtx` mismatch errors disappear. This stream should unblock `Stream 1` and `Stream 3` by eliminating runtime context ownership issues.

By building one reusable helper and sharing it across all tests, we avoid repeated `CompileCtx` mistakes and keep the runtime invariant that `viewport` is always defined.
