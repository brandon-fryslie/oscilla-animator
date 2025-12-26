/**
 * Block Lowering Types
 *
 * Type definitions for the block lowering contract.
 * Blocks use these types to emit IR nodes directly instead of closures.
 *
 * References:
 * - design-docs/12-Compiler-Final/16-Block-Lowering.md
 * - PLAN-2025-12-26-030000.md § P0-1, P0-2, P0-3
 */

import type { TypeDesc, SigExprId, FieldExprId } from "./types";
import type { IRBuilder } from "./IRBuilder";
import type { TimeModel } from "../types";
import type { BlockIndex } from "./patches";

// =============================================================================
// Block Capability
// =============================================================================

/**
 * Capability classification for blocks.
 *
 * - `time`: Produces time signals (TimeRoot)
 * - `identity`: Produces domain handles (DomainN, GridDomain)
 * - `state`: Uses persistent state (PulseDivider, EnvelopeAD)
 * - `render`: Produces render tree nodes (RenderInstances2D)
 * - `io`: I/O operations (external data sources)
 * - `pure`: Pure computation (AddSignal, Oscillator)
 */
export type BlockCapability = "time" | "identity" | "state" | "render" | "io" | "pure";

// =============================================================================
// Block Port Declaration
// =============================================================================

/**
 * Port declaration for a block type.
 *
 * Defines the type signature of an input or output port.
 */
export interface BlockPortDecl {
  /** Stable port identifier within the block type */
  readonly portId: string;

  /** Human-readable label */
  readonly label: string;

  /** Port direction */
  readonly dir: "in" | "out";

  /** Canonical type descriptor */
  readonly type: TypeDesc;

  /** If true, DefaultSource will attach automatically when unconnected */
  readonly optional?: boolean;
}

// =============================================================================
// Value References (P0-2)
// =============================================================================

/**
 * ValueRefPacked - A reference to a value in the IR
 *
 * This is the unified reference type that can point to:
 * - Signal expressions (time-varying values)
 * - Field expressions (domain-varying values)
 * - Scalar constants (compile-time constants)
 * - Special values (Domain, RenderTree, etc.)
 */
export type ValueRefPacked =
  | { k: "sig"; id: SigExprId }
  | { k: "field"; id: FieldExprId }
  | { k: "scalarConst"; constId: number }
  | { k: "special"; tag: string; id: number };

// =============================================================================
// Lowering Context
// =============================================================================

/**
 * Context passed to block lowering functions.
 *
 * Contains all information needed to emit IR nodes for a block instance.
 */
export interface LowerCtx {
  /** Dense index for this block instance */
  readonly blockIdx: BlockIndex;

  /** Block type name (e.g., "AddSignal", "Oscillator") */
  readonly blockType: string;

  /** Stable editor blockId for provenance/debug */
  readonly instanceId: string;

  /** Optional user-defined label for debug */
  readonly label?: string;

  /** Fully resolved input port types */
  readonly inTypes: readonly TypeDesc[];

  /** Fully resolved output port types */
  readonly outTypes: readonly TypeDesc[];

  /** IRBuilder instance for emitting nodes */
  readonly b: IRBuilder;

  /** Reference to seed constant for deterministic randomness */
  readonly seedConstId: number;
}

// =============================================================================
// Lowering Function
// =============================================================================

/**
 * Block lowering function signature.
 *
 * Takes resolved inputs and emits IR nodes via the IRBuilder.
 * Returns ValueRefs for each output port.
 */
export type BlockLowerFn = (args: {
  ctx: LowerCtx;

  /** Inputs resolved by the compiler (wire/bus/defaultSource already decided) */
  inputs: readonly ValueRefPacked[];

  /**
   * Instance configuration (static, non-user-adjustable).
   * User-adjustable params should use DefaultSource inputs instead.
   */
  config?: unknown;
}) => LowerResult;

// =============================================================================
// Lowering Result
// =============================================================================

/**
 * Result of block lowering.
 *
 * Contains output ValueRefs and optional graph-level declarations.
 */
export interface LowerResult {
  /** Output ValueRefs - must have length === outputs.length */
  readonly outputs: readonly ValueRefPacked[];

  /** Optional declarations for graph-level validation */
  readonly declares?: BlockDeclarations;
}

/**
 * Block declarations for graph-level validation.
 *
 * Used by time/identity/render blocks to declare special capabilities.
 */
export interface BlockDeclarations {
  /**
   * For time blocks: declares which canonical time signals it provides.
   * TimeRoot must declare exactly the required set for its TimeModel kind.
   */
  readonly timeModel?: TimeModel;

  /**
   * For identity blocks: declares the Domain root they produce.
   * Domain is treated as a special typed root, not a Field.
   */
  readonly domainOut?: { outPortIndex: number; domainKind: "domain" };

  /**
   * For render blocks: declares RenderSink nodes.
   */
  readonly renderSink?: { sinkId: number };
}

// =============================================================================
// Block Type Declaration
// =============================================================================

/**
 * Complete type declaration for a block.
 *
 * Includes port signatures, capability classification, and lowering function.
 */
export interface BlockTypeDecl {
  /** Block type name (e.g., "AddSignal", "Oscillator") */
  readonly type: string;

  /** Capability classification */
  readonly capability: BlockCapability;

  /** Input port declarations */
  readonly inputs: readonly BlockPortDecl[];

  /** Output port declarations */
  readonly outputs: readonly BlockPortDecl[];

  /**
   * Static guarantee: does this block break combinational cycles?
   * If false, this block is combinational and cannot break feedback cycles.
   */
  readonly breaksCombinationalCycle?: boolean;

  /**
   * Does this block allocate persistent state slots?
   * Usually implied by capability === 'state', but explicit is better.
   */
  readonly usesState?: boolean;

  /**
   * Lowering hook: compile an instance to IR fragments.
   */
  readonly lower: BlockLowerFn;
}

// =============================================================================
// Block Type Registry (P0-3)
// =============================================================================

/**
 * Global registry of BlockTypeDecl declarations.
 *
 * Runs parallel to the existing BlockCompiler registry to support dual-emit mode.
 * Blocks can register BOTH a BlockCompiler (closures) AND a BlockTypeDecl (IR).
 */
const blockTypeRegistry = new Map<string, BlockTypeDecl>();

/**
 * Register a block type declaration.
 *
 * @param decl - Block type declaration
 */
export function registerBlockType(decl: BlockTypeDecl): void {
  blockTypeRegistry.set(decl.type, decl);
}

/**
 * Get a block type declaration by type name.
 *
 * @param type - Block type name
 * @returns BlockTypeDecl or undefined if not registered
 */
export function getBlockType(type: string): BlockTypeDecl | undefined {
  return blockTypeRegistry.get(type);
}

/**
 * Check if a block type is registered.
 *
 * @param type - Block type name
 * @returns true if registered
 */
export function hasBlockType(type: string): boolean {
  return blockTypeRegistry.has(type);
}
