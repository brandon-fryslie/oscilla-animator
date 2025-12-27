/**
 * Tests for Pure Block Compilation Validator
 *
 * Validates that pure blocks cannot emit artifacts requiring kernel capabilities.
 *
 * Note: AST enforcement for operator blocks is deferred to future IR migration.
 * These tests focus on forbidden artifact kinds only.
 */

import { describe, it, expect } from "vitest";
import { validatePureBlockOutput } from "../pure-block-validator";
import type { Artifact } from "../types";

describe("validatePureBlockOutput", () => {
  // ==========================================================================
  // Test: Pure blocks can emit allowed artifact kinds
  // ==========================================================================

  it("allows pure blocks to emit Signal artifacts", () => {
    const outputs = new Map<string, Artifact>([
      ["out", { kind: "Signal:number", value: (t: number) => t }],
    ]);

    expect(() => {
      validatePureBlockOutput("TestSignalBlock", "composite", outputs);
    }).not.toThrow();
  });

  it("allows pure blocks to emit Field artifacts", () => {
    const outputs = new Map<string, Artifact>([
      ["out", { kind: "Field:vec2", value: () => [] }],
    ]);

    expect(() => {
      validatePureBlockOutput("TestFieldBlock", "composite", outputs);
    }).not.toThrow();
  });

  it("allows pure blocks to emit Scalar artifacts", () => {
    const outputs = new Map<string, Artifact>([
      ["out", { kind: "Scalar:number", value: 42 }],
    ]);

    expect(() => {
      validatePureBlockOutput("TestScalarBlock", "composite", outputs);
    }).not.toThrow();
  });

  it("allows pure blocks to emit PhaseMachine artifacts", () => {
    const outputs = new Map<string, Artifact>([
      [
        "out",
        {
          kind: "PhaseMachine",
          value: {
            sample: (tMs: number) => ({
              phase: "intro",
              u: 0.5,
              uRaw: 0.5,
              tLocal: tMs,
            }),
          },
        },
      ],
    ]);

    expect(() => {
      validatePureBlockOutput("TestPhaseMachineBlock", "composite", outputs);
    }).not.toThrow();
  });

  it("allows pure blocks to emit Spec artifacts", () => {
    const outputs = new Map<string, Artifact>([
      ["out", { kind: "Spec:Particles", value: {} }],
    ]);

    expect(() => {
      validatePureBlockOutput("TestSpecBlock", "spec", outputs);
    }).not.toThrow();
  });

  // ==========================================================================
  // Test: Pure blocks CANNOT emit RenderTree artifacts
  // ==========================================================================

  it("rejects pure blocks emitting RenderTree", () => {
    const outputs = new Map<string, Artifact>([
      [
        "out",
        {
          kind: "RenderTree",
          value: () => ({ kind: "group", id: "root", children: [] }),
        },
      ],
    ]);

    expect(() => {
      validatePureBlockOutput("BadRenderBlock", "composite", outputs);
    }).toThrow(/cannot emit artifact kind "RenderTree"/);
  });

  it("rejects pure blocks emitting RenderTreeProgram", () => {
    const outputs = new Map<string, Artifact>([
      [
        "out",
        {
          kind: "RenderTreeProgram",
          value: {
            signal: () => ({ kind: "group", id: "root", children: [] }),
            event: () => [],
          },
        },
      ],
    ]);

    expect(() => {
      validatePureBlockOutput("BadProgramBlock", "composite", outputs);
    }).toThrow(/cannot emit artifact kind "RenderTreeProgram"/);
  });

  it("rejects pure blocks emitting RenderNode", () => {
    const outputs = new Map<string, Artifact>([
      ["out", { kind: "RenderNode", value: { kind: "group", id: "root", children: [] } }],
    ]);

    expect(() => {
      validatePureBlockOutput("BadNodeBlock", "composite", outputs);
    }).toThrow(/cannot emit artifact kind "RenderNode"/);
  });

  it("rejects pure blocks emitting CanvasRender", () => {
    const outputs = new Map<string, Artifact>([
      [
        "out",
        {
          kind: "CanvasRender",
          value: () => ({ kind: "group" as const, id: "root", children: [] }),
        },
      ],
    ]);

    expect(() => {
      validatePureBlockOutput("BadCanvasBlock", "composite", outputs);
    }).toThrow(/cannot emit artifact kind "CanvasRender"/);
  });

  // ==========================================================================
  // Test: Pure blocks CANNOT emit Domain artifacts
  // ==========================================================================

  it("rejects pure blocks emitting Domain", () => {
    const outputs = new Map<string, Artifact>([
      ["out", { kind: "Domain", value: { id: "test", elements: [] } }],
    ]);

    expect(() => {
      validatePureBlockOutput("BadDomainBlock", "composite", outputs);
    }).toThrow(/cannot emit artifact kind "Domain"/);
  });

  // ==========================================================================
  // Test: Pure blocks CANNOT emit ExternalAsset artifacts (future)
  // ==========================================================================

  it("rejects pure blocks emitting ExternalAsset", () => {
    const outputs = new Map<string, Artifact>([
      ["out", { kind: "ExternalAsset", value: {} }],
    ]);

    expect(() => {
      validatePureBlockOutput("BadAssetBlock", "composite", outputs);
    }).toThrow(/cannot emit artifact kind "ExternalAsset"/);
  });

  // ==========================================================================
  // Test: Operator blocks (future AST enforcement - not tested yet)
  // ==========================================================================

  it("allows operator blocks to emit closures during transition period", () => {
    const outputs = new Map<string, Artifact>([
      ["out", { kind: "Signal:number", value: (t: number) => t * 2 }],
    ]);

    // During transition, operator blocks CAN emit closures
    // Future: This will require AST nodes once IR migration is complete
    expect(() => {
      validatePureBlockOutput("OperatorWithClosure", "operator", outputs);
    }).not.toThrow();
  });

  it("allows composite blocks to emit closures", () => {
    const outputs = new Map<string, Artifact>([
      ["out", { kind: "Signal:number", value: (t: number) => t * 2 }],
    ]);

    // Composite blocks CAN emit closures - they're not required to be AST
    expect(() => {
      validatePureBlockOutput("CompositeWithClosure", "composite", outputs);
    }).not.toThrow();
  });

  // ==========================================================================
  // Test: Multiple outputs validation
  // ==========================================================================

  it("validates all outputs and reports first violation", () => {
    const outputs = new Map<string, Artifact>([
      ["signal", { kind: "Signal:number", value: (t: number) => t }],
      [
        "render",
        {
          kind: "RenderTree",
          value: () => ({ kind: "group", id: "root", children: [] }),
        },
      ], // Violation!
      ["field", { kind: "Field:vec2", value: () => [] }],
    ]);

    expect(() => {
      validatePureBlockOutput("MultiOutputBlock", "composite", outputs);
    }).toThrow(/cannot emit artifact kind "RenderTree"/);
  });

  it("passes validation when all outputs are allowed", () => {
    const outputs = new Map<string, Artifact>([
      ["signal", { kind: "Signal:number", value: (t: number) => t }],
      ["field", { kind: "Field:vec2", value: () => [] }],
      ["scalar", { kind: "Scalar:number", value: 42 }],
    ]);

    expect(() => {
      validatePureBlockOutput("GoodMultiOutputBlock", "composite", outputs);
    }).not.toThrow();
  });

  // ==========================================================================
  // Test: Error messages are descriptive
  // ==========================================================================

  it("includes block type in error message", () => {
    const outputs = new Map<string, Artifact>([
      [
        "out",
        {
          kind: "RenderTree",
          value: () => ({ kind: "group", id: "root", children: [] }),
        },
      ],
    ]);

    expect(() => {
      validatePureBlockOutput("MyCustomBlock", "composite", outputs);
    }).toThrow(/MyCustomBlock/);
  });

  it("includes port ID in error message", () => {
    const outputs = new Map<string, Artifact>([
      ["myPort", { kind: "Domain", value: { id: "test", elements: [] } }],
    ]);

    expect(() => {
      validatePureBlockOutput("TestBlock", "composite", outputs);
    }).toThrow(/myPort/);
  });

  it("includes suggested capability in error message", () => {
    const outputs = new Map<string, Artifact>([
      [
        "out",
        {
          kind: "RenderTree",
          value: () => ({ kind: "group", id: "root", children: [] }),
        },
      ],
    ]);

    expect(() => {
      validatePureBlockOutput("TestBlock", "composite", outputs);
    }).toThrow(/requires kernel capability/);
  });
});
