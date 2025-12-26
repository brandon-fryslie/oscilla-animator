/**
 * Compiler Passes - Public API
 *
 * Canonical 11-pass compilation pipeline.
 * Sprint 1: Passes 1-5 (normalization, types, time, deps, SCC)
 * Sprint 2: Passes 6-8 (block lowering, bus lowering, link resolution)
 * Sprint 3: Passes 9-11 (render lowering, constants, debug index)
 */

// Pass 1: Normalize Patch
export { pass1Normalize } from "./pass1-normalize";
export type { NormalizedPatch } from "../ir/patches";

// Pass 2: Type Graph
export { pass2TypeGraph } from "./pass2-types";
export type { TypedPatch } from "../ir/patches";

// Pass 3: Time Topology
export { pass3TimeTopology } from "./pass3-time";
export type { TimeResolvedPatch } from "../ir/patches";

// Pass 4: Dependency Graph
export { pass4DepGraph } from "./pass4-depgraph";
export type { DepGraph } from "../ir/patches";

// Pass 5: SCC Validation
export { pass5CycleValidation } from "./pass5-scc";
export type { AcyclicOrLegalGraph } from "../ir/patches";

// Pass 6: Block Lowering
export { pass6BlockLowering } from "./pass6-block-lowering";
export type { UnlinkedIRFragments, ValueRefPacked } from "./pass6-block-lowering";

// Pass 7: Bus Lowering
export { pass7BusLowering } from "./pass7-bus-lowering";
export type { IRWithBusRoots } from "./pass7-bus-lowering";

// Pass 8: Link Resolution
export { pass8LinkResolution } from "./pass8-link-resolution";
export type { LinkedGraphIR, BlockInputRootIR, BlockOutputRootIR } from "./pass8-link-resolution";
