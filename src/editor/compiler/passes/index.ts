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
 * Currently implemented: Pass 1
 */

export { pass1Normalize } from "./pass1-normalize";
