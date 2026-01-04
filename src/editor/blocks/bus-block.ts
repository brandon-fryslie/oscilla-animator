/**
 * BusBlock - Hidden pass-through block representing a bus.
 *
 * Sprint: Bus-Block Unification - Sprint 1 (Foundation)
 * Created: 2026-01-01
 *
 * This block is never shown in the UI palette. It serves as the unified
 * representation of buses in the block graph, allowing buses to be treated
 * as regular blocks in the compiler and editor.
 *
 * Conceptually:
 * - Input: Multi-input port with bus's combine policy
 * - Output: Pass-through of combined input value
 * - Tags: hidden=true, bus=true to identify and filter from UI
 */

import type { PureBlockDefinition } from './types';

/**
 * BusBlock - represents a bus as a hidden pass-through block.
 *
 * This block has:
 * - Single input port 'in' with combine policy (multi-input capable)
 * - Single output port 'out' that passes through the combined value
 * - Hidden tag to exclude from BlockLibrary
 * - Bus tag to identify as a bus representation
 *
 * Parameters store the original bus metadata:
 * - busId: Original bus ID (matches block.id)
 * - busName: Human-readable bus name
 * - busType: Type descriptor for the bus
 * - combineMode: Combine policy for multiple publishers
 * - defaultValue: Fallback value when no publishers
 * - sortKey: Publisher ordering
 * - origin: 'built-in' or 'user'
 *
 * NOTE: This block uses 'operator' compileKind. The compiler will recognize
 * BusBlock.type and handle it specially in Pass 6 (block lowering).
 */
export const BusBlock: PureBlockDefinition = {
  type: 'BusBlock',
  capability: 'pure',
  compileKind: 'operator', // Compiler handles this as pass-through in Pass 6

  label: 'Bus',
  description: 'Hidden block representing a bus (multi-publisher signal distribution)',
  subcategory: 'Other',

  tags: {
    hidden: true,
    bus: true,
    role: 'bus',
  },

  color: '#666666', // Not visible in UI, but required

  inputs: [
    {
      id: 'in',
      label: 'Publishers',
      type: 'Signal<float>', // Placeholder - actual type set dynamically from params
      direction: 'input',
      // Multi-input behavior is handled by the compiler based on params.combineMode
      // NOTE: Slot no longer has 'combine' property - combine logic moved to Bus interface
    },
  ],

  outputs: [
    {
      id: 'out',
      label: 'Bus Output',
      type: 'Signal<float>', // Placeholder - actual type set dynamically from params
      direction: 'output',
    },
  ],

  defaultParams: {
    busId: '',
    busName: 'Unnamed Bus',
    busType: { domain: 'float', world: 'signal', category: 'core', busEligible: true },
    combineMode: 'last', // Updated from combine: { when: 'multi', mode: 'last' }
    defaultValue: 0,
    sortKey: 0,
    origin: 'user',
  },
};
