/**
 * Pass 2: Type Graph Construction
 *
 * Transforms a NormalizedPatch into a TypedPatch by:
 * 1. Converting SlotType strings to IR TypeDesc
 * 2. Validating bus type eligibility (only scalars can be buses)
 * 3. Enforcing reserved bus type constraints (phaseA, pulse, energy, palette)
 * 4. Building block output types map
 *
 * This pass establishes the type system foundation for all subsequent passes.
 *
 * NOTE: After Bus-Block Unification (2026-01-02), all connections use unified edges.
 *
 * References:
 * - HANDOFF.md Topic 3: Pass 2 - Type Graph
 * - design-docs/12-Compiler-Final/15-Canonical-Lowering-Pipeline.md § Pass 2
 */

import type {
  Block,
  Edge,
  Endpoint,
} from "../../types";
import type { TypeDesc, TypeDomain } from "../ir/types";
import type { NormalizedPatch, TypedPatch } from "../ir";
import { domainFromString } from "../../ir/types/typeConversion";
import { asTypeDesc } from "../ir/types";

/**
 * Error types emitted by Pass 2.
 */
export interface PortTypeUnknownError {
  kind: "PortTypeUnknown";
  blockId: string;
  slotId: string;
  slotType: string;
  message: string;
}

export interface BusIneligibleTypeError {
  kind: "BusIneligibleType";
  busId: string;
  busName: string;
  typeDesc: TypeDesc;
  message: string;
}

export interface ReservedBusTypeViolationError {
  kind: "ReservedBusTypeViolation";
  busId: string;
  busName: string;
  expectedType: string;
  actualType: TypeDesc;
  message: string;
}

export interface NoConversionPathError {
  kind: "NoConversionPath";
  connectionId: string;
  fromType: TypeDesc;
  toType: TypeDesc;
  message: string;
}

export type Pass2Error =
  | PortTypeUnknownError
  | BusIneligibleTypeError
  | ReservedBusTypeViolationError
  | NoConversionPathError;

/**
 * Convert editor SlotType string to IR TypeDesc.
 * Parses patterns like "Signal<float>", "Field<vec2>", "Scalar:float".
 *
 * Uses canonical domain mapping from typeConversion.ts.
 *
 * @param slotType - The slot type string from the editor
 * @returns A TypeDesc for the IR
 * @throws Error if the slot type cannot be parsed
 */
function slotTypeToTypeDesc(slotType: string): TypeDesc {
  // Pattern: Signal<domain>, Field<domain>, Event<domain>
  const worldMatch = slotType.match(/^(Signal|Field|Event)<(.+)>$/);
  if (worldMatch !== null) {
    const world = worldMatch[1].toLowerCase();
    const domainStr = worldMatch[2];

    // Use canonical domain mapping from typeConversion.ts
    const domain = domainFromString(domainStr);

    return asTypeDesc({
      world: world as "signal" | "field" | "event",
      domain: domain as TypeDomain,
    });
  }

  // Pattern: Scalar:domain
  const scalarMatch = slotType.match(/^Scalar:(.+)$/);
  if (scalarMatch !== null) {
    const domainStr = scalarMatch[1];
    const domain = domainFromString(domainStr);
    return asTypeDesc({
      world: "scalar",
      domain: domain as TypeDomain,
    });
  }

  // Special types without generic syntax
  // Use 'config' world for compile-time types
  const specialTypes: Record<string, TypeDesc> = {
    Scene: { world: "config", domain: "scene", category: "internal", busEligible: false },
    SceneTargets: { world: "config", domain: "sceneTargets", category: "internal", busEligible: false },
    SceneStrokes: { world: "config", domain: "sceneStrokes", category: "internal", busEligible: false },
    Domain: { world: "config", domain: "domain", category: "internal", busEligible: false },
    Program: { world: "config", domain: "program", category: "internal", busEligible: false },
    Render: { world: "config", domain: "renderTree", category: "internal", busEligible: false },
    RenderTree: { world: "config", domain: "renderTree", category: "internal", busEligible: false },
    CanvasRender: { world: "config", domain: "canvasRender", category: "internal", busEligible: false },
    RenderNode: { world: "config", domain: "renderNode", category: "internal", busEligible: false },
    "RenderNode[]": { world: "config", domain: "renderNode", category: "internal", busEligible: false },
    FilterDef: { world: "config", domain: "filterDef", category: "internal", busEligible: false },
    StrokeStyle: { world: "config", domain: "strokeStyle", category: "internal", busEligible: false },
    ElementCount: { world: "scalar", domain: "int", category: "core", busEligible: true },
  };

  if (slotType in specialTypes) {
    return specialTypes[slotType];
  }

  throw new Error(`Unknown slot type: ${slotType}`);
}

/**
 * Check if a TypeDesc is eligible for bus usage.
 *
 * Rules:
 * - signal world: always bus-eligible
 * - field world: only if domain is scalar (float, int, boolean, color)
 * - scalar world: not bus-eligible (compile-time only)
 * - event world: bus-eligible (for event buses)
 * - config world: not bus-eligible
 */
