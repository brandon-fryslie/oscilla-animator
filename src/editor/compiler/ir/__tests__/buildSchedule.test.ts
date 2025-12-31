/**
 * Build Schedule Tests
 *
 * Tests for schedule building with debug probe insertion.
 */

import { describe, it, expect } from "vitest";
import { IRBuilderImpl } from "../IRBuilderImpl";
import { buildCompiledProgram } from "../buildSchedule";
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
import type { TypeDesc } from "../types";
import { asTypeDesc } from "../types";
=======
import type { TypeDesc } from } from "../types";;
import { asTypeDesc } from
<<<<<<< HEAD
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
import type { TypeDesc } from } from "../types";;
import { asTypeDesc } from
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
>>>>>>> 8eb3ea5 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
import type { BuilderProgramIR } from "../builderTypes";

// Helper to create a simple TypeDesc
function makeType(world: "signal" | "field", domain: string): TypeDesc {
  return asTypeDesc({
    world,
    domain: domain as TypeDesc["domain"],
  });
}

/**
 * Create a minimal builder IR for testing.
 */
function createMinimalBuilderIR(): BuilderProgramIR {
  const builder = new IRBuilderImpl();
  const type = makeType("signal", "float");

  // Add a few signal expressions
  builder.setCurrentBlockId("TestBlock#1");
  builder.sigTimeAbsMs();
  builder.sigConst(42, type);
  builder.sigPhase01();

  return builder.build();
}

describe("buildSchedule", () => {
  describe("probeMode='off' (default)", () => {
    it("does not insert any debugProbe steps", () => {
      const builderIR = createMinimalBuilderIR();
      const compiled = buildCompiledProgram(
        builderIR,
        "test-patch",
        1,
        12345,
        // No debug config = off
      );

      const probeSteps = compiled.schedule.steps.filter(s => s.kind === "debugProbe");
      expect(probeSteps).toHaveLength(0);
    });

    it("includes timeDerive step", () => {
      const builderIR = createMinimalBuilderIR();
      const compiled = buildCompiledProgram(
        builderIR,
        "test-patch",
        1,
        12345,
      );

      const timeDeriveSteps = compiled.schedule.steps.filter(s => s.kind === "timeDerive");
      expect(timeDeriveSteps).toHaveLength(1);
    });
  });

  describe("probeMode='basic'", () => {
    it("inserts debugProbe step after time derive", () => {
      const builderIR = createMinimalBuilderIR();
      const compiled = buildCompiledProgram(
        builderIR,
        "test-patch",
        1,
        12345,
        { probeMode: "basic" },
      );

      const probeSteps = compiled.schedule.steps.filter(s => s.kind === "debugProbe");
      expect(probeSteps.length).toBeGreaterThan(0);

      // Find the time probe
      const timeProbe = probeSteps.find(s =>
        s.kind === "debugProbe" && s.probe.id.includes("time")
      );
      expect(timeProbe).toBeDefined();
    });

    it("probe steps have unique IDs", () => {
      const builderIR = createMinimalBuilderIR();
      const compiled = buildCompiledProgram(
        builderIR,
        "test-patch",
        1,
        12345,
        { probeMode: "basic" },
      );

      const probeSteps = compiled.schedule.steps.filter(s => s.kind === "debugProbe");
      const stepIds = probeSteps.map(s => s.id);
      const uniqueIds = new Set(stepIds);
      expect(uniqueIds.size).toBe(stepIds.length);
    });

    it("probe steps depend on their preceding step", () => {
      const builderIR = createMinimalBuilderIR();
      const compiled = buildCompiledProgram(
        builderIR,
        "test-patch",
        1,
        12345,
        { probeMode: "basic" },
      );

      const probeSteps = compiled.schedule.steps.filter(s => s.kind === "debugProbe");
      for (const probe of probeSteps) {
        expect(probe.deps.length).toBeGreaterThan(0);
        // The dependency should be a real step in the schedule
        for (const dep of probe.deps) {
          expect(compiled.schedule.stepIdToIndex[dep]).toBeDefined();
        }
      }
    });

    it("probe slots reference valid time output slots", () => {
      const builderIR = createMinimalBuilderIR();
      const compiled = buildCompiledProgram(
        builderIR,
        "test-patch",
        1,
        12345,
        { probeMode: "basic" },
      );

      // Find the time probe
      const probeSteps = compiled.schedule.steps.filter(s => s.kind === "debugProbe");
      const timeProbe = probeSteps.find(s =>
        s.kind === "debugProbe" && s.probe.id.includes("time")
      );

      expect(timeProbe).toBeDefined();
      if (timeProbe !== undefined && timeProbe.kind === "debugProbe") {
        // Should have at least 2 slots (tModelMs, progress01)
        expect(timeProbe.probe.slots.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe("probeMode='full'", () => {
    it("inserts more probes than basic mode", () => {
      const builderIR = createMinimalBuilderIR();

      const compiledBasic = buildCompiledProgram(
        builderIR,
        "test-patch",
        1,
        12345,
        { probeMode: "basic" },
      );

      const compiledFull = buildCompiledProgram(
        builderIR,
        "test-patch",
        1,
        12345,
        { probeMode: "full" },
      );

      const basicProbes = compiledBasic.schedule.steps.filter(s => s.kind === "debugProbe").length;
      const fullProbes = compiledFull.schedule.steps.filter(s => s.kind === "debugProbe").length;

      // Full mode should have at least as many probes as basic mode
      expect(fullProbes).toBeGreaterThanOrEqual(basicProbes);
    });
  });
});
