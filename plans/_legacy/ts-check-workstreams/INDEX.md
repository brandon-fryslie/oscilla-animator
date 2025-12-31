# TS Check Errors Workstreams (post lane-removal)

Goal: resolve `just check` TypeScript failures after lane removal + int/float + phase semantics updates. This is a backlog split into parallel workstreams with clear dependencies and file-level context.

## Current error clusters (from `just check`)
- ValueKind gaps: `Signal:int`, `Scalar:int`, `Field:int` missing in compiler ValueKind union (`src/editor/compiler/types.ts`).
- Domain mismatches: `number`/`phase` no longer valid CoreDomain/TypeDomain (`src/editor/adapters/AdapterRegistry.ts`, `src/editor/Bus*`, `src/editor/ir/types/typeConversion.ts`, `src/editor/lenses/lensResolution.ts`).
- IR conversion map bug: duplicate `unit` in `DOMAIN_STRING_MAP`, and `Phase` maps to a non-existent domain (`src/editor/ir/types/typeConversion.ts`).
- Misc TS errors: missing import (`BlockDefinition`), unused params in `ActionExecutor`, stale export of `Lane`.

## Workstreams
1) **WS-1 Core Type System & ValueKind Repair** (blocking)
   - Update compiler ValueKind union to include int variants and align mapping functions.
   - Fix domain string conversion map to avoid invalid domains/duplicates.

2) **WS-2 Phase Semantics + Bus/Adapter UI** (can proceed once WS-1 decisions are set)
   - Replace `number`/`phase` domain checks with `float` + semantics checks.
   - Update adapter registry to use float domains and explicit phase semantics.

3) **WS-3 Misc TS Hygiene** (independent)
   - Fix missing imports, unused parameters, stale exports.

## Dependencies
- WS-1 should land first to define the authoritative domain/valueKind space.
- WS-2 should follow, using the WS-1 decisions (especially how to detect “phase” via semantics).
- WS-3 is independent and can be run in parallel.

## Scriptable candidates
- Safe string swap candidates (after WS-1/WS-2 decisions): replace UI strings “number” → “float” in Bus-related components where purely cosmetic.
- Not safe to bulk-replace `phase` checks without adding semantic guards; those should be manual edits.
