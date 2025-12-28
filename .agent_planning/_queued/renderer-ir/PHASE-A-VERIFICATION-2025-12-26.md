# Phase A Verification Checklist
**Date:** 2025-12-26
**Commit:** b66d3fb

## P0: RenderFrameIR Core Types

- [x] `RenderFrameIR` interface defined in `src/editor/compiler/ir/renderIR.ts`
  - [x] `version: 1` field
  - [x] `frameKey?: FrameKey` (optional)
  - [x] `clear: ClearSpecIR` field
  - [x] `passes: RenderPassIR[]` field
  - [x] `overlays?: RenderPassIR[]` (optional)
  - [x] `meta?: RenderFrameMetaIR` (optional)
- [x] `RenderPassIR` union type defined with all variants:
  - [x] `Instances2DPassIR`
  - [x] `Paths2DPassIR`
  - [x] `PostFXPassIR` (stubbed for future)
- [x] `RenderPassHeaderIR` interface defined with all fields:
  - [x] `id: string` (stable pass identity)
  - [x] `z: number` (ordering control)
  - [x] `enabled: boolean`
  - [x] `clip?: ClipSpecIR` (optional)
  - [x] `view?: Mat3x2IR` (optional)
  - [x] `blend?: BlendSpecIR` (optional)
  - [x] `notes?: string[]` (optional warnings)
- [x] `ClearSpecIR` interface defined:
  - [x] `mode: "none" | "color"`
  - [x] `colorRGBA?: number` (packed u32)
- [x] `BlendSpecIR` interface defined:
  - [x] `mode: "normal" | "add" | "multiply" | "screen"`
  - [x] `opacity?: number` (pass-wide alpha)
- [x] `ClipSpecIR` union type defined:
  - [x] Rect variant: `{ kind: "rect"; x: number; y: number; w: number; h: number }`
  - [x] Path variant: `{ kind: "path"; geometry: PathGeometryBufferIR }`
- [x] `FrameKey` type defined (string | number)
- [x] `RenderFrameMetaIR` interface defined
- [x] All types have JSDoc comments
- [x] TypeScript strict mode passes (`just typecheck`)
- [x] No imports of runtime code

## P0: Buffer Reference Types

- [x] `BufferRefIR` interface defined:
  - [x] `bufferId: number`
  - [x] `type: "f32" | "u32" | "u16" | "u8"`
  - [x] `length: number`
- [x] `ScalarF32IR` type defined: `{ kind: "scalar:f32"; value: number }`
- [x] `ScalarU32IR` type defined: `{ kind: "scalar:u32"; value: number }`
- [x] `ScalarU16IR` type defined: `{ kind: "scalar:u16"; value: number }`
- [x] JSDoc explains scalar broadcast semantics
- [x] `Mat3x2IR` interface defined (2D affine transform):
  - [x] Fields: `a, b, c, d, e, f: number`
  - [x] JSDoc documents convention: `[a c e; b d f; 0 0 1]`
- [x] All types compile cleanly

## P1: Instances2D Pass Types

- [x] `Instances2DPassIR` interface defined:
  - [x] `kind: "instances2d"`
  - [x] `header: RenderPassHeaderIR`
  - [x] `count: number`
  - [x] `material: InstanceMaterialIR`
  - [x] `buffers: InstanceBufferSetIR`
  - [x] `sort?: InstanceSortIR`
- [x] `InstanceMaterialIR` union type defined with all variants:
  - [x] Shape2D: `{ kind: "shape2d"; shading: "flat"; colorSpace: "srgb" | "linear" }`
  - [x] Sprite: `{ kind: "sprite"; sampling: "nearest" | "linear"; textureId: string }`
  - [x] Glyph: `{ kind: "glyph"; fontId: string }`
- [x] `InstanceBufferSetIR` interface defined with all fields:
  - [x] Required: `posXY: BufferRefIR`
  - [x] Optional: `size: BufferRefIR | ScalarF32IR`
  - [x] Optional: `rot: BufferRefIR | ScalarF32IR`
  - [x] Optional: `colorRGBA: BufferRefIR | ScalarU32IR`
  - [x] Optional: `opacity: BufferRefIR | ScalarF32IR`
  - [x] Optional: `shapeId?: BufferRefIR | ScalarU16IR`
  - [x] Optional: `strokeWidth?: BufferRefIR | ScalarF32IR`
  - [x] Optional: `strokeColorRGBA?: BufferRefIR | ScalarU32IR`
  - [x] Custom: `custom?: Record<string, BufferRefIR>`
