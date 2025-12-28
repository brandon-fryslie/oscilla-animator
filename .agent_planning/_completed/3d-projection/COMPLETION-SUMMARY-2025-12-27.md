# 3D Projection Initiative - COMPLETE

**Completed:** 2025-12-27
**Duration:** Single session (auto-approved implementation)
**Scope:** IR compiler only (legacy compiler excluded)

## Phase Summary

| Phase | Description | Commits | Status |
|-------|-------------|---------|--------|
| **Phase 1** | Type Foundations | `33c0fad` | ✅ Complete |
| **Phase 2** | IR Schema | `74b8251` | ✅ Complete |
| **Phase 3** | Camera System | `de6dfbe` | ✅ Complete |
| **Phase 4** | Projection Pass | `f46c31c` | ✅ Complete |
| **Phase 5** | Mesh System | `608d36b` | ✅ Complete |
| **Phase 6** | Integration | `8883366`, `6647e40` | ✅ Complete |

## Deliverables

### Phase 1: Type Foundations
- `quat` type in TypeDomain and TypeDesc
- `vec3Type`, `vec4Type`, `quatType`, `mat4Type` singletons
- `quatf32`, `mat4f32` in BufferFormat
- BufferPool allocation for new formats
- Materializer fillBufferConst/fillBufferBroadcast for vec3/vec4/quat/mat4

### Phase 2: IR Schema
- `CameraIR`, `CameraEval`, `CameraTable` types
- `MeshIR`, `MeshBufferRef`, `MeshTable` types (extrusion-only)
- `Instance2DBufferRef` (split RGBA channels)
- `StepPerfCounters` for diagnostics
- OpCodes: `CameraEval (720)`, `MeshMaterialize (721)`, `Instances3DProjectTo2D (722)`
- `CompiledProgramIR` extended with optional cameras/meshes tables

### Phase 3: Camera System
- `src/editor/runtime/camera/cameraMatrix.ts` - Float32 matrix math
- `src/editor/runtime/camera/evaluateCamera.ts` - CameraIR → CameraEval
- `src/editor/runtime/camera/CameraStore.ts` - Viewport-keyed cache
- `src/editor/runtime/executor/steps/executeCameraEval.ts` - Step executor
- 38 tests (22 matrix, 16 store)

### Phase 4: Projection Pass
- `src/editor/runtime/executor/steps/executeInstances3DProject.ts`
- Float32 projection pipeline (projectPoint → clipToNDC → ndcToScreen)
- Frustum culling (behind camera, NDC bounds)
- Depth sorting with stable tie-breaking
- NaN/Inf handling
- Full performance counters
- 12 tests

### Phase 5: Mesh System
- `src/editor/runtime/mesh/extrudeGeometry.ts` - Profile generators, linear extrusion
- `src/editor/runtime/mesh/materializeMesh.ts` - Recipe execution
- `src/editor/runtime/mesh/MeshStore.ts` - Recipe-keyed cache
- `src/editor/runtime/executor/steps/executeMeshMaterialize.ts` - Step executor
- 51 tests

### Phase 6: Integration
- StepIR union extended with 3D step types
- ScheduleExecutor step dispatch for 3D steps
- RuntimeState extended with CameraStore, MeshStore, viewport
- Store initialization from program.cameras/program.meshes
- Hot-swap cache invalidation
- Module exports (camera/, mesh/, steps/)

## Architecture

```
CompiledProgramIR
├── cameras?: CameraTable
├── meshes?: MeshTable
└── schedule
    └── steps[]
        ├── StepCameraEval → CameraStore.getOrEvaluate()
        ├── StepMeshMaterialize → MeshStore.getOrMaterialize()
        └── StepInstances3DProjectTo2D → Instance2DBufferRef

RuntimeState
├── cameraStore: CameraStore (viewport-keyed cache)
├── meshStore: MeshStore (recipe-keyed cache)
└── viewport: ViewportInfo
```

## Key Design Decisions

1. **Float32 Throughout** - All 3D math uses Math.fround() for Rust/WASM parity
2. **Column-Major Matrices** - WebGL/OpenGL convention
3. **Right-Handed Coordinates** - -Z forward, +Y up (locked in CameraIR)
4. **Split RGBA** - Separate Uint8Array channels (per design doc)
5. **Extrusion-Only Meshes** - No arbitrary triangles, only procedural recipes
6. **Viewport-Keyed Camera Cache** - Invalidate on resize (aspect ratio changes projection)
7. **Recipe-Keyed Mesh Cache** - Geometry is expensive, cache by full recipe hash

## Test Coverage

- Phase 1: Type system tests (existing + extensions)
- Phase 3: 38 tests (matrix math, CameraStore)
- Phase 4: 12 tests (projection, culling, sorting)
- Phase 5: 51 tests (profiles, extrusion, MeshStore)
- All tests passing ✅

## Next Steps (Future Work)

1. **Block Implementation** - Create RenderInstances3D block that emits 3D steps
2. **Compiler Passes** - Block lowering to emit CameraEval, MeshMaterialize, Instances3DProjectTo2D
3. **UI Integration** - Camera/mesh editors in the patch bay
4. **Rounded Extrusion** - Implement the "pill shape" variant
5. **WebGL Renderer** - Alternative to Canvas 2D projection path

## Reference Docs

- `design-docs/13-Renderer/07-3d-Canonical.md` - Authoritative spec
- `design-docs/13-Renderer/06-3d-IR-Deltas.md` - IR schema additions
