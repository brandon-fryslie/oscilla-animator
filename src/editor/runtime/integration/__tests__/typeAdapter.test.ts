/**
 * @file Type Adapter Tests
 * @description Comprehensive tests for compiler ↔ runtime type conversion
 */

import { describe, it, expect } from "vitest";
import type { TypeDesc as CompilerTypeDesc } from "../../../compiler/ir/types";
import type { TypeDesc as RuntimeTypeDesc } from "../../field/types";
import {
  compilerToRuntimeType,
  runtimeToCompilerType,
  batchCompilerToRuntimeTypes,
  areTypesCompatible,
  compilerToRuntimeTypeCached,
  isFieldType,
  canBroadcastToField,
  isDomainCompatible,
  UnsupportedTypeError,
  RuntimeTypeConversionError,
} from "../typeAdapter";

describe("Type Adapter - Compiler to Runtime", () => {
  describe("Field type conversions", () => {
    it("should convert number field type", () => {
      const compiler: CompilerTypeDesc = { world: "field", domain: "number" };
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "number" });
    });

    it("should convert vec2 field type", () => {
      const compiler: CompilerTypeDesc = { world: "field", domain: "vec2" };
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "vec2" });
    });

    it("should convert vec3 field type", () => {
      const compiler: CompilerTypeDesc = { world: "field", domain: "vec3" };
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "vec3" });
    });

    it("should convert vec4 field type", () => {
      const compiler: CompilerTypeDesc = { world: "field", domain: "vec4" };
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "vec4" });
    });

    it("should convert color field type", () => {
      const compiler: CompilerTypeDesc = { world: "field", domain: "color" };
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "color" });
    });

    it("should convert boolean field type", () => {
      const compiler: CompilerTypeDesc = { world: "field", domain: "boolean" };
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "boolean" });
    });
  });

  describe("Signal type conversions (for broadcast nodes)", () => {
    it("should convert signal number type", () => {
      const compiler: CompilerTypeDesc = { world: "signal", domain: "number" };
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "number" });
    });

    it("should convert signal vec2 type", () => {
      const compiler: CompilerTypeDesc = { world: "signal", domain: "vec2" };
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "vec2" });
    });

    it("should convert signal color type", () => {
      const compiler: CompilerTypeDesc = { world: "signal", domain: "color" };
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "color" });
    });
  });

  describe("Types with semantics and units", () => {
    it("should ignore semantics annotation", () => {
      const compiler: CompilerTypeDesc = {
        world: "field",
        domain: "number",
        semantics: "point",
      };
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "number" });
    });

    it("should ignore unit annotation", () => {
      const compiler: CompilerTypeDesc = {
        world: "field",
        domain: "number",
        unit: "px",
      };
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "number" });
    });

    it("should ignore both semantics and unit annotations", () => {
      const compiler: CompilerTypeDesc = {
        world: "field",
        domain: "vec2",
        semantics: "point",
        unit: "px",
      };
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "vec2" });
    });
  });

  describe("Unsupported type errors", () => {
    it("should throw for scalar world", () => {
      const compiler: CompilerTypeDesc = { world: "scalar", domain: "number" };
      expect(() => compilerToRuntimeType(compiler)).toThrow(
        UnsupportedTypeError
      );
      expect(() => compilerToRuntimeType(compiler)).toThrow(
        /Type world must be 'field' or 'signal'/
      );
    });

    it("should throw for special world", () => {
      const compiler: CompilerTypeDesc = { world: "special", domain: "domain" };
      expect(() => compilerToRuntimeType(compiler)).toThrow(
        UnsupportedTypeError
      );
    });

    it("should throw for event world", () => {
      const compiler: CompilerTypeDesc = { world: "event", domain: "trigger" };
      expect(() => compilerToRuntimeType(compiler)).toThrow(
        UnsupportedTypeError
      );
    });

    it("should throw for unsupported domain (timeMs)", () => {
      const compiler: CompilerTypeDesc = { world: "field", domain: "timeMs" };
      expect(() => compilerToRuntimeType(compiler)).toThrow(
        UnsupportedTypeError
      );
      expect(() => compilerToRuntimeType(compiler)).toThrow(
        /Domain 'timeMs' is not supported/
      );
    });

    it("should throw for unsupported domain (phase01)", () => {
      const compiler: CompilerTypeDesc = { world: "signal", domain: "phase01" };
      expect(() => compilerToRuntimeType(compiler)).toThrow(
        UnsupportedTypeError
      );
    });

    it("should throw for unsupported domain (domain)", () => {
      const compiler: CompilerTypeDesc = { world: "field", domain: "domain" };
      expect(() => compilerToRuntimeType(compiler)).toThrow(
        UnsupportedTypeError
      );
    });

    it("should include source and target types in error message", () => {
      const compiler: CompilerTypeDesc = { world: "scalar", domain: "number" };
      try {
        compilerToRuntimeType(compiler);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(UnsupportedTypeError);
        const err = error as UnsupportedTypeError;
        expect(err.message).toContain("world=scalar");
        expect(err.message).toContain("domain=number");
        expect(err.message).toContain("Supported domains:");
      }
    });
  });
});

