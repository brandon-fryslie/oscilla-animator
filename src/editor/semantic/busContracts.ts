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
      domain: 'phase',
      semantics: 'primary',
      category: 'core',
      busEligible: true,
    },
    combineMode: 'last',
    description: 'Primary phase signal',
  },

  phaseB: {
    type: {
      world: 'signal',
      domain: 'phase',
      semantics: 'secondary',
      category: 'core',
      busEligible: true,
    },
    combineMode: 'last',
    description: 'Secondary phase signal for modulation',
  },

  pulse: {
    type: {
      world: 'signal',
      domain: 'trigger',
      semantics: 'pulse',
      category: 'core',
      busEligible: true,
    },
    combineMode: 'last',
    description: 'Pulse events (wrap events, beat triggers)',
  },

  energy: {
    type: {
      world: 'signal',
      domain: 'number',
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
      domain: 'number',
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
 * This defines the semantic meaning of combine operations per domain.
 * For example: 'phase' signals can only use 'last' because phases
 * represent positions in a cycle, not additive values.
 */
export const COMBINE_MODE_COMPATIBILITY: Record<string, BusCombineMode[]> = {
  // Signal domains
  'number': ['sum', 'average', 'max', 'min', 'last'],
  'phase': ['last'],  // Phases are positions, only last-writer wins
  'color': ['last', 'layer'], // Colors can be layered
  'boolean': ['last'], // Boolean values use last writer
  'time': ['last'],     // Time values are authoritative
  'rate': ['last'],     // Rates are authoritative
  'trigger': ['last'],  // Trigger events use last writer

  // Field domains (per-element values)
  'vec2': ['last', 'layer'],
  'vec3': ['last', 'layer'],
  'vec4': ['last', 'layer'],
  'point': ['last', 'layer'],
  'duration': ['sum', 'last'],  // Durations can be added
  'hsl': ['last', 'layer'],
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
  expected: any;
  actual: any;
}> {
  const errors: Array<{
    code: 'E_RESERVED_BUS_TYPE_MISMATCH' | 'E_RESERVED_BUS_COMBINE_MODE_MISMATCH';
    message: string;
    expected: any;
    actual: any;
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
  if (!allowedModes) {
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