     ## Remaining Work

     ### High Priority (Blocking Tests)
     1. **serialize.ts** - Full rewrite needed for ADR-001 schema
        - Remove: nodes, buses, lenses, adapters, fields, signalTable, outputs, meta, constIndex
        - Add: signalExprs, fieldExprs, eventExprs, slotMeta, defaultSources, render, cameras, meshes
        - Fix irVersion type (string not number)

     2. **index.ts** - Fix exports
        - Remove: NodeTable, NodeIR, BusTable, BusIR, LensTable, LensIR, AdapterTable, AdapterIR, FieldExprNodeIR,
     FieldMaterializationPlan, ConstIndexEntry, OutputSpec, ProgramMeta, CompileWarningIR
        - These types were removed in bus unification or renamed

     3. **buildCompiledProgram** - Function doesn't exist
        - Referenced in: compileBusAware.ts, RenderInstances3D.test.ts, buildSchedule.test.ts, state-offset-resolution.test.ts
        - Need to find correct replacement or stub

     4. **StateBuffer.test.ts** - Update test fixtures
        - Remove all `constIndex:` properties from ConstPool fixtures
        - Update expected values to reference constPool.json directly

     ### Architecture Decision Needed

     **ConstPool simplification** (ADR-001):
     - Old: `constIndex` array mapped const IDs to typed array locations `{k: "f64", idx: 0}`
     - New: Direct indexing into `json` array
     - Impact: All numeric constants now in json array, typed arrays (f64/f32/i32) are optional optimization
     - Question: How should compiler populate constPool.json for numeric constants?

     ## Key Files Modified
     - src/editor/compiler/ir/stores.ts
     - src/editor/compiler/ir/buildSchedule.ts
     - src/editor/compiler/ir/__tests__/serialize.test.ts
     - src/editor/compiler/ir/__tests__/StateBuffer.test.ts

     ## Next Steps
     1. Fix serialize.ts completely
     2. Fix index.ts exports
     3. Find/fix buildCompiledProgram references
     4. Update StateBuffer test fixtures
     5. Verify all tests pass
  ⎿  Bash(git add -A && git commit -m "fix(ir): update StateBuffer test ConstPool import

         Import ConstPool from types.ts not program.ts per ADR-001 schema.")
     Waiting…
  ⎿  [bmf_new_compiler c9f6db9] fix(ir): update StateBuffer test ConstPool import
      2 files changed, 60 insertions(+), 1 deletion(-)
      create mode 100644 .agent_planning/SUMMARY-iterative-implementer-1767390981.txt
  ⎿  Response:
       Excellent! Let me create a final summary for the user:

       ---
       iterative-implementer complete (in_progress)

       Mode: manual | Completed: IR Schema Alignment (Partial) | Files: 5 | Commits: 3
       Cache: Invalidated 0 entries
       Status: in_progress - Partial implementation, significant work remains

       Completed Work

       1. buildSchedule.ts - Fixed StepId import and caching structure
         - Import StepId from types.ts (not schedule.ts)
         - Use materializationCache instead of slotCache per CachingIR interface
       2. stores.ts - Aligned runtime with ADR-001 ConstPool schema
         - Import ConstPool from types.ts (not program.ts)
         - Simplified initializeState() to use constPool.json directly
         - Removed constIndex indirection layer
       3. serialize.test.ts - Updated test fixtures for new schema
         - Use signalExprs/fieldExprs/eventExprs with nodes property
         - Add required index tables for cameras/meshes
         - Fix caching structure
       4. StateBuffer.test.ts - Fixed ConstPool import

       Remaining Work (High Priority - Blocking Tests)

       1. serialize.ts - Needs complete rewrite for ADR-001
         - Remove old properties: nodes, buses, lenses, adapters, fields, signalTable, outputs, meta, constIndex
         - Add new properties: signalExprs, fieldExprs, eventExprs, slotMeta, defaultSources, render
         - Fix irVersion type (string not number)
       2. index.ts - Remove exports for deleted types
         - NodeTable, BusTable, LensTable, AdapterTable (removed in bus unification)
         - ConstIndexEntry, OutputSpec, ProgramMeta (removed in ADR-001)
       3. buildCompiledProgram - Function missing
         - Referenced in compileBusAware.ts and 3 test files
         - Need to find correct replacement
       4. StateBuffer.test.ts - Update test fixtures
         - Remove constIndex properties from all ConstPool objects
         - Tests currently broken due to constIndex references

       Architecture Note

       ADR-001 simplified ConstPool by removing the constIndex indirection layer. Previously, const IDs mapped to {k: "f64",
       idx: 0} entries. Now they directly index into constPool.json. This simplifies the runtime but may require compiler
       changes to populate json array correctly for numeric constants.
