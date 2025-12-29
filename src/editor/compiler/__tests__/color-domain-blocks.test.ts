/**
 * Color and Domain Block Tests (Sprint 2 P2-1)
 *
 * Tests IR lowering for color manipulation and domain creation blocks.
 * Validates ColorLFO hue rotation and domain block element creation.
 *
 * Reference: Sprint 2 P2-1 - Color/Domain Block Coverage
 */

import { describe, it, expect } from "vitest";
import { IRBuilderImpl } from "../ir/IRBuilderImpl";
import { getBlockType } from "../ir/lowerTypes";
import type { ValueRefPacked } from "../ir/lowerTypes";
import type { TypeDesc } from "../ir/types";
import type { BlockIndex } from "../ir/patches";

// Import block compilers to trigger registerBlockType() calls
import "../blocks/index";

describe("Color Domain Blocks", () => {
  describe("ColorLFO", () => {
    it("should lower ColorLFO with hue rotation", () => {
      const builder = new IRBuilderImpl();
      const irDecl = getBlockType("ColorLFO");
      expect(irDecl).toBeDefined();

      const typePhase: TypeDesc = { world: "signal", domain: "float", semantics: "phase(0..1)" };
      const typeColor: TypeDesc = { world: "signal", domain: "color" };

      const phaseSignal = builder.sigConst(0.5, typePhase);
      const slotPhase = builder.allocValueSlot(typePhase);
      builder.registerSigSlot(phaseSignal, slotPhase);

      const inputs: ValueRefPacked[] = [
        { k: "sig", id: phaseSignal, slot: slotPhase },
      ];

      const ctx = {
        blockIdx: 0 as BlockIndex,
        blockType: "ColorLFO",
        instanceId: "test-color-lfo",
        inTypes: [typePhase],
        outTypes: [typeColor],
        b: builder,
        seedConstId: 0,
      };

      const config = {
        base: "#FF0000", // Red
        hueSpan: 180, // Rotate 180 degrees
      };

      const result = irDecl!.lower({ ctx, inputs, config });

      expect(result.outputs).toHaveLength(1);
      expect(result.outputs[0].k).toBe("sig");

      // Verify signal expression was created
      const program = builder.build();
      expect(program.signalIR.nodes.length).toBeGreaterThan(0);
    });

    it("should handle different base colors", () => {
      const builder = new IRBuilderImpl();
      const irDecl = getBlockType("ColorLFO");
      expect(irDecl).toBeDefined();

      const typePhase: TypeDesc = { world: "signal", domain: "float", semantics: "phase(0..1)" };
      const typeColor: TypeDesc = { world: "signal", domain: "color" };

      const phaseSignal = builder.sigConst(0, typePhase);
      const slotPhase = builder.allocValueSlot(typePhase);
      builder.registerSigSlot(phaseSignal, slotPhase);

      const inputs: ValueRefPacked[] = [
        { k: "sig", id: phaseSignal, slot: slotPhase },
      ];

      const ctx = {
        blockIdx: 0 as BlockIndex,
        blockType: "ColorLFO",
        instanceId: "test-color-lfo-blue",
        inTypes: [typePhase],
        outTypes: [typeColor],
        b: builder,
        seedConstId: 0,
      };

      const config = {
        base: "#3B82F6", // Blue
        hueSpan: 360, // Full hue cycle
      };

      const result = irDecl!.lower({ ctx, inputs, config });

      expect(result.outputs).toHaveLength(1);
      expect(result.outputs[0].k).toBe("sig");
    });

    it("should handle zero hue span (static color)", () => {
      const builder = new IRBuilderImpl();
      const irDecl = getBlockType("ColorLFO");
      expect(irDecl).toBeDefined();

      const typePhase: TypeDesc = { world: "signal", domain: "float", semantics: "phase(0..1)" };
      const typeColor: TypeDesc = { world: "signal", domain: "color" };

      const phaseSignal = builder.sigConst(0.25, typePhase);
      const slotPhase = builder.allocValueSlot(typePhase);
      builder.registerSigSlot(phaseSignal, slotPhase);

      const inputs: ValueRefPacked[] = [
        { k: "sig", id: phaseSignal, slot: slotPhase },
      ];

      const ctx = {
        blockIdx: 0 as BlockIndex,
        blockType: "ColorLFO",
        instanceId: "test-color-static",
        inTypes: [typePhase],
        outTypes: [typeColor],
        b: builder,
        seedConstId: 0,
      };

      const config = {
        base: "#00FF00", // Green
        hueSpan: 0, // No rotation
      };

      const result = irDecl!.lower({ ctx, inputs, config });

      expect(result.outputs).toHaveLength(1);
      expect(result.outputs[0].k).toBe("sig");
    });
  });

  describe("DomainN", () => {
    it("should create domain with specified element count", () => {
      const builder = new IRBuilderImpl();
      const irDecl = getBlockType("DomainN");
      expect(irDecl).toBeDefined();

      // DomainN takes n as a scalar input
      const nConst = builder.allocConstId(10);
      const inputs: ValueRefPacked[] = [
        { k: "scalarConst", constId: nConst },
      ];

      const typeDomain: TypeDesc = { world: "special", domain: "domain" };
      const ctx = {
        blockIdx: 0 as BlockIndex,
        blockType: "DomainN",
        instanceId: "test-domain-10",
        inTypes: [{ world: "scalar" as const, domain: "float" as const }],
        outTypes: [typeDomain],
        b: builder,
        seedConstId: 0,
      };

      const result = irDecl!.lower({ ctx, inputs });

      expect(result.outputs).toHaveLength(1);
      expect(result.outputs[0].k).toBe("special");
      if (result.outputs[0].k === "special") {
        expect(result.outputs[0].tag).toBe("domain");
      }

      // Verify domain was created
      const program = builder.build();
      expect(program.domains.length).toBeGreaterThan(0);
      expect(program.domains[0].count).toBe(10);
    });

    it("should handle single element domain", () => {
      const builder = new IRBuilderImpl();
      const irDecl = getBlockType("DomainN");
      expect(irDecl).toBeDefined();

      const nConst = builder.allocConstId(1);
      const inputs: ValueRefPacked[] = [
        { k: "scalarConst", constId: nConst },
      ];

      const typeDomain: TypeDesc = { world: "special", domain: "domain" };
      const ctx = {
        blockIdx: 0 as BlockIndex,
        blockType: "DomainN",
        instanceId: "test-domain-1",
        inTypes: [{ world: "scalar" as const, domain: "float" as const }],
        outTypes: [typeDomain],
        b: builder,
        seedConstId: 0,
      };

      const result = irDecl!.lower({ ctx, inputs });

      expect(result.outputs).toHaveLength(1);
      const program = builder.build();
      expect(program.domains[0].count).toBe(1);
    });

    it("should handle large domain", () => {
      const builder = new IRBuilderImpl();
      const irDecl = getBlockType("DomainN");
      expect(irDecl).toBeDefined();

      const nConst = builder.allocConstId(1000);
      const inputs: ValueRefPacked[] = [
        { k: "scalarConst", constId: nConst },
      ];

      const typeDomain: TypeDesc = { world: "special", domain: "domain" };
      const ctx = {
        blockIdx: 0 as BlockIndex,
        blockType: "DomainN",
        instanceId: "test-domain-large",
        inTypes: [{ world: "scalar" as const, domain: "float" as const }],
        outTypes: [typeDomain],
        b: builder,
        seedConstId: 0,
      };

      const result = irDecl!.lower({ ctx, inputs });

      expect(result.outputs).toHaveLength(1);
      const program = builder.build();
      expect(program.domains[0].count).toBe(1000);
    });
  });

  describe("GridDomain", () => {
    it("should create grid domain with proper layout", () => {
      const builder = new IRBuilderImpl();
      const irDecl = getBlockType("GridDomain");
      expect(irDecl).toBeDefined();

      const typeDomain: TypeDesc = { world: "special", domain: "domain" };
      const typeVec2: TypeDesc = { world: "field", domain: "vec2" };

      const ctx = {
        blockIdx: 0 as BlockIndex,
        blockType: "GridDomain",
        instanceId: "test-grid",
        inTypes: [],
        outTypes: [typeDomain, typeVec2],
        b: builder,
        seedConstId: 0,
      };

      const config = {
        rows: 5,
        cols: 5,
        spacing: 20,
        originX: 0,
        originY: 0,
      };

      const result = irDecl!.lower({ ctx, inputs: [], config });

      expect(result.outputs).toHaveLength(2);
      expect(result.outputs[0].k).toBe("special"); // Domain output
      if (result.outputs[0].k === "special") {
        expect(result.outputs[0].tag).toBe("domain");
      }
      expect(result.outputs[1].k).toBe("field"); // Position field output

      // Verify domain was created with correct element count
      const program = builder.build();
      expect(program.domains.length).toBeGreaterThan(0);
      expect(program.domains[0].count).toBe(25); // 5x5 grid

      // Verify position field was created
      expect(program.fieldIR.nodes.length).toBeGreaterThan(0);
    });

    it("should handle rectangular grid", () => {
      const builder = new IRBuilderImpl();
      const irDecl = getBlockType("GridDomain");
      expect(irDecl).toBeDefined();

      const typeDomain: TypeDesc = { world: "special", domain: "domain" };
      const typeVec2: TypeDesc = { world: "field", domain: "vec2" };

      const ctx = {
        blockIdx: 0 as BlockIndex,
        blockType: "GridDomain",
        instanceId: "test-grid-rect",
        inTypes: [],
        outTypes: [typeDomain, typeVec2],
        b: builder,
        seedConstId: 0,
      };

      const config = {
        rows: 10,
        cols: 3,
        spacing: 15,
        originX: 100,
        originY: 50,
      };

      const result = irDecl!.lower({ ctx, inputs: [], config });

      expect(result.outputs).toHaveLength(2);
      const program = builder.build();
      expect(program.domains[0].count).toBe(30); // 10x3 grid
    });

    it("should handle custom spacing and origin", () => {
      const builder = new IRBuilderImpl();
      const irDecl = getBlockType("GridDomain");
      expect(irDecl).toBeDefined();

      const typeDomain: TypeDesc = { world: "special", domain: "domain" };
      const typeVec2: TypeDesc = { world: "field", domain: "vec2" };

      const ctx = {
        blockIdx: 0 as BlockIndex,
        blockType: "GridDomain",
        instanceId: "test-grid-custom",
        inTypes: [],
        outTypes: [typeDomain, typeVec2],
        b: builder,
        seedConstId: 0,
      };

      const config = {
        rows: 2,
        cols: 2,
        spacing: 50,
        originX: 200,
        originY: 300,
      };

      const result = irDecl!.lower({ ctx, inputs: [], config });

      expect(result.outputs).toHaveLength(2);
      const program = builder.build();
      expect(program.domains[0].count).toBe(4); // 2x2 grid
    });

    it("should support declaration of domain output", () => {
      const builder = new IRBuilderImpl();
      const irDecl = getBlockType("GridDomain");
      expect(irDecl).toBeDefined();

      const typeDomain: TypeDesc = { world: "special", domain: "domain" };
      const typeVec2: TypeDesc = { world: "field", domain: "vec2" };

      const ctx = {
        blockIdx: 0 as BlockIndex,
        blockType: "GridDomain",
        instanceId: "test-grid-decl",
        inTypes: [],
        outTypes: [typeDomain, typeVec2],
        b: builder,
        seedConstId: 0,
      };

      const config = {
        rows: 3,
        cols: 3,
        spacing: 30,
        originX: 0,
        originY: 0,
      };

      const result = irDecl!.lower({ ctx, inputs: [], config });

      // Verify domain declaration
      expect(result.declares).toBeDefined();
      expect(result.declares?.domainOut).toBeDefined();
      expect(result.declares?.domainOut?.outPortIndex).toBe(0);
      expect(result.declares?.domainOut?.domainKind).toBe("domain");
    });
  });

  describe("SVGSampleDomain", () => {
    it("should be registered with IR lowering", () => {
      const irDecl = getBlockType("SVGSampleDomain");
      expect(irDecl).toBeDefined();
      expect(irDecl?.capability).toBe("identity");
    });
  });

  describe("Integration Tests", () => {
    it("should allow composing ColorLFO with domain blocks", () => {
      const builder = new IRBuilderImpl();

      // Create a domain
      const domainDecl = getBlockType("DomainN");
      expect(domainDecl).toBeDefined();

      const nConst = builder.allocConstId(5);
      const domainInputs: ValueRefPacked[] = [
        { k: "scalarConst", constId: nConst },
      ];

      const domainCtx = {
        blockIdx: 0 as BlockIndex,
        blockType: "DomainN",
        instanceId: "domain-for-color",
        inTypes: [{ world: "scalar" as const, domain: "float" as const }],
        outTypes: [{ world: "special" as const, domain: "domain" as const }],
        b: builder,
        seedConstId: 0,
      };

      const domainResult = domainDecl!.lower({ ctx: domainCtx, inputs: domainInputs });
      expect(domainResult.outputs).toHaveLength(1);

      // Create a color signal
      const colorDecl = getBlockType("ColorLFO");
      expect(colorDecl).toBeDefined();

      const typePhase: TypeDesc = { world: "signal", domain: "float", semantics: "phase(0..1)" };
      const phaseSignal = builder.sigConst(0.5, typePhase);
      const slotPhase = builder.allocValueSlot(typePhase);
      builder.registerSigSlot(phaseSignal, slotPhase);

      const colorInputs: ValueRefPacked[] = [
        { k: "sig", id: phaseSignal, slot: slotPhase },
      ];

      const colorCtx = {
        blockIdx: 1 as BlockIndex,
        blockType: "ColorLFO",
        instanceId: "color-lfo",
        inTypes: [typePhase],
        outTypes: [{ world: "signal" as const, domain: "color" as const }],
        b: builder,
        seedConstId: 0,
      };

      const colorConfig = {
        base: "#FF00FF",
        hueSpan: 120,
      };

      const colorResult = colorDecl!.lower({ ctx: colorCtx, inputs: colorInputs, config: colorConfig });
      expect(colorResult.outputs).toHaveLength(1);

      // Verify both were created
      const program = builder.build();
      expect(program.domains.length).toBeGreaterThan(0);
      expect(program.signalIR.nodes.length).toBeGreaterThan(0);
    });
  });
});
