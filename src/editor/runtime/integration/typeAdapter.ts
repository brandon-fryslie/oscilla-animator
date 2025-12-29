/**
 * @file Type Adapter - Compiler IR TypeDesc ↔ Runtime TypeDesc Conversion
 * @description
 * This module provides bidirectional type conversion between the compiler IR
 * type system and the runtime field materialization type system.
 *
 * **IMPORTANT**: The compiler TypeDesc is the authoritative source.
 * The primary flow is: Compiler TypeDesc → Runtime TypeDesc
 * The reverse direction exists only for debugging and error messages.
 *
 * References:
 * - design-docs/12-Compiler-Final/02-IR-Schema.md §1 (Compiler types)
 * - src/editor/runtime/field/types.ts (Runtime types)
 */

import type { TypeDesc as CompilerTypeDesc } from "../../compiler/ir/types";
import type { TypeDesc as RuntimeTypeDesc } from "../field/types";

// =============================================================================
// Error Types
// =============================================================================

/**
 * Thrown when a compiler type cannot be converted to runtime type
 */
export class UnsupportedTypeError extends Error {
  readonly compilerType: CompilerTypeDesc;
  readonly reason: string;

  constructor(compilerType: CompilerTypeDesc, reason: string) {
    super(
      `Cannot convert compiler type to runtime type: ${reason}\n` +
        `Compiler type: world=${compilerType.world}, domain=${compilerType.domain}\n` +
        `Supported domains: number, vec2, vec3, vec4, color, boolean`
    );
    this.compilerType = compilerType;
    this.reason = reason;
    this.name = "UnsupportedTypeError";
  }
}

/**
 * Thrown when a runtime type cannot be converted to compiler type
 */
export class RuntimeTypeConversionError extends Error {
  readonly runtimeType: RuntimeTypeDesc;
  readonly reason: string;

  constructor(runtimeType: RuntimeTypeDesc, reason: string) {
    super(
      `Cannot convert runtime type to compiler type: ${reason}\n` +
        `Runtime type: kind=${runtimeType.kind}`
    );
    this.runtimeType = runtimeType;
    this.reason = reason;
    this.name = "RuntimeTypeConversionError";
  }
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a compiler type can be materialized as a field
 */
export function isFieldType(type: CompilerTypeDesc): boolean {
  return type.world === "field";
}

/**
 * Check if a compiler type can be broadcast to a field
 * (signal types with field-compatible domains)
 */
export function canBroadcastToField(type: CompilerTypeDesc): boolean {
  return (
    type.world === "signal" &&
    isDomainCompatible(type.domain)
  );
}

/**
 * Check if a domain is compatible with runtime field materialization
 */
export function isDomainCompatible(domain: string): boolean {
  return (
    domain === "number" ||
    domain === "vec2" ||
    domain === "vec3" ||
    domain === "vec4" ||
    domain === "color" ||
    domain === "boolean"
  );
}

// =============================================================================
// Compiler → Runtime Conversion (Primary Path)
// =============================================================================

/**
 * Convert compiler TypeDesc to runtime TypeDesc.
 *
 * This is the primary conversion path. The compiler type system is authoritative,
 * and this function maps it to the simpler runtime type representation.
 *
 * @throws {UnsupportedTypeError} if the compiler type cannot be converted
 */
export function compilerToRuntimeType(
  compilerType: CompilerTypeDesc
): RuntimeTypeDesc {
  // Only field and signal types can be materialized
  if (compilerType.world !== "field" && compilerType.world !== "signal") {
    throw new UnsupportedTypeError(
      compilerType,
      `Type world must be 'field' or 'signal', got '${compilerType.world}'`
    );
  }

  // Map domain to runtime type kind
  switch (compilerType.domain) {
    case "number":
      return { kind: "number" };
    case "vec2":
      return { kind: "vec2" };
    case "vec3":
      return { kind: "vec3" };
    case "vec4":
      return { kind: "vec4" };
    case "color":
      return { kind: "color" };
    case "boolean":
      return { kind: "boolean" };
    default:
      throw new UnsupportedTypeError(
        compilerType,
        `Domain '${compilerType.domain}' is not supported for field materialization`
      );
  }
}

/**
 * Batch convert an array of compiler types to runtime types.
 *
 * Useful for converting all field types in a FieldExprTable.
 * Filters out unsupported types and returns only the successfully converted ones.
 *
 * @returns Array of [index, runtimeType] pairs for successfully converted types
 */
export function batchCompilerToRuntimeTypes(
  compilerTypes: readonly CompilerTypeDesc[]
): Array<[number, RuntimeTypeDesc]> {
  const results: Array<[number, RuntimeTypeDesc]> = [];

  for (let i = 0; i < compilerTypes.length; i++) {
    try {
      const runtimeType = compilerToRuntimeType(compilerTypes[i]);
      results.push([i, runtimeType]);
    } catch (error) {
      // Skip unsupported types (they may be special/domain/etc)
      if (!(error instanceof UnsupportedTypeError)) {
        throw error;
      }
    }
  }

  return results;
}

// =============================================================================
// Runtime → Compiler Conversion (Debug/Error Messages Only)
// =============================================================================

/**
 * Convert runtime TypeDesc to compiler TypeDesc.
 *
 * **NOTE**: This is for debugging and error messages only.
 * The compiler type system is richer (has world/semantics/unit),
 * so this conversion makes assumptions about the world.
 *
 * @param world - The type world to use (defaults to 'field')
 */
export function runtimeToCompilerType(
  runtimeType: RuntimeTypeDesc,
  world: "field" | "signal" = "field"
): CompilerTypeDesc {
  // Map runtime kind to compiler domain
  switch (runtimeType.kind) {
    case "number":
      return { world, domain: "number" };
    case "vec2":
      return { world, domain: "vec2" };
    case "vec3":
      return { world, domain: "vec3" };
    case "vec4":
      return { world, domain: "vec4" };
    case "color":
      return { world, domain: "color" };
    case "boolean":
      return { world, domain: "boolean" };
    case "string":
      return { world, domain: "string" };
    default:
      throw new RuntimeTypeConversionError(
        runtimeType,
        `Unknown runtime type kind: ${String((runtimeType as { kind: unknown }).kind)}`
      );
  }
}

// =============================================================================
// Type Comparison
// =============================================================================

/**
 * Check if a compiler type and runtime type are compatible.
 *
 * Returns true if the compiler type can be successfully converted to the runtime type.
 */
export function areTypesCompatible(
  compilerType: CompilerTypeDesc,
  runtimeType: RuntimeTypeDesc
): boolean {
  try {
    const converted = compilerToRuntimeType(compilerType);
    return converted.kind === runtimeType.kind;
  } catch {
    return false;
  }
}

// =============================================================================
// Performance Optimization: Type Conversion Cache
// =============================================================================

/**
 * Cache for common type conversions.
 *
 * Uses WeakMap so entries are GC'd when compiler types are no longer referenced.
 * This avoids repeated conversion of the same types.
 */
const conversionCache = new WeakMap<CompilerTypeDesc, RuntimeTypeDesc>();

/**
 * Convert compiler type to runtime type with caching.
 *
 * Use this for hot paths where the same types are converted repeatedly.
 */
export function compilerToRuntimeTypeCached(
  compilerType: CompilerTypeDesc
): RuntimeTypeDesc {
  const cached = conversionCache.get(compilerType);
  if (cached !== undefined) {
    return cached;
  }

  const converted = compilerToRuntimeType(compilerType);
  conversionCache.set(compilerType, converted);
  return converted;
}