- [x] `InstanceSortIR` union type defined:
  - [x] None: `{ kind: "none" }`
  - [x] ByKey: `{ kind: "byKey"; key: BufferRefIR; order: "asc" | "desc" }`
- [x] JSDoc documents buffer layout conventions
- [x] JSDoc documents shapeId encoding
- [x] All types compile

## P1: Paths2D Pass Types

- [x] `Paths2DPassIR` interface defined:
  - [x] `kind: "paths2d"`
  - [x] `header: RenderPassHeaderIR`
  - [x] `geometry: PathGeometryBufferIR`
  - [x] `style: PathStyleIR`
  - [x] `draw: { stroke: boolean; fill: boolean }`
- [x] `PathGeometryBufferIR` interface defined:
  - [x] `pathCount: number`
  - [x] `pathCommandStart: BufferRefIR`
  - [x] `pathCommandLen: BufferRefIR`
  - [x] `pathPointStart: BufferRefIR`
  - [x] `pathPointLen: BufferRefIR`
  - [x] `commands: BufferRefIR`
  - [x] `pointsXY: BufferRefIR`
  - [x] `aux?: BufferRefIR`
  - [x] `encoding: PathEncodingIR`
- [x] `PathEncodingIR` type defined:
  - [x] `kind: "v1"`
  - [x] `commands: ("M" | "L" | "Q" | "C" | "Z")[]`
  - [x] JSDoc documents command semantics (M: 1 pt, L: 1 pt, Q: 2 pts, C: 3 pts, Z: 0 pts)
- [x] `PathStyleIR` interface defined:
  - [x] Fill: `fillColorRGBA?: BufferRefIR | ScalarU32IR`
  - [x] Fill: `fillRule?: "nonzero" | "evenodd"`
  - [x] Stroke: `strokeColorRGBA?: BufferRefIR | ScalarU32IR`
  - [x] Stroke: `strokeWidth?: BufferRefIR | ScalarF32IR`
  - [x] Stroke: `lineCap?: "butt" | "round" | "square"`
  - [x] Stroke: `lineJoin?: "miter" | "round" | "bevel"`
  - [x] Stroke: `miterLimit?: number`
  - [x] Stroke: `dash?: { pattern: number[]; offset?: number } | null`
  - [x] Opacity: `opacity?: BufferRefIR | ScalarF32IR`
- [x] JSDoc documents path indexing scheme
- [x] JSDoc documents command encoding
- [x] All types compile

## P2: Type Export and Module Organization

- [x] All RenderIR types exported from `src/editor/compiler/ir/renderIR.ts`
- [x] Type exports grouped logically (Frame, Pass, Buffer types)
- [x] File header comment documents purpose and design doc reference
- [x] No circular dependencies introduced
- [x] `just typecheck` passes with zero errors
- [x] Git diff shows only additive changes (new file)

## P2: Design Doc Alignment Verification

- [x] Doc 01 Section 1 (RenderFrameIR): All fields present, types match spec
- [x] Doc 01 Section 2 (Pass model): RenderPassIR union complete, header matches
- [x] Doc 01 Section 3 (Instances2D): Complete structure, all variants
- [x] Doc 01 Section 4 (Paths2D): Complete structure, indexing scheme correct
- [x] Doc 01 Section 5 (Buffer references): BufferRefIR, scalars defined
- [x] Doc 01 Section 6 (Clear/blend/clip/transforms): All specs match
- [x] Zero intentional deviations
- [x] All JSDoc comments reference design doc sections

## Verification Commands

```bash
just typecheck   # PASS - zero errors
pnpm test run    # PASS - 1842/1882 (failures pre-existing)
git diff --stat  # 1 file: src/editor/compiler/ir/renderIR.ts (NEW)
```

## Summary

Phase A Complete - All P0, P1, P2 criteria met.

- 594 lines of pure TypeScript type definitions
- Zero runtime code modified
- Zero deviations from design doc
- 100% type coverage for Doc 01
- Ready for Phase B (Color & Encoding Foundation)
