// src/editor/blocks/render/Render2dCanvas.ts
//
// Render2dCanvas is a *render sink* block.
//
// It does NOT draw to the DOM itself.
// It compiles to an IR node that produces RenderCmds (or RenderTree) which the
// authoritative runtime+renderer then executes against a Canvas 2D context.
//
// This implementation assumes the “do it right” architecture you’re moving to:
// - Program IR (no closures)
// - Schedule + VM
// - Central ValueStore
// - Lazy FieldExpr until forced by a sink
//
// PSEUDOCODE NOTE:
// - Types like BlockDefinition, CompileEnv, ValueSlot, FieldHandle, BufferRef,
//   RenderCmdsHandle, etc are your APIs — I’m showing realistic shapes and contracts.

import type { BlockDefinition } from "../registry/BlockRegistry";
import type { TypeDesc } from "../../types";
import type {
  NodeIR,
  InputPortIR,
  OutputPortIR,
  ValueSlot,
  ConstId,
  CompileEnv,
  OpCode,
} from "../../compiler/ir";

// --------------------------------------------
// Type helpers (your real code already has these)
// --------------------------------------------
const T = {
  Domain: { world: "special", domain: "domain" } as TypeDesc,
  FieldVec2: { world: "field", domain: "vec2" } as TypeDesc,
  FieldNum: { world: "field", domain: "number" } as TypeDesc,
  FieldColor: { world: "field", domain: "color" } as TypeDesc,
  FieldUnit: { world: "field", domain: "unit01" } as TypeDesc, // if you have it
  ScalarBool: { world: "scalar", domain: "boolean" } as TypeDesc,
  ScalarNum: { world: "scalar", domain: "number" } as TypeDesc,
  ScalarBlend: { world: "scalar", domain: "string", semantics: "blendMode" } as TypeDesc,
  ScalarClear: { world: "scalar", domain: "string", semantics: "clearMode" } as TypeDesc,
  RenderCmds: { world: "special", domain: "renderCmds" } as TypeDesc,
};

// --------------------------------------------
// BlockDefinition (Editor layer)
// --------------------------------------------
export const Render2dCanvas: BlockDefinition = {
  type: "Render2dCanvas",
  category: "render",
  description:
    "Render sink that emits Canvas2D render commands from a Domain + Fields. Does not perform evaluation or drawing in-block.",

  inputs: [
    // Identity + geometry
    { id: "domain", label: "Domain", type: "Domain", direction: "input" },
    { id: "pos", label: "Position", type: "Field<vec2>", direction: "input" },
    { id: "radius", label: "Radius", type: "Field<number>", direction: "input" },
    { id: "color", label: "Color", type: "Field<color>", direction: "input" },

    // Optional style
    { id: "alpha", label: "Alpha", type: "Field<Unit>", direction: "input" }, // unit01
    { id: "rotation", label: "Rotation", type: "Field<number>", direction: "input" }, // radians
    { id: "strokeWidth", label: "Stroke Width", type: "Field<number>", direction: "input" },

    // Frame controls (scalar inputs, default-sourced)
    { id: "clearMode", label: "Clear", type: "Scalar<string>", direction: "input" }, // "clear" | "fade" | "none"
    { id: "clearAlpha", label: "Clear α", type: "Scalar<number>", direction: "input" }, // fade amount if fade
    { id: "blendMode", label: "Blend", type: "Scalar<string>", direction: "input" }, // Canvas blend mode string
    { id: "zOrder", label: "Z", type: "Scalar<number>", direction: "input" }, // used by compositor upstream
  ],

  outputs: [
    // One output: render commands for the renderer/compositor
    { id: "out", label: "Render", type: "RenderCmds", direction: "output" },
  ],

  // No params: everything is an input with Default Sources
  params: {},

  // --------------------------------------------
  // Compiler hook to produce NodeIR (IR layer)
  // --------------------------------------------
  compileToIR(env: CompileEnv): NodeIR {
    // Value slots are assigned by compiler (dense indices into ValueStore).
    // The block compiler requests output slots; input sources are resolved earlier.
    const outSlot: ValueSlot = env.allocValueSlot(T.RenderCmds);

    const op: OpCode = { kind: "Render2DCanvas" };

    const inputs: InputPortIR[] = [
      env.resolveInput("domain", T.Domain),
      env.resolveInput("pos", T.FieldVec2),
      env.resolveInput("radius", T.FieldNum),
      env.resolveInput("color", T.FieldColor),

      // Optional fields – resolution must still yield a source (default source if unconnected)
      env.resolveInput("alpha", T.FieldUnit),
      env.resolveInput("rotation", T.FieldNum),
      env.resolveInput("strokeWidth", T.FieldNum),

      // Scalar controls
      env.resolveInput("clearMode", T.ScalarClear),
      env.resolveInput("clearAlpha", T.ScalarNum),
      env.resolveInput("blendMode", T.ScalarBlend),
      env.resolveInput("zOrder", T.ScalarNum),
    ];

    const outputs: OutputPortIR[] = [
      { name: "out", type: T.RenderCmds, slot: outSlot },
    ];

    return {
      id: env.nodeIdForBlock(),
      index: env.nodeIndexForBlock(),
      capability: "render",
      op,
      inputs,
      outputs,
      meta: env.metaForBlock({
        label: env.blockLabel(),
        description: "Canvas2D render sink (command emitter).",
      }),
    };
  },
};

