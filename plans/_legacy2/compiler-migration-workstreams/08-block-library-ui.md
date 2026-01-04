Workstream 08: Block Library Expansion and UI Focus (P3)

Goal
- Expand the IR-native block library and align UI with the new compiler model.
- Remove UI affordances for legacy buses/wires/adapters.

Scope
- Block registry and editor components.

Dependencies
- Workstream 07 complete (legacy cleanup).

Parallel safety
- Should be executed after cleanup to avoid conflicts in UI and data model.

Implementation steps
1. Block library expansion:
   - Promote a curated set of IR-native blocks in each category (time, signal, field, domain, render).
   - Ensure every new block uses typed slot allocation and IR lowerers only.
2. UI alignment:
   - PatchBay: display transform chains on edges and combine policies on inputs.
   - Inspector: show TypeDesc and transform stack editing.
   - TimeConsole: driven exclusively by TimeModel from compiler output.
3. Remove legacy UI features:
   - Bus-specific panels that rely on publisher/listener models.
   - Legacy wiring visuals or deprecated block forms.
4. Add curated example patches for user onboarding.

Verification (DevTools, no tests)
- Load curated patches and verify that UI reflects transform stacks and TimeModel.
- Confirm that the editor no longer exposes legacy controls.

Done criteria
- Block library and UI operate purely on the new compiler architecture.
