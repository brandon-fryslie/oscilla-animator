/**
 * OBSOLETE: Bus step execution removed in Edge-based architecture migration.
 *
 * Bus evaluation now happens through:
 * - BusBlocks (just regular blocks with combine output ports)
 * - SignalExpr busCombine nodes (for combining publishers)
 *
 * This file kept as stub to avoid breaking imports.
 */

// Stub export to satisfy old imports
export function executeBusEval(): never {
  throw new Error("executeBusEval is obsolete - buses are now regular blocks");
}
