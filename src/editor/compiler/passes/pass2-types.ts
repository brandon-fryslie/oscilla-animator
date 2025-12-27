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
 * Parses patterns like "Signal<number>", "Field<vec2>", "Scalar:number".
 *
 * @param slotType - The slot type string from the editor
 * @returns A TypeDesc for the IR
 * @throws Error if the slot type cannot be parsed
 */
function slotTypeToTypeDesc(slotType: string): TypeDesc {
  // Pattern: Signal<domain>, Field<domain>, Event<domain>
  const worldMatch = slotType.match(/^(Signal|Field|Event)<(.+)>$/);
  if (worldMatch) {
    const world = worldMatch[1].toLowerCase();
    const domain = worldMatch[2];

    // Normalize domain aliases
    const normalizedDomain = normalizeDomain(domain);

    return {
      world: world as "signal" | "field" | "event",
      domain: normalizedDomain as TypeDomain,
    };
  }

  // Pattern: Scalar:domain
  const scalarMatch = slotType.match(/^Scalar:(.+)$/);
  if (scalarMatch) {
    const domain = scalarMatch[1];
    return {
      world: "scalar",
      domain: normalizeDomain(domain) as TypeDomain,
    };
  }

  // Special types without generic syntax
  const specialTypes: Record<string, TypeDesc> = {
    Scene: { world: "special", domain: "scene" },
    SceneTargets: { world: "special", domain: "sceneTargets" },
    SceneStrokes: { world: "special", domain: "sceneStrokes" },
    Domain: { world: "special", domain: "domain" },
    Program: { world: "special", domain: "program" },
    Render: { world: "special", domain: "renderTree" },
    RenderTree: { world: "special", domain: "renderTree" },
    CanvasRender: { world: "special", domain: "canvasRender" },
    RenderNode: { world: "special", domain: "renderNode" },
    "RenderNode[]": { world: "special", domain: "renderNode" },
    FilterDef: { world: "special", domain: "filterDef" },
    StrokeStyle: { world: "special", domain: "strokeStyle" },
    ElementCount: { world: "scalar", domain: "number" },
  };

  if (slotType in specialTypes) {
    return specialTypes[slotType];
  }

  throw new Error(`Unknown slot type: ${slotType}`);
}

/**
 * Normalize domain names to canonical IR domains.
 * Maps editor aliases to consistent IR domain names.
 */
function normalizeDomain(domain: string): string {
  const aliases: Record<string, string> = {
    Point: "vec2",
    Unit: "unit01",
    Time: "timeMs",
    PhaseSample: "phase01",
    any: "unknown",
  };

  return aliases[domain] || domain.toLowerCase();
}

/**
 * Check if a TypeDesc is eligible for bus usage.
 *
 * Rules:
 * - signal world: always bus-eligible
 * - field world: only if domain is scalar (number, boolean, color)
 * - scalar world: not bus-eligible (compile-time only)
 * - event world: bus-eligible (for event buses)
 * - special world: not bus-eligible
 */
export function isBusEligible(type: TypeDesc): boolean {
  if (type.world === "signal") {
    return true;
  }

  if (type.world === "event") {
    return true;
  }

  if (type.world === "field") {
    // Field is bus-eligible only for scalar domains
    const scalarDomains = ["number", "boolean", "color"];
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
 * - phaseA: signal<phase> - Phase has special invariants (wrap semantics, cycle-derived provenance)
 * - pulse: event<trigger> - Discrete events, not continuous signals (cleaner scheduling)
 * - energy: signal<number> - Continuous energy/amplitude
 * - palette: signal<color> - Color palette
 */
const RESERVED_BUS_CONSTRAINTS: Record<
  string,
  { world: string; domain: string; description: string }
> = {
  phaseA: {
    world: "signal",
    domain: "phase01",
    description: "Primary phase signal (0..1) with wrap semantics",
  },
  pulse: {
    world: "event",
    domain: "trigger",
    description: "Primary pulse/event trigger (discrete, not continuous)",
  },
  energy: {
    world: "signal",
    domain: "number",
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
  if (!constraint) {
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
 * Precompute type conversion paths for wired connections.
 * For now, we only support direct type equality.
 * TODO: Add adapter/lens chain computation in future passes.
 */
function computeConversionPath(
  fromType: TypeDesc,
  toType: TypeDesc
): string[] | null {
  // For MVP: require exact type match
  if (
    fromType.world === toType.world &&
    fromType.domain === toType.domain
  ) {
    return []; // No conversion needed
  }

  // TODO: Query adapter registry for conversion chains
  // For now, return null to indicate no conversion path exists
  return null;
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
    const busType = bus.type as TypeDesc;

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
    if (reservedError) {
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

    if (!fromBlock || !toBlock) {
      // Dangling connection - will be caught by Pass 4
      continue;
    }

    // Find source and target slots
    const fromSlot = fromBlock.outputs.find((s) => s.id === wire.from.slotId);
    const toSlot = toBlock.inputs.find((s) => s.id === wire.to.slotId);

    if (!fromSlot || !toSlot) {
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
