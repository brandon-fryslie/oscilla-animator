/**
 * Type Conversion Utilities
 *
 * Bridge utilities for converting between legacy type systems (ValueKind, SlotType)
 * and the unified TypeDesc system.
 *
 * @module ir/types/typeConversion
 */

import type { TypeDesc, TypeDomain } from './TypeDesc';
import { createTypeDesc } from './TypeDesc';

// =============================================================================
// ValueKind Conversion
// =============================================================================

/**
 * Mapping from ValueKind strings to TypeDesc.
 * This is the canonical conversion table.
 */
const VALUE_KIND_MAP: Record<string, TypeDesc> = {
  // Scalars
  'Scalar:float': createTypeDesc({ world: 'scalar', domain: 'float' }),
  'Scalar:int': createTypeDesc({ world: 'scalar', domain: 'int' }),
  'Scalar:number': createTypeDesc({ world: 'scalar', domain: 'float' }),
  'Scalar:string': createTypeDesc({ world: 'scalar', domain: 'string' }),
  'Scalar:boolean': createTypeDesc({ world: 'scalar', domain: 'boolean' }),
  'Scalar:color': createTypeDesc({ world: 'scalar', domain: 'color' }),
  'Scalar:vec2': createTypeDesc({ world: 'scalar', domain: 'vec2' }),
  'Scalar:bounds': createTypeDesc({ world: 'scalar', domain: 'bounds' }),

  // Signals
  'Signal:float': createTypeDesc({ world: 'signal', domain: 'float' }),
  'Signal:int': createTypeDesc({ world: 'signal', domain: 'int' }),
  'Signal:number': createTypeDesc({ world: 'signal', domain: 'float' }),
  'Signal:Time': createTypeDesc({ world: 'signal', domain: 'time', unit: 'ms' }),
  'Signal:Unit': createTypeDesc({ world: 'signal', domain: 'float', semantics: 'unit(0..1)' }),
  'Signal:vec2': createTypeDesc({ world: 'signal', domain: 'vec2' }),
  'Signal:phase': createTypeDesc({ world: 'signal', domain: 'float', semantics: 'phase(0..1)' }),
  'Signal:phase01': createTypeDesc({ world: 'signal', domain: 'float', semantics: 'phase(0..1)' }),
  'Signal:color': createTypeDesc({ world: 'signal', domain: 'color' }),

  // Fields
  'Field:float': createTypeDesc({ world: 'field', domain: 'float' }),
  'Field:int': createTypeDesc({ world: 'field', domain: 'int' }),
  'Field:number': createTypeDesc({ world: 'field', domain: 'float' }),
  'Field:string': createTypeDesc({ world: 'field', domain: 'string' }),
  'Field:boolean': createTypeDesc({ world: 'field', domain: 'boolean' }),
  'Field:color': createTypeDesc({ world: 'field', domain: 'color' }),
  'Field:vec2': createTypeDesc({ world: 'field', domain: 'vec2' }),
  'Field:Point': createTypeDesc({ world: 'field', domain: 'vec2', semantics: 'point' }),
  'Field<Point>': createTypeDesc({ world: 'field', domain: 'vec2', semantics: 'point' }),
  'Field:Jitter': createTypeDesc({ world: 'field', domain: 'jitter' }),
  'Field:Spiral': createTypeDesc({ world: 'field', domain: 'spiral' }),
  'Field:Wave': createTypeDesc({ world: 'field', domain: 'wave' }),
  'Field:Wobble': createTypeDesc({ world: 'field', domain: 'wobble' }),
  'Field:Path': createTypeDesc({ world: 'field', domain: 'path' }),

  // Special types
  'Domain': createTypeDesc({ world: 'config', domain: 'domain' }),
  'PhaseMachine': createTypeDesc({ world: 'config', domain: 'phaseMachine' }),
  'TargetScene': createTypeDesc({ world: 'config', domain: 'sceneTargets' }),
  'Scene': createTypeDesc({ world: 'config', domain: 'scene' }),

  // Render types
  'Render': createTypeDesc({ world: 'signal', domain: 'render' }),
  'RenderTreeProgram': createTypeDesc({ world: 'signal', domain: 'renderTree' }),
  'RenderTree': createTypeDesc({ world: 'signal', domain: 'renderTree' }),
  'RenderNode': createTypeDesc({ world: 'signal', domain: 'renderNode' }),
  'RenderNodeArray': createTypeDesc({ world: 'field', domain: 'renderNode' }),
  'FilterDef': createTypeDesc({ world: 'config', domain: 'filterDef' }),
  'StrokeStyle': createTypeDesc({ world: 'config', domain: 'strokeStyle' }),

  // Specs
  'Spec:LineMorph': createTypeDesc({ world: 'config', domain: 'spec', semantics: 'lineMorph' }),
  'Spec:Particles': createTypeDesc({ world: 'config', domain: 'spec', semantics: 'particles' }),
  'Spec:RevealMask': createTypeDesc({ world: 'config', domain: 'spec', semantics: 'revealMask' }),
  'Spec:Transform3DCompositor': createTypeDesc({ world: 'config', domain: 'spec', semantics: 'transform3d' }),
  'Spec:DeformCompositor': createTypeDesc({ world: 'config', domain: 'spec', semantics: 'deform' }),
  'Spec:ProgramStack': createTypeDesc({ world: 'config', domain: 'spec', semantics: 'programStack' }),

  // Additional types
  'ElementCount': createTypeDesc({ world: 'scalar', domain: 'elementCount' }),
  'FieldExpr': createTypeDesc({ world: 'field', domain: 'unknown', semantics: 'expr' }),
  'Event': createTypeDesc({ world: 'signal', domain: 'trigger' }),
};

/**
 * Convert a ValueKind string to a TypeDesc.
 *
 * @param kind - The ValueKind string (e.g., 'Signal:float', 'Field<Point>')
 * @returns The corresponding TypeDesc, or a fallback for unknown types
 */
export function valueKindToTypeDesc(kind: string): TypeDesc {
  const result = VALUE_KIND_MAP[kind];
  if (result !== undefined) {
    return result;
  }

  // Fallback: try to parse the kind string
  return parseValueKindFallback(kind);
}

/**
 * Fallback parser for ValueKind strings not in the mapping.
 */
function parseValueKindFallback(kind: string): TypeDesc {
  // Try to match Signal:<domain>
  if (kind.startsWith('Signal:')) {
    const domain = domainFromString(kind.slice(7));
    return createTypeDesc({ world: 'signal', domain });
  }

  // Try to match Field:<domain>
  if (kind.startsWith('Field:')) {
    const domain = domainFromString(kind.slice(6));
    return createTypeDesc({ world: 'field', domain });
  }

  // Try to match Field<T>
  if (kind.startsWith('Field<') && kind.endsWith('>')) {
    const inner = kind.slice(6, -1);
    const domain = domainFromString(inner);
    const semantics = inner.toLowerCase() !== domain ? inner.toLowerCase() : undefined;
    return createTypeDesc({ world: 'field', domain, semantics });
  }

  // Try to match Scalar:<domain>
  if (kind.startsWith('Scalar:')) {
    const domain = domainFromString(kind.slice(7));
    return createTypeDesc({ world: 'scalar', domain });
  }

  // Try to match Signal<T>
  if (kind.startsWith('Signal<') && kind.endsWith('>')) {
    const inner = kind.slice(7, -1);
    const domain = domainFromString(inner);
    return createTypeDesc({ world: 'signal', domain });
  }

  // Unknown type
  console.warn(`Unknown ValueKind: ${kind}`);
  return createTypeDesc({ world: 'config', domain: 'unknown' });
}

// =============================================================================
// SlotType Conversion
// =============================================================================

/**
 * Convert a SlotType string to a TypeDesc.
 * SlotType uses patterns like 'Signal<phase>', 'Field<Point>', 'Scalar:float'.
 *
 * @param slot - The SlotType string
 * @returns The corresponding TypeDesc
 */
export function slotTypeToTypeDesc(slot: string): TypeDesc {
  // First check if it matches a ValueKind directly
  const directMatch = VALUE_KIND_MAP[slot];
  if (directMatch !== undefined) {
    return directMatch;
  }

  // Try to parse as Signal<T>
  if (slot.startsWith('Signal<') && slot.endsWith('>')) {
    const inner = slot.slice(7, -1);
    const domain = domainFromString(inner);
    const semantics = getSemantics(inner);
    return createTypeDesc({ world: 'signal', domain, semantics });
  }

  // Try to parse as Field<T>
  if (slot.startsWith('Field<') && slot.endsWith('>')) {
    const inner = slot.slice(6, -1);
    const domain = domainFromString(inner);
    const semantics = getSemantics(inner);
    return createTypeDesc({ world: 'field', domain, semantics });
  }

  // Try to parse as Scalar:T or Scalar<T>
  if (slot.startsWith('Scalar:')) {
    const inner = slot.slice(7);
    const domain = domainFromString(inner);
    return createTypeDesc({ world: 'scalar', domain });
  }
  if (slot.startsWith('Scalar<') && slot.endsWith('>')) {
    const inner = slot.slice(7, -1);
    const domain = domainFromString(inner);
    return createTypeDesc({ world: 'scalar', domain });
  }

  // Handle bare types (Domain, RenderTree, etc.)
  const bareMatch = VALUE_KIND_MAP[slot];
  if (bareMatch !== undefined) {
    return bareMatch;
  }

  // Fallback for unknown types
  console.warn(`Unknown SlotType: ${slot}`);
  return createTypeDesc({ world: 'config', domain: 'unknown' });
}

// =============================================================================
// Domain Parsing
// =============================================================================

/**
 * Mapping from string representations to TypeDomain.
 */
