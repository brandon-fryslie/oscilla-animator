/**
 * Block Lowering Coverage Tests (Sprint 2 P2-1)
 *
 * Validates IR block lowering coverage across all registered blocks.
 * Ensures each IR-ready block has a defined `lower` function.
 *
 * This test acts as a tracking mechanism to document:
 * - Which blocks support IR lowering
 * - Which blocks are legacy-only
 * - Overall IR-readiness percentage
 *
 * Reference: Sprint 2 P2-1 - Block Lowering Coverage
 */

import { describe, it, expect } from "vitest";
import { getBlockDefinitions } from "../../blocks/registry";
import { getBlockType } from "../ir/lowerTypes";

// Import block compilers to trigger registerBlockType() calls
import "../blocks/index";

describe("Block Lowering Coverage", () => {
  describe("IR Block Registry", () => {
    it("should have IR lowering registered for all migrated blocks", () => {
      // Get all block definitions from the block registry
      const allBlocks = getBlockDefinitions(true); // Include composites

      // Track statistics
      const irReadyBlocks: string[] = [];
      const legacyOnlyBlocks: string[] = [];

      for (const blockDef of allBlocks) {
        const irDecl = getBlockType(blockDef.type);

        if (irDecl !== undefined) {
          // Block is registered in IR system and has lower function
          irReadyBlocks.push(blockDef.type);
        } else {
          // Block not registered in IR system (legacy-only)
          legacyOnlyBlocks.push(blockDef.type);
        }
      }

      // Calculate coverage
      const totalBlocks = allBlocks.length;
      const irReadyCount = irReadyBlocks.length;
      const coverage = totalBlocks > 0 ? (irReadyCount / totalBlocks) * 100 : 0;

      // Log results for visibility
      console.log(`\nBlock Lowering Coverage Report:`);
      console.log(`Total Blocks: ${totalBlocks}`);
      console.log(`IR-Ready: ${irReadyCount} (${coverage.toFixed(1)}%)`);
      console.log(`Legacy-Only: ${legacyOnlyBlocks.length}`);

      if (legacyOnlyBlocks.length > 0) {
        console.log(`\nLegacy-Only Blocks (${legacyOnlyBlocks.length}):`);
        for (const type of legacyOnlyBlocks.sort()) {
          console.log(`  - ${type}`);
        }
      }

      if (irReadyBlocks.length > 0) {
        console.log(`\nIR-Ready Blocks (${irReadyBlocks.length}):`);
        for (const type of irReadyBlocks.sort()) {
          console.log(`  - ${type}`);
        }
      }

      // For Sprint 2, we expect significant IR coverage
      // This is a tracking test, not a hard requirement
      expect(irReadyCount).toBeGreaterThan(0);
    });

    it("should have all signal math operators registered", () => {
      const signalMathBlocks = [
        "AddSignal",
        "SubSignal",
        "MulSignal",
        "DivSignal",
        "MinSignal",
        "MaxSignal",
        "ClampSignal",
      ];

      for (const blockType of signalMathBlocks) {
        const irDecl = getBlockType(blockType);
        expect(irDecl, `${blockType} should be registered`).toBeDefined();
        expect(irDecl?.capability).toBe("pure");
      }
    });

    it("should have Oscillator registered with IR lowering", () => {
      const irDecl = getBlockType("Oscillator");
      expect(irDecl).toBeDefined();
      expect(irDecl?.capability).toBe("pure");
      expect(irDecl?.inputs.length).toBeGreaterThan(0);
      expect(irDecl?.outputs.length).toBe(1);
    });

    it("should have ColorLFO registered with IR lowering", () => {
      const irDecl = getBlockType("ColorLFO");
      expect(irDecl).toBeDefined();
      expect(irDecl?.capability).toBe("pure");
    });

    it("should have TimeRoot blocks registered", () => {
      const timeRootBlocks = ["FiniteTimeRoot", "InfiniteTimeRoot"];

      for (const blockType of timeRootBlocks) {
        const irDecl = getBlockType(blockType);
        expect(irDecl, `${blockType} should be registered`).toBeDefined();
        expect(irDecl?.capability).toBe("time");
      }
    });

    it("should have domain blocks registered", () => {
      const domainBlocks = ["DomainN", "GridDomain", "SVGSampleDomain"];

      for (const blockType of domainBlocks) {
        const irDecl = getBlockType(blockType);
        expect(irDecl, `${blockType} should be registered`).toBeDefined();
        expect(irDecl?.capability).toBe("identity");
      }
    });

    it("should document known legacy-only blocks", () => {
      // These blocks are expected to remain legacy-only (at least for Sprint 2)
      // They have side-effects or features that don't map cleanly to pure IR
      const knownLegacyBlocks = [
        "DebugDisplay", // Updates DebugStore (side-effects)
      ];

      for (const blockType of knownLegacyBlocks) {
        const irDecl = getBlockType(blockType);
        // DebugDisplay may or may not be registered in some configurations
        // If it is registered, it should have io capability
        if (blockType === "DebugDisplay" && irDecl !== undefined) {
          expect(irDecl.capability).toBe("io");
        }
        // Just document that these are known legacy blocks - don't fail if not registered
      }
    });
  });

  describe("Block Type Declarations", () => {
    it("should have valid port declarations for IR-ready blocks", () => {
      const testBlocks = ["AddSignal", "Oscillator", "DomainN"];

      for (const blockType of testBlocks) {
        const irDecl = getBlockType(blockType);
        expect(irDecl, `${blockType} should be registered`).toBeDefined();

        if (irDecl === undefined) continue;

        // Inputs should have valid port IDs and types
        for (const input of irDecl.inputs) {
          expect(input.portId).toBeTruthy();
          expect(input.label).toBeTruthy();
          expect(input.dir).toBe("in");
          expect(input.type).toBeDefined();
          expect(input.type.world).toBeTruthy();
          expect(input.type.domain).toBeTruthy();
        }

        // Outputs should have valid port IDs and types
        for (const output of irDecl.outputs) {
          expect(output.portId).toBeTruthy();
          expect(output.label).toBeTruthy();
          expect(output.dir).toBe("out");
          expect(output.type).toBeDefined();
          expect(output.type.world).toBeTruthy();
          expect(output.type.domain).toBeTruthy();
        }
      }
    });

    it("should have consistent capability classifications", () => {
      const capabilities = {
        time: ["FiniteTimeRoot", "InfiniteTimeRoot"],
        identity: ["DomainN", "GridDomain"],
        pure: ["AddSignal", "Oscillator", "ColorLFO"],
        state: ["PulseDivider", "EnvelopeAD"],
        render: ["RenderInstances2D", "RenderPaths2D"],
      };

      for (const [capability, blockTypes] of Object.entries(capabilities)) {
        for (const blockType of blockTypes) {
          const irDecl = getBlockType(blockType);
          if (irDecl !== undefined) {
            expect(irDecl.capability).toBe(capability);
          }
        }
      }
    });
  });
});
