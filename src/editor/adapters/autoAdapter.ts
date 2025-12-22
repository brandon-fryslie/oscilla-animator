import { isDirectlyCompatible } from '../types';
import type { TypeDesc, AdapterStep } from '../types';
import { adapterRegistry } from './AdapterRegistry';

export interface AutoAdapterResult {
  ok: boolean;
  chain?: AdapterStep[];
  reason?: string;
  suggestions?: AdapterStep[][];
}

export function findAdapterPath(
  from: TypeDesc,
  to: TypeDesc,
  _context: 'wire' | 'publisher' | 'listener' | 'lensParam' = 'wire'
): AutoAdapterResult {
  if (isDirectlyCompatible(from, to)) {
    return { ok: true, chain: [] };
  }

  const allAdapters = adapterRegistry.list();

  // Try direct adapters first
  const directAdapters = allAdapters.filter(adapter =>
    adapter.from.world === from.world &&
    adapter.from.domain === from.domain &&
    adapter.to.world === to.world &&
    adapter.to.domain === to.domain
  );

  if (directAdapters.length > 0) {
    const bestAdapter = directAdapters[0];
    return {
      ok: true,
      chain: [{
        adapterId: bestAdapter.id,
        params: {}
      }]
    };
  }

  return {
    ok: false,
    reason: `No adapter found from ${from.world}:${from.domain} to ${to.world}:${to.domain}`
  };
}