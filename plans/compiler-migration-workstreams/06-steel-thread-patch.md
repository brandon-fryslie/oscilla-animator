Workstream 06: Steel Thread Patch and Verification Harness (P1)

Goal
- Provide a handpicked patch that renders via the new IR compiler.
- Establish a repeatable DevTools validation checklist.

Scope
- Documentation and/or a patch fixture file.
- No compiler or runtime changes.

Out of scope
- Block lowerer fixes (P0 streams).

Parallel safety
- Can be done in parallel with compiler fixes because it only adds docs/fixtures.

Implementation steps
1. Define the minimal steel-thread graph:
   - TimeRoot (InfiniteTimeRoot or FiniteTimeRoot)
   - DomainN or GridDomain
   - PositionMapCircle (or PositionMapGrid)
   - FieldConstColor
   - FieldConstNumber (radius)
   - RenderInstances2D
2. Add a patch recipe document with exact block settings and wiring.
   - Prefer a docs/ or plans/ entry that can be followed manually.
3. Optional: add a fixture JSON patch file in a dedicated folder (e.g., public/fixtures/steel-thread.json).
   - Keep it decoupled from editor code to avoid conflicts.
4. Create a DevTools validation checklist:
   - IR compile logs show render sinks
   - schedule includes timeDerive -> signalEval -> materialize -> renderAssemble
   - RenderFrameIR is written to the output slot
   - No slotMeta errors

Verification (DevTools, no tests)
- Manually load the patch and confirm visible output.
- Capture a screenshot and verify the pass list includes instances2d.

Done criteria
- A reproducible patch recipe exists and can be validated in DevTools.