describe("Type Adapter - Runtime to Compiler", () => {
  describe("Basic conversions", () => {
    it("should convert number to field number (default)", () => {
      const runtime: RuntimeTypeDesc = { kind: "number" };
      const compiler = runtimeToCompilerType(runtime);
      expect(compiler).toEqual({ world: "field", domain: "number" });
    });

    it("should convert vec2 to field vec2", () => {
      const runtime: RuntimeTypeDesc = { kind: "vec2" };
      const compiler = runtimeToCompilerType(runtime);
      expect(compiler).toEqual({ world: "field", domain: "vec2" });
    });

    it("should convert color to field color", () => {
      const runtime: RuntimeTypeDesc = { kind: "color" };
      const compiler = runtimeToCompilerType(runtime);
      expect(compiler).toEqual({ world: "field", domain: "color" });
    });

    it("should convert boolean to field boolean", () => {
      const runtime: RuntimeTypeDesc = { kind: "boolean" };
      const compiler = runtimeToCompilerType(runtime);
      expect(compiler).toEqual({ world: "field", domain: "boolean" });
    });

    it("should convert string to field string", () => {
      const runtime: RuntimeTypeDesc = { kind: "string" };
      const compiler = runtimeToCompilerType(runtime);
      expect(compiler).toEqual({ world: "field", domain: "string" });
    });
  });

  describe("World parameter", () => {
    it("should create signal types when world='signal'", () => {
      const runtime: RuntimeTypeDesc = { kind: "number" };
      const compiler = runtimeToCompilerType(runtime, "signal");
      expect(compiler).toEqual({ world: "signal", domain: "number" });
    });

    it("should create field types when world='field' (explicit)", () => {
      const runtime: RuntimeTypeDesc = { kind: "vec2" };
      const compiler = runtimeToCompilerType(runtime, "field");
      expect(compiler).toEqual({ world: "field", domain: "vec2" });
    });
  });

  describe("Error handling", () => {
    it("should throw for unknown runtime type kind", () => {
      const runtime = { kind: "unknown" } as any;
      expect(() => runtimeToCompilerType(runtime)).toThrow(
        RuntimeTypeConversionError
      );
    });

    it("should include runtime type in error message", () => {
      const runtime = { kind: "invalid" } as any;
      try {
        runtimeToCompilerType(runtime);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(RuntimeTypeConversionError);
        const err = error as RuntimeTypeConversionError;
        expect(err.message).toContain("kind=invalid");
      }
    });
  });
});

