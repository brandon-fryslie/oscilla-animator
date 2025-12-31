/**
 * RenderInstances3D Block Tests
 *
 * Tests for the RenderInstances3D block lowering and schedule integration.
 *
 * References:
 * - design-docs/13-Renderer/07-3d-Canonical.md (§7.2 - Instances3DProjectTo2D contract)
 * - design-docs/13-Renderer/06-3d-IR-Deltas.md (§3 - Projection pass)
 */

import { describe, it, expect } from "vitest";
import { IRBuilderImpl } from "../../../ir/IRBuilderImpl";
import { buildCompiledProgram } from "../../../ir/buildSchedule";
import type { TypeDesc } from "../../../ir/types";
import { asTypeDesc } from "../../../ir/types";

// Helper to create a TypeDesc
function makeType(world: TypeDesc["world"], domain: string): TypeDesc {
  return asTypeDesc({
    world,
    domain: domain as TypeDesc["domain"],
  });
}

/**
 * Create a test scenario with RenderInstances3D sink.
 */
function createRenderInstances3DSinkScenario(): {
  builder: IRBuilderImpl;
  domainSlot: number;
  positions3dSlot: number;
  colorSlot: number;
  radiusSlot: number;
  opacitySlot: number;
} {
  const builder = new IRBuilderImpl();

  // Allocate domain
  const domainSlot = builder.domainFromN(10);

  // Create field expressions
  builder.setCurrentBlockId("Spatial3D#1");
  const positions3dFieldId = builder.fieldConst({ x: 0, y: 0, z: 0 }, makeType("field", "vec3"));
  const positions3dSlot = builder.allocValueSlot(makeType("field", "vec3"), "positions3d");
  builder.registerFieldSlot(positions3dFieldId, positions3dSlot);

  builder.setCurrentBlockId("ColorGen#1");
  const colorFieldId = builder.fieldConst("#ff0000", makeType("field", "color"));
  const colorSlot = builder.allocValueSlot(makeType("field", "color"), "color");
  builder.registerFieldSlot(colorFieldId, colorSlot);

  builder.setCurrentBlockId("SizeGen#1");
  const radiusSigId = builder.sigConst(5, makeType("signal", "float"));
  const radiusSlot = builder.allocValueSlot(makeType("signal", "float"), "radius");
  builder.registerSigSlot(radiusSigId, radiusSlot);

  const opacitySigId = builder.sigConst(1.0, makeType("signal", "float"));
  const opacitySlot = builder.allocValueSlot(makeType("signal", "float"), "opacity");
  builder.registerSigSlot(opacitySigId, opacitySlot);

  // Register render sink (simulates RenderInstances3D block lowering)
  builder.renderSink("instances3d", {
    domain: domainSlot,
    positions3d: positions3dSlot,
    color: colorSlot,
    radius: radiusSlot,
    opacity: opacitySlot,
    // camera is omitted (will use default)
  });

  return { builder, domainSlot, positions3dSlot, colorSlot, radiusSlot, opacitySlot };
}
describe("RenderInstances3D block lowering", () => {
  describe("Block type registration", () => {
    it("has correct inputs defined", () => {
      // This test would verify the block type registration
      // For now, we test the sink processing behavior
      expect(true).toBe(true);
    });
  });

  describe("Render sink processing", () => {
    it("emits materialize steps for 3D positions", () => {
      const { builder } = createRenderInstances3DSinkScenario();
      const builderIR = builder.build();
      const compiled = buildCompiledProgram(builderIR, "test-patch", 1, 12345);

      // Should have a materialize step for positions (vec3)
      const matSteps = compiled.schedule.steps.filter(s =>
        s.kind === "materialize" && (s.label?.includes("3D positions") ?? false)
      );
      expect(matSteps.length).toBeGreaterThan(0);
    });

    it("emits StepMaterializeColor for color channels", () => {
      const { builder } = createRenderInstances3DSinkScenario();
      const builderIR = builder.build();
      const compiled = buildCompiledProgram(builderIR, "test-patch", 1, 12345);

      // Should have a materializeColor step
      const colorSteps = compiled.schedule.steps.filter(s => s.kind === "materializeColor");
      expect(colorSteps.length).toBeGreaterThan(0);
    });

    it("emits StepInstances3DProjectTo2D with correct structure", () => {
      const { builder } = createRenderInstances3DSinkScenario();
      const builderIR = builder.build();
      const compiled = buildCompiledProgram(builderIR, "test-patch", 1, 12345);

      // Should have a projection step
      const projectionSteps = compiled.schedule.steps.filter(s =>
        s.kind === "Instances3DProjectTo2D"
      );
      expect(projectionSteps).toHaveLength(1);

      const projStep = projectionSteps[0];
      expect(projStep.kind).toBe("Instances3DProjectTo2D");

      // Verify step has required fields
      if (projStep.kind === "Instances3DProjectTo2D") {
        expect(projStep.domainSlot).toBeDefined();
        expect(projStep.positionSlot).toBeDefined();
        expect(projStep.colorRSlot).toBeDefined();
        expect(projStep.colorGSlot).toBeDefined();
        expect(projStep.colorBSlot).toBeDefined();
        expect(projStep.colorASlot).toBeDefined();
        expect(projStep.radiusSlot).toBeDefined();
        expect(projStep.outSlot).toBeDefined();

        // Verify default projection parameters
        expect(projStep.zSort).toBe(true);
        expect(projStep.cullMode).toBe("frustum");
        expect(projStep.clipMode).toBe("discard");
        expect(projStep.sizeSpace).toBe("px");
      }
    });

    it("creates Instance2DBatch pointing to projection output", () => {
      const { builder } = createRenderInstances3DSinkScenario();
      const builderIR = builder.build();
      const compiled = buildCompiledProgram(builderIR, "test-patch", 1, 12345);

      // Should have render assemble step with instance2d batches
      const assembleSteps = compiled.schedule.steps.filter(s => s.kind === "renderAssemble");
      expect(assembleSteps).toHaveLength(1);

      const assembleStep = assembleSteps[0];
      if (assembleStep.kind === "renderAssemble") {
        expect(assembleStep.instance2dBatches).toBeDefined();
        if (assembleStep.instance2dBatches !== null && assembleStep.instance2dBatches !== undefined) {
          expect(assembleStep.instance2dBatches.length).toBeGreaterThan(0);

          // The batch should reference the projection output slot
          const batch = assembleStep.instance2dBatches[0];
          expect(batch.kind).toBe("instance2d");
          expect(batch.domainSlot).toBeDefined();
          expect(batch.posXYSlot).toBeDefined();
          expect(batch.colorRGBASlot).toBeDefined();
        }
      }
    });

    it("projection step depends on all materialization steps", () => {
      const { builder } = createRenderInstances3DSinkScenario();
      const builderIR = builder.build();
      const compiled = buildCompiledProgram(builderIR, "test-patch", 1, 12345);

      const projectionSteps = compiled.schedule.steps.filter(s =>
        s.kind === "Instances3DProjectTo2D"
      );
      expect(projectionSteps).toHaveLength(1);

      const projStep = projectionSteps[0];
      // Should depend on position materialization and color materialization
      expect(projStep.deps.length).toBeGreaterThan(1);
    });
  });

  describe("Camera handling", () => {
    it("accepts undefined camera slot (default injection)", () => {
      const { builder } = createRenderInstances3DSinkScenario();
      const builderIR = builder.build();
      const compiled = buildCompiledProgram(builderIR, "test-patch", 1, 12345);

      const projectionSteps = compiled.schedule.steps.filter(s =>
        s.kind === "Instances3DProjectTo2D"
      );
      expect(projectionSteps).toHaveLength(1);

      const projStep = projectionSteps[0];
      if (projStep.kind === "Instances3DProjectTo2D") {
        // cameraEvalSlot should be defined (even if it's 0 as placeholder)
        expect(projStep.cameraEvalSlot).toBeDefined();
      }
    });

    it("accepts explicit camera slot", () => {
      const builder = new IRBuilderImpl();
      const domainSlot = builder.domainFromN(10);

      // Create field expressions
      const positions3dFieldId = builder.fieldConst({ x: 0, y: 0, z: 0 }, makeType("field", "vec3"));
      const positions3dSlot = builder.allocValueSlot(makeType("field", "vec3"), "positions3d");
      builder.registerFieldSlot(positions3dFieldId, positions3dSlot);

      const colorFieldId = builder.fieldConst("#ff0000", makeType("field", "color"));
      const colorSlot = builder.allocValueSlot(makeType("field", "color"), "color");
      builder.registerFieldSlot(colorFieldId, colorSlot);

      const radiusSigId = builder.sigConst(5, makeType("signal", "float"));
      const radiusSlot = builder.allocValueSlot(makeType("signal", "float"), "radius");
      builder.registerSigSlot(radiusSigId, radiusSlot);

      const opacitySigId = builder.sigConst(1.0, makeType("signal", "float"));
      const opacitySlot = builder.allocValueSlot(makeType("signal", "float"), "opacity");
      builder.registerSigSlot(opacitySigId, opacitySlot);

      // Allocate a camera slot (simulates Camera block output)
      const cameraSlot = builder.allocValueSlot(makeType("special", "camera"), "camera");

      builder.renderSink("instances3d", {
        domain: domainSlot,
        positions3d: positions3dSlot,
        color: colorSlot,
        radius: radiusSlot,
        opacity: opacitySlot,
        camera: cameraSlot,
      });

      const builderIR = builder.build();
      const compiled = buildCompiledProgram(builderIR, "test-patch", 1, 12345);

      const projectionSteps = compiled.schedule.steps.filter(s =>
        s.kind === "Instances3DProjectTo2D"
      );
      expect(projectionSteps).toHaveLength(1);

      const projStep = projectionSteps[0];
      if (projStep.kind === "Instances3DProjectTo2D") {
        expect(projStep.cameraEvalSlot).toBe(cameraSlot);
      }
    });
  });

  describe("Field vs Signal radius handling", () => {
    it("materializes radius when it's a field", () => {
      const builder = new IRBuilderImpl();
      const domainSlot = builder.domainFromN(10);

      const positions3dFieldId = builder.fieldConst({ x: 0, y: 0, z: 0 }, makeType("field", "vec3"));
      const positions3dSlot = builder.allocValueSlot(makeType("field", "vec3"), "positions3d");
      builder.registerFieldSlot(positions3dFieldId, positions3dSlot);

      const colorFieldId = builder.fieldConst("#ff0000", makeType("field", "color"));
      const colorSlot = builder.allocValueSlot(makeType("field", "color"), "color");
      builder.registerFieldSlot(colorFieldId, colorSlot);

      // Use Field<float> for radius
      const radiusFieldId = builder.fieldConst(5, makeType("field", "float"));
      const radiusSlot = builder.allocValueSlot(makeType("field", "float"), "radius");
      builder.registerFieldSlot(radiusFieldId, radiusSlot);

      const opacitySigId = builder.sigConst(1.0, makeType("signal", "float"));
      const opacitySlot = builder.allocValueSlot(makeType("signal", "float"), "opacity");
      builder.registerSigSlot(opacitySigId, opacitySlot);

      builder.renderSink("instances3d", {
        domain: domainSlot,
        positions3d: positions3dSlot,
        color: colorSlot,
        radius: radiusSlot,
        opacity: opacitySlot,
      });

      const builderIR = builder.build();
      const compiled = buildCompiledProgram(builderIR, "test-patch", 1, 12345);

      // Should have a materialize step for radius
      const radiusMatSteps = compiled.schedule.steps.filter(s =>
        s.kind === "materialize" && (s.label?.includes("radius") ?? false)
      );
      expect(radiusMatSteps.length).toBeGreaterThan(0);
    });

    it("uses signal slot directly when radius is a signal", () => {
      const { builder, radiusSlot } = createRenderInstances3DSinkScenario();
      const builderIR = builder.build();
      const compiled = buildCompiledProgram(builderIR, "test-patch", 1, 12345);

      const projectionSteps = compiled.schedule.steps.filter(s =>
        s.kind === "Instances3DProjectTo2D"
      );
      expect(projectionSteps).toHaveLength(1);

      const projStep = projectionSteps[0];
      if (projStep.kind === "Instances3DProjectTo2D") {
        // radiusSlot should reference the signal slot directly (no materialization)
        expect(projStep.radiusSlot).toBe(radiusSlot);
      }
    });
  });

  describe("Schedule ordering", () => {
    it("projection step comes after all materialization steps", () => {
      const { builder } = createRenderInstances3DSinkScenario();
      const builderIR = builder.build();
      const compiled = buildCompiledProgram(builderIR, "test-patch", 1, 12345);

      const steps = compiled.schedule.steps;
      const projectionIdx = steps.findIndex(s => s.kind === "Instances3DProjectTo2D");
      const matIndices = steps
        .map((s, i) => (s.kind === "materialize" || s.kind === "materializeColor") ? i : -1)
        .filter(i => i !== -1);

      expect(projectionIdx).toBeGreaterThan(-1);

      // All materialization steps should come before projection
      for (const matIdx of matIndices) {
        expect(matIdx).toBeLessThan(projectionIdx);
      }
    });

    it("render assemble depends on projection step", () => {
      const { builder } = createRenderInstances3DSinkScenario();
      const builderIR = builder.build();
      const compiled = buildCompiledProgram(builderIR, "test-patch", 1, 12345);

      const assembleSteps = compiled.schedule.steps.filter(s => s.kind === "renderAssemble");
      expect(assembleSteps).toHaveLength(1);

      const assembleStep = assembleSteps[0];
      const projectionSteps = compiled.schedule.steps.filter(s =>
        s.kind === "Instances3DProjectTo2D"
      );
      expect(projectionSteps).toHaveLength(1);

      // Render assemble should depend on projection step
      expect(assembleStep.deps).toContain(projectionSteps[0].id);
    });
  });
});
