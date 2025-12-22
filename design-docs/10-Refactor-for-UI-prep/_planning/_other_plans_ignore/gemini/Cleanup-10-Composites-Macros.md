# Cleanup Plan: Composites & Macros

**Goal:** Standardize the expansion and compilation of compound blocks, removing duplicated logic and legacy bridges.

## 1. Unify Expansion Logic
- [ ] Review `PatchStore.expandMacro` vs `integration.ts/expandComposites`.
- [ ] Ensure both use the same ID generation and port mapping logic.
- [ ] Macros should just be "Composites that expand at edit time," using the same underlying graph definition structure.

## 2. Clean Up Composite Bridge
- [ ] Review `composite-bridge.ts`. Remove if it's just a legacy adapter.
- [ ] Ensure `domain-composites.ts` and `signal-composites.ts` follow the standard `BlockDefinition` schema.

## 3. Enforce Port Identity in Composites
- [ ] Ensure composite definitions use `slotId` keys in their `inputMap` / `outputMap`.
- [ ] Validate that composite internal graphs don't violate the "Port Identity" cleanup rules.

## 4. Remove Legacy "Block Behavior"
- [ ] If `BlockBehavior` interface in `types.ts` is unused/legacy, remove it. Use `BlockDefinition` and `BlockCompiler` interfaces strictly.

## 5. Verification
- [ ] Verify: Adding a Composite block behaves exactly like adding a Primitive block from the compiler's perspective (opaque boundary).
- [ ] Verify: Expanding a Macro results in a clean graph with no "ghost" connections.
