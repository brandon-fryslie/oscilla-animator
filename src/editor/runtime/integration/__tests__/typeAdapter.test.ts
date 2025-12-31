/**
 * @file Type Adapter Tests
 * @description Comprehensive tests for compiler ↔ runtime type conversion
 */

import { describe, it, expect } from "vitest";
<<<<<<< HEAD
<<<<<<< HEAD
import type { TypeDesc as CompilerTypeDesc } from "../../../compiler/ir/types";
import { asTypeDesc } from "../../../compiler/ir/types";
import type { TypeDesc as RuntimeTypeDesc } from "../../field/types";

// Helper to create valid CompilerTypeDesc from partial spec
function makeCompilerType(world: CompilerTypeDesc["world"], domain: CompilerTypeDesc["domain"], extras?: Partial<CompilerTypeDesc>): CompilerTypeDesc {
  return asTypeDesc({ world, domain, ...extras });
}
=======
=======
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
import type { TypeDesc } from as CompilerTypeDesc } from "../../../compiler/ir/types";;
import { asTypeDesc } from
import type { TypeDesc } from as RuntimeTypeDesc } from "../../field/types";;
import { asTypeDesc } from
<<<<<<< HEAD
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
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
<<<<<<< HEAD
<<<<<<< HEAD
      const compiler = makeCompilerType("field", "float");
