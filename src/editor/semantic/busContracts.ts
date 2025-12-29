/**
 * @file Reserved Bus Contracts
 * @description Canonical contracts for reserved bus names and types.
 *
 * Reserved buses are NOT user-ownable. They have fixed TypeDesc contracts
 * and combine modes that must be enforced at compile time.
 *
 * Reference: design-docs/3-Synthesized/03-Buses.md lines 48-85
 */

import type { TypeDesc, BusCombineMode } from '../types';

/**
 * Reserved bus contract specification.
 */
interface ReservedBusContract {
  /** Canonical TypeDesc for this bus */
  readonly type: TypeDesc;
  /** Required combine mode for this bus */
  readonly combineMode: BusCombineMode;
  /** Description of what this bus represents */
  readonly description: string;
}

/**
 * Canonical contracts for all reserved buses.
 *
 * These buses are NOT user-ownable. Users cannot create buses with these names
 * or change their types/combine modes. Any attempt to do so should result in
 * a compile error.
 */
export const RESERVED_BUS_CONTRACTS: Record<string, ReservedBusContract> = {
  phaseA: {
    type: {
      world: 'signal',
      domain: 'float',
      semantics: 'phase(primary)',
      category: 'core',
      busEligible: true,
    },
    combineMode: 'last',
    description: 'Primary phase signal',
  },

  phaseB: {
    type: {
      world: 'signal',
      domain: 'float',
      semantics: 'phase(secondary)',
      category: 'core',
      busEligible: true,
    },
    combineMode: 'last',
    description: 'Secondary phase signal for modulation',
  },

  pulse: {
    type: {
      world: 'event',  // CRITICAL: event<trigger>, NOT signal<trigger>
      domain: 'trigger',
      semantics: 'pulse',
      category: 'core',
      busEligible: true,
    },
    combineMode: 'last',
    description: 'Discrete pulse events (wrap events, beat triggers)',
  },

  energy: {
    type: {
      world: 'signal',
      domain: 'float',
      semantics: 'energy',
      category: 'core',
      busEligible: true,
    },
    combineMode: 'sum',
    description: 'Energy/intensity contributions from multiple sources',
  },

  progress: {
    type: {
      world: 'signal',
      domain: 'float',
      semantics: 'progress',
      category: 'core',
      busEligible: true,
    },
    combineMode: 'last',
    description: 'Progress signal (0-1)',
  },

  palette: {
    type: {
      world: 'signal',
      domain: 'color',
      category: 'core',
      busEligible: true,
    },
    combineMode: 'last',
    description: 'Color theming signal',
  },
} as const;

/**
 * Set of reserved bus names for quick lookup.
 */
export const RESERVED_BUS_NAMES = new Set(Object.keys(RESERVED_BUS_CONTRACTS));

/**
 * Combine mode compatibility matrix.
 * Maps TypeDesc domains to allowed combine modes.
 *
 * AC3: This matrix now reflects ACTUAL runtime support, not theoretical possibilities.
 * Runtime constraints:
 * - executeBusEval.ts only handles numeric values (AC2)
 * - Materializer.ts fillBufferCombine only handles Field<float> (AC2)
 * - busSemantics.ts does NOT support 'layer' for fields (AC5)
 *
 * This defines the semantic meaning of combine operations per domain.
 * For example: phase signals should use 'last' because phases
 * represent positions in a cycle, not additive values.
 */
export const COMBINE_MODE_COMPATIBILITY: Record<string, BusCombineMode[]> = {
  // Signal domains - numeric only (runtime constraint: executeBusEval.ts line 58-64)
  'float': ['sum', 'average', 'max', 'min', 'last'],
  'int': ['sum', 'average', 'max', 'min', 'last'],
  'boolean': ['last'], // Boolean values use last writer
  'time': ['last'],     // Time values are authoritative
  'rate': ['last'],     // Rates are authoritative
  'duration': ['sum', 'last'],  // Durations can be added
  'trigger': ['last'],  // Trigger events use last writer

  // Field domains - numeric only, NO layer support
  // Runtime constraints:
  // - Materializer.ts line 1214: only Field<float> supported
  // - busSemantics.ts line 210-230: 'layer' mode NOT implemented for fields
  // AC3: Removed 'layer' from vec2/vec3/vec4/color/hsl to match runtime
  'vec2': ['last'],  // REMOVED: 'layer' - not supported by runtime
  'vec3': ['last'],  // REMOVED: 'layer' - not supported by runtime
  'vec4': ['last'],  // REMOVED: 'layer' - not supported by runtime
  'color': ['last'], // REMOVED: 'layer' - not supported by runtime (also non-numeric, would fail AC2)
  'point': ['last'], // REMOVED: 'layer' - not supported by runtime (also non-numeric, would fail AC2)
  'hsl': ['last'],   // REMOVED: 'layer' - not supported by runtime (also non-numeric, would fail AC2)

  // Complex types - only last-writer semantics
  'path': ['last'],
  'wobble': ['last'],
  'spiral': ['last'],
  'wave': ['last'],
  'jitter': ['last'],
  'program': ['last'],
  'renderTree': ['last'],
  'event': ['last'],
};