export function isBusEligible(type: Pick<TypeDesc, 'world' | 'domain'>): boolean {
  if (type.world === "signal") {
    return true;
  }

  if (type.world === "event") {
    return true;
  }

  if (type.world === "field") {
    // Field is bus-eligible only for scalar domains
    const scalarDomains = ["float", "int", "boolean", "color"];
    return scalarDomains.includes(type.domain);
  }

  // scalar and config are not bus-eligible
  return false;
}

/**
 * Reserved bus constraints - canonical type definitions.
 * These buses have strict type requirements enforced by the compiler.
 *
 * Canonical types:
 * - phaseA: signal<float> - Phase has special invariants (wrap semantics, cycle-derived provenance)
 * - pulse: event<trigger> - Discrete events, not continuous signals (cleaner scheduling)
 * - energy: signal<number> - Continuous energy/amplitude
 * - energy: signal<float> - Continuous energy/amplitude
 * - palette: signal<color> - Color palette
 */
const RESERVED_BUS_CONSTRAINTS: Record<
  string,
  { world: string; domain: string; description: string }
> = {
  phaseA: {
    world: "signal",
    domain: "float",
    description: "Primary phase signal (0..1) with wrap semantics",
  },
  pulse: {
    world: "event",
    domain: "trigger",
    description: "Primary pulse/event trigger (discrete, not continuous)",
  },
  energy: {
    world: "signal",
    domain: "float",
    description: "Energy/amplitude signal (0..∞)",
  },
  palette: {
    world: "signal",
    domain: "color",
    description: "Color palette signal",
  },
};

/**
 * Validate reserved bus type constraints.
 */
function validateReservedBus(
  busId: string,
  busName: string,
  busType: TypeDesc
): ReservedBusTypeViolationError | null {
  const constraint = RESERVED_BUS_CONSTRAINTS[busName];
  if (constraint === undefined) {
    return null; // Not a reserved bus
  }

  // Check world and domain match
  if (
    busType.world !== constraint.world ||
    busType.domain !== constraint.domain
  ) {
    return {
      kind: "ReservedBusTypeViolation",
      busId,
      busName,
      expectedType: `${constraint.world}<${constraint.domain}>`,
      actualType: busType,
      message: `Reserved bus '${busName}' must have type ${constraint.world}<${constraint.domain}> (${constraint.description}), got ${busType.world}<${busType.domain}>`,
    };
  }

  return null;
}

/**
 * Type compatibility check for wired connections.
 * Determines if a value of type 'from' can be connected to a port expecting type 'to'.
 *
 * Compatibility rules:
 * 1. Exact match (same world + domain)
 * 2. Scalar can promote to Signal (same domain)
 * 3. Signal can broadcast to Field (same domain)
 * 4. Scalar can broadcast to Field via implicit signal promotion (same domain)
 * 5. Special domain compatibility (render types, sceneTargets→vec2)
 *
 * Note: In the IR type system, 'point' is normalized to 'vec2' by domainFromString(),
 * so we don't need special handling for point↔vec2 compatibility.
 *
 * @param from - Source type descriptor
 * @param to - Target type descriptor
 * @returns true if connection is compatible
 */
function isTypeCompatible(from: TypeDesc, to: TypeDesc): boolean {
  // Exact match (world + domain)
  if (from.world === to.world && from.domain === to.domain) {
    return true;
  }

  // Scalar can promote to Signal (same domain)
  if (from.world === "scalar" && to.world === "signal" && from.domain === to.domain) {
    return true;
  }

  // Signal can broadcast to Field (same domain)
  if (from.world === "signal" && to.world === "field" && from.domain === to.domain) {
    return true;
  }

  // Scalar can broadcast to Field via signal promotion (same domain)
  if (from.world === "scalar" && to.world === "field" && from.domain === to.domain) {
    return true;
  }

  // Special case: renderTree and renderNode are compatible
  const renderDomains: TypeDomain[] = ["renderTree", "renderNode"];
  if (renderDomains.includes(from.domain) && renderDomains.includes(to.domain)) {
    if (from.world === to.world) return true;
  }

  // Special case: sceneTargets can flow to vec2 (scene target points are positions)
  // Note: sceneTargets→point is also handled because point is normalized to vec2
  if (from.domain === "sceneTargets" && to.domain === "vec2") {
    if (from.world === to.world) return true;
  }

  return false;
}

/**
 * Get the type of an endpoint (port).
 * Bus-Block Unification: Endpoints are now only ports - buses are BusBlocks.
 */
function getEndpointType(
  endpoint: Endpoint,
  blocks: ReadonlyMap<string, unknown>,
  _busTypes: Map<string, TypeDesc>
): TypeDesc | null {
  // Bus-Block Unification: All endpoints are port kind now
  // Find the block and slot
  const blockData = blocks.get(endpoint.blockId);
  if (blockData === null || blockData === undefined) return null;

  const block = blockData as Block;
  const slot = [...block.inputs, ...block.outputs].find(s => s.id === endpoint.slotId);
  if (slot === null || slot === undefined) return null;

  try {
    return slotTypeToTypeDesc(slot.type);
  } catch {
    return null;
  }
}