describe("Type Adapter - Batch Conversion", () => {
  it("should convert all supported types", () => {
    const compilerTypes: CompilerTypeDesc[] = [
      { world: "field", domain: "number" },
      { world: "field", domain: "vec2" },
      { world: "signal", domain: "color" },
    ];

    const results = batchCompilerToRuntimeTypes(compilerTypes);

    expect(results).toEqual([
      [0, { kind: "number" }],
      [1, { kind: "vec2" }],
      [2, { kind: "color" }],
    ]);
  });

  it("should skip unsupported types without throwing", () => {
    const compilerTypes: CompilerTypeDesc[] = [
      { world: "field", domain: "number" }, // Supported
      { world: "scalar", domain: "number" }, // Unsupported (world)
      { world: "field", domain: "vec2" }, // Supported
      { world: "field", domain: "domain" }, // Unsupported (domain)
    ];

    const results = batchCompilerToRuntimeTypes(compilerTypes);

    expect(results).toEqual([
      [0, { kind: "number" }],
      [2, { kind: "vec2" }],
    ]);
  });

  it("should return empty array for all unsupported types", () => {
    const compilerTypes: CompilerTypeDesc[] = [
      { world: "scalar", domain: "number" },
      { world: "special", domain: "domain" },
    ];

    const results = batchCompilerToRuntimeTypes(compilerTypes);

    expect(results).toEqual([]);
  });

  it("should preserve indices correctly", () => {
    const compilerTypes: CompilerTypeDesc[] = [
      { world: "scalar", domain: "number" }, // index 0, skipped
      { world: "field", domain: "number" }, // index 1, kept
      { world: "scalar", domain: "number" }, // index 2, skipped
      { world: "field", domain: "vec2" }, // index 3, kept
    ];

    const results = batchCompilerToRuntimeTypes(compilerTypes);

    expect(results.map(([idx]) => idx)).toEqual([1, 3]);
  });
});

describe("Type Adapter - Type Compatibility", () => {
  it("should return true for compatible types", () => {
    const compiler: CompilerTypeDesc = { world: "field", domain: "number" };
    const runtime: RuntimeTypeDesc = { kind: "number" };

    expect(areTypesCompatible(compiler, runtime)).toBe(true);
  });

  it("should return false for incompatible domains", () => {
    const compiler: CompilerTypeDesc = { world: "field", domain: "vec2" };
    const runtime: RuntimeTypeDesc = { kind: "number" };

    expect(areTypesCompatible(compiler, runtime)).toBe(false);
  });

  it("should return false for unsupported compiler types", () => {
    const compiler: CompilerTypeDesc = { world: "scalar", domain: "number" };
    const runtime: RuntimeTypeDesc = { kind: "number" };

    expect(areTypesCompatible(compiler, runtime)).toBe(false);
  });

  it("should handle signal types correctly", () => {
    const compiler: CompilerTypeDesc = { world: "signal", domain: "color" };
    const runtime: RuntimeTypeDesc = { kind: "color" };

    expect(areTypesCompatible(compiler, runtime)).toBe(true);
  });
});

