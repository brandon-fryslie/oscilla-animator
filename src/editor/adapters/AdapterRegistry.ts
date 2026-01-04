/**
 * DEPRECATED: Legacy adapter registry
 *
 * This file is part of the old adapter system and is being phased out.
 * The new unified transform system (TransformRegistry) should be used instead.
 *
 * TODO: Migrate remaining usages to TRANSFORM_REGISTRY and remove this file.
 * See: src/editor/transforms/TransformRegistry.ts
 */

import type { AdapterPolicy, AdapterCost, TypeDesc } from '../types';

export interface AdapterDef {
  id: string;
  label: string;
  policy: AdapterPolicy;
  cost: AdapterCost;
  from: TypeDesc;
  to: TypeDesc;
  // Execution logic will be added in Phase 4
}

/**
 * Registry for adapter definitions.
 *
 * @deprecated Use TRANSFORM_REGISTRY from transforms/TransformRegistry.ts instead
 */
class AdapterRegistry {
  private adapters: Map<string, AdapterDef> = new Map();

  /**
   * Register a new adapter.
   */
  register(adapter: AdapterDef): void {
    this.adapters.set(adapter.id, adapter);
  }

  /**
   * Get an adapter by ID.
   */
  get(id: string): AdapterDef | undefined {
    return this.adapters.get(id);
  }

  /**
   * Find adapters that convert from one type to another.
   *
   * NOTE: This implementation assumes object-based TypeDesc but the current
   * system uses string-based TypeDesc. This needs to be rewritten or deprecated.
   */
  findAdapters(_from: TypeDesc, _to: TypeDesc): AdapterDef[] {
    // TODO: This method needs to be updated for string-based TypeDesc
    // For now, return empty array to avoid type errors
    console.warn('AdapterRegistry.findAdapters() is deprecated and non-functional with string-based TypeDesc');
    return [];

    /* COMMENTED OUT - requires object-based TypeDesc
    const result: AdapterDef[] = [];
    for (const adapter of this.adapters.values()) {
      if (this.matchesType(adapter.from, from) && this.matchesType(adapter.to, to)) {
        result.push(adapter);
      }
    }
    return result.sort((a, b) => a.cost - b.cost);
    */
  }

  /* COMMENTED OUT - unused method, needs update for string-based TypeDesc
  private _matchesType(source: TypeDesc, target: TypeDesc): boolean {
    // TODO: Update for string-based TypeDesc or remove entirely
    return source === target;

    // COMMENTED OUT - requires object-based TypeDesc
    // return (
    //   source.world === target.world &&
    //   source.domain === target.domain &&
    //   source.category === target.category
    // );
  }
  */

  /**
   * List all registered adapters.
   */
  list(): AdapterDef[] {
    return Array.from(this.adapters.values());
  }
}

// Global adapter registry instance
export const adapterRegistry = new AdapterRegistry();

// NOTE: The initialization code below is commented out because it relies on
// object-based TypeDesc and CORE_DOMAIN_DEFAULTS which don't exist in the current type system.
// Use TRANSFORM_REGISTRY for adapter functionality instead.

