/**
 * Control Surface Type Definitions
 *
 * A Control Surface is a curated set of high-leverage controls that bind to
 * parameters and/or ports in the underlying patch, with strict rules that
 * keep everything predictable, scrubbable, and unbreakable.
 *
 * Key principles:
 * - Controls emit values, Bindings decide where they go
 * - Surface never changes topology (can't add/remove blocks/wires)
 * - All combine rules must be explicit
 * - Controls are typed, clamped, deterministic, scrub-safe
 */

// =============================================================================
// Control Surface Core
// =============================================================================

export type SurfaceId = string;
export type ControlId = string;
export type SectionId = string;

/**
 * A Control Surface is the playable layer over a patch.
 * It doesn't create structure (that's Macros), it's a projection + binding layer.
 */
export interface ControlSurface {
  readonly id: SurfaceId;
  title: string;

  /** Curated layout grouped into canonical sections */
  sections: SurfaceSection[];

  /** Optional scope - which patch/macro this surface "belongs" to */
  scope?: {
    patchId?: string;
    macroType?: string;
  };
}

/**
 * Canonical section types - always in this order:
 * TIME → MOTION → STYLE → CHAOS
 *
 * This never changes, even across archetypes.
 * Users build muscle memory, archetypes feel like "different presets on the same instrument"
 */
export type SectionKind = 'time' | 'motion' | 'style' | 'chaos' | 'advanced';

/**
 * A section groups related controls together.
 */
export interface SurfaceSection {
  readonly id: SectionId;
  readonly kind: SectionKind;
  title: string;
  collapsed: boolean;
  controls: SurfaceControl[];
}

// =============================================================================
// Control Types
// =============================================================================

/**
 * Output type that a control produces.
 */
export type ControlOutputType =
  | 'Scalar<number>'
  | 'Scalar<boolean>'
  | 'Scalar<string>'  // For enum values
  | 'Scalar<Vec2>'
  | 'Color';

/**
 * Base properties shared by all controls.
 */
interface ControlBase {
  readonly id: ControlId;
  label: string;
  bindings: Binding[];
}

/**
 * Number Control - the workhorse.
 * Used for timing, distances, intensities, weights.
 */
export interface NumberControl extends ControlBase {
  kind: 'number';
  min: number;
  max: number;
  default: number;
  value: number;

  /** Response curve for the control */
  curve?: 'linear' | 'exp' | 'log' | 'sCurve';

  /** Step for discrete values */
  step?: number;

  /** Display unit */
  unit?: 'ms' | 'px' | '%' | 'deg' | 'x' | 's';
}

/**
 * Enum Control - modes without magic.
 * Used for converge/cascade/diagonal, easing families, palette selection.
 */
export interface EnumControl<T extends string = string> extends ControlBase {
  kind: 'enum';
  options: readonly T[];
  default: T;
  value: T;

  /** How to present the enum */
  presentation?: 'segmented' | 'dropdown' | 'radio';
}

/**
 * Toggle Control - boolean, but expressive.
 * Used for enable/disable effects, reverse order, lock/unlock behavior.
 */
export interface ToggleControl extends ControlBase {
  kind: 'toggle';
  default: boolean;
  value: boolean;
}

/**
 * XY Control - spatial intuition.
 * Used for origin points, direction + magnitude, offsets.
 */
export interface XYControl extends ControlBase {
  kind: 'xy';
  x: { min: number; max: number; default: number; value: number };
  y: { min: number; max: number; default: number; value: number };

  /** Constraint mode */
  aspect?: 'free' | 'lockX' | 'lockY';

  /** Visual hint for bounds */
  boundsHint?: 'viewport' | 'unitSquare';
}

/**
 * Color Control - visual-first.
 * Used for stroke/fill, glow color, palette offsets.
 */
export interface ColorControl extends ControlBase {
  kind: 'color';
  default: string;
  value: string;

  /** Optional named palette */
  palette?: string;

  /** Whether alpha channel is editable */
  allowAlpha?: boolean;
}

/**
 * Union of all control types.
 */
export type SurfaceControl =
  | NumberControl
  | EnumControl
  | ToggleControl
  | XYControl
  | ColorControl;

// =============================================================================
// Binding Types
// =============================================================================

/**
 * A Binding is a declarative mapping from a Control's output to a specific
 * target in the patch, with explicit transformation and combination rules.
 *
 * A Binding answers three questions:
 * 1. Where does this value go?
 * 2. How is it transformed?
 * 3. What happens if something else also writes there?
 */
export type Binding = BindParam | BindPort;

/**
 * Bind to a block parameter (most common).
 */
export interface BindParam {
  target: { blockId: string; paramKey: string };
  map?: ValueMap;
  combine?: Combine;
}

/**
 * Bind to an input port of a block (injection).
 */
export interface BindPort {
  target: { blockId: string; inputPort: string };
  map?: ValueMap;
}

