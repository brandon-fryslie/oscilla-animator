       ---
       Research: Compiler Pass Pipeline Architecture - COMPLETE

       Executive Summary

       Question: How should compilePatch() be implemented using the pass-based compiler pipeline (passes 0-8)?

       Answer: Implement a sequential pipeline with early exit - call passes 0-8 in order, accumulate errors, skip pass7 (deprecated), and wrap the final
       LinkedGraphIR with buildSchedule() + IRRuntimeAdapter to produce Program<RenderTree>.

       Key Finding: All pieces exist and are compatible. Pass 0 output matches Pass 1 input. No closure compilation needed - pass6 uses registered lowering
       functions. Pass 7 is skipped (buses are BusBlocks). The pipeline is ready to wire up.

       ---
       Complete Data Flow Diagram

       CompilerPatch (blocks[], edges, buses)
           ↓ pass0Materialize()
       CompilerPatch (+ default source provider blocks)
           ↓ pass1Normalize()
       NormalizedPatch (blockIndexMap, edges, constPool)
           ↓ pass2TypeGraph()
       TypedPatch (+ blockOutputTypes, busOutputTypes)
           ↓ pass3TimeTopology()
       TimeResolvedPatch (+ timeModel, timeSignals)
           ↓ pass4DepGraph()
       DepGraphWithTimeModel (graph, timeModel)
           ↓ pass5CycleValidation() + blocks array
       AcyclicOrLegalGraph (graph, sccs, errors, timeModel)
           ↓ pass6BlockLowering() + blocks, edges, emptyPortMap
       UnlinkedIRFragments (builder, blockOutputs, errors)
           ↓ [SKIP pass7 - deprecated]
           ↓ pass8LinkResolution() + blocks, edges
       LinkedGraphIR (builder, blockInputRoots, blockOutputRoots, errors)
           ↓ builder.build()
       BuilderProgramIR (signalTable, fieldTable, renderSinks, etc.)
           ↓ buildSchedule()
       CompiledProgramIR (schedule, typeTable, constPool, etc.)
           ↓ new IRRuntimeAdapter()
           ↓ adapter.createProgram()
       Program<RenderTree> ✓

       ---
       Function Signatures Reference

       Pass 0: Materialize Default Sources

       function pass0Materialize(patch: CompilerPatch): CompilerPatch
       - Input: CompilerPatch with blocks: BlockInstance[]
       - Output: Augmented CompilerPatch with hidden provider blocks
       - Errors: None (pass-through)
       - File: src/editor/compiler/passes/pass0-materialize.ts

       Pass 1: Normalize

       function pass1Normalize(patch: Patch): NormalizedPatch
       - Input: Patch (compatible with CompilerPatch - both use BlockInstance[])
       - Output: NormalizedPatch with frozen block indices, canonicalized edges
       - Errors: None (defensive)
       - File: src/editor/compiler/passes/pass1-normalize.ts

       Pass 2: Type Graph

       function pass2TypeGraph(normalized: NormalizedPatch): TypedPatch
       - Output: Adds blockOutputTypes, busOutputTypes
       - Errors: Throws on type mismatches
       - File: src/editor/compiler/passes/pass2-types.ts

       Pass 3: Time Topology

       function pass3TimeTopology(typedPatch: TypedPatch): TimeResolvedPatch
       - Output: Adds timeModel, timeSignals
       - Errors: Throws if no TimeRoot or invalid params
       - File: src/editor/compiler/passes/pass3-time.ts

       Pass 4: Dependency Graph

       function pass4DepGraph(timeResolved: TimeResolvedPatch): DepGraphWithTimeModel
       - Output: { graph, timeModel }
       - Errors: Throws on dangling connections
       - File: src/editor/compiler/passes/pass4-depgraph.ts

       Pass 5: Cycle Validation

       function pass5CycleValidation(
         depGraphWithTime: DepGraphWithTimeModel,
         blocks: readonly Block[]
       ): AcyclicOrLegalGraph
       - Extra Input: Requires blocks array (convert from NormalizedPatch.blocks Map)
       - Output: { graph, sccs, errors, timeModel }
       - Errors: Accumulated in errors array (does not throw)
       - File: src/editor/compiler/passes/pass5-scc.ts

       Pass 6: Block Lowering

       function pass6BlockLowering(
         validated: AcyclicOrLegalGraph,
         blocks: readonly Block[],
         compiledPortMap: Map<string, Artifact>,
         edges?: readonly Edge[]
       ): UnlinkedIRFragments
       - Extra Inputs: blocks, compiledPortMap (can be empty!), edges
       - Output: { builder, blockOutputs, errors }
       - Errors: Accumulated (does not throw)
       - File: src/editor/compiler/passes/pass6-block-lowering.ts
       - NOTE: If compiledPortMap is empty, uses registered lowering functions via getBlockType()

       Pass 7: SKIP (Deprecated)

       - Status: Buses are BusBlocks, lowered in pass6
       - Action: Do not call this pass

       Pass 8: Link Resolution

       function pass8LinkResolution(
         fragments: UnlinkedIRFragments,
         blocks: readonly Block[],
         edges: readonly Edge[]
       ): LinkedGraphIR
       - Output: { builder, blockInputRoots, blockOutputRoots, errors }
       - Errors: Accumulated (does not throw)
       - File: src/editor/compiler/passes/pass8-link-resolution.ts

       Schedule Building

       function buildSchedule(
         builderProgram: BuilderProgramIR,
         debugConfig?: ScheduleDebugConfig
       ): CompiledProgramIR
       - Input: builder.build() output
       - Output: Executable schedule
       - File: src/editor/compiler/ir/buildSchedule.ts

       Runtime Adapter

       class IRRuntimeAdapter {
         constructor(program: CompiledProgramIR)
         createProgram(): Program<RenderTree>
       }
       - File: src/editor/runtime/executor/IRRuntimeAdapter.ts

       ---
       Recommended Implementation (Option A)

       export function compilePatch(
         patch: CompilerPatch,
         registry: BlockRegistry,
         seed: Seed,
         ctx: CompileCtx,
         options?: { emitIR?: boolean }
       ): CompileResult {
         const errors: CompileError[] = [];

         try {
           // Pass 0: Materialize default sources
           const materialized = pass0Materialize(patch);

           // Pass 1: Normalize
           const normalized = pass1Normalize(materialized);

           // Pass 2: Type graph
           const typed = pass2TypeGraph(normalized);

           // Pass 3: Time topology
           const timeResolved = pass3TimeTopology(typed);

           // Pass 4: Dependency graph
           const depGraph = pass4DepGraph(timeResolved);

           // Pass 5: Cycle validation (needs blocks array)
           const blocks = Array.from(normalized.blocks.values()) as Block[];
           const validated = pass5CycleValidation(depGraph, blocks);
           errors.push(...validated.errors.map(e => ({
             code: 'CycleDetected' as const,
             message: e.kind === 'IllegalCycle'
               ? `Illegal cycle in blocks: ${e.nodes.join(', ')}`
               : 'Unknown cycle error'
           })));

           if (validated.errors.length > 0) {
             return { ok: false, errors };
           }

           // Pass 6: Block lowering (no closure compilation needed)
           const emptyPortMap = new Map<string, Artifact>();
           const fragments = pass6BlockLowering(
             validated,
             blocks,
             emptyPortMap,
             materialized.edges
           );
           errors.push(...fragments.errors);

           // Pass 7: SKIP (deprecated)

           // Pass 8: Link resolution
           const linked = pass8LinkResolution(
             fragments,
             blocks,
             materialized.edges
           );
           errors.push(...linked.errors);

           if (errors.length > 0) {
             return { ok: false, errors };
           }

           // Build schedule from IR
           const builderProgram = linked.builder.build();
           const compiledProgram = buildSchedule(builderProgram);

           // Create runtime adapter and program
           const adapter = new IRRuntimeAdapter(compiledProgram);
           const program = adapter.createProgram();

           return {
             ok: true,
             program,
             timeModel: validated.timeModel,
             ...(options?.emitIR && { ir: builderProgram }),
           };

         } catch (error) {
           errors.push({
             code: 'CompilerCrash' as const,
             message: error instanceof Error ? error.message : String(error)
           });
           return { ok: false, errors };
         }
       }

       ---
       Files to Modify

       1. src/editor/compiler/compile.ts - Replace compileBusAwarePatch call with pass pipeline
       2. src/editor/compiler/passes/index.ts - Add pass0Materialize to exports if missing

       ---
       Blockers Resolution

       | Blocker                      | Resolution                                                  |
       |------------------------------|-------------------------------------------------------------|
       | Pass 0 not integrated        | Call before pass1 - output format matches                   |
       | No closure compilation       | Pass empty compiledPortMap - pass6 uses lowering functions  |
       | Blocks array needed          | Convert NormalizedPatch.blocks Map to array before pass5    |
       | Pass 7 deprecated            | Skip entirely - buses are BusBlocks                         |
       | Error handling inconsistency | Wrap throw-prone passes in try-catch, accumulate all errors |
       | Final Program creation       | buildSchedule() → IRRuntimeAdapter → createProgram()        |

       ---
       Decision

       Implement Option A immediately. All pieces exist, are compatible, and ready to wire together. Estimated effort: ~100 lines of glue code in compile.ts.

       ---
       Files Referenced:
       - /Users/bmf/code/oscilla-animator_codex/src/editor/compiler/compile.ts
       - /Users/bmf/code/oscilla-animator_codex/src/editor/compiler/compileBusAware.ts
       - /Users/bmf/code/oscilla-animator_codex/src/editor/compiler/passes/pass0-materialize.ts
       - /Users/bmf/code/oscilla-animator_codex/src/editor/compiler/passes/pass1-normalize.ts
       - /Users/bmf/code/oscilla-animator_codex/src/editor/compiler/passes/pass2-types.ts
       - /Users/bmf/code/oscilla-animator_codex/src/editor/compiler/passes/pass3-time.ts
       - /Users/bmf/code/oscilla-animator_codex/src/editor/compiler/passes/pass4-depgraph.ts
       - /Users/bmf/code/oscilla-animator_codex/src/editor/compiler/passes/pass5-scc.ts
       - /Users/bmf/code/oscilla-animator_codex/src/editor/compiler/passes/pass6-block-lowering.ts
       - /Users/bmf/code/oscilla-animator_codex/src/editor/compiler/passes/pass8-link-resolution.ts
       - /Users/bmf/code/oscilla-animator_codex/src/editor/compiler/ir/buildSchedule.ts
       - /Users/bmf/code/oscilla-animator_codex/src/editor/runtime/executor/IRRuntimeAdapter.ts

       ---
       researcher complete
         Question: Implement compilePatch() using passes 0-8 | Options: 3 | Recommendation: Sequential Pipeline
         -> Ready for implementation - all blockers resolved
  ⎿  Done (25 tool uses · 82.5k tokens · 3m 44s)