describe("Type Adapter - Type Guards", () => {
  describe("isFieldType", () => {
    it("should return true for field types", () => {
      expect(isFieldType({ world: "field", domain: "number" })).toBe(true);
      expect(isFieldType({ world: "field", domain: "vec2" })).toBe(true);
    });

    it("should return false for non-field types", () => {
      expect(isFieldType({ world: "signal", domain: "number" })).toBe(false);
      expect(isFieldType({ world: "scalar", domain: "number" })).toBe(false);
      expect(isFieldType({ world: "special", domain: "domain" })).toBe(false);
    });
  });

  describe("canBroadcastToField", () => {
    it("should return true for signal types with field-compatible domains", () => {
      expect(canBroadcastToField({ world: "signal", domain: "number" })).toBe(
        true
      );
      expect(canBroadcastToField({ world: "signal", domain: "vec2" })).toBe(
        true
      );
      expect(canBroadcastToField({ world: "signal", domain: "color" })).toBe(
        true
      );
    });

    it("should return false for signal types with incompatible domains", () => {
      expect(canBroadcastToField({ world: "signal", domain: "timeMs" })).toBe(
        false
      );
      expect(canBroadcastToField({ world: "signal", domain: "phase01" })).toBe(
        false
      );
    });

    it("should return false for non-signal types", () => {
      expect(canBroadcastToField({ world: "field", domain: "number" })).toBe(
        false
      );
      expect(canBroadcastToField({ world: "scalar", domain: "number" })).toBe(
        false
      );
    });
  });

  describe("isDomainCompatible", () => {
    it("should return true for supported domains", () => {
      expect(isDomainCompatible("number")).toBe(true);
      expect(isDomainCompatible("vec2")).toBe(true);
      expect(isDomainCompatible("vec3")).toBe(true);
      expect(isDomainCompatible("vec4")).toBe(true);
      expect(isDomainCompatible("color")).toBe(true);
      expect(isDomainCompatible("boolean")).toBe(true);
    });

    it("should return false for unsupported domains", () => {
      expect(isDomainCompatible("timeMs")).toBe(false);
      expect(isDomainCompatible("phase01")).toBe(false);
      expect(isDomainCompatible("domain")).toBe(false);
      expect(isDomainCompatible("renderTree")).toBe(false);
      expect(isDomainCompatible("unknown")).toBe(false);
    });
  });
});

describe("Type Adapter - Caching", () => {
  it("should cache converted types", () => {
    const compiler: CompilerTypeDesc = { world: "field", domain: "number" };

    const result1 = compilerToRuntimeTypeCached(compiler);
    const result2 = compilerToRuntimeTypeCached(compiler);

    // Same object reference (cached)
    expect(result1).toBe(result2);
  });

  it("should return correct cached values", () => {
    const compiler: CompilerTypeDesc = { world: "field", domain: "vec2" };

    const result = compilerToRuntimeTypeCached(compiler);

    expect(result).toEqual({ kind: "vec2" });
  });

  it("should cache different types separately", () => {
    const compiler1: CompilerTypeDesc = { world: "field", domain: "number" };
    const compiler2: CompilerTypeDesc = { world: "field", domain: "vec2" };

    const result1 = compilerToRuntimeTypeCached(compiler1);
    const result2 = compilerToRuntimeTypeCached(compiler2);

    expect(result1).toEqual({ kind: "number" });
    expect(result2).toEqual({ kind: "vec2" });
    expect(result1).not.toBe(result2);
  });

  it("should throw for unsupported types even with caching", () => {
    const compiler: CompilerTypeDesc = { world: "scalar", domain: "number" };

    expect(() => compilerToRuntimeTypeCached(compiler)).toThrow(
      UnsupportedTypeError
    );
  });
});

describe("Type Adapter - Roundtrip Conversion", () => {
  it("should roundtrip field types correctly", () => {
    const original: CompilerTypeDesc = { world: "field", domain: "number" };
    const runtime = compilerToRuntimeType(original);
    const backToCompiler = runtimeToCompilerType(runtime, "field");

    expect(backToCompiler.world).toBe(original.world);
    expect(backToCompiler.domain).toBe(original.domain);
  });

  it("should roundtrip signal types correctly", () => {
    const original: CompilerTypeDesc = { world: "signal", domain: "vec2" };
    const runtime = compilerToRuntimeType(original);
    const backToCompiler = runtimeToCompilerType(runtime, "signal");

    expect(backToCompiler.world).toBe(original.world);
    expect(backToCompiler.domain).toBe(original.domain);
  });

  it("should lose semantics/unit in roundtrip (expected)", () => {
    const original: CompilerTypeDesc = {
      world: "field",
      domain: "number",
      semantics: "point",
      unit: "px",
    };
    const runtime = compilerToRuntimeType(original);
    const backToCompiler = runtimeToCompilerType(runtime, "field");

    expect(backToCompiler.semantics).toBeUndefined();
    expect(backToCompiler.unit).toBeUndefined();
  });
});
