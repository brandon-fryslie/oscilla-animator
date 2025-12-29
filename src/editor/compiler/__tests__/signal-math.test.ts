/**
 * Signal Math Integration Tests (Sprint 2 P2-1)
 *
 * Tests IR lowering of signal math operations and Oscillator waveforms.
 * Validates that signal processing blocks produce correct IR nodes.
 *
 * Reference: Sprint 2 P2-1 - Signal Math Block Coverage
 */

import { describe, it, expect } from "vitest";
import { IRBuilderImpl } from "../ir/IRBuilderImpl";
import { AddSignalBlock } from "../blocks/signal/AddSignal";
import { OscillatorBlock } from "../blocks/signal/Oscillator";
import { getBlockType } from "../ir/lowerTypes";
import type { ValueRefPacked } from "../ir/lowerTypes";
import type { TypeDesc } from "../ir/types";

// Import block compilers to trigger registerBlockType() calls
import "../blocks/index";

describe("Signal Math Operations", () => {
  describe("Binary Math Operations", () => {
    it("should lower AddSignal to IR", () => {
      const builder = new IRBuilderImpl();
      const irDecl = getBlockType("AddSignal");
      expect(irDecl).toBeDefined();

      // Create two constant signal inputs
      const typeNum: TypeDesc = { world: "signal", domain: "number" };
      const sigA = builder.sigConst(5, typeNum);
      const sigB = builder.sigConst(3, typeNum);

      const slotA = builder.allocValueSlot(typeNum);
      const slotB = builder.allocValueSlot(typeNum);
      builder.registerSigSlot(sigA, slotA);
      builder.registerSigSlot(sigB, slotB);

      const inputs: ValueRefPacked[] = [
        { k: "sig", id: sigA, slot: slotA },
        { k: "sig", id: sigB, slot: slotB },
      ];

      const ctx = {
        blockIdx: 0 as number,
        blockType: "AddSignal",
        instanceId: "test-add",
        inTypes: [typeNum, typeNum],
        outTypes: [typeNum],
        b: builder,
        seedConstId: 0,
      };

      const result = irDecl!.lower({ ctx, inputs });

      // Migrated blocks use outputsById instead of positional outputs
      expect(result.outputsById).toBeDefined();
      expect(result.outputsById!.out).toBeDefined();
      expect(result.outputsById!.out.k).toBe("sig");

      // Verify signal expression was created
      const program = builder.build();
      expect(program.signalIR.nodes.length).toBeGreaterThan(0);
    });

    it("should lower SubSignal to IR", () => {
      const builder = new IRBuilderImpl();
      const irDecl = getBlockType("SubSignal");
      expect(irDecl).toBeDefined();

      const typeNum: TypeDesc = { world: "signal", domain: "number" };
      const sigA = builder.sigConst(10, typeNum);
      const sigB = builder.sigConst(3, typeNum);

      const slotA = builder.allocValueSlot(typeNum);
      const slotB = builder.allocValueSlot(typeNum);
      builder.registerSigSlot(sigA, slotA);
      builder.registerSigSlot(sigB, slotB);

      const inputs: ValueRefPacked[] = [
        { k: "sig", id: sigA, slot: slotA },
        { k: "sig", id: sigB, slot: slotB },
      ];

      const ctx = {
        blockIdx: 0 as number,
        blockType: "SubSignal",
        instanceId: "test-sub",
        inTypes: [typeNum, typeNum],
        outTypes: [typeNum],
        b: builder,
        seedConstId: 0,
      };

      const result = irDecl!.lower({ ctx, inputs });
      expect(result.outputsById).toBeDefined();
      expect(result.outputsById!.out).toBeDefined();
      expect(result.outputsById!.out.k).toBe("sig");
    });

    it("should lower MulSignal to IR", () => {
      const builder = new IRBuilderImpl();
      const irDecl = getBlockType("MulSignal");
      expect(irDecl).toBeDefined();

      const typeNum: TypeDesc = { world: "signal", domain: "number" };
      const sigA = builder.sigConst(4, typeNum);
      const sigB = builder.sigConst(2.5, typeNum);

      const slotA = builder.allocValueSlot(typeNum);
      const slotB = builder.allocValueSlot(typeNum);
      builder.registerSigSlot(sigA, slotA);
      builder.registerSigSlot(sigB, slotB);

      const inputs: ValueRefPacked[] = [
        { k: "sig", id: sigA, slot: slotA },
        { k: "sig", id: sigB, slot: slotB },
      ];

      const ctx = {
        blockIdx: 0 as number,
        blockType: "MulSignal",
        instanceId: "test-mul",
        inTypes: [typeNum, typeNum],
        outTypes: [typeNum],
        b: builder,
        seedConstId: 0,
      };

      const result = irDecl!.lower({ ctx, inputs });
      expect(result.outputsById).toBeDefined();
      expect(result.outputsById!.out).toBeDefined();
      expect(result.outputsById!.out.k).toBe("sig");
    });

    it("should lower DivSignal to IR", () => {
      const builder = new IRBuilderImpl();
      const irDecl = getBlockType("DivSignal");
      expect(irDecl).toBeDefined();

      const typeNum: TypeDesc = { world: "signal", domain: "number" };
      const sigA = builder.sigConst(10, typeNum);
      const sigB = builder.sigConst(2, typeNum);

      const slotA = builder.allocValueSlot(typeNum);
      const slotB = builder.allocValueSlot(typeNum);
      builder.registerSigSlot(sigA, slotA);
      builder.registerSigSlot(sigB, slotB);

      const inputs: ValueRefPacked[] = [
        { k: "sig", id: sigA, slot: slotA },
        { k: "sig", id: sigB, slot: slotB },
      ];

      const ctx = {
        blockIdx: 0 as number,
        blockType: "DivSignal",
        instanceId: "test-div",
        inTypes: [typeNum, typeNum],
        outTypes: [typeNum],
        b: builder,
        seedConstId: 0,
      };

      const result = irDecl!.lower({ ctx, inputs });
      expect(result.outputs).toHaveLength(1);
      expect(result.outputs[0].k).toBe("sig");
    });

    it("should lower MinSignal to IR", () => {
      const builder = new IRBuilderImpl();
      const irDecl = getBlockType("MinSignal");
      expect(irDecl).toBeDefined();

      const typeNum: TypeDesc = { world: "signal", domain: "number" };
      const sigA = builder.sigConst(5, typeNum);
      const sigB = builder.sigConst(3, typeNum);

      const slotA = builder.allocValueSlot(typeNum);
      const slotB = builder.allocValueSlot(typeNum);
      builder.registerSigSlot(sigA, slotA);
      builder.registerSigSlot(sigB, slotB);

      const inputs: ValueRefPacked[] = [
        { k: "sig", id: sigA, slot: slotA },
        { k: "sig", id: sigB, slot: slotB },
      ];

      const ctx = {
        blockIdx: 0 as number,
        blockType: "MinSignal",
        instanceId: "test-min",
        inTypes: [typeNum, typeNum],
        outTypes: [typeNum],
        b: builder,
        seedConstId: 0,
      };

      const result = irDecl!.lower({ ctx, inputs });
      expect(result.outputs).toHaveLength(1);
      expect(result.outputs[0].k).toBe("sig");
    });

    it("should lower MaxSignal to IR", () => {
      const builder = new IRBuilderImpl();
      const irDecl = getBlockType("MaxSignal");
      expect(irDecl).toBeDefined();

      const typeNum: TypeDesc = { world: "signal", domain: "number" };
      const sigA = builder.sigConst(5, typeNum);
      const sigB = builder.sigConst(8, typeNum);

      const slotA = builder.allocValueSlot(typeNum);
      const slotB = builder.allocValueSlot(typeNum);
      builder.registerSigSlot(sigA, slotA);
      builder.registerSigSlot(sigB, slotB);

      const inputs: ValueRefPacked[] = [
        { k: "sig", id: sigA, slot: slotA },
        { k: "sig", id: sigB, slot: slotB },
      ];

      const ctx = {
        blockIdx: 0 as number,
        blockType: "MaxSignal",
        instanceId: "test-max",
        inTypes: [typeNum, typeNum],
        outTypes: [typeNum],
        b: builder,
        seedConstId: 0,
      };

      const result = irDecl!.lower({ ctx, inputs });
      expect(result.outputs).toHaveLength(1);
      expect(result.outputs[0].k).toBe("sig");
    });

    it("should lower ClampSignal to IR", () => {
      const builder = new IRBuilderImpl();
      const irDecl = getBlockType("ClampSignal");
      expect(irDecl).toBeDefined();

      const typeNum: TypeDesc = { world: "signal", domain: "number" };
      const sigIn = builder.sigConst(15, typeNum);
      const sigMin = builder.sigConst(0, typeNum);
      const sigMax = builder.sigConst(10, typeNum);

      const slotIn = builder.allocValueSlot(typeNum);
      const slotMin = builder.allocValueSlot(typeNum);
      const slotMax = builder.allocValueSlot(typeNum);
      builder.registerSigSlot(sigIn, slotIn);
      builder.registerSigSlot(sigMin, slotMin);
      builder.registerSigSlot(sigMax, slotMax);

      const inputs: ValueRefPacked[] = [
        { k: "sig", id: sigIn, slot: slotIn },
        { k: "sig", id: sigMin, slot: slotMin },
        { k: "sig", id: sigMax, slot: slotMax },
      ];

      const ctx = {
        blockIdx: 0 as number,
        blockType: "ClampSignal",
        instanceId: "test-clamp",
        inTypes: [typeNum, typeNum, typeNum],
        outTypes: [typeNum],
        b: builder,
        seedConstId: 0,
      };

      const result = irDecl!.lower({ ctx, inputs });
      expect(result.outputs).toHaveLength(1);
      expect(result.outputs[0].k).toBe("sig");
    });
  });

  describe("Oscillator Waveforms", () => {
    it("should lower Oscillator with sine waveform", () => {
      const builder = new IRBuilderImpl();
      const irDecl = getBlockType("Oscillator");
      expect(irDecl).toBeDefined();

      const typePhase: TypeDesc = { world: "signal", domain: "phase01" };
      const typeNum: TypeDesc = { world: "signal", domain: "number" };
      const typeWaveform: TypeDesc = { world: "scalar", domain: "waveform" };

      const phaseSignal = builder.sigConst(0.5, typePhase);
      const amplitudeSignal = builder.sigConst(1, typeNum);
      const biasSignal = builder.sigConst(0, typeNum);
      const waveformConstId = builder.allocConstId("sine");

      const slotPhase = builder.allocValueSlot(typePhase);
      const slotAmp = builder.allocValueSlot(typeNum);
      const slotBias = builder.allocValueSlot(typeNum);
      builder.registerSigSlot(phaseSignal, slotPhase);
      builder.registerSigSlot(amplitudeSignal, slotAmp);
      builder.registerSigSlot(biasSignal, slotBias);

      const inputs: ValueRefPacked[] = [
        { k: "sig", id: phaseSignal, slot: slotPhase },
        { k: "scalarConst", constId: waveformConstId },
        { k: "sig", id: amplitudeSignal, slot: slotAmp },
        { k: "sig", id: biasSignal, slot: slotBias },
      ];

      const ctx = {
        blockIdx: 0 as number,
        blockType: "Oscillator",
        instanceId: "test-osc-sine",
        inTypes: [typePhase, typeWaveform, typeNum, typeNum],
        outTypes: [typeNum],
        b: builder,
        seedConstId: 0,
      };

      const result = irDecl!.lower({ ctx, inputs });

      expect(result.outputsById).toBeDefined();
      expect(result.outputsById!.out).toBeDefined();
      expect(result.outputsById!.out.k).toBe("sig");

      // Verify signal expression graph was created
      const program = builder.build();
      expect(program.signalIR.nodes.length).toBeGreaterThan(0);
    });

    it("should lower Oscillator with triangle waveform", () => {
      const builder = new IRBuilderImpl();
      const irDecl = getBlockType("Oscillator");
      expect(irDecl).toBeDefined();

      const typePhase: TypeDesc = { world: "signal", domain: "phase01" };
      const typeNum: TypeDesc = { world: "signal", domain: "number" };
      const typeWaveform: TypeDesc = { world: "scalar", domain: "waveform" };

      const phaseSignal = builder.sigConst(0.25, typePhase);
      const amplitudeSignal = builder.sigConst(2, typeNum);
      const biasSignal = builder.sigConst(0.5, typeNum);
      const waveformConstId = builder.allocConstId("triangle");

      const slotPhase = builder.allocValueSlot(typePhase);
      const slotAmp = builder.allocValueSlot(typeNum);
      const slotBias = builder.allocValueSlot(typeNum);
      builder.registerSigSlot(phaseSignal, slotPhase);
      builder.registerSigSlot(amplitudeSignal, slotAmp);
      builder.registerSigSlot(biasSignal, slotBias);

      const inputs: ValueRefPacked[] = [
        { k: "sig", id: phaseSignal, slot: slotPhase },
        { k: "scalarConst", constId: waveformConstId },
        { k: "sig", id: amplitudeSignal, slot: slotAmp },
        { k: "sig", id: biasSignal, slot: slotBias },
      ];

      const ctx = {
        blockIdx: 0 as number,
        blockType: "Oscillator",
        instanceId: "test-osc-tri",
        inTypes: [typePhase, typeWaveform, typeNum, typeNum],
        outTypes: [typeNum],
        b: builder,
        seedConstId: 0,
      };

      const result = irDecl!.lower({ ctx, inputs });

      expect(result.outputsById).toBeDefined();
      expect(result.outputsById!.out).toBeDefined();
      expect(result.outputsById!.out.k).toBe("sig");
    });

    it("should lower Oscillator with saw waveform", () => {
      const builder = new IRBuilderImpl();
      const irDecl = getBlockType("Oscillator");
      expect(irDecl).toBeDefined();

      const typePhase: TypeDesc = { world: "signal", domain: "phase01" };
      const typeNum: TypeDesc = { world: "signal", domain: "number" };
      const typeWaveform: TypeDesc = { world: "scalar", domain: "waveform" };

      const phaseSignal = builder.sigConst(0.75, typePhase);
      const amplitudeSignal = builder.sigConst(1, typeNum);
      const biasSignal = builder.sigConst(0, typeNum);
      const waveformConstId = builder.allocConstId("saw");

      const slotPhase = builder.allocValueSlot(typePhase);
      const slotAmp = builder.allocValueSlot(typeNum);
      const slotBias = builder.allocValueSlot(typeNum);
      builder.registerSigSlot(phaseSignal, slotPhase);
      builder.registerSigSlot(amplitudeSignal, slotAmp);
      builder.registerSigSlot(biasSignal, slotBias);

      const inputs: ValueRefPacked[] = [
        { k: "sig", id: phaseSignal, slot: slotPhase },
        { k: "scalarConst", constId: waveformConstId },
        { k: "sig", id: amplitudeSignal, slot: slotAmp },
        { k: "sig", id: biasSignal, slot: slotBias },
      ];

      const ctx = {
        blockIdx: 0 as number,
        blockType: "Oscillator",
        instanceId: "test-osc-saw",
        inTypes: [typePhase, typeWaveform, typeNum, typeNum],
        outTypes: [typeNum],
        b: builder,
        seedConstId: 0,
      };

      const result = irDecl!.lower({ ctx, inputs });

      expect(result.outputsById).toBeDefined();
      expect(result.outputsById!.out).toBeDefined();
      expect(result.outputsById!.out.k).toBe("sig");
    });
  });

  describe("Legacy Closure Compilation (Dual-Emit Validation)", () => {
    it("should have both IR lowering and legacy closure compilation for AddSignal", () => {
      // Verify IR path exists
      const irDecl = getBlockType("AddSignal");
      expect(irDecl).toBeDefined();

      // Verify legacy path exists
      expect(AddSignalBlock).toBeDefined();
      expect(typeof AddSignalBlock.compile).toBe("function");
    });

    it("should have both paths for Oscillator", () => {
      const irDecl = getBlockType("Oscillator");
      expect(irDecl).toBeDefined();

      expect(OscillatorBlock).toBeDefined();
      expect(typeof OscillatorBlock.compile).toBe("function");
    });
  });
});
