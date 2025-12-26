/**
 * Compilation Passes
 *
 * The 11-pass compilation pipeline transforms a Patch into CompiledProgramIR.
 *
 * Pass Flow:
 * 1. Normalize    → NormalizedPatch
 * 2. Type Graph   → TypedPatch
 * 3. Time Topology→ TimeResolvedPatch
 * 4. Dep Graph    → DepGraph
 * 5. SCC/Cycles   → AcyclicOrLegalGraph
 * 6-11. Lowering  → CompiledProgramIR
 *
 * Currently implemented: Passes 1-5
 */

export { pass1Normalize } from "./pass1-normalize";
export { pass2TypeGraph, isBusEligible } from "./pass2-types";
export { pass3TimeTopology } from "./pass3-time";
export { pass4DepGraph } from "./pass4-depgraph";
export { pass5CycleValidation } from "./pass5-scc";