=======
      const compiler: CompilerTypeDesc = { world: "field", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      const compiler: CompilerTypeDesc = { world: "field", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "number" });
    });

    it("should convert vec2 field type", () => {
<<<<<<< HEAD
<<<<<<< HEAD
      const compiler = makeCompilerType("field", "vec2");
=======
      const compiler: CompilerTypeDesc = { world: "field", domain: "vec2", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      const compiler: CompilerTypeDesc = { world: "field", domain: "vec2", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "vec2" });
    });

    it("should convert vec3 field type", () => {
<<<<<<< HEAD
<<<<<<< HEAD
      const compiler = makeCompilerType("field", "vec3");
=======
      const compiler: CompilerTypeDesc = { world: "field", domain: "vec3", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      const compiler: CompilerTypeDesc = { world: "field", domain: "vec3", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "vec3" });
    });

    it("should convert vec4 field type", () => {
<<<<<<< HEAD
<<<<<<< HEAD
      const compiler = makeCompilerType("field", "vec4");
=======
      const compiler: CompilerTypeDesc = { world: "field", domain: "vec4", category: "internal", busEligible: false };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      const compiler: CompilerTypeDesc = { world: "field", domain: "vec4", category: "internal", busEligible: false };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "vec4" });
    });

    it("should convert color field type", () => {
<<<<<<< HEAD
<<<<<<< HEAD
      const compiler = makeCompilerType("field", "color");
=======
      const compiler: CompilerTypeDesc = { world: "field", domain: "color", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      const compiler: CompilerTypeDesc = { world: "field", domain: "color", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "color" });
    });

    it("should convert boolean field type", () => {
<<<<<<< HEAD
<<<<<<< HEAD
      const compiler = makeCompilerType("field", "boolean");
=======
      const compiler: CompilerTypeDesc = { world: "field", domain: "boolean", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      const compiler: CompilerTypeDesc = { world: "field", domain: "boolean", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "boolean" });
    });
  });

  describe("Signal type conversions (for broadcast nodes)", () => {
    it("should convert signal number type", () => {
<<<<<<< HEAD
<<<<<<< HEAD
      const compiler = makeCompilerType("signal", "float");
=======
      const compiler: CompilerTypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      const compiler: CompilerTypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "number" });
    });

    it("should convert signal vec2 type", () => {
<<<<<<< HEAD
<<<<<<< HEAD
      const compiler = makeCompilerType("signal", "vec2");
=======
      const compiler: CompilerTypeDesc = { world: "signal", domain: "vec2", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      const compiler: CompilerTypeDesc = { world: "signal", domain: "vec2", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "vec2" });
    });

    it("should convert signal color type", () => {
<<<<<<< HEAD
<<<<<<< HEAD
      const compiler = makeCompilerType("signal", "color");
=======
      const compiler: CompilerTypeDesc = { world: "signal", domain: "color", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      const compiler: CompilerTypeDesc = { world: "signal", domain: "color", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "color" });
    });
  });

  describe("Types with semantics and units", () => {
    it("should ignore semantics annotation", () => {
      const compiler = makeCompilerType("field", "float", { semantics: "point" });
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "number" });
    });

    it("should ignore unit annotation", () => {
      const compiler = makeCompilerType("field", "float", { unit: "px" });
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "number" });
    });

    it("should ignore both semantics and unit annotations", () => {
      const compiler = makeCompilerType("field", "vec2", { semantics: "point", unit: "px" });
      const runtime = compilerToRuntimeType(compiler);
      expect(runtime).toEqual({ kind: "vec2" });
    });
  });

  describe("Unsupported type errors", () => {
    it("should throw for scalar world", () => {
<<<<<<< HEAD
<<<<<<< HEAD
      const compiler = makeCompilerType("scalar", "float");
=======
      const compiler: CompilerTypeDesc = { world: "scalar", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      const compiler: CompilerTypeDesc = { world: "scalar", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      expect(() => compilerToRuntimeType(compiler)).toThrow(
        UnsupportedTypeError
      );
      expect(() => compilerToRuntimeType(compiler)).toThrow(
        /Type world must be 'field' or 'signal'/
      );
    });

    it("should throw for special world", () => {
<<<<<<< HEAD
<<<<<<< HEAD
      const compiler = makeCompilerType("special", "domain");
=======
      const compiler: CompilerTypeDesc = { world: "config", domain: "domain", category: "internal", busEligible: false };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      const compiler: CompilerTypeDesc = { world: "config", domain: "domain", category: "internal", busEligible: false };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      expect(() => compilerToRuntimeType(compiler)).toThrow(
        UnsupportedTypeError
      );
    });

    it("should throw for event world", () => {
<<<<<<< HEAD
<<<<<<< HEAD
      const compiler = makeCompilerType("event", "trigger");
=======
      const compiler: CompilerTypeDesc = { world: "event", domain: "trigger", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      const compiler: CompilerTypeDesc = { world: "event", domain: "trigger", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      expect(() => compilerToRuntimeType(compiler)).toThrow(
        UnsupportedTypeError
      );
    });

    it("should throw for unsupported domain (timeMs)", () => {
<<<<<<< HEAD
<<<<<<< HEAD
      const compiler = makeCompilerType("field", "timeMs");
=======
      const compiler: CompilerTypeDesc = { world: "field", domain: "timeMs", category: "internal", busEligible: false };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      const compiler: CompilerTypeDesc = { world: "field", domain: "timeMs", category: "internal", busEligible: false };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      expect(() => compilerToRuntimeType(compiler)).toThrow(
        UnsupportedTypeError
      );
      expect(() => compilerToRuntimeType(compiler)).toThrow(
        /Domain 'timeMs' is not supported/
      );
    });

    it("should throw for unsupported domain (phaseSample)", () => {
<<<<<<< HEAD
<<<<<<< HEAD
      const compiler = makeCompilerType("signal", "phaseSample");
=======
      const compiler: CompilerTypeDesc = { world: "signal", domain: "phaseSample", category: "internal", busEligible: false };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      const compiler: CompilerTypeDesc = { world: "signal", domain: "phaseSample", category: "internal", busEligible: false };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      expect(() => compilerToRuntimeType(compiler)).toThrow(
        UnsupportedTypeError
      );
    });

    it("should throw for unsupported domain (domain)", () => {
<<<<<<< HEAD
<<<<<<< HEAD
      const compiler = makeCompilerType("field", "domain");
=======
      const compiler: CompilerTypeDesc = { world: "field", domain: "domain", category: "internal", busEligible: false };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      const compiler: CompilerTypeDesc = { world: "field", domain: "domain", category: "internal", busEligible: false };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      expect(() => compilerToRuntimeType(compiler)).toThrow(
        UnsupportedTypeError
      );
    });

    it("should include source and target types in error message", () => {
<<<<<<< HEAD
<<<<<<< HEAD
      const compiler = makeCompilerType("scalar", "float");
=======
      const compiler: CompilerTypeDesc = { world: "scalar", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      const compiler: CompilerTypeDesc = { world: "scalar", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      try {
        compilerToRuntimeType(compiler);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(UnsupportedTypeError);
        const err = error as UnsupportedTypeError;
        expect(err.message).toContain("world=scalar");
        expect(err.message).toContain("domain=float");
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
<<<<<<< HEAD
<<<<<<< HEAD
      expect(compiler.world).toBe("field");
      expect(compiler.domain).toBe("float");
=======
      expect(compiler).toEqual({ world: "field", domain: "float", category: "core", busEligible: true });
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      expect(compiler).toEqual({ world: "field", domain: "float", category: "core", busEligible: true });
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
    });

    it("should convert vec2 to field vec2", () => {
      const runtime: RuntimeTypeDesc = { kind: "vec2" };
      const compiler = runtimeToCompilerType(runtime);
<<<<<<< HEAD
<<<<<<< HEAD
      expect(compiler.world).toBe("field");
      expect(compiler.domain).toBe("vec2");
=======
      expect(compiler).toEqual({ world: "field", domain: "vec2", category: "core", busEligible: true });
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      expect(compiler).toEqual({ world: "field", domain: "vec2", category: "core", busEligible: true });
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
    });

    it("should convert color to field color", () => {
      const runtime: RuntimeTypeDesc = { kind: "color" };
      const compiler = runtimeToCompilerType(runtime);
<<<<<<< HEAD
<<<<<<< HEAD
      expect(compiler.world).toBe("field");
      expect(compiler.domain).toBe("color");
=======
      expect(compiler).toEqual({ world: "field", domain: "color", category: "core", busEligible: true });
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      expect(compiler).toEqual({ world: "field", domain: "color", category: "core", busEligible: true });
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
    });

    it("should convert boolean to field boolean", () => {
      const runtime: RuntimeTypeDesc = { kind: "boolean" };
      const compiler = runtimeToCompilerType(runtime);
<<<<<<< HEAD
<<<<<<< HEAD
      expect(compiler.world).toBe("field");
      expect(compiler.domain).toBe("boolean");
=======
      expect(compiler).toEqual({ world: "field", domain: "boolean", category: "core", busEligible: true });
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      expect(compiler).toEqual({ world: "field", domain: "boolean", category: "core", busEligible: true });
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
    });

    it("should convert string to field string", () => {
      const runtime: RuntimeTypeDesc = { kind: "string" };
      const compiler = runtimeToCompilerType(runtime);
<<<<<<< HEAD
<<<<<<< HEAD
      expect(compiler.world).toBe("field");
      expect(compiler.domain).toBe("string");
=======
      expect(compiler).toEqual({ world: "field", domain: "string", category: "internal", busEligible: false });
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      expect(compiler).toEqual({ world: "field", domain: "string", category: "internal", busEligible: false });
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
    });
  });

  describe("World parameter", () => {
    it("should create signal types when world='signal'", () => {
      const runtime: RuntimeTypeDesc = { kind: "number" };
      const compiler = runtimeToCompilerType(runtime, "signal");
<<<<<<< HEAD
<<<<<<< HEAD
      expect(compiler.world).toBe("signal");
      expect(compiler.domain).toBe("float");
=======
      expect(compiler).toEqual({ world: "signal", domain: "float", category: "core", busEligible: true });
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      expect(compiler).toEqual({ world: "signal", domain: "float", category: "core", busEligible: true });
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
    });

    it("should create field types when world='field' (explicit)", () => {
      const runtime: RuntimeTypeDesc = { kind: "vec2" };
      const compiler = runtimeToCompilerType(runtime, "field");
<<<<<<< HEAD
<<<<<<< HEAD
      expect(compiler.world).toBe("field");
      expect(compiler.domain).toBe("vec2");
=======
      expect(compiler).toEqual({ world: "field", domain: "vec2", category: "core", busEligible: true });
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      expect(compiler).toEqual({ world: "field", domain: "vec2", category: "core", busEligible: true });
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
    });
  });

  describe("Error handling", () => {
    it("should throw for unknown runtime type kind", () => {
      const runtime = { kind: "unknown" } as unknown as RuntimeTypeDesc;
      expect(() => runtimeToCompilerType(runtime)).toThrow(
        RuntimeTypeConversionError
      );
    });

    it("should include runtime type in error message", () => {
      const runtime = { kind: "invalid" } as unknown as RuntimeTypeDesc;
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
<<<<<<< HEAD
<<<<<<< HEAD
      makeCompilerType("field", "float"),
      makeCompilerType("field", "vec2"),
      makeCompilerType("signal", "color"),
=======
      { world: "field", domain: "float", category: "core", busEligible: true },
      { world: "field", domain: "vec2", category: "core", busEligible: true },
      { world: "signal", domain: "color", category: "core", busEligible: true },
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      { world: "field", domain: "float", category: "core", busEligible: true },
      { world: "field", domain: "vec2", category: "core", busEligible: true },
      { world: "signal", domain: "color", category: "core", busEligible: true },
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
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
<<<<<<< HEAD
<<<<<<< HEAD
      makeCompilerType("field", "float"), // Supported
      makeCompilerType("scalar", "float"), // Unsupported (world)
      makeCompilerType("field", "vec2"), // Supported
      makeCompilerType("field", "domain"), // Unsupported (domain)
=======
=======
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      { world: "field", domain: "float", category: "core", busEligible: true }, // Supported
      { world: "scalar", domain: "float", category: "core", busEligible: true }, // Unsupported (world)
      { world: "field", domain: "vec2", category: "core", busEligible: true }, // Supported
      { world: "field", domain: "domain", category: "internal", busEligible: false }, // Unsupported (domain)
<<<<<<< HEAD
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
    ];

    const results = batchCompilerToRuntimeTypes(compilerTypes);

    expect(results).toEqual([
      [0, { kind: "number" }],
      [2, { kind: "vec2" }],
    ]);
  });

  it("should return empty array for all unsupported types", () => {
    const compilerTypes: CompilerTypeDesc[] = [
<<<<<<< HEAD
<<<<<<< HEAD
      makeCompilerType("scalar", "float"),
      makeCompilerType("special", "domain"),
=======
      { world: "scalar", domain: "float", category: "core", busEligible: true },
      { world: "config", domain: "domain", category: "internal", busEligible: false },
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      { world: "scalar", domain: "float", category: "core", busEligible: true },
      { world: "config", domain: "domain", category: "internal", busEligible: false },
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
    ];

    const results = batchCompilerToRuntimeTypes(compilerTypes);

    expect(results).toEqual([]);
  });

  it("should preserve indices correctly", () => {
    const compilerTypes: CompilerTypeDesc[] = [
<<<<<<< HEAD
<<<<<<< HEAD
      makeCompilerType("scalar", "float"), // index 0, skipped
      makeCompilerType("field", "float"), // index 1, kept
      makeCompilerType("scalar", "float"), // index 2, skipped
      makeCompilerType("field", "vec2"), // index 3, kept
=======
=======
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      { world: "scalar", domain: "float", category: "core", busEligible: true }, // index 0, skipped
      { world: "field", domain: "float", category: "core", busEligible: true }, // index 1, kept
      { world: "scalar", domain: "float", category: "core", busEligible: true }, // index 2, skipped
      { world: "field", domain: "vec2", category: "core", busEligible: true }, // index 3, kept
<<<<<<< HEAD
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
    ];

    const results = batchCompilerToRuntimeTypes(compilerTypes);

    expect(results.map(([idx]) => idx)).toEqual([1, 3]);
  });
});

describe("Type Adapter - Type Compatibility", () => {
  it("should return true for compatible types", () => {
<<<<<<< HEAD
<<<<<<< HEAD
    const compiler = makeCompilerType("field", "float");
=======
    const compiler: CompilerTypeDesc = { world: "field", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
    const compiler: CompilerTypeDesc = { world: "field", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
    const runtime: RuntimeTypeDesc = { kind: "number" };

    expect(areTypesCompatible(compiler, runtime)).toBe(true);
  });

  it("should return false for incompatible domains", () => {
<<<<<<< HEAD
<<<<<<< HEAD
    const compiler = makeCompilerType("field", "vec2");
=======
    const compiler: CompilerTypeDesc = { world: "field", domain: "vec2", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
    const compiler: CompilerTypeDesc = { world: "field", domain: "vec2", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
    const runtime: RuntimeTypeDesc = { kind: "number" };

    expect(areTypesCompatible(compiler, runtime)).toBe(false);
  });

  it("should return false for unsupported compiler types", () => {
<<<<<<< HEAD
<<<<<<< HEAD
    const compiler = makeCompilerType("scalar", "float");
=======
    const compiler: CompilerTypeDesc = { world: "scalar", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
    const compiler: CompilerTypeDesc = { world: "scalar", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
    const runtime: RuntimeTypeDesc = { kind: "number" };

    expect(areTypesCompatible(compiler, runtime)).toBe(false);
  });

  it("should handle signal types correctly", () => {
<<<<<<< HEAD
<<<<<<< HEAD
    const compiler = makeCompilerType("signal", "color");
=======
    const compiler: CompilerTypeDesc = { world: "signal", domain: "color", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
    const compiler: CompilerTypeDesc = { world: "signal", domain: "color", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
    const runtime: RuntimeTypeDesc = { kind: "color" };

    expect(areTypesCompatible(compiler, runtime)).toBe(true);
  });
});

describe("Type Adapter - Type Guards", () => {
  describe("isFieldType", () => {
    it("should return true for field types", () => {
<<<<<<< HEAD
<<<<<<< HEAD
      expect(isFieldType(makeCompilerType("field", "float"))).toBe(true);
      expect(isFieldType(makeCompilerType("field", "vec2"))).toBe(true);
    });

    it("should return false for non-field types", () => {
      expect(isFieldType(makeCompilerType("signal", "float"))).toBe(false);
      expect(isFieldType(makeCompilerType("scalar", "float"))).toBe(false);
      expect(isFieldType(makeCompilerType("special", "domain"))).toBe(false);
=======
      expect(isFieldType({ world: "field", domain: "float", category: "core", busEligible: true })).toBe(true);
      expect(isFieldType({ world: "field", domain: "vec2", category: "core", busEligible: true })).toBe(true);
    });

    it("should return false for non-field types", () => {
      expect(isFieldType({ world: "signal", domain: "float", category: "core", busEligible: true })).toBe(false);
      expect(isFieldType({ world: "scalar", domain: "float", category: "core", busEligible: true })).toBe(false);
      expect(isFieldType({ world: "config", domain: "domain", category: "internal", busEligible: false })).toBe(false);
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      expect(isFieldType({ world: "field", domain: "float", category: "core", busEligible: true })).toBe(true);
      expect(isFieldType({ world: "field", domain: "vec2", category: "core", busEligible: true })).toBe(true);
    });

    it("should return false for non-field types", () => {
      expect(isFieldType({ world: "signal", domain: "float", category: "core", busEligible: true })).toBe(false);
      expect(isFieldType({ world: "scalar", domain: "float", category: "core", busEligible: true })).toBe(false);
      expect(isFieldType({ world: "config", domain: "domain", category: "internal", busEligible: false })).toBe(false);
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
    });
  });

  describe("canBroadcastToField", () => {
    it("should return true for signal types with field-compatible domains", () => {
<<<<<<< HEAD
<<<<<<< HEAD
      expect(canBroadcastToField(makeCompilerType("signal", "float"))).toBe(true);
      expect(canBroadcastToField(makeCompilerType("signal", "vec2"))).toBe(true);
      expect(canBroadcastToField(makeCompilerType("signal", "color"))).toBe(true);
    });

    it("should return false for signal types with incompatible domains", () => {
      expect(canBroadcastToField(makeCompilerType("signal", "timeMs"))).toBe(false);
      expect(canBroadcastToField(makeCompilerType("signal", "phaseSample"))).toBe(false);
    });

    it("should return false for non-signal types", () => {
      expect(canBroadcastToField(makeCompilerType("field", "float"))).toBe(false);
      expect(canBroadcastToField(makeCompilerType("scalar", "float"))).toBe(false);
=======
=======
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      expect(canBroadcastToField({ world: "signal", domain: "float", category: "core", busEligible: true })).toBe(
        true
      );
      expect(canBroadcastToField({ world: "signal", domain: "vec2", category: "core", busEligible: true })).toBe(
        true
      );
      expect(canBroadcastToField({ world: "signal", domain: "color", category: "core", busEligible: true })).toBe(
        true
      );
    });

    it("should return false for signal types with incompatible domains", () => {
      expect(canBroadcastToField({ world: "signal", domain: "timeMs", category: "internal", busEligible: false })).toBe(
        false
      );
      expect(canBroadcastToField({ world: "signal", domain: "phaseSample", category: "internal", busEligible: false })).toBe(
        false
      );
    });

    it("should return false for non-signal types", () => {
      expect(canBroadcastToField({ world: "field", domain: "float", category: "core", busEligible: true })).toBe(
        false
      );
      expect(canBroadcastToField({ world: "scalar", domain: "float", category: "core", busEligible: true })).toBe(
        false
      );
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
    });
  });

  describe("isDomainCompatible", () => {
    it("should return true for supported domains", () => {
      expect(isDomainCompatible("float")).toBe(true);
      expect(isDomainCompatible("vec2")).toBe(true);
      expect(isDomainCompatible("vec3")).toBe(true);
      expect(isDomainCompatible("vec4")).toBe(true);
      expect(isDomainCompatible("color")).toBe(true);
      expect(isDomainCompatible("boolean")).toBe(true);
    });

    it("should return false for unsupported domains", () => {
      expect(isDomainCompatible("timeMs")).toBe(false);
      expect(isDomainCompatible("phaseSample")).toBe(false);
      expect(isDomainCompatible("domain")).toBe(false);
      expect(isDomainCompatible("renderTree")).toBe(false);
      expect(isDomainCompatible("unknown")).toBe(false);
    });
  });
});

describe("Type Adapter - Caching", () => {
  it("should cache converted types", () => {
<<<<<<< HEAD
<<<<<<< HEAD
    const compiler = makeCompilerType("field", "float");
=======
    const compiler: CompilerTypeDesc = { world: "field", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
    const compiler: CompilerTypeDesc = { world: "field", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)

    const result1 = compilerToRuntimeTypeCached(compiler);
    const result2 = compilerToRuntimeTypeCached(compiler);

    // Same object reference (cached)
    expect(result1).toBe(result2);
  });

  it("should return correct cached values", () => {
<<<<<<< HEAD
<<<<<<< HEAD
    const compiler = makeCompilerType("field", "vec2");
=======
    const compiler: CompilerTypeDesc = { world: "field", domain: "vec2", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
    const compiler: CompilerTypeDesc = { world: "field", domain: "vec2", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)

    const result = compilerToRuntimeTypeCached(compiler);

    expect(result).toEqual({ kind: "vec2" });
  });

  it("should cache different types separately", () => {
<<<<<<< HEAD
<<<<<<< HEAD
    const compiler1 = makeCompilerType("field", "float");
    const compiler2 = makeCompilerType("field", "vec2");
=======
    const compiler1: CompilerTypeDesc = { world: "field", domain: "float", category: "core", busEligible: true };
    const compiler2: CompilerTypeDesc = { world: "field", domain: "vec2", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
    const compiler1: CompilerTypeDesc = { world: "field", domain: "float", category: "core", busEligible: true };
    const compiler2: CompilerTypeDesc = { world: "field", domain: "vec2", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)

    const result1 = compilerToRuntimeTypeCached(compiler1);
    const result2 = compilerToRuntimeTypeCached(compiler2);

    expect(result1).toEqual({ kind: "number" });
    expect(result2).toEqual({ kind: "vec2" });
    expect(result1).not.toBe(result2);
  });

  it("should throw for unsupported types even with caching", () => {
<<<<<<< HEAD
<<<<<<< HEAD
    const compiler = makeCompilerType("scalar", "float");
=======
    const compiler: CompilerTypeDesc = { world: "scalar", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
    const compiler: CompilerTypeDesc = { world: "scalar", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)

    expect(() => compilerToRuntimeTypeCached(compiler)).toThrow(
      UnsupportedTypeError
    );
  });
});

describe("Type Adapter - Roundtrip Conversion", () => {
  it("should roundtrip field types correctly", () => {
<<<<<<< HEAD
<<<<<<< HEAD
    const original = makeCompilerType("field", "float");
=======
    const original: CompilerTypeDesc = { world: "field", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
    const original: CompilerTypeDesc = { world: "field", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
    const runtime = compilerToRuntimeType(original);
    const backToCompiler = runtimeToCompilerType(runtime, "field");

    expect(backToCompiler.world).toBe(original.world);
    expect(backToCompiler.domain).toBe(original.domain);
  });

  it("should roundtrip signal types correctly", () => {
<<<<<<< HEAD
<<<<<<< HEAD
    const original = makeCompilerType("signal", "vec2");
=======
    const original: CompilerTypeDesc = { world: "signal", domain: "vec2", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
    const original: CompilerTypeDesc = { world: "signal", domain: "vec2", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
    const runtime = compilerToRuntimeType(original);
    const backToCompiler = runtimeToCompilerType(runtime, "signal");

    expect(backToCompiler.world).toBe(original.world);
    expect(backToCompiler.domain).toBe(original.domain);
  });

  it("should lose semantics/unit in roundtrip (expected)", () => {
    const original = makeCompilerType("field", "float", { semantics: "point", unit: "px" });
    const runtime = compilerToRuntimeType(original);
    const backToCompiler = runtimeToCompilerType(runtime, "field");

    expect(backToCompiler.semantics).toBeUndefined();
    expect(backToCompiler.unit).toBeUndefined();
  });
});
