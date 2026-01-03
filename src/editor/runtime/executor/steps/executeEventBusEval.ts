/**
 * OBSOLETE: Event bus step execution removed in Edge-based architecture migration.
 *
 * Event bus evaluation now happens through:
 * - BusBlocks (just regular blocks with combine output ports)
 * - EventExpr busCombine nodes (for combining event publishers)
 *
 * This file kept as stub to avoid breaking imports.
 */

// Stub export to satisfy old imports
export function executeEventBusEval(): never {
  throw new Error("executeEventBusEval is obsolete - event buses are now regular blocks");
}