// ------------------------------------------------------------
// RUNTIME: VM opcode implementation
// ------------------------------------------------------------
//
// This is the kernel that *forces* materialization of the required Fields
// for this sink and emits a compact RenderCmds payload.
//
// Important: this VM kernel does NOT draw; it produces commands.
// The renderer later executes commands on Canvas.
//
// PSEUDOCODE: your VM likely has a switch(op.kind) dispatch.
export function exec_Render2DCanvas(vm: VM, node: NodeIR): void {
  // 1) Read scalar inputs
  const clearMode = vm.readScalar<string>(node.inputs, "clearMode");
  const clearAlpha = vm.readScalar<number>(node.inputs, "clearAlpha");
  const blendMode = vm.readScalar<string>(node.inputs, "blendMode");
  const zOrder = vm.readScalar<number>(node.inputs, "zOrder");

  // 2) Read domain + field handles (lazy expr handles)
  const domain = vm.readSpecialDomain(node.inputs, "domain");
  const posField = vm.readFieldHandle(node.inputs, "pos");
  const radiusField = vm.readFieldHandle(node.inputs, "radius");
  const colorField = vm.readFieldHandle(node.inputs, "color");

  const alphaField = vm.readFieldHandle(node.inputs, "alpha");
  const rotationField = vm.readFieldHandle(node.inputs, "rotation");
  const strokeWidthField = vm.readFieldHandle(node.inputs, "strokeWidth");

  // 3) Materialize once per frame for this sink.
  //    This is the “RenderInstances2D batch-evaluate into ArrayBuffers” answer in code.
  //
  //    These return BufferRefs (typed arrays or shared ArrayBuffers in a pool).
  const n = vm.domainSize(domain);

  const posBuf = vm.fields.materializeVec2(posField, domain);          // Float32Array [x0,y0,x1,y1...]
  const radiusBuf = vm.fields.materializeF32(radiusField, domain);     // Float32Array [r...]
  const colorBuf = vm.fields.materializeColorRGBA(colorField, domain); // Uint32Array or Float32Array, your choice
  const alphaBuf = vm.fields.materializeF32(alphaField, domain);       // Float32Array [0..1]
  const rotBuf = vm.fields.materializeF32(rotationField, domain);      // Float32Array [rad]
  const strokeBuf = vm.fields.materializeF32(strokeWidthField, domain);

  // 4) Emit render commands (stable structure)
  //
  // The command payload should be serializable + Rust/WASM friendly:
  // - enums, buffer refs, small scalars
  // - no functions
  const cmds: RenderCmd[] = [
    { kind: "BeginFrame", clearMode, clearAlpha },
    { kind: "SetBlendMode", mode: blendMode },
    // Your compositor can use zOrder to sort multiple render sinks; keep it in metadata too.
    {
      kind: "DrawInstances2D",
      geom: "circle",
      count: n,
      zOrder,
      buffers: {
        pos: posBuf,
        radius: radiusBuf,
        color: colorBuf,
        alpha: alphaBuf,
        rotation: rotBuf,
        strokeWidth: strokeBuf,
      },
    },
    { kind: "EndFrame" },
  ];

  const handle = vm.renderCmdsStore.intern(cmds);

  // 5) Write output slot
  const outSlot = node.outputs[0]!.slot;
  vm.valueStore.writeSpecial(outSlot, handle);
}

