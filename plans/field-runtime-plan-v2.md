# Revised Sprint Plan (v2): Field Runtime Red Flags

Sprint Goal: Remove legacy params, make failures explicit, and ensure the compiler wires default sources into field IR.

## Priorities (Reordered to avoid churn)

| Priority | Item                             | Description                                                      |
|----------|----------------------------------|------------------------------------------------------------------|
| P0       | Hard error on signal fallback    | Throw Error with actionable message (no silent 0s)               |
| P0.5     | No silent default source fallback| Missing defaults are compile errors, not runtime defaults        |
| P1       | Compiler default source handling | Wire block inputs → field IR (JitterVec2, Vec2Rotate, etc.)      |
| P2       | Remove legacy params code        | Delete readParamNumber + params from field IR/runtime            |
| P3       | Update audit document            | Mark resolved items, document architecture                       |

## Key Changes from Previous Plan
- Error, not warning, on signal fallback
- Default sources are wired by compiler (no runtime fallback)
- Remove params *after* default sources are wired

## Acceptance Criteria (DevTools validation)
- Signal evaluation failure throws Error with fix instructions
- Missing default sources produce compile errors
- JitterVec2, Vec2Rotate, Vec2Scale work with default sources only
- No `params` property in field IR/runtime types
- No `readParamNumber()` function exists
- Audit document is accurate

## IR Modeling Decisions (Field Ops)
- Field op inputs must be explicit **FieldExprId** references.
- Inputs like `angle`, `centerX`, `centerY` become:
  - `FieldExprConst` (constant default), or
  - `FieldExprBroadcastSig` (signal default).
- No op‑params bag for field ops once P2 is complete.

## Investigation Notes (for P1)
- Current `FieldExprIR` supports `map`, `zip`, `transform`, `busCombine`.
- Runtime field ops already support n‑ary args in `src/editor/runtime/field/types.ts`.
- Compiler should emit explicit field inputs instead of params:
  - Example: Vec2Rotate(posField, angleField, centerXField, centerYField)

