/**
 * IRBuilder Tests
 *
 * Tests for the IRBuilder implementation.
 * Verifies ID allocation, constant deduplication, and IR node creation.
 */

import { describe, it, expect } from "vitest";
import { IRBuilderImpl } from "../IRBuilderImpl";
<<<<<<< HEAD
import type { TypeDesc } from "../types";
import { asTypeDesc } from "../types";
=======
import type { TypeDesc } from } from "../types";;
import { asTypeDesc } from
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)

// Helper to create a simple TypeDesc
function makeType(world: "signal" | "field", domain: string): TypeDesc {
  return asTypeDesc({
    world,
    domain: domain as TypeDesc["domain"],
  });
}

describe("IRBuilder", () => {
  describe("ID Allocation", () => {
    it("allocates sequential signal expression IDs starting from 0", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("signal", "float");

      const id0 = builder.sigConst(1, type);
      const id1 = builder.sigConst(2, type);
      const id2 = builder.sigConst(3, type);

      expect(id0).toBe(0);
      expect(id1).toBe(1);
      expect(id2).toBe(2);
    });

    it("allocates sequential field expression IDs starting from 0", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("field", "float");

      const id0 = builder.fieldConst([1], type);
      const id1 = builder.fieldConst([2], type);
      const id2 = builder.fieldConst([3], type);

      expect(id0).toBe(0);
      expect(id1).toBe(1);
      expect(id2).toBe(2);
    });

    it("signal and field IDs are independent", () => {
      const builder = new IRBuilderImpl();
      const sigType = makeType("signal", "float");
      const fieldType = makeType("field", "float");

      const sigId = builder.sigConst(1, sigType);
      const fieldId = builder.fieldConst([1], fieldType);

      expect(sigId).toBe(0);
      expect(fieldId).toBe(0);
    });
  });

  describe("Signal Expressions", () => {
    it("creates a const node with correct structure", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("signal", "float");

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
      const srcType = makeType("signal", "float");
      const outputType = makeType("signal", "float");

      const src = builder.sigConst(10, srcType);
      const mapped = builder.sigMap(src, {
        kind: "kernel",
        kernelId: "double",
      }, outputType);

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
      const type = makeType("signal", "float");

      const a = builder.sigConst(10, type);
      const b = builder.sigConst(20, type);
      const zipped = builder.sigZip(a, b, {
        kind: "kernel",
        kernelId: "add",
      }, type);

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
      expect(node.type.domain).toBe("float");
    });

    it("creates a select node", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("signal", "float");
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
      const type = makeType("signal", "float");

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
      const type = makeType("signal", "float");

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
      const type = makeType("signal", "float");

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
      const type = makeType("signal", "float");

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
      const type = makeType("field", "float");

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
      const type = makeType("field", "float");

      const src = builder.fieldConst([1, 2, 3], type);
      const mapped = builder.fieldMap(src, {
        kind: "kernel",
        kernelId: "double",
      }, type);

      const ir = builder.build();
      const node = ir.fieldIR.nodes[mapped];

      expect(node.kind).toBe("map");
      if (node.kind === "map") {
        expect(node.src).toBe(src);
      }
    });

    it("creates a broadcastSig node", () => {
      const builder = new IRBuilderImpl();
      const sigType = makeType("signal", "float");
      const fieldType = makeType("field", "float");

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
      const type = makeType("signal", "float");

      const stateId = builder.allocStateId(type, 0, "counter");

      const ir = builder.build();
      // stateLayout is an array, need to find the entry
      const entry = ir.stateLayout.find(e => e.stateId === stateId);

      expect(entry).toBeDefined();
      expect(entry?.stateId).toBe(stateId);
      expect(entry?.type).toEqual(type);
      expect(entry?.initial).toBe(0);
      expect(entry?.debugName).toBe("counter");
    });

    it("creates stateful signal node", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("signal", "float");

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
      const type = makeType("signal", "float");

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
      const type = makeType("signal", "float");

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

  describe("Debug Index Population", () => {
    it("tracks sigExprSource when currentBlockId is set", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("signal", "float");

      builder.setCurrentBlockId("Block#1");
      const sig1 = builder.sigConst(42, type);
      const sig2 = builder.sigTimeAbsMs();

      builder.setCurrentBlockId("Block#2");
      const sig3 = builder.sigPhase01();

      const ir = builder.build();

      expect(ir.debugIndex.sigExprSource.get(sig1)).toBe("Block#1");
      expect(ir.debugIndex.sigExprSource.get(sig2)).toBe("Block#1");
      expect(ir.debugIndex.sigExprSource.get(sig3)).toBe("Block#2");
    });

    it("tracks fieldExprSource when currentBlockId is set", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("field", "float");

      builder.setCurrentBlockId("FieldBlock#1");
      const field1 = builder.fieldConst([1, 2, 3], type);

      builder.setCurrentBlockId("FieldBlock#2");
      const field2 = builder.fieldConst([4, 5, 6], type);

      const ir = builder.build();

      expect(ir.debugIndex.fieldExprSource.get(field1)).toBe("FieldBlock#1");
      expect(ir.debugIndex.fieldExprSource.get(field2)).toBe("FieldBlock#2");
    });

    it("tracks slotSource when currentBlockId and debugName are set", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("signal", "float");

      builder.setCurrentBlockId("TimeRoot#1");
      const slot1 = builder.allocValueSlot(type, "phase01");
      builder.trackSlotSource(slot1, "phase01"); // Explicitly track
      const slot2 = builder.allocValueSlot(type, "tModelMs");
      builder.trackSlotSource(slot2, "tModelMs"); // Explicitly track

      builder.setCurrentBlockId("Oscillator#1");
      const slot3 = builder.allocValueSlot(type, "output");
      builder.trackSlotSource(slot3, "output"); // Explicitly track

      const ir = builder.build();

      expect(ir.debugIndex.slotSource.get(slot1)).toEqual({ blockId: "TimeRoot#1", slotId: "phase01" });
      expect(ir.debugIndex.slotSource.get(slot2)).toEqual({ blockId: "TimeRoot#1", slotId: "tModelMs" });
      expect(ir.debugIndex.slotSource.get(slot3)).toEqual({ blockId: "Oscillator#1", slotId: "output" });
    });

    it("does not track when currentBlockId is undefined", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("signal", "float");

      // No setCurrentBlockId call
      const sig = builder.sigConst(42, type);

      const ir = builder.build();

      expect(ir.debugIndex.sigExprSource.get(sig)).toBeUndefined();
    });

    it("given 3 blocks, debugIndex contains 3+ sigExpr mappings", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("signal", "float");

      // Simulate compiling 3 blocks
      builder.setCurrentBlockId("Block#1");
      builder.sigConst(1, type);
      builder.sigTimeAbsMs();

      builder.setCurrentBlockId("Block#2");
      builder.sigConst(2, type);
      builder.sigPhase01();

      builder.setCurrentBlockId("Block#3");
      builder.sigConst(3, type);

      const ir = builder.build();

      // Should have at least 5 entries (2 + 2 + 1)
      expect(ir.debugIndex.sigExprSource.size).toBeGreaterThanOrEqual(5);

      // Should have entries from all 3 blocks
      const blockIds = new Set(ir.debugIndex.sigExprSource.values());
      expect(blockIds.has("Block#1")).toBe(true);
      expect(blockIds.has("Block#2")).toBe(true);
      expect(blockIds.has("Block#3")).toBe(true);
    });

    it("given field-using blocks, debugIndex.fieldExprSource is populated", () => {
      const builder = new IRBuilderImpl();
      const sigType = makeType("signal", "float");
      const fieldType = makeType("field", "float");

      // Simulate a block that uses fields
      builder.setCurrentBlockId("DomainBlock#1");
      const domainSlot = builder.domainFromN(100);

      builder.setCurrentBlockId("PositionBlock#1");
      const sig = builder.sigConst(42, sigType);
      const broadcastField = builder.broadcastSigToField(sig, domainSlot, fieldType);

      const ir = builder.build();

      // Should have field expression mappings
      expect(ir.debugIndex.fieldExprSource.size).toBeGreaterThan(0);
      expect(ir.debugIndex.fieldExprSource.get(broadcastField)).toBe("PositionBlock#1");
    });

    it("clearing currentBlockId stops tracking", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("signal", "float");

      builder.setCurrentBlockId("Block#1");
      const sig1 = builder.sigConst(1, type);

      builder.setCurrentBlockId(undefined);
      const sig2 = builder.sigConst(2, type);

      const ir = builder.build();

      expect(ir.debugIndex.sigExprSource.get(sig1)).toBe("Block#1");
      expect(ir.debugIndex.sigExprSource.get(sig2)).toBeUndefined();
    });

    it("tracks all signal expression types", () => {
      const builder = new IRBuilderImpl();
      const type = makeType("signal", "float");

      builder.setCurrentBlockId("TestBlock#1");
      const const1 = builder.sigConst(42, type);
      const timeAbs = builder.sigTimeAbsMs();
      const timeModel = builder.sigTimeModelMs();
      const phase = builder.sigPhase01();
      const wrap = builder.sigWrapEvent();
      const mapped = builder.sigMap(const1, { kind: "kernel", kernelId: "sin" }, type);
      const zipped = builder.sigZip(const1, const1, { kind: "kernel", kernelId: "add" }, type);
      const selected = builder.sigSelect(const1, const1, const1, type);
      const combined = builder.sigCombine(0 as import("../types").BusIndex, [const1], "sum", type);

      const ir = builder.build();

      // All signal expressions should be tracked
      expect(ir.debugIndex.sigExprSource.get(const1)).toBe("TestBlock#1");
      expect(ir.debugIndex.sigExprSource.get(timeAbs)).toBe("TestBlock#1");
      expect(ir.debugIndex.sigExprSource.get(timeModel)).toBe("TestBlock#1");
      expect(ir.debugIndex.sigExprSource.get(phase)).toBe("TestBlock#1");
      expect(ir.debugIndex.sigExprSource.get(wrap)).toBe("TestBlock#1");
      expect(ir.debugIndex.sigExprSource.get(mapped)).toBe("TestBlock#1");
      expect(ir.debugIndex.sigExprSource.get(zipped)).toBe("TestBlock#1");
      expect(ir.debugIndex.sigExprSource.get(selected)).toBe("TestBlock#1");
      expect(ir.debugIndex.sigExprSource.get(combined)).toBe("TestBlock#1");
    });

    it("tracks all field expression types", () => {
      const builder = new IRBuilderImpl();
      const sigType = makeType("signal", "float");
      const fieldType = makeType("field", "float");

      builder.setCurrentBlockId("TestFieldBlock#1");
      const domainSlot = builder.domainFromN(10);
      const const1 = builder.sigConst(42, sigType);

      const fieldConst = builder.fieldConst([1, 2, 3], fieldType);
      const fieldMapped = builder.fieldMap(fieldConst, { kind: "kernel", kernelId: "sin" }, fieldType);
      const fieldZipped = builder.fieldZip(fieldConst, fieldConst, { kind: "kernel", kernelId: "add" }, fieldType);
      const fieldSelected = builder.fieldSelect(fieldConst, fieldConst, fieldConst, fieldType);
      const broadcast = builder.broadcastSigToField(const1, domainSlot, fieldType);
      const combined = builder.fieldCombine(0 as import("../types").BusIndex, [fieldConst], "sum", fieldType);

      const ir = builder.build();

      // All field expressions should be tracked
      expect(ir.debugIndex.fieldExprSource.get(fieldConst)).toBe("TestFieldBlock#1");
      expect(ir.debugIndex.fieldExprSource.get(fieldMapped)).toBe("TestFieldBlock#1");
      expect(ir.debugIndex.fieldExprSource.get(fieldZipped)).toBe("TestFieldBlock#1");
      expect(ir.debugIndex.fieldExprSource.get(fieldSelected)).toBe("TestFieldBlock#1");
      expect(ir.debugIndex.fieldExprSource.get(broadcast)).toBe("TestFieldBlock#1");
      expect(ir.debugIndex.fieldExprSource.get(combined)).toBe("TestFieldBlock#1");
    });
  });
});