/**
 * Value mapping - shapes the control's influence.
 * Applied in this order: curve → scale → offset → clamp
 */
export interface ValueMap {
  /** Response curve */
  curve?: 'linear' | 'exp' | 'log' | 'sCurve';
  /** Multiply the value */
  scale?: number;
  /** Add to the value */
  offset?: number;
  /** Clamp to range */
  clamp?: [number, number];
}

/**
 * Combine operators for when multiple controls bind to the same target.
 * Default should be error - UI should force the user to choose.
 */
export type Combine =
  | { op: 'add' }
  | { op: 'multiply' }
  | { op: 'lerp'; t: number }
  | { op: 'min' }
  | { op: 'max' }
  | { op: 'override' };  // Last writer wins

// =============================================================================
// Type Guards
// =============================================================================

export function isBindParam(binding: Binding): binding is BindParam {
  return 'paramKey' in (binding as BindParam).target;
}

export function isBindPort(binding: Binding): binding is BindPort {
  return 'inputPort' in (binding as BindPort).target;
}

export function isNumberControl(control: SurfaceControl): control is NumberControl {
  return control.kind === 'number';
}

export function isEnumControl(control: SurfaceControl): control is EnumControl {
  return control.kind === 'enum';
}

export function isToggleControl(control: SurfaceControl): control is ToggleControl {
  return control.kind === 'toggle';
}

export function isXYControl(control: SurfaceControl): control is XYControl {
  return control.kind === 'xy';
}

export function isColorControl(control: SurfaceControl): control is ColorControl {
  return control.kind === 'color';
}

// =============================================================================
// Factory Functions
// =============================================================================

let controlIdCounter = 0;

function generateControlId(): ControlId {
  return `ctrl-${++controlIdCounter}`;
}

export function createNumberControl(
  label: string,
  opts: {
    min: number;
    max: number;
    default: number;
    unit?: NumberControl['unit'];
    curve?: NumberControl['curve'];
    step?: number;
  },
  bindings: Binding[] = []
): NumberControl {
  return {
    id: generateControlId(),
    kind: 'number',
    label,
    min: opts.min,
    max: opts.max,
    default: opts.default,
    value: opts.default,
    unit: opts.unit,
    curve: opts.curve,
    step: opts.step,
    bindings,
  };
}

export function createEnumControl<T extends string>(
  label: string,
  opts: {
    options: readonly T[];
    default: T;
    presentation?: EnumControl['presentation'];
  },
  bindings: Binding[] = []
): EnumControl<T> {
  return {
    id: generateControlId(),
    kind: 'enum',
    label,
    options: opts.options,
    default: opts.default,
    value: opts.default,
    presentation: opts.presentation,
    bindings,
  };
}

export function createToggleControl(
  label: string,
  defaultValue: boolean,
  bindings: Binding[] = []
): ToggleControl {
  return {
    id: generateControlId(),
    kind: 'toggle',
    label,
    default: defaultValue,
    value: defaultValue,
    bindings,
  };
}

export function createXYControl(
  label: string,
  opts: {
    x: { min: number; max: number; default: number };
    y: { min: number; max: number; default: number };
    aspect?: XYControl['aspect'];
    boundsHint?: XYControl['boundsHint'];
  },
  bindings: Binding[] = []
): XYControl {
  return {
    id: generateControlId(),
    kind: 'xy',
    label,
    x: { ...opts.x, value: opts.x.default },
    y: { ...opts.y, value: opts.y.default },
    aspect: opts.aspect,
    boundsHint: opts.boundsHint,
    bindings,
  };
}

export function createColorControl(
  label: string,
  opts: {
    default: string;
    palette?: string;
    allowAlpha?: boolean;
  },
  bindings: Binding[] = []
): ColorControl {
  return {
    id: generateControlId(),
    kind: 'color',
    label,
    default: opts.default,
    value: opts.default,
    palette: opts.palette,
    allowAlpha: opts.allowAlpha,
    bindings,
  };
}

export function createSection(
  kind: SectionKind,
  title: string,
  controls: SurfaceControl[] = []
): SurfaceSection {
  return {
    id: `section-${kind}`,
    kind,
    title,
    collapsed: false,
    controls,
  };
}

let surfaceIdCounter = 0;

export function createSurface(
  title: string,
  sections: SurfaceSection[] = [],
  scope?: ControlSurface['scope']
): ControlSurface {
  return {
    id: `surface-${++surfaceIdCounter}`,
    title,
    sections,
    scope,
  };
}

/**
 * Create a default surface with empty canonical sections.
 */
export function createDefaultSurface(title: string = 'Controls'): ControlSurface {
  return createSurface(title, [
    createSection('time', 'TIME'),
    createSection('motion', 'MOTION'),
    createSection('style', 'STYLE'),
    createSection('chaos', 'CHAOS'),
  ]);
}
