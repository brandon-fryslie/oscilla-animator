# Cleanup Plan: Default Sources & Params

**Goal:** Complete the transition to "everything is an input," effectively deprecating the concept of block parameters for runtime evaluation.

## 1. Remove Params from Compiler
- [ ] Audit all block compilers (`compiler/blocks/**/*.ts`).
- [ ] Identify access to `params.someValue`.
- [ ] Refactor to read from `inputs.someValue` (which will be populated by `resolveDefaultSource` if not wired).
- [ ] **Exception:** Keep `params` for "Config" world inputs (enums, booleans that change topology) if they are not yet fully modeled as signals.

## 2. Registry Migration
- [ ] Systematic pass over `src/editor/blocks/*.ts`.
- [ ] Ensure every entry in `paramSchema` has a corresponding `input` with `defaultSource`.
- [ ] Mark these legacy params as deprecated or remove them if the UI fully supports `defaultSource` editing.

## 3. UI Inspector Refactor
- [ ] Update `Inspector.tsx` to prefer rendering `DefaultSource` controls over `params` controls.
- [ ] Ensure the "Drive..." button is available for every input that was formerly a param.

## 4. Simplify `DefaultSource` Logic
- [ ] Review `createDefaultArtifact`. Expand it to cover all `ValueKind` cases robustly (e.g., `Signal:color`, `Field:boolean`).
- [ ] Ensure type safety in the `DefaultSource` value (e.g., don't allow a string value for a number slot).

## 5. Verification
- [ ] Verify: Disconnecting a wire from a port immediately reverts to the `DefaultSource` value without error.
- [ ] Verify: Changing a default value in the UI updates the artifact (re-evaluates) correctly.
