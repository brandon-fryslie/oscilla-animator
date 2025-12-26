/**
 * IRBuilder Tests
 *
 * Tests for the IRBuilder implementation.
 * Verifies ID allocation, constant deduplication, and IR node creation.
 */

import { describe, it, expect } from "vitest";
import { IRBuilderImpl } from "../IRBuilderImpl";
import type { TypeDesc } from "../types";

// Helper to create a simple TypeDesc
function makeType(world: "signal" | "field", domain: string): TypeDesc {
  return {
    world,
    domain: domain as TypeDesc["domain"],
  };
}

describe("IRBuilder", () => {
  describe("ID Allocation", () => {
    it("allocates sequential signal expression IDs starting from 0", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("signal", "number");

      const id0 = builder.sigConst(1, type);
      const id1 = builder.sigConst(2, type);
      const id2 = builder.sigConst(3, type);

      expect(id0).toBe(0);
      expect(id1).toBe(1);
      expect(id2).toBe(2);
    });

    it("allocates sequential field expression IDs starting from 0", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("field", "number");

      const id0 = builder.fieldConst([1], type);
      const id1 = builder.fieldConst([2], type);
      const id2 = builder.fieldConst([3], type);

      expect(id0).toBe(0);
      expect(id1).toBe(1);
      expect(id2).toBe(2);
    });

    it("signal and field IDs are independent", () => {
      const builder = new IRBuilderImpl();
      const sigType = makeType("signal", "number");
      const fieldType = makeType("field", "number");

      const sigId = builder.sigConst(1, sigType);
      const fieldId = builder.fieldConst([1], fieldType);

      expect(sigId).toBe(0);
      expect(fieldId).toBe(0);
    });
  });

  describe("Signal Expressions", () => {
    it("creates a const node with correct structure", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("signal", "number");

      const id = builder.sigConst(42, type);

      const ir = builder.build();
      const node = ir.signalIR.nodes[id];

      expect(node.kind).toBe("const");
      expect(node.type).toEqual(type);
      expect(node).toHaveProperty("constId");
      // Type-safe access to constId
      if (node.kind === "const") {
        expect(ir.constants[node.constId]).toBe(42);
      }
    });

    it("creates a map node with correct structure", () => {
      const builder = new IRBuilderImpl();
      const srcType = makeType("signal", "number");
      const outputType = makeType("signal", "number");

      const src = builder.sigConst(10, srcType);
      const mapped = builder.sigMap(src, {
        fnId: "double",
        outputType,
        params: { factor: 2 },
      });

      const ir = builder.build();
      const node = ir.signalIR.nodes[mapped];

      expect(node.kind).toBe("map");
      expect(node.type).toEqual(outputType);
      if (node.kind === "map") {
        expect(node.src).toBe(src);
        expect(node.fn.kind).toBe("kernel");
        if (node.fn.kind === "kernel") {
          expect(node.fn.kernelId).toBe("double");
        }
      }
    });

    it("creates a zip node with correct structure", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("signal", "number");

      const a = builder.sigConst(10, type);
      const b = builder.sigConst(20, type);
      const zipped = builder.sigZip(a, b, {
        fnId: "add",
        outputType: type,
      });

      const ir = builder.build();
      const node = ir.signalIR.nodes[zipped];

      expect(node.kind).toBe("zip");
      if (node.kind === "zip") {
        expect(node.a).toBe(a);
        expect(node.b).toBe(b);
      }
    });

    it("creates a timeAbsMs node", () => {
      const builder = new IRBuilderImpl();

      const id = builder.sigTimeAbsMs();

      const ir = builder.build();
      const node = ir.signalIR.nodes[id];

      expect(node.kind).toBe("timeAbsMs");
      expect(node.type.world).toBe("signal");
      expect(node.type.domain).toBe("timeMs");
    });

    it("creates a phase01 node", () => {
      const builder = new IRBuilderImpl();

      const id = builder.sigPhase01();

      const ir = builder.build();
      const node = ir.signalIR.nodes[id];

      expect(node.kind).toBe("phase01");
      expect(node.type.world).toBe("signal");
      expect(node.type.domain).toBe("phase01");
    });

    it("creates a select node", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("signal", "number");
      const boolType = makeType("signal", "boolean");

      const cond = builder.sigConst(1, boolType);
      const t = builder.sigConst(10, type);
      const f = builder.sigConst(20, type);
      const selected = builder.sigSelect(cond, t, f, type);

      const ir = builder.build();
      const node = ir.signalIR.nodes[selected];

      expect(node.kind).toBe("select");
      if (node.kind === "select") {
        expect(node.cond).toBe(cond);
        expect(node.t).toBe(t);
        expect(node.f).toBe(f);
      }
    });
  });

  describe("Constant Deduplication", () => {
    it("deduplicates identical constant values", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("signal", "number");

      const id1 = builder.sigConst(42, type);
      const id2 = builder.sigConst(42, type);

      const ir = builder.build();
      const node1 = ir.signalIR.nodes[id1];
      const node2 = ir.signalIR.nodes[id2];

      // Different signal IDs
      expect(id1).not.toBe(id2);

      // But same constant ID
      expect(node1.kind).toBe("const");
      expect(node2.kind).toBe("const");
      if (node1.kind === "const" && node2.kind === "const") {
        expect(node1.constId).toBe(node2.constId);
      }

      // Constant pool has only one entry
      expect(ir.constants).toHaveLength(1);
      expect(ir.constants[0]).toBe(42);
    });

    it("does NOT deduplicate different values", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("signal", "number");

      const id1 = builder.sigConst(42, type);
      const id2 = builder.sigConst(99, type);

      const ir = builder.build();
      const node1 = ir.signalIR.nodes[id1];
      const node2 = ir.signalIR.nodes[id2];

      expect(node1.kind).toBe("const");
      expect(node2.kind).toBe("const");
      if (node1.kind === "const" && node2.kind === "const") {
        expect(node1.constId).not.toBe(node2.constId);
      }

      expect(ir.constants).toHaveLength(2);
      expect(ir.constants).toContain(42);
      expect(ir.constants).toContain(99);
    });
  });

  describe("Build Result", () => {
    it("returns BuilderProgramIR with populated signalIR.nodes", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("signal", "number");

      builder.sigConst(1, type);
      builder.sigConst(2, type);
      builder.sigTimeAbsMs();

      const ir = builder.build();

      expect(ir.signalIR).toBeDefined();
      expect(ir.signalIR.nodes).toHaveLength(3);
      expect(ir.fieldIR).toBeDefined();
      expect(ir.constants).toBeDefined();
      expect(ir.stateLayout).toBeDefined();
      expect(ir.transformChains).toBeDefined();
      expect(ir.renderSinks).toBeDefined();
      expect(ir.debugIndex).toBeDefined();
      expect(ir.timeModel).toBeDefined();
    });

    it("includes all constants in the constant pool", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("signal", "number");

      builder.sigConst(100, type);
      builder.sigConst(200, type);
      builder.sigConst(100, type); // Duplicate - should be deduplicated

      const ir = builder.build();

      expect(ir.constants).toHaveLength(2);
      expect(ir.constants).toContain(100);
      expect(ir.constants).toContain(200);
    });

    it("has correct structure for empty builder", () => {
      const builder = new IRBuilderImpl();
      const ir = builder.build();

      expect(ir.signalIR.nodes).toHaveLength(0);
      expect(ir.fieldIR.nodes).toHaveLength(0);
      expect(ir.constants).toHaveLength(0);
      expect(ir.timeModel.kind).toBe("infinite");
    });
  });

  describe("Field Expressions", () => {
    it("creates a field const node", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("field", "number");

      const id = builder.fieldConst([1, 2, 3], type);

      const ir = builder.build();
      const node = ir.fieldIR.nodes[id];

      expect(node.kind).toBe("const");
      expect(node.type).toEqual(type);
      if (node.kind === "const") {
        expect(ir.constants[node.constId]).toEqual([1, 2, 3]);
      }
    });

    it("creates a field map node", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("field", "number");

      const src = builder.fieldConst([1, 2, 3], type);
      const mapped = builder.fieldMap(src, {
        fnId: "double",
        outputType: type,
      });

      const ir = builder.build();
      const node = ir.fieldIR.nodes[mapped];

      expect(node.kind).toBe("map");
      if (node.kind === "map") {
        expect(node.src).toBe(src);
      }
    });

    it("creates a broadcastSig node", () => {
      const builder = new IRBuilderImpl();
      const sigType = makeType("signal", "number");
      const fieldType = makeType("field", "number");

      const sig = builder.sigConst(42, sigType);
      const domainSlot = builder.domainFromN(10);
      const field = builder.broadcastSigToField(sig, domainSlot, fieldType);

      const ir = builder.build();
      const node = ir.fieldIR.nodes[field];

      expect(node.kind).toBe("broadcastSig");
      if (node.kind === "broadcastSig") {
        expect(node.sig).toBe(sig);
        expect(node.domainSlot).toBe(domainSlot);
      }
    });
  });

  describe("State Allocation", () => {
    it("allocates state with correct metadata", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("signal", "number");

      const stateId = builder.allocStateId(type, 0, "counter");

      const ir = builder.build();
      const entry = ir.stateLayout[stateId];

      expect(entry.stateId).toBe(stateId);
      expect(entry.type).toEqual(type);
      expect(entry.initial).toBe(0);
      expect(entry.debugName).toBe("counter");
    });

    it("creates stateful signal node", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("signal", "number");

      const input = builder.sigConst(1, type);
      const stateId = builder.allocStateId(type, 0, "accumulator");
      const stateful = builder.sigStateful("integrate", input, stateId, type);

      const ir = builder.build();
      const node = ir.signalIR.nodes[stateful];

      expect(node.kind).toBe("stateful");
      if (node.kind === "stateful") {
        expect(node.op).toBe("integrate");
        expect(node.input).toBe(input);
        expect(node.stateId).toBe(stateId);
      }
    });
  });

  describe("Transform Chains", () => {
    it("creates a transform chain", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("signal", "number");

      const chainId = builder.transformChain(
        [
          { kind: "scaleBias", scale: 2, bias: 0 },
          { kind: "scaleBias", scale: 1, bias: 10 },
        ],
        type
      );

      const ir = builder.build();
      const chain = ir.transformChains[chainId];

      expect(chain.steps).toHaveLength(2);
      expect(chain.steps[0].kind).toBe("scaleBias");
      expect(chain.steps[1].kind).toBe("scaleBias");
      expect(chain.outputType).toEqual(type);
    });

    it("applies transform chain to signal", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("signal", "number");

      const src = builder.sigConst(5, type);
      const chainId = builder.transformChain([{ kind: "scaleBias", scale: 2, bias: 0 }], type);
      const transformed = builder.sigTransform(src, chainId);

      const ir = builder.build();
      const node = ir.signalIR.nodes[transformed];

      expect(node.kind).toBe("transform");
      if (node.kind === "transform") {
        expect(node.src).toBe(src);
        expect(node.chain).toBe(chainId);
      }
    });
  });

  describe("Value Slots", () => {
    it("allocates sequential value slots", () => {
      const builder = new IRBuilderImpl();

      const slot0 = builder.allocValueSlot();
      const slot1 = builder.allocValueSlot();
      const slot2 = builder.allocValueSlot();

      expect(slot0).toBe(0);
      expect(slot1).toBe(1);
      expect(slot2).toBe(2);
    });

    it("domainFromN allocates a value slot", () => {
      const builder = new IRBuilderImpl();

      const domainSlot = builder.domainFromN(100);

      expect(typeof domainSlot).toBe("number");
      expect(domainSlot).toBe(0);

      const nextSlot = builder.allocValueSlot();
      expect(nextSlot).toBe(1);
    });
  });

  describe("Render Sinks", () => {
    it("registers render sinks", () => {
      const builder = new IRBuilderImpl();
      const slot0 = builder.allocValueSlot();
      const slot1 = builder.allocValueSlot();

      builder.renderSink("canvas", { position: slot0, color: slot1 });

      const ir = builder.build();

      expect(ir.renderSinks).toHaveLength(1);
      expect(ir.renderSinks[0].sinkType).toBe("canvas");
      expect(ir.renderSinks[0].inputs.position).toBe(slot0);
      expect(ir.renderSinks[0].inputs.color).toBe(slot1);
    });
  });
});
