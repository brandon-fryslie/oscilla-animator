/**
 * Unified Bindings Type System
 *
 * This module provides a single abstraction over three edge types:
 * - Wire (block → block connection)
 * - Publisher (block output → bus)
 * - Listener (bus → block input)
 *
 * All three share nearly identical metadata but differ in endpoint types.
 * This type system unifies them under a single "binding" abstraction.
 */

import type {
  PortRef,
  TypeDesc,
  LensInstance,
  AdapterStep,
  Bus,
  Block,
  Slot,
} from '../types';

/**
 * Discriminated union tag for binding kinds.
 */
export type BindingKind = 'wire' | 'publisher' | 'listener';

/**
 * Reference to a binding (any of the three edge types).
 * Discriminated union on `kind` field.
 */
export type BindingRef =
  | { kind: 'wire'; id: string }
  | { kind: 'publisher'; id: string }
  | { kind: 'listener'; id: string };

/**
 * Reference to a binding endpoint.
 * Can be either a port (block + slot) or a bus.
 */
export type EndpointRef =
  | { kind: 'port'; port: PortRef }
  | { kind: 'bus'; busId: string };

/**
 * Normalized binding with no optional fields.
 * All three variants have enabled/lensStack/adapterChain normalized to non-optional.
 */
export type NormalizedBinding =
  | {
      kind: 'wire';
      id: string;
      from: PortRef;
      to: PortRef;
      enabled: boolean;
      lensStack: LensInstance[];
      adapterChain: AdapterStep[];
    }
  | {
      kind: 'publisher';
      id: string;
      busId: string;
      from: PortRef;
      enabled: boolean;
      lensStack: LensInstance[];
      adapterChain: AdapterStep[];
      weight?: number;
      sortKey: number;
    }
  | {
      kind: 'listener';
      id: string;
      busId: string;
      to: PortRef;
      enabled: boolean;
      lensStack: LensInstance[];
      adapterChain: AdapterStep[];
    };

/**
 * Resolved port endpoint with block, slot, and type information.
 */
export interface ResolvedPortEndpoint {
  kind: 'port';
  port: PortRef;
  block: Block;
  slot: Slot;
  typeDesc: TypeDesc;
}

/**
 * Resolved bus endpoint with bus and type information.
 */
export interface ResolvedBusEndpoint {
  kind: 'bus';
  busId: string;
  bus: Bus;
  typeDesc: TypeDesc;
}

/**
 * Union of resolved endpoint types.
 */
export type ResolvedEndpoint = ResolvedPortEndpoint | ResolvedBusEndpoint;

/**
 * Resolved binding with all endpoints resolved to their full objects.
 * Either succeeds (binding + from + to endpoints) or fails (error message).
 */
export type ResolvedBinding =
  | {
      success: true;
      binding: NormalizedBinding;
      from: ResolvedEndpoint;
      to: ResolvedEndpoint;
    }
  | {
      success: false;
      ref: BindingRef;
      error: string;
    };
