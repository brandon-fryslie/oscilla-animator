# BACKLOG: Additional Infrastructure Blocks
**Date**: 2026-01-01
**Context**: "Track B" (Blocks) expansion.

## 1. New Blocks
With the "Graph Surgery" system in place, we can easily add more utility blocks that feel like modifiers.

*   [ ] **DelayBlock**:
    *   Inputs: `in`, `time`, `feedback`, `mix`.
    *   State: Ring Buffer.
*   [ ] **LatchBlock**:
    *   Inputs: `in`, `trigger`, `reset`.
    *   State: `heldValue`.
*   [ ] **IntegrateBlock**:
    *   Inputs: `in`, `reset`.
    *   State: `accumulator`.

## 2. Visual Polish
*   [ ] **"Nano-Block" Styling**:
    *   Create a CSS variant for `infrastructure-blocks` that makes them small and unobtrusive (e.g., just an icon or label on the wire path), distinguishing them from "Main" blocks like Oscillators.

## 3. Advanced Graph Surgery
*   [ ] **Delete Behavior**:
    *   If a user deletes a `SlewBlock`, should it auto-heal the connection (`A -> B`)?
    *   *Implementation*: Detecting if a block is a "passthrough" infrastructure block and reconnecting neighbors on delete.