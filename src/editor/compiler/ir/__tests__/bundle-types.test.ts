/**
 * Bundle Type System Tests (Sprint 2)
 *
 * Tests for the bundle type system extension to TypeDesc and slot allocation.
 * Verifies that multi-component signals (vec2, vec3, rgba, mat4) allocate
 * correct number of consecutive slots.
 *
 * NOTE: This test suite has been updated for the new TypeDesc contract
 * which uses `lanes` instead of `bundleKind`/`bundleArity`.
 */

import { describe, it, expect } from "vitest";
import {
  BundleKind,
  getBundleArity,
  inferBundleKind,
  createTypeDesc,
  getTypeArity,
} from "../types";
import { IRBuilderImpl } from "../IRBuilderImpl";

describe("Bundle Type System", () => {
  describe("BundleKind enum and arity", () => {
    it("Scalar has arity 1", () => {
      expect(getBundleArity(BundleKind.Scalar)).toBe(1);
    });

    it("Vec2 has arity 2", () => {
      expect(getBundleArity(BundleKind.Vec2)).toBe(2);
    });

    it("Vec3 has arity 3", () => {
      expect(getBundleArity(BundleKind.Vec3)).toBe(3);
    });

    it("RGBA has arity 4", () => {
      expect(getBundleArity(BundleKind.RGBA)).toBe(4);
    });

    it("Quat has arity 4", () => {
      expect(getBundleArity(BundleKind.Quat)).toBe(4);
    });

    it("Vec4 has arity 4", () => {
      expect(getBundleArity(BundleKind.Vec4)).toBe(4);
    });

    it("Mat4 has arity 16", () => {
      expect(getBundleArity(BundleKind.Mat4)).toBe(16);
    });
  });

  describe("inferBundleKind from TypeDomain", () => {
    it("infers Scalar for float domain", () => {
      expect(inferBundleKind("float")).toBe(BundleKind.Scalar);
    });

    it("infers Scalar for int domain", () => {
      expect(inferBundleKind("int")).toBe(BundleKind.Scalar);
    });

    it("infers Vec2 for vec2 domain", () => {
      expect(inferBundleKind("vec2")).toBe(BundleKind.Vec2);
    });

    it("infers Vec3 for vec3 domain", () => {
      expect(inferBundleKind("vec3")).toBe(BundleKind.Vec3);
    });

    it("infers Vec4 for vec4 domain", () => {
      expect(inferBundleKind("vec4")).toBe(BundleKind.Vec4);
    });

    it("infers Quat for quat domain", () => {
      expect(inferBundleKind("quat")).toBe(BundleKind.Quat);
    });

    it("infers RGBA for color domain", () => {
      expect(inferBundleKind("color")).toBe(BundleKind.RGBA);
    });

    it("infers Mat4 for mat4 domain", () => {
      expect(inferBundleKind("mat4")).toBe(BundleKind.Mat4);
    });

    it("infers Scalar for unknown domain", () => {
      expect(inferBundleKind("unknown")).toBe(BundleKind.Scalar);
    });
  });

  describe("createTypeDesc automatic bundle inference", () => {
    it("creates scalar TypeDesc with arity 1", () => {
      const type = createTypeDesc("signal", "float", "internal", false);
      expect(getTypeArity(type)).toBe(1);
      expect(type.world).toBe("signal");
      expect(type.domain).toBe("float");
      expect(type.lanes).toBeUndefined(); // Scalar has no explicit lanes
    });

    it("creates vec2 TypeDesc with arity 2", () => {
      const type = createTypeDesc("signal", "vec2", "internal", false);
      expect(getTypeArity(type)).toBe(2);
      expect(type.world).toBe("signal");
      expect(type.domain).toBe("vec2");
      expect(type.lanes).toEqual([2]);
    });

    it("creates vec3 TypeDesc with arity 3", () => {
      const type = createTypeDesc("signal", "vec3", "internal", false);
      expect(getTypeArity(type)).toBe(3);
      expect(type.lanes).toEqual([3]);
    });

    it("creates RGBA TypeDesc with arity 4", () => {
      const type = createTypeDesc("signal", "color", "internal", false);
      expect(getTypeArity(type)).toBe(4);
      expect(type.lanes).toEqual([4]);
    });

    it("creates mat4 TypeDesc with arity 16", () => {
      const type = createTypeDesc("signal", "mat4", "internal", false);
      expect(getTypeArity(type)).toBe(16);
      expect(type.lanes).toEqual([16]);
    });

    it("preserves optional semantic/unit annotations", () => {
      const type = createTypeDesc("signal", "float", "internal", false, {
        semantics: "hue",
        unit: "deg",
      });
      expect(type.semantics).toBe("hue");
      expect(type.unit).toBe("deg");
      expect(getTypeArity(type)).toBe(1);
    });

    it("allows override of lanes", () => {
      const type = createTypeDesc("signal", "float", "internal", false, {
        lanes: [3],
      });
      expect(type.lanes).toEqual([3]);
      expect(getTypeArity(type)).toBe(3);
    });
  });

  describe("getTypeArity safe accessor", () => {
    it("returns correct arity for vec3", () => {
      const type = createTypeDesc("signal", "vec3", "internal", false);
      expect(getTypeArity(type)).toBe(3);
    });

    it("returns 1 for legacy TypeDesc without lanes", () => {
      const legacyType = {
        world: "signal" as const,
        domain: "float" as const,
        category: "internal" as const,
        busEligible: false,
      };
      expect(getTypeArity(legacyType)).toBe(1);
    });

    it("returns 1 for scalar types", () => {
      const type = createTypeDesc("signal", "float", "internal", false);
      expect(getTypeArity(type)).toBe(1);
    });
  });

  describe("IRBuilder slot allocation respects bundle arity", () => {
    it("allocates 1 slot for scalar signal", () => {
      const builder = new IRBuilderImpl();
      const type = createTypeDesc("signal", "float", "internal", false);

      const slot = builder.allocValueSlot(type, "hue");

      expect(slot).toBe(0);

      // Verify next allocation increments by 1
      const nextSlot = builder.allocValueSlot(type, "saturation");
      expect(nextSlot).toBe(1);
    });

    it("allocates 2 consecutive slots for vec2 signal", () => {
      const builder = new IRBuilderImpl();
      const type = createTypeDesc("signal", "vec2", "internal", false);

      const slot = builder.allocValueSlot(type, "position");

      expect(slot).toBe(0);

      // Verify next allocation starts at slot 2 (0+2)
      const nextSlot = builder.allocValueSlot(
        createTypeDesc("signal", "float", "internal", false),
        "alpha"
      );
      expect(nextSlot).toBe(2);
    });

    it("allocates 3 consecutive slots for vec3 signal", () => {
      const builder = new IRBuilderImpl();
      const type = createTypeDesc("signal", "vec3", "internal", false);

      const slot = builder.allocValueSlot(type, "rgb");

      expect(slot).toBe(0);

      // Verify next allocation starts at slot 3 (0+3)
      const nextSlot = builder.allocValueSlot(
        createTypeDesc("signal", "float", "internal", false),
        "alpha"
      );
      expect(nextSlot).toBe(3);
    });

    it("allocates 4 consecutive slots for RGBA signal", () => {
      const builder = new IRBuilderImpl();
      const type = createTypeDesc("signal", "color", "internal", false);

      const slot = builder.allocValueSlot(type, "color");

      expect(slot).toBe(0);

      // Verify next allocation starts at slot 4 (0+4)
      const nextSlot = builder.allocValueSlot(
        createTypeDesc("signal", "float", "internal", false),
        "scalar"
      );
      expect(nextSlot).toBe(4);
    });

    it("allocates 16 consecutive slots for mat4 signal", () => {
      const builder = new IRBuilderImpl();
      const type = createTypeDesc("signal", "mat4", "internal", false);

      const slot = builder.allocValueSlot(type, "transform");

      expect(slot).toBe(0);

      // Verify next allocation starts at slot 16 (0+16)
      const nextSlot = builder.allocValueSlot(
        createTypeDesc("signal", "float", "internal", false),
        "scalar"
      );
      expect(nextSlot).toBe(16);
    });

    it("handles mixed scalar and bundle allocations correctly", () => {
      const builder = new IRBuilderImpl();

      // Allocate: scalar (slot 0)
      const slot0 = builder.allocValueSlot(
        createTypeDesc("signal", "float", "internal", false),
        "hue"
      );
      expect(slot0).toBe(0);

      // Allocate: vec3 (slots 1, 2, 3)
      const slot1 = builder.allocValueSlot(
        createTypeDesc("signal", "vec3", "internal", false),
        "rgb"
      );
      expect(slot1).toBe(1);

      // Allocate: scalar (slot 4)
      const slot4 = builder.allocValueSlot(
        createTypeDesc("signal", "float", "internal", false),
        "alpha"
      );
      expect(slot4).toBe(4);

      // Allocate: vec2 (slots 5, 6)
      const slot5 = builder.allocValueSlot(
        createTypeDesc("signal", "vec2", "internal", false),
        "position"
      );
      expect(slot5).toBe(5);

      // Next slot should be 7
      const slot7 = builder.allocValueSlot(
        createTypeDesc("signal", "float", "internal", false),
        "scale"
      );
      expect(slot7).toBe(7);
    });

    it("allocates slots without type (legacy behavior)", () => {
      const builder = new IRBuilderImpl();

      // Allocate without type - should default to arity 1
      const slot0 = builder.allocValueSlot();
      expect(slot0).toBe(0);

      const slot1 = builder.allocValueSlot();
      expect(slot1).toBe(1);

      // Mix with typed allocation
      const slot2 = builder.allocValueSlot(
        createTypeDesc("signal", "vec2", "internal", false),
        "pos"
      );
      expect(slot2).toBe(2);

      // Next should be at 4 (2 + 2)
      const slot4 = builder.allocValueSlot();
      expect(slot4).toBe(4);
    });

    it("tracks slot metadata for bundle types", () => {
      const builder = new IRBuilderImpl();
      const vec3Type = createTypeDesc("signal", "vec3", "internal", false);

      builder.allocValueSlot(vec3Type, "rgb");

      const result = builder.build();

      // Should have one slot metadata entry
      expect(result.slotMeta).toHaveLength(1);
      expect(result.slotMeta[0].slot).toBe(0);
      expect(result.slotMeta[0].debugName).toBe("rgb");
      expect(getTypeArity(result.slotMeta[0].type)).toBe(3);
      expect(result.slotMeta[0].storage).toBe("f64");
    });

    it("correctly tracks nextValueSlot in build output", () => {
      const builder = new IRBuilderImpl();

      builder.allocValueSlot(createTypeDesc("signal", "float", "internal", false), "s1");
      builder.allocValueSlot(createTypeDesc("signal", "vec3", "internal", false), "v3");
      builder.allocValueSlot(createTypeDesc("signal", "vec2", "internal", false), "v2");

      const result = builder.build();

      // 1 (scalar) + 3 (vec3) + 2 (vec2) = 6
      expect(result.nextValueSlot).toBe(6);
    });
  });

  describe("Integration: bundle slots in signal expressions", () => {
    it("vec2 signal allocates 2 consecutive slots", () => {
      const builder = new IRBuilderImpl();
      const vec2Type = createTypeDesc("signal", "vec2", "internal", false);

      const slot = builder.allocValueSlot(vec2Type, "position");

      expect(slot).toBe(0);

      const result = builder.build();
      expect(result.nextValueSlot).toBe(2); // Consumed slots [0, 1]
    });

    it("vec3 signal allocates 3 consecutive slots", () => {
      const builder = new IRBuilderImpl();
      const vec3Type = createTypeDesc("signal", "vec3", "internal", false);

      const slot = builder.allocValueSlot(vec3Type, "rgb");

      expect(slot).toBe(0);

      const result = builder.build();
      expect(result.nextValueSlot).toBe(3); // Consumed slots [0, 1, 2]
    });

    it("multiple bundle allocations are contiguous", () => {
      const builder = new IRBuilderImpl();

      const scalarSlot = builder.allocValueSlot(
        createTypeDesc("signal", "float", "internal", false),
        "scalar"
      );
      expect(scalarSlot).toBe(0);

      const vec2Slot = builder.allocValueSlot(
        createTypeDesc("signal", "vec2", "internal", false),
        "vec2"
      );
      expect(vec2Slot).toBe(1); // Starts at 1

      const vec3Slot = builder.allocValueSlot(
        createTypeDesc("signal", "vec3", "internal", false),
        "vec3"
      );
      expect(vec3Slot).toBe(3); // Starts at 3 (1 + 2)

      const rgbaSlot = builder.allocValueSlot(
        createTypeDesc("signal", "color", "internal", false),
        "rgba"
      );
      expect(rgbaSlot).toBe(6); // Starts at 6 (3 + 3)

      const result = builder.build();
      expect(result.nextValueSlot).toBe(10); // 0 + 1 + 2 + 3 + 4 = 10
    });
  });
});
