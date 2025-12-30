import type { AdapterCost, AdapterPolicy, TypeDesc } from '../types';
import { CORE_DOMAIN_DEFAULTS } from '../types';

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
   */
  findAdapters(from: TypeDesc, to: TypeDesc): AdapterDef[] {
    const result: AdapterDef[] = [];
    for (const adapter of this.adapters.values()) {
      if (this.matchesType(adapter.from, from) && this.matchesType(adapter.to, to)) {
        result.push(adapter);
      }
    }
    return result.sort((a, b) => a.cost - b.cost);
  }

  /**
   * Check if a type description matches a target type.
   */
  private matchesType(source: TypeDesc, target: TypeDesc): boolean {
    return (
      source.world === target.world &&
      source.domain === target.domain &&
      source.category === target.category
    );
  }

  /**
   * List all registered adapters.
   */
  list(): AdapterDef[] {
    return Array.from(this.adapters.values());
  }
}

// Global adapter registry instance
export const adapterRegistry = new AdapterRegistry();

const COST_CHEAP = 1;
const COST_MEDIUM = 10;
const COST_HEAVY = 100;

const CORE_DOMAINS = Object.keys(CORE_DOMAIN_DEFAULTS) as Array<keyof typeof CORE_DOMAIN_DEFAULTS>;

function isCoreDomain(domain: string): boolean {
  return CORE_DOMAINS.includes(domain as keyof typeof CORE_DOMAIN_DEFAULTS);
}

function makeTypeDesc(
  world: TypeDesc['world'],
  domain: TypeDesc['domain'],
  semantics?: TypeDesc['semantics']
): TypeDesc {
  const category = isCoreDomain(domain) ? 'core' : 'internal';
  return {
    world,
    domain,
    category,
    busEligible: category === 'core' && world !== 'scalar' && world !== 'config',
    ...(semantics !== undefined ? { semantics } : {}),
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

  // Domain adapters: phase/float and duration/float
  const signalFloat = makeTypeDesc('signal', 'float');
  const signalPhase = makeTypeDesc('signal', 'float', 'phase(0..1)');
  const scalarFloat = makeTypeDesc('scalar', 'float');
  const scalarPhase = makeTypeDesc('scalar', 'float', 'phase(0..1)');
  const signalDuration = makeTypeDesc('signal', 'duration');
  const scalarDuration = makeTypeDesc('scalar', 'duration');

  adapterRegistry.register({
    id: 'NormalizeToPhase:signal',
    label: 'Number → Phase (signal)',
    policy: 'SUGGEST',
    cost: COST_CHEAP,
    from: signalFloat,
    to: signalPhase,
  });

  adapterRegistry.register({
    id: 'PhaseToNumber:signal',
    label: 'Phase → Number (signal)',
    policy: 'AUTO',
    cost: COST_CHEAP,
    from: signalPhase,
    to: signalFloat,
  });

  adapterRegistry.register({
    id: 'NormalizeToPhase:scalar',
    label: 'Number → Phase (scalar)',
    policy: 'SUGGEST',
    cost: COST_CHEAP,
    from: scalarFloat,
    to: scalarPhase,
  });

  adapterRegistry.register({
    id: 'PhaseToNumber:scalar',
    label: 'Phase → Number (scalar)',
    policy: 'AUTO',
    cost: COST_CHEAP,
    from: scalarPhase,
    to: scalarFloat,
  });

  adapterRegistry.register({
    id: 'NumberToDurationMs:signal',
    label: 'Number → Duration (signal)',
    policy: 'SUGGEST',
    cost: COST_CHEAP,
    from: signalFloat,
    to: signalDuration,
  });

  adapterRegistry.register({
    id: 'DurationToNumberMs:signal',
    label: 'Duration → Number (signal)',
    policy: 'AUTO',
    cost: COST_CHEAP,
    from: signalDuration,
    to: signalFloat,
  });

  adapterRegistry.register({
    id: 'NumberToDurationMs:scalar',
    label: 'Number → Duration (scalar)',
    policy: 'SUGGEST',
    cost: COST_CHEAP,
    from: scalarFloat,
    to: scalarDuration,
  });

  adapterRegistry.register({
    id: 'DurationToNumberMs:scalar',
    label: 'Duration → Number (scalar)',
    policy: 'AUTO',
    cost: COST_CHEAP,
    from: scalarDuration,
    to: scalarFloat,
  });

  const scalarExpression = makeTypeDesc('scalar', 'expression');
  const scalarWaveform = makeTypeDesc('scalar', 'waveform');

  adapterRegistry.register({
    id: 'ExpressionToWaveform:scalar',
    label: 'Expression → Waveform (scalar)',
    policy: 'EXPLICIT',
    cost: COST_HEAVY,
    from: scalarExpression,
    to: scalarWaveform,
  });
}

initAdapterRegistry();
