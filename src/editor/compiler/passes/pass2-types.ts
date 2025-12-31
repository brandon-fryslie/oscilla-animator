/**
 * Pass 2: Type Graph Construction
 *
 * Transforms a NormalizedPatch into a TypedPatch by:
 * 1. Converting SlotType strings to IR TypeDesc
 * 2. Validating bus type eligibility (only scalars can be buses)
 * 3. Enforcing reserved bus type constraints (phaseA, pulse, energy, palette)
 * 4. Precomputing type conversion paths for wired connections
 *
 * This pass establishes the type system foundation for all subsequent passes.
 *
 * References:
 * - HANDOFF.md Topic 3: Pass 2 - Type Graph
 * - design-docs/12-Compiler-Final/15-Canonical-Lowering-Pipeline.md § Pass 2
 */

import type {
  Block,
  Connection,
  Publisher,
  Listener,
  Bus,
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
  // Use 'special' world for compatibility with existing IR runtime
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
 * - special world: not bus-eligible
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

  // scalar and special are not bus-eligible
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
 * Compute type conversion path for wired connections.
 *
 * Returns an array of conversion steps needed to transform 'from' type to 'to' type.
 * Empty array means direct assignment (no conversion needed).
 * null means no conversion path exists.
 *
 * Current implementation:
 * - Direct compatibility → empty array (no conversion)
 * - Incompatible types → null (no conversion path)
 *
 * Future enhancements:
 * - Adapter chain computation (e.g., number→vec2 via broadcast adapter)
 * - Lens transformations
 * - Multi-step conversion paths
 *
 * @param fromType - Source type descriptor
 * @param toType - Target type descriptor
 * @returns Array of conversion step IDs, or null if no path exists
 */
function computeConversionPath(
  fromType: TypeDesc,
  toType: TypeDesc
): string[] | null {
  // Check if types are compatible (using compatibility rules)
  if (isTypeCompatible(fromType, toType)) {
    return []; // No conversion needed - direct assignment
  }

  // TODO: Future enhancement - query adapter registry for conversion chains
  // For example:
  // - number → vec2 (broadcast to both components)
  // - color → number (luminance extraction)
  // - vec2 → number (magnitude)
  //
  // This would involve:
  // 1. Graph search through adapter registry
  // 2. Cost-based path selection
  // 3. Validation of adapter applicability
  //
  // For now, we only support direct compatibility (no adapters)

  return null; // No conversion path exists
}

/**
 * Pass 2: Type Graph Construction
 *
 * Establishes types for every slot and bus, validates bus eligibility,
 * and precomputes conversion paths.
 *
 * @param normalized - The normalized patch from Pass 1
 * @returns A typed patch with type information, or throws on error
 */
export function pass2TypeGraph(
  normalized: NormalizedPatch<Block, Connection, Publisher, Listener, Bus>
): TypedPatch<Block, Connection, Publisher, Listener, Bus> {
  const errors: Pass2Error[] = [];

  // Step 1: Build bus type map and validate bus eligibility
  const busTypes = new Map<string, TypeDesc>();

  for (const bus of normalized.buses) {
    // Convert editor TypeDesc to core TypeDesc
    const busType = asTypeDesc(bus.type);

    // Validate bus eligibility
    if (!isBusEligible(busType)) {
      errors.push({
        kind: "BusIneligibleType",
        busId: bus.id,
        busName: bus.name,
        typeDesc: busType,
        message: `Bus '${bus.name}' (${bus.id}) has ineligible type ${busType.world}<${busType.domain}>. Only signal, event, and scalar-domain field types can be buses.`,
      });
    }

    // Validate reserved bus constraints
    const reservedError = validateReservedBus(bus.id, bus.name, busType);
    if (reservedError !== null) {
      errors.push(reservedError);
    }

    busTypes.set(bus.id, busType);
  }

  // Step 2: Validate all slot types can be parsed
  for (const block of normalized.blocks) {
    for (const slot of [...block.inputs, ...block.outputs]) {
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
  }

  // Step 3: Precompute conversion paths for wired connections
  const conversionPaths = new Map<Connection, readonly string[]>();

  for (const wire of normalized.wires) {
    // Find source and target blocks
    const fromBlock = normalized.blocks.find(
      (b: Block) => b.id === wire.from.blockId
    );
    const toBlock = normalized.blocks.find((b: Block) => b.id === wire.to.blockId);

    if (fromBlock === undefined || toBlock === undefined) {
      // Dangling connection - will be caught by Pass 4
      continue;
    }

    // Find source and target slots
    const fromSlot = fromBlock.outputs.find((s) => s.id === wire.from.slotId);
    const toSlot = toBlock.inputs.find((s) => s.id === wire.to.slotId);

    if (fromSlot === undefined || toSlot === undefined) {
      // Dangling slot reference - will be caught by Pass 4
      continue;
    }

    try {
      const fromType = slotTypeToTypeDesc(fromSlot.type);
      const toType = slotTypeToTypeDesc(toSlot.type);

      const path = computeConversionPath(fromType, toType);

      if (path === null) {
        errors.push({
          kind: "NoConversionPath",
          connectionId: wire.id,
          fromType,
          toType,
          message: `No conversion path from ${fromType.world}<${fromType.domain}> to ${toType.world}<${toType.domain}> for wire ${wire.id}`,
        });
      } else if (path.length > 0) {
        // Store non-empty conversion paths
        conversionPaths.set(wire, path);
      }
    } catch {
      // Type parsing error already recorded in step 2
      continue;
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
    busTypes,
    conversionPaths,
  };
}