/**
 * Check if a bus name is reserved.
 */
export function isReservedBusName(busName: string): boolean {
  return RESERVED_BUS_NAMES.has(busName);
}

/**
 * Get the canonical contract for a reserved bus.
 * Returns undefined if the bus name is not reserved.
 */
export function getReservedBusContract(busName: string): ReservedBusContract | undefined {
  return RESERVED_BUS_CONTRACTS[busName];
}

/**
 * Validate a bus against its reserved contract (if any).
 *
 * @param busName - Name of the bus to validate
 * @param actualType - Actual TypeDesc of the bus
 * @param actualCombineMode - Actual combine mode of the bus
 * @returns Array of validation errors (empty if valid)
 */
export function validateReservedBus(
  busName: string,
  actualType: TypeDesc,
  actualCombineMode: BusCombineMode
): Array<{
  code: 'E_RESERVED_BUS_TYPE_MISMATCH' | 'E_RESERVED_BUS_COMBINE_MODE_MISMATCH';
  message: string;
  expected: unknown;
  actual: unknown;
}> {
  const errors: Array<{
    code: 'E_RESERVED_BUS_TYPE_MISMATCH' | 'E_RESERVED_BUS_COMBINE_MODE_MISMATCH';
    message: string;
    expected: unknown;
    actual: unknown;
  }> = [];

  const contract = getReservedBusContract(busName);
  if (!contract) {
    // Not a reserved bus, no validation required
    return errors;
  }

  // Validate TypeDesc match (world + domain + semantics)
  if (
    actualType.world !== contract.type.world ||
    actualType.domain !== contract.type.domain ||
    actualType.semantics !== contract.type.semantics ||
    actualType.category !== contract.type.category ||
    actualType.busEligible !== contract.type.busEligible
  ) {
    errors.push({
      code: 'E_RESERVED_BUS_TYPE_MISMATCH',
      message: `Reserved bus "${busName}" must have type ${contract.type.world}:${contract.type.domain} with semantics "${contract.type.semantics}"`,
      expected: {
        world: contract.type.world,
        domain: contract.type.domain,
        semantics: contract.type.semantics,
        category: contract.type.category,
        busEligible: contract.type.busEligible,
      },
      actual: {
        world: actualType.world,
        domain: actualType.domain,
        semantics: actualType.semantics,
        category: actualType.category,
        busEligible: actualType.busEligible,
      },
    });
  }

  // Validate combine mode match
  if (actualCombineMode !== contract.combineMode) {
    errors.push({
      code: 'E_RESERVED_BUS_COMBINE_MODE_MISMATCH',
      message: `Reserved bus "${busName}" must use combineMode="${contract.combineMode}"`,
      expected: contract.combineMode,
      actual: actualCombineMode,
    });
  }

  return errors;
}

/**
 * Validate combine mode compatibility with TypeDesc domain.
 *
 * AC3: This validation now enforces ACTUAL runtime support.
 * Modes allowed by this check WILL work at runtime.
 * Modes NOT allowed by this check WILL fail at runtime.
 *
 * @param domain - The TypeDesc domain of the bus
 * @param combineMode - The combine mode to validate
 * @returns Validation error or null if compatible
 */
export function validateCombineModeCompatibility(
  domain: string,
  combineMode: BusCombineMode
): {
  code: 'E_BUS_COMBINE_MODE_INCOMPATIBLE';
  message: string;
  expected: BusCombineMode[];
  actual: BusCombineMode;
} | null {
  const allowedModes = COMBINE_MODE_COMPATIBILITY[domain];

  // If domain is unknown, allow any mode but log a warning (not error)
  if (allowedModes == null) {
    return null;
  }

  if (!allowedModes.includes(combineMode)) {
    return {
      code: 'E_BUS_COMBINE_MODE_INCOMPATIBLE',
      message: `Bus with type domain "${domain}" cannot use combineMode="${combineMode}"`,
      expected: allowedModes,
      actual: combineMode,
    };
  }

  return null;
}