// ------------------------------------------------------------
// RENDERER: Canvas2D executor for the emitted commands
// ------------------------------------------------------------
//
// This is what actually touches the Canvas API. It is intentionally dumb:
// it assumes cmds are already in the right order and buffers are ready.
export class Canvas2DRenderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas2D not available");
    this.ctx = ctx;
  }

  setViewport(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;

    const cw = Math.floor(w * dpr);
    const ch = Math.floor(h * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
    }

    // Set pixel-space transform
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(cmds: RenderCmd[]) {
    const ctx = this.ctx;

    for (const cmd of cmds) {
      switch (cmd.kind) {
        case "BeginFrame": {
          if (cmd.clearMode === "clear") {
            ctx.clearRect(0, 0, this.w, this.h);
          } else if (cmd.clearMode === "fade") {
            // Fade previous frame by drawing a translucent rect over it.
            // This is the canonical Canvas way to do trails without storing history in the patch.
            ctx.save();
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = Math.max(0, Math.min(1, cmd.clearAlpha));
            ctx.fillStyle = "#000"; // you could make this a command too
            ctx.fillRect(0, 0, this.w, this.h);
            ctx.restore();
          } // "none" does nothing
          break;
        }

        case "SetBlendMode": {
          ctx.globalCompositeOperation = cmd.mode as GlobalCompositeOperation;
          break;
        }

        case "DrawInstances2D": {
          if (cmd.geom !== "circle") throw new Error(`Unsupported geom: ${cmd.geom}`);

          const { pos, radius, color, alpha, rotation, strokeWidth } = cmd.buffers;

          // Expected layouts:
          // pos: Float32Array length=2*n
          // radius: Float32Array length=n
          // color: Uint32Array length=n (packed RGBA) OR Float32Array length=4*n
          // alpha: Float32Array length=n
          // rotation: Float32Array length=n
          // strokeWidth: Float32Array length=n
          const n = cmd.count;

          // A minimal but realistic loop.
          // IMPORTANT: Canvas state changes are expensive. If you can pack colors and only
          // change fillStyle occasionally, do it. Here we do per-instance for correctness.
          for (let i = 0; i < n; i++) {
            const x = pos.f32[(i << 1) + 0];
            const y = pos.f32[(i << 1) + 1];
            const r = radius.f32[i];

            // Skip degenerate
            if (!(r > 0)) continue;

            const a = alpha.f32[i];

            ctx.save();
            ctx.globalAlpha = a;

            // rotation only matters if you draw non-circles; still included for future shapes
            const rot = rotation.f32[i];
            if (rot !== 0) {
              ctx.translate(x, y);
              ctx.rotate(rot);
              ctx.translate(-x, -y);
            }

            // Color unpack (example: packed RGBA 0xRRGGBBAA)
            const rgba = color.u32[i];
            const rr = (rgba >>> 24) & 0xff;
            const gg = (rgba >>> 16) & 0xff;
            const bb = (rgba >>> 8) & 0xff;
            const aa = rgba & 0xff;

            ctx.fillStyle = `rgba(${rr},${gg},${bb},${aa / 255})`;

            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();

            const sw = strokeWidth.f32[i];
            if (sw > 0) {
              ctx.lineWidth = sw;
              ctx.strokeStyle = ctx.fillStyle;
              ctx.stroke();
            }

            ctx.restore();
          }
          break;
        }

        case "EndFrame": {
          // no-op for Canvas2D
          break;
        }

        default:
          // exhaustive check in real TS code
          throw new Error(`Unknown cmd: ${(cmd as any).kind}`);
      }
    }
  }
}

// ------------------------------------------------------------
// Render command shapes (serializable, Rust-friendly)
// ------------------------------------------------------------

export type BufferRef =
  | { kind: "f32"; f32: Float32Array }
  | { kind: "u32"; u32: Uint32Array };

export type RenderCmd =
  | { kind: "BeginFrame"; clearMode: "clear" | "fade" | "none"; clearAlpha: number }
  | { kind: "SetBlendMode"; mode: string }
  | {
      kind: "DrawInstances2D";
      geom: "circle";
      count: number;
      zOrder: number;
      buffers: {
        pos: { kind: "f32"; f32: Float32Array };
        radius: { kind: "f32"; f32: Float32Array };
        color: { kind: "u32"; u32: Uint32Array };
        alpha: { kind: "f32"; f32: Float32Array };
        rotation: { kind: "f32"; f32: Float32Array };
        strokeWidth: { kind: "f32"; f32: Float32Array };
      };
    }
  | { kind: "EndFrame" };

// ------------------------------------------------------------
// VM interface sketch (pseudocode)
// ------------------------------------------------------------
type VM = {
  valueStore: {
    writeSpecial(slot: ValueSlot, handle: unknown): void;
  };
  fields: {
    materializeVec2(field: FieldHandle, domain: DomainHandle): { kind: "f32"; f32: Float32Array };
    materializeF32(field: FieldHandle, domain: DomainHandle): { kind: "f32"; f32: Float32Array };
    materializeColorRGBA(field: FieldHandle, domain: DomainHandle): { kind: "u32"; u32: Uint32Array };
  };
  renderCmdsStore: {
    intern(cmds: RenderCmd[]): RenderCmdsHandle;
  };
  domainSize(domain: DomainHandle): number;

  readScalar<T>(inputs: InputPortIR[], name: string): T;
  readFieldHandle(inputs: InputPortIR[], name: string): FieldHandle;
  readSpecialDomain(inputs: InputPortIR[], name: string): DomainHandle;
};

type FieldHandle = { exprId: string };       // or dense handle
type DomainHandle = { domainId: string };    // opaque
type RenderCmdsHandle = { id: string };

If you want this plug-in ready against your current repo, paste (1) your actual BlockDefinition type and (2) how your compiler currently expects block compilers to return artifacts/IR nodes, and I’ll adapt the scaffolding so it drops in with minimal translation.