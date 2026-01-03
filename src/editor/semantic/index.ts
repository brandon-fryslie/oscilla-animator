/**
 * Semantic Kernel
 *
 * Single source of truth for type compatibility and graph validation.
 * This module provides:
 * - TypeDesc as the canonical type representation
 * - isAssignable() for all type compatibility checks
 * - SemanticGraph for derived graph indices
 * - Validator for all validation rules
 * - Adapter path resolution for conversions
 * - Bus semantics (ordering, combining)
 *
 * BOTH the UI (wiring) and compiler MUST use this module for type checks and validation.
 * This eliminates divergence between what the UI allows and what compiles.
 *
 * Reference: design-docs/10-Refactor-for-UI-prep/5-DivergentTypes.md
 */

import type { SlotType } from '../types';
import type { TypeDesc } from '../ir/types/TypeDesc';
import type { ValueKind, PortType } from '../compiler/types';

// =============================================================================
// Re-exports from submodules
// =============================================================================

export { SemanticGraph } from './graph';
export { Validator } from './validator';
export type {
  ValidationResult,
  SuggestedFix,
  PatchDocument,
  PortKey,
  GraphNode,
  GraphEdge,
  WireEdge,
  BlockNode,
  PortNode,
  BusNode,
} from './types';
export {
  portKeyToString,
  stringToPortKey,
  portKeyFromEdge,
} from './types';

// Bus Semantics Module - artifact combination for multi-input reduction
// NOTE: getSortedPublishers has been removed after bus-block unification.
// Edge sorting is now handled by the compiler based on edge.sortKey properties.
export {
  combineSignalArtifacts,
  combineFieldArtifacts,
  validateCombineMode,
  getSupportedCombineModes,
  getCombineModesForDomain,
} from './busSemantics';

// =============================================================================
// Type Compatibility
// =============================================================================

/**
 * Compatible type sets - types within a set can connect to each other.
 * These are semantic equivalences where the underlying data is the same
 * or trivially convertible.
 *
 * IMPORTANT: Add new compatibility rules HERE, not in portUtils or compile.ts.
 */
const COMPATIBLE_DOMAIN_SETS: ReadonlyArray<ReadonlyArray<string>> = [
  // Position types - Point and vec2 are semantically identical
  ['point', 'vec2'],

  // Numeric signals - int and float are compatible for wiring
  ['float', 'int'],


  // Render types - all render outputs are composable
  ['renderTree', 'renderNode', 'render'],
];

/**
 * One-way assignability rules.
 * { from: [domains], to: [domains] } means any `from` domain can connect to any `to` domain.
 */
const ONE_WAY_COMPATIBLE: ReadonlyArray<{ from: string[]; to: string[] }> = [
  // SceneTargets can provide positions
  { from: ['sceneTargets'], to: ['vec2', 'point'] },
];

/**
 * Check if two TypeDescs are directly compatible (same world + same domain).
 */
export function isDirectlyCompatible(from: TypeDesc, to: TypeDesc): boolean {
  return from.world === to.world && from.domain === to.domain;
}

/**
 * Check if two domains are in the same compatible set.
 */
function areDomainsInSameSet(
  fromDomain: string,
  toDomain: string
): boolean {
  for (const set of COMPATIBLE_DOMAIN_SETS) {
    if (set.includes(fromDomain) && set.includes(toDomain)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if there's a one-way compatibility from -> to.
 */
function hasOneWayCompatibility(
  fromDomain: string,
  toDomain: string
): boolean {
  for (const rule of ONE_WAY_COMPATIBLE) {
    if (rule.from.includes(fromDomain) && rule.to.includes(toDomain)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if one TypeDesc can be assigned to another.
 * This is the CANONICAL compatibility check used by both UI and compiler.
 *
 * Rules:
 * 1. Direct match: same world + same domain → always compatible
 * 2. Same world + compatible domain set → compatible
 * 3. One-way compatibility rules → compatible in that direction only
 * 4. Otherwise → not compatible
 *
 * @param from The source TypeDesc (output port / producer)
 * @param to The target TypeDesc (input port / consumer)
 * @returns true if from can be assigned to to
 */
export function isAssignable(from: TypeDesc, to: TypeDesc): boolean {
  // Rule 1: Direct match
  if (from.world === to.world && from.domain === to.domain) {
    return true;
  }

  // World must match for rules 2-3
  if (from.world !== to.world) {
    return false;
  }

  // Rule 2: Compatible domain sets (bidirectional)
  if (areDomainsInSameSet(from.domain, to.domain)) {
    return true;
  }

  // Rule 3: One-way compatibility
  if (hasOneWayCompatibility(from.domain, to.domain)) {
    return true;
  }

  return false;
}

// =============================================================================
// SlotType Integration
// =============================================================================

// TODO: SLOT_TYPE_TO_TYPE_DESC was removed from types.ts.
// This mapping needs to be rebuilt or SlotType usage needs to be migrated to TypeDesc.
// For now, create a minimal implementation:
const SLOT_TYPE_TO_TYPE_DESC: Record<SlotType, TypeDesc | undefined> = {} as any;

/**
 * Get the TypeDesc for a SlotType.
 * Returns undefined if the SlotType is not recognized.
 */
export function getTypeDesc(slotType: SlotType): TypeDesc | undefined {
  return SLOT_TYPE_TO_TYPE_DESC[slotType];
}

/**
 * Check if two SlotTypes are compatible.
 * This is the function that should be called by the UI for wire compatibility.
 *
 * @param fromSlot The source SlotType (output port)
 * @param toSlot The target SlotType (input port)
 * @returns true if the types are compatible
 */
export function areSlotTypesCompatible(
  fromSlot: SlotType,
  toSlot: SlotType
): boolean {
  // Exact match shortcut
  if (fromSlot === toSlot) {
    return true;
  }

  const fromDesc = getTypeDesc(fromSlot);
  const toDesc = getTypeDesc(toSlot);

  // If either type is unknown, fall back to exact match only
  if (!fromDesc || !toDesc) {
    return false;
  }

  return isAssignable(fromDesc, toDesc);
}


// =============================================================================
// Adapter Path Resolution
// =============================================================================

/**
 * AdapterPath - represents a conversion path from one type to another.
 * TODO: This type was removed from types.ts, needs to be redefined or imported from elsewhere.
 */
export interface AdapterPath {
  from: TypeDesc;
  to: TypeDesc;
  adapters: Array<{ adapterId: string; params: Record<string, unknown> }>;
  isHeavy: boolean;
}

/**
 * Get adapter paths for type conversion.
 * TODO: Deprecated autoAdapter uses string-based TypeDesc. For now, only return direct compatibility.
 */
export function getConvertiblePaths(
  from: TypeDesc,
  to: TypeDesc
): AdapterPath[] {
  // For now, only return direct compatibility (no adapters)
  if (isAssignable(from, to)) {
    return [{ from, to, adapters: [], isHeavy: false }];
  }
  return [];
}


// =============================================================================
// Bus Eligibility
// =============================================================================

/**
 * Check if a type is eligible for bus routing.
 * Only core types that are explicitly marked can be published to buses.
 */
export function isBusEligible(typeDesc: TypeDesc): boolean {
  return typeDesc.busEligible === true && typeDesc.category === 'core';
}

/**
 * Check if a SlotType is eligible for bus routing.
 */
export function isSlotBusEligible(slotType: SlotType): boolean {
  const desc = getTypeDesc(slotType);
  return desc ? isBusEligible(desc) : false;
}

// =============================================================================
// Debugging / Display
// =============================================================================

/**
 * Format a TypeDesc for display.
 */
export function formatTypeDesc(typeDesc: TypeDesc): string {
  const parts: string[] = [typeDesc.world, typeDesc.domain];
  if (typeDesc.semantics != null && typeDesc.semantics !== '') {
    parts.push(`(${typeDesc.semantics})`);
  }
  return parts.join(':');
}

/**
 * Get a human-readable compatibility hint for a slot type.
 */
export function getCompatibilityHint(slotType: SlotType): string {
  const desc = getTypeDesc(slotType);
  if (!desc) {
    return `Requires exact match: ${slotType}`;
  }

  // Find all compatible domains
  const compatibleDomains = new Set<string>([desc.domain]);
  for (const set of COMPATIBLE_DOMAIN_SETS) {
    if (set.includes(desc.domain)) {
      for (const d of set) compatibleDomains.add(d);
    }
  }

  if (compatibleDomains.size === 1) {
    const semanticHint = desc.semantics != null ? ` (${desc.semantics})` : '';
    return `Requires ${desc.world}:${desc.domain}${semanticHint}`;
  }

  const domainList = Array.from(compatibleDomains).join(', ');
  return `Requires ${desc.world} type (${domainList})`;
}

// =============================================================================
// ValueKind Integration (Compiler Types)
// =============================================================================

/**
 * Mapping from compiler ValueKind to TypeDesc.
 * This bridges the compiler's type system with the canonical semantic layer.
 *
 * NOTE: ValueKind uses colon syntax (Field:float), SlotType uses angle brackets (Field<float>).
 * This table normalizes both into the same TypeDesc representation.
 */
const VALUE_KIND_TO_TYPE_DESC: Partial<Record<ValueKind, TypeDesc>> = {
  // Scalars
  'Scalar:float': { world: 'signal', domain: 'float', category: 'core', busEligible: true, semantics: 'scalar' },
  'Scalar:int': { world: 'signal', domain: 'int', category: 'core', busEligible: true, semantics: 'scalar' },
  'Scalar:string': { world: 'signal', domain: 'string', category: 'internal', busEligible: false },
  'Scalar:boolean': { world: 'signal', domain: 'boolean', category: 'core', busEligible: false },
  'Scalar:color': { world: 'signal', domain: 'color', category: 'core', busEligible: true, semantics: 'scalar' },
  'Scalar:vec2': { world: 'signal', domain: 'vec2', category: 'core', busEligible: true, semantics: 'scalar' },
  'Scalar:bounds': { world: 'signal', domain: 'bounds', category: 'internal', busEligible: false },

  // Fields
  'Field:float': { world: 'field', domain: 'float', category: 'core', busEligible: true },
  'Field:int': { world: 'field', domain: 'int', category: 'core', busEligible: true },
  'Field:string': { world: 'field', domain: 'string', category: 'internal', busEligible: false },
  'Field:boolean': { world: 'field', domain: 'boolean', category: 'internal', busEligible: false },
  'Field:color': { world: 'field', domain: 'color', category: 'core', busEligible: true },
  'Field:vec2': { world: 'field', domain: 'vec2', category: 'core', busEligible: true, semantics: 'position' },
  'Field:Point': { world: 'field', domain: 'point', category: 'internal', busEligible: false, semantics: 'position' },
  'Field<Point>': { world: 'field', domain: 'point', category: 'internal', busEligible: false, semantics: 'position' },
  'Field:Jitter': { world: 'field', domain: 'float', category: 'internal', busEligible: false, semantics: 'jitter' },
  'Field:Spiral': { world: 'field', domain: 'float', category: 'internal', busEligible: false, semantics: 'spiral' },
  'Field:Wave': { world: 'field', domain: 'float', category: 'internal', busEligible: false, semantics: 'wave' },
  'Field:Wobble': { world: 'field', domain: 'float', category: 'internal', busEligible: false, semantics: 'wobble' },
  'Field:Path': { world: 'field', domain: 'path', category: 'internal', busEligible: false },

  // Signals
  'Signal:Time': { world: 'signal', domain: 'time', category: 'core', busEligible: true, unit: 'seconds' },
  'Signal:float': { world: 'signal', domain: 'float', category: 'core', busEligible: true },
  'Signal:int': { world: 'signal', domain: 'int', category: 'core', busEligible: true },
  'Signal:Unit': { world: 'signal', domain: 'float', category: 'core', busEligible: true, semantics: 'unit(0..1)' },
  'Signal:vec2': { world: 'signal', domain: 'vec2', category: 'core', busEligible: true },
  'Signal:phase': { world: 'signal', domain: 'float', category: 'core', busEligible: true, semantics: 'phase(0..1)' },
  'Signal:phase01': { world: 'signal', domain: 'float', category: 'core', busEligible: true, semantics: 'phase(0..1)' },
  'Signal:color': { world: 'signal', domain: 'color', category: 'core', busEligible: true },

  // Special types
  'Domain': { world: 'field', domain: 'elementCount', category: 'internal', busEligible: false },
  'PhaseMachine': { world: 'signal', domain: 'phaseMachine', category: 'internal', busEligible: false },
  'TargetScene': { world: 'field', domain: 'sceneTargets', category: 'internal', busEligible: false },
  'Scene': { world: 'field', domain: 'scene', category: 'internal', busEligible: false },
  'Render': { world: 'field', domain: 'renderTree', category: 'internal', busEligible: false },
  'RenderTreeProgram': { world: 'field', domain: 'renderTree', category: 'internal', busEligible: false },
  'RenderTree': { world: 'field', domain: 'renderTree', category: 'internal', busEligible: false },
  'RenderNode': { world: 'field', domain: 'renderNode', category: 'internal', busEligible: false },
  'RenderNodeArray': { world: 'field', domain: 'renderNode', category: 'internal', busEligible: false, semantics: 'array' },
  'FilterDef': { world: 'field', domain: 'filterDef', category: 'internal', busEligible: false },
  'StrokeStyle': { world: 'field', domain: 'strokeStyle', category: 'internal', busEligible: false },

  // Specs (all compile to programs)
  'Spec:LineMorph': { world: 'field', domain: 'spec', category: 'internal', busEligible: false, semantics: 'lineMorph' },
  'Spec:Particles': { world: 'field', domain: 'spec', category: 'internal', busEligible: false, semantics: 'particles' },
  'Spec:RevealMask': { world: 'field', domain: 'spec', category: 'internal', busEligible: false, semantics: 'revealMask' },
  'Spec:Transform3DCompositor': { world: 'field', domain: 'spec', category: 'internal', busEligible: false, semantics: 'transform3d' },
  'Spec:DeformCompositor': { world: 'field', domain: 'spec', category: 'internal', busEligible: false, semantics: 'deform' },
  'Spec:ProgramStack': { world: 'field', domain: 'spec', category: 'internal', busEligible: false, semantics: 'programStack' },

  // Additional artifact kinds
  'ElementCount': { world: 'signal', domain: 'int', category: 'core', busEligible: true, semantics: 'count' },
  'FieldExpr': { world: 'field', domain: 'float', category: 'internal', busEligible: false, semantics: 'lazy' },
};

/**
 * Extended compatible domain sets for compiler-specific types.
 * These are in addition to COMPATIBLE_DOMAIN_SETS.
 */
const COMPILER_COMPATIBLE_DOMAIN_SETS: ReadonlyArray<ReadonlyArray<string>> = [
  // ElementCount is compatible with int
  ['elementCount', 'int'],

  // All spec types are their own category
  ['spec'],
];

/**
 * Get the TypeDesc for a ValueKind.
 * Returns undefined if the ValueKind is not recognized.
 */
export function getTypeDescFromValueKind(valueKind: ValueKind): TypeDesc | undefined {
  return VALUE_KIND_TO_TYPE_DESC[valueKind];
}

/**
 * Check if two ValueKinds are compatible.
 * This is the function that should be called by the compiler for port compatibility.
 *
 * @param fromKind The source ValueKind (output port)
 * @param toKind The target ValueKind (input port)
 * @returns true if the types are compatible
 */
export function areValueKindsCompatible(fromKind: ValueKind, toKind: ValueKind): boolean {
  // Exact match shortcut
  if (fromKind === toKind) {
    return true;
  }

  const fromDesc = getTypeDescFromValueKind(fromKind);
  const toDesc = getTypeDescFromValueKind(toKind);

  // If either type is unknown, fall back to exact match only
  if (!fromDesc || !toDesc) {
    return false;
  }

  // Use canonical isAssignable
  if (isAssignable(fromDesc, toDesc)) {
    return true;
  }

  // Check compiler-specific compatible sets
  if (fromDesc.world === toDesc.world) {
    for (const set of COMPILER_COMPATIBLE_DOMAIN_SETS) {
      if (set.includes(fromDesc.domain) && set.includes(toDesc.domain)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if two PortTypes are compatible.
 * Convenience wrapper for the compiler that takes PortType objects.
 *
 * @param from The source PortType (output port)
 * @param to The target PortType (input port)
 * @returns true if the types are compatible
 */
export function arePortTypesCompatible(from: PortType, to: PortType): boolean {
  return areValueKindsCompatible(from.kind, to.kind);
}
