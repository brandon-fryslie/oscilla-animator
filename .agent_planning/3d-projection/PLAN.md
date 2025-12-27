# 3D Projection Initiative - Phase 6: End-to-End Integration

## Objective
Wire all 3D components together to enable full 3D-to-2D projection in the runtime.

## Context - Phases 1-5 COMPLETE
- **Phase 1**: Type foundations (quat, vec3, vec4, mat4)
- **Phase 2**: IR Schema (CameraIR, MeshIR, CameraTable, MeshTable, OpCodes)
- **Phase 3**: Camera System (cameraMatrix.ts, evaluateCamera(), CameraStore, executeCameraEval)
- **Phase 4**: Projection Pass (executeInstances3DProject with culling and depth sorting)
- **Phase 5**: Mesh System (extrudeGeometry, materializeMesh, MeshStore, executeMeshMaterialize)

## Phase 6 Work Items

### 1. Fix Compilation Errors (CRITICAL)
- [ ] Fix executeInstances3DProject.ts unused imports
- [ ] Fix Materializer import error (should be materialize function)
- [ ] Fix executeRenderAssemble.ts type error for pathCommandStart.type
- [ ] Fix extrudeGeometry.ts unused variable warnings

### 2. RuntimeState Integration
- [ ] Add cameraStore: CameraStore to RuntimeState interface
- [ ] Add meshStore: MeshStore to RuntimeState interface
- [ ] Initialize stores in createRuntimeState()
- [ ] Update hotSwap() to preserve 3D stores

### 3. ScheduleExecutor Integration
- [ ] Add CameraStore and MeshStore fields
- [ ] Initialize stores from program.cameras and program.meshes
- [ ] Add viewport tracking and invalidation
- [ ] Handle viewport resize events

### 4. Step Dispatch Integration
- [ ] Add 'CameraEval' case to ScheduleExecutor.executeStep()
- [ ] Add 'MeshMaterialize' case to ScheduleExecutor.executeStep()
- [ ] Add 'Instances3DProjectTo2D' case to ScheduleExecutor.executeStep()
- [ ] Ensure proper parameter passing (viewport, stores, etc.)

### 5. StepIR Type Union
- [ ] Add StepCameraEval to StepIR union in schedule.ts
- [ ] Add StepMeshMaterialize to StepIR union
- [ ] Add StepInstances3DProjectTo2D to StepIR union

### 6. Module Exports
- [ ] Export camera module from runtime/index.ts
- [ ] Export mesh module from runtime/index.ts
- [ ] Export 3D step executors from executor/index.ts

### 7. Viewport Propagation
- [ ] Define ViewportInfo interface in central location
- [ ] Add viewport parameter to executeFrame()
- [ ] Pass viewport to 3D steps that need it

### 8. Integration Test
- [ ] Create end-to-end integration test
- [ ] Test: CameraEval → Instances3DProjectTo2D pipeline
- [ ] Verify projected 2D coordinates are correct
- [ ] Verify culling and depth sorting work

## Success Criteria
- All compilation errors fixed
- RuntimeState includes 3D stores
- ScheduleExecutor dispatches 3D steps correctly
- Viewport info flows through the system
- Integration test passes
- Full test suite passes

## Non-Goals (Future Work)
- Block implementation for 3D features (Phase 7)
- Compiler IR emission for 3D steps (Phase 7)
- UI/UX for 3D editing (Phase 8)

## References
- design-docs/13-Renderer/06-3d-IR-Deltas.md (IR schema)
- design-docs/13-Renderer/07-3d-Canonical.md (canonical 3D design)
- .agent_planning/3d-projection/STATUS.md (Phase 4 completion)