const DOMAIN_STRING_MAP: Record<string, TypeDomain> = {
  // Core domains (lowercase)
  'number': 'float',
  'float': 'float',
  'int': 'int',
  'vec2': 'vec2',
  'color': 'color',
  'boolean': 'boolean',
  'time': 'time',
  'phase': 'float',
  'phase01': 'float',
  'unit': 'float',
  'rate': 'rate',
  'trigger': 'trigger',

  // Core domains (various casings)
  'Number': 'float',
  'Float': 'float',
  'Int': 'int',
  'Vec2': 'vec2',
  'Color': 'color',
  'Boolean': 'boolean',
  'Time': 'time',
  'Phase': 'phase',
  'Rate': 'rate',
  'Trigger': 'trigger',

  // Special time variants
  'Unit': 'float',  // Unit is a float with unit(0..1) semantics
  'unit': 'float',

  // Point/position variants
  'Point': 'vec2',
  'point': 'vec2',
  'Position': 'vec2',
  'position': 'vec2',

  // Internal domains
  'duration': 'duration',
  'Duration': 'duration',
  'hsl': 'hsl',
  'HSL': 'hsl',
  'path': 'path',
  'Path': 'path',
  'wobble': 'wobble',
  'Wobble': 'wobble',
  'spiral': 'spiral',
  'Spiral': 'spiral',
  'wave': 'wave',
  'Wave': 'wave',
  'jitter': 'jitter',
  'Jitter': 'jitter',
  'program': 'program',
  'Program': 'program',
  'renderTree': 'renderTree',
  'RenderTree': 'renderTree',
  'renderNode': 'renderNode',
  'RenderNode': 'renderNode',
  'render': 'render',
  'Render': 'render',
  'filterDef': 'filterDef',
  'FilterDef': 'filterDef',
  'strokeStyle': 'strokeStyle',
  'StrokeStyle': 'strokeStyle',
  'elementCount': 'elementCount',
  'ElementCount': 'elementCount',
  'scene': 'scene',
  'Scene': 'scene',
  'sceneTargets': 'sceneTargets',
  'SceneTargets': 'sceneTargets',
  'sceneStrokes': 'sceneStrokes',
  'SceneStrokes': 'sceneStrokes',
  'event': 'event',
  'Event': 'event',
  'string': 'string',
  'String': 'string',
  'expression': 'expression',
  'Expression': 'expression',
  'waveform': 'waveform',
  'Waveform': 'waveform',
  'bounds': 'bounds',
  'Bounds': 'bounds',
  'spec': 'spec',
  'Spec': 'spec',
  'domain': 'domain',
  'Domain': 'domain',

  // PhaseSample and other compound types
  'PhaseSample': 'phaseSample',
  'phaseSample': 'phaseSample',
  'phaseMachine': 'phaseMachine',
  'PhaseMachine': 'phaseMachine',
};

/**
 * Convert a string to a TypeDomain.
 * Handles various casings and aliases.
 *
 * @param s - The string to convert
 * @returns The corresponding TypeDomain, or 'unknown' if not recognized
 */
export function domainFromString(s: string): TypeDomain {
  const result = DOMAIN_STRING_MAP[s];
  if (result !== undefined) {
    return result;
  }

  // Try lowercase
  const lower = s.toLowerCase();
  const lowerResult = DOMAIN_STRING_MAP[lower];
  if (lowerResult !== undefined) {
    return lowerResult;
  }

  // Unknown domain
  return 'unknown';
}

/**
 * Get semantics from a type name if applicable.
 * For example, 'Point' has semantics 'point' even though domain is 'vec2'.
 */
function getSemantics(typeName: string): string | undefined {
  const semanticsMap: Record<string, string> = {
    'Point': 'point',
    'point': 'point',
    'Unit': 'unit(0..1)',
    'unit': 'unit(0..1)',
    'Phase': 'phase(0..1)',
    'phase': 'phase(0..1)',
    'phase01': 'phase(0..1)',
    'PhaseSample': 'phaseSample',
    'phaseSample': 'phaseSample',
    'Position': 'position',
    'position': 'position',
    'Velocity': 'velocity',
    'velocity': 'velocity',
  };
  return semanticsMap[typeName];
}

// =============================================================================
// TypeDesc to String Conversion
// =============================================================================

/**
 * Convert a TypeDesc back to a ValueKind-style string.
 * Useful for debugging and compatibility.
 *
 * @param type - The TypeDesc to convert
 * @returns A string representation
 */
export function typeDescToString(type: TypeDesc): string {
  const worldPrefixMap: Record<string, string> = {
    'signal': 'Signal',
    'field': 'Field',
    'scalar': 'Scalar',
    'config': 'Config',
    'event': 'Event',
  };
  const worldPrefix = worldPrefixMap[type.world] ?? type.world;

  const domainStr = type.domain.charAt(0).toUpperCase() + type.domain.slice(1);

  if (type.semantics != null) {
    return `${worldPrefix}<${domainStr}:${type.semantics}>`;
  }

  return `${worldPrefix}:${type.domain}`;
}
