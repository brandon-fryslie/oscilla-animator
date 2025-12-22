# Cleanup Plan: Port Identity

**Goal:** Standardize `PortRef` usage (`{ blockId, slotId, dir }`) and eliminate ambiguous "port name" strings.

## 1. Standardize DTOs
- [ ] Review `editor/types.ts` vs `compiler/types.ts`.
- [ ] Rename `port` property to `slotId` in `CompilerConnection` and `PortRef` within the compiler types, OR strictly alias them.
- [ ] Ideally, share a single `PortRef` definition package-wide.

## 2. Compiler Internal Naming
- [ ] Audit `compileBusAware.ts` and block compilers.
- [ ] Ensure `keyOf(blockId, port)` helpers consistently use the canonical ID.
- [ ] Remove any logic that tries to "guess" port names or handle aliases (unless explicitly required for migration).

## 3. Store Data Cleanup
- [ ] Verify `PatchStore` JSON serialization. Ensure connections utilize `slotId` consistently.
- [ ] If any legacy patches use "name" or inconsistent keys, implement a migration layer in `patchAdapter.ts`.

## 4. UI Component Updates
- [ ] Update `Inspector`, `Node`, and `Port` components to use `slotId` as the unique React key and lookup identifier.
- [ ] Remove any fuzzy matching logic in UI for port highlighting.

## 5. Verification
- [ ] Verify: A block with a port named "output" and a port named "output2" never has cross-talk.
- [ ] Verify: Renaming a label in the registry does NOT break connections (because `slotId` remains stable).
