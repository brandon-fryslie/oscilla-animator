/**
 * DefaultSource Table
 *
 * Default source table for parameter replacement.
 * Replaces the old params system with explicit default value bindings.
 *
 * References:
 * - design-docs/12-Compiler-Final/06-Default-Sources.md
 * - HANDOFF.md Topic 7: ConstPool & Default Sources
 */

// =============================================================================
// Default Source Table
// =============================================================================

/**
 * Default source table - replaces the old params system.
 * Maps block ports to default values (either constants or expressions).
 */
export interface DefaultSourceTable {
  sources: DefaultSourceIR[];
}

/**
 * Default source IR - binds a default value to a block port.
 */
export interface DefaultSourceIR {
  /** Default source ID */
  id: number;

  /** Target block index */
  targetBlockIndex: number;

  /** Target port index */
  targetPortIndex: number;

  /** Value reference (const or expression) */
  valueRef: ValueRef;

  /** Optional UI control hint for editor */
  uiHint?: UIControlHint;
}

// =============================================================================
// Value Reference
// =============================================================================

/**
 * Reference to a value - either a constant or an expression.
 * Note: exprId can reference either SignalExpr or FieldExpr tables.
 */
export type ValueRef = ValueRefConst | ValueRefExpr;

/** Reference to a constant in the const pool */
export interface ValueRefConst {
  kind: "const";
  constId: number;
}

/** Reference to an expression (SignalExpr or FieldExpr) */
export interface ValueRefExpr {
  kind: "expr";
  exprId: number;
}

// =============================================================================
// UI Control Hints
// =============================================================================

/**
 * UI control hints for the editor.
 * These are editor-only metadata, not used by runtime.
 */
export type UIControlHint =
  | UIControlHintSlider
  | UIControlHintNumber
  | UIControlHintSelect
  | UIControlHintColor
  | UIControlHintBoolean
  | UIControlHintText
  | UIControlHintXY;

/** Slider control */
export interface UIControlHintSlider {
  kind: "slider";
  min: number;
  max: number;
  step: number;
}

/** Number input control */
export interface UIControlHintNumber {
  kind: "number";
  min?: number;
  max?: number;
  step?: number;
}

/** Select/dropdown control */
export interface UIControlHintSelect {
  kind: "select";
  options: { value: string; label: string }[];
}

/** Color picker control */
export interface UIControlHintColor {
  kind: "color";
}

/** Boolean toggle control */
export interface UIControlHintBoolean {
  kind: "boolean";
}

/** Text input control */
export interface UIControlHintText {
  kind: "text";
}

/** XY pad control */
export interface UIControlHintXY {
  kind: "xy";
}