/* COMMENTED OUT - requires object-based TypeDesc and CORE_DOMAIN_DEFAULTS

const COST_CHEAP = 1;
const COST_MEDIUM = 10;
const COST_HEAVY = 100;

const CORE_DOMAINS = Object.keys(CORE_DOMAIN_DEFAULTS) as Array<keyof typeof CORE_DOMAIN_DEFAULTS>;

function isCoreDomain(domain: string): boolean {
  return CORE_DOMAINS.includes(domain as keyof typeof CORE_DOMAIN_DEFAULTS);
}

function makeTypeDesc(world: TypeDesc['world'], domain: TypeDesc['domain']): TypeDesc {
  const category = isCoreDomain(domain) ? 'core' : 'internal';
  return {
    world,
    domain,
    category,
    busEligible: category === 'core' && world !== 'scalar' && world !== 'config',
  };
}

export function initAdapterRegistry(): void {
  if (adapterRegistry.list().length > 0) return;

  // World adapters
  for (const domain of CORE_DOMAINS) {
    const scalar = makeTypeDesc('scalar', domain);
    const signal = makeTypeDesc('signal', domain);
    const field = makeTypeDesc('field', domain);

    adapterRegistry.register({
      id: `ConstToSignal:${domain}`,
      label: `Const → Signal (${domain})`,
      policy: 'AUTO',
      cost: COST_CHEAP,
      from: scalar,
      to: signal,
    });

    adapterRegistry.register({
      id: `BroadcastScalarToField:${domain}`,
      label: `Const → Field (${domain})`,
      policy: 'AUTO',
      cost: COST_MEDIUM,
      from: scalar,
      to: field,
    });

    adapterRegistry.register({
      id: `BroadcastSignalToField:${domain}`,
      label: `Signal → Field (${domain})`,
      policy: 'AUTO',
      cost: COST_MEDIUM,
      from: signal,
      to: field,
    });

    adapterRegistry.register({
      id: `ReduceFieldToSignal:${domain}`,
      label: `Field → Signal (${domain})`,
      policy: 'EXPLICIT',
      cost: COST_HEAVY,
      from: field,
      to: signal,
    });
  }

  // Domain adapters: phase/number and duration/number
  const signalNumber = makeTypeDesc('signal', 'number');
  const signalPhase = makeTypeDesc('signal', 'phase');
  const scalarNumber = makeTypeDesc('scalar', 'number');
  const scalarPhase = makeTypeDesc('scalar', 'phase');
  const signalDuration = makeTypeDesc('signal', 'duration');
  const scalarDuration = makeTypeDesc('scalar', 'duration');

  adapterRegistry.register({
    id: 'NormalizeToPhase:signal',
    label: 'Number → Phase (signal)',
    policy: 'SUGGEST',
    cost: COST_CHEAP,
    from: signalNumber,
    to: signalPhase,
  });

  adapterRegistry.register({
    id: 'PhaseToNumber:signal',
    label: 'Phase → Number (signal)',
    policy: 'AUTO',
    cost: COST_CHEAP,
    from: signalPhase,
    to: signalNumber,
  });

  adapterRegistry.register({
    id: 'NormalizeToPhase:scalar',
    label: 'Number → Phase (scalar)',
    policy: 'SUGGEST',
    cost: COST_CHEAP,
    from: scalarNumber,
    to: scalarPhase,
  });

  adapterRegistry.register({
    id: 'PhaseToNumber:scalar',
    label: 'Phase → Number (scalar)',
    policy: 'AUTO',
    cost: COST_CHEAP,
    from: scalarPhase,
    to: scalarNumber,
  });

  adapterRegistry.register({
    id: 'NumberToDurationMs:signal',
    label: 'Number → Duration (signal)',
    policy: 'SUGGEST',
    cost: COST_CHEAP,
    from: signalNumber,
    to: signalDuration,
  });

  adapterRegistry.register({
    id: 'DurationToNumberMs:signal',
    label: 'Duration → Number (signal)',
    policy: 'AUTO',
    cost: COST_CHEAP,
    from: signalDuration,
    to: signalNumber,
  });

  adapterRegistry.register({
    id: 'NumberToDurationMs:scalar',
    label: 'Number → Duration (scalar)',
    policy: 'SUGGEST',
    cost: COST_CHEAP,
    from: scalarNumber,
    to: scalarDuration,
  });

  adapterRegistry.register({
    id: 'DurationToNumberMs:scalar',
    label: 'Duration → Number (scalar)',
    policy: 'AUTO',
    cost: COST_CHEAP,
    from: scalarDuration,
    to: scalarNumber,
  });
}

initAdapterRegistry();

*/