/**
 * Pass 2: Type Graph Construction
 *
 * Establishes types for every slot and bus, validates bus eligibility,
 * and builds block output types map.
 *
 * @param normalized - The normalized patch from Pass 1
 * @returns A typed patch with type information, or throws on error
 */
export function pass2TypeGraph(
  normalized: NormalizedPatch
): TypedPatch {
  const errors: Pass2Error[] = [];

  // Step 1: Build bus type map from BusBlocks and validate bus eligibility
  // After Bus-Block Unification, bus info is in BusBlock params
  const busOutputTypes = new Map<string, TypeDesc>();

  // Use Array.from() to avoid downlevelIteration issues
  for (const blockData of Array.from(normalized.blocks.values())) {
    const block = blockData as Block;
    if (block.type !== 'BusBlock') continue;

    const busId = block.id;
    const busName = (block.params as Record<string, unknown>)?.busName as string | undefined ?? block.label ?? 'Unnamed';
    const busTypeDesc = (block.params as Record<string, unknown>)?.busType as { domain: string; world: string } | undefined;

    if (busTypeDesc == null) {
      // BusBlock without type info - skip (shouldn't happen)
      continue;
    }

    // Convert editor TypeDesc to core TypeDesc
    const busType = asTypeDesc({
      domain: busTypeDesc.domain as TypeDomain,
      world: busTypeDesc.world as 'signal' | 'field' | 'event' | 'scalar',
    });

    // Validate bus eligibility
    if (!isBusEligible(busType)) {
      errors.push({
        kind: "BusIneligibleType",
        busId,
        busName,
        typeDesc: busType,
        message: `Bus '${busName}' (${busId}) has ineligible type ${busType.world}<${busType.domain}>. Only signal, event, and scalar-domain field types can be buses.`,
      });
    }

    // Validate reserved bus constraints
    const reservedError = validateReservedBus(busId, busName, busType);
    if (reservedError !== null) {
      errors.push(reservedError);
    }

    busOutputTypes.set(busId, busType);
  }

  // Step 2: Build block output types map and validate all slot types can be parsed
  const blockOutputTypes = new Map<string, ReadonlyMap<string, TypeDesc>>();

  // Use Array.from() to avoid downlevelIteration issues
  for (const blockData of Array.from(normalized.blocks.values())) {
    const block = blockData as Block;
    const outputTypes = new Map<string, TypeDesc>();

    // Parse input types (for validation)
    for (const slot of block.inputs) {
      try {
        slotTypeToTypeDesc(slot.type);
      } catch (error) {
        errors.push({
          kind: "PortTypeUnknown",
          blockId: block.id,
          slotId: slot.id,
          slotType: slot.type,
          message: `Cannot parse slot type '${slot.type}' on block ${block.id}.${slot.id}: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    // Parse and store output types
    for (const slot of block.outputs) {
      try {
        const typeDesc = slotTypeToTypeDesc(slot.type);
        outputTypes.set(slot.id, typeDesc);
      } catch (error) {
        errors.push({
          kind: "PortTypeUnknown",
          blockId: block.id,
          slotId: slot.id,
          slotType: slot.type,
          message: `Cannot parse slot type '${slot.type}' on block ${block.id}.${slot.id}: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    blockOutputTypes.set(block.id, outputTypes);
  }

  // Step 3: Validate type compatibility for edges
  const edges: readonly Edge[] = normalized.edges ?? [];
  for (const edge of edges) {
    if (!edge.enabled) continue;

    // Get source and target types
    const fromType = getEndpointType(edge.from, normalized.blocks, busOutputTypes);
    const toType = getEndpointType(edge.to, normalized.blocks, busOutputTypes);

    if (fromType === null || toType === null) {
      // Dangling reference - will be caught by Pass 4
      continue;
    }

    // Check type compatibility
    if (!isTypeCompatible(fromType, toType)) {
      errors.push({
        kind: "NoConversionPath",
        connectionId: edge.id,
        fromType,
        toType,
        message: `Type mismatch: cannot connect ${fromType.world}<${fromType.domain}> to ${toType.world}<${toType.domain}> for edge ${edge.id}`,
      });
    }
  }

  // Throw if there are any errors
  if (errors.length > 0) {
    const errorSummary = errors
      .map((e) => `  - ${e.kind}: ${e.message}`)
      .join("\n");
    throw new Error(
      `Pass 2 (Type Graph) failed with ${errors.length} error(s):\n${errorSummary}`
    );
  }

  // Return typed patch
  return {
    ...normalized,
    blockOutputTypes,
    busOutputTypes: busOutputTypes.size > 0 ? busOutputTypes : undefined,
  };
}
