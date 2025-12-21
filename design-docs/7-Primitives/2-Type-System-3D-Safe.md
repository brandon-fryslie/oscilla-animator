# Type System: 3D-Safe Additions

> **Status**: Canonical
> **Decision Date**: 2024-12-21
> **Scope**: Type additions to ensure 3D compatibility without current implementation.

---

## Guiding Principle

**Avoid baking in 2D assumptions at compiler/runtime boundaries.**

The system must be capable of representing 3D even if the first implementation is 2D-only.

---

## ValueKind Additions

Add these to `compiler/types.ts` even if currently unused:

```typescript
export type ValueKind =
  // Existing...

  // 3D-safe additions (Scalars)
  | 'Scalar:vec3'
  | 'Scalar:vec4'
  | 'Scalar:mat3'
  | 'Scalar:mat4'
  | 'Scalar:quat'        // Quaternion rotation

  // 3D-safe additions (Fields)
  | 'Field:vec3'
  | 'Field:vec4'
  | 'Field:mat3'
  | 'Field:mat4'
  | 'Field:quat'

  // 3D-safe additions (Signals)
  | 'Signal:vec3'
  | 'Signal:vec4'
  | 'Signal:mat3'
  | 'Signal:mat4'
  | 'Signal:quat'

  // Render-related additions
  | 'Camera'             // Camera parameters
  | 'Light'              // Light definition
  | 'Mesh'               // 3D mesh data
  | 'Material'           // Material/shader params

  // Masking (for domain filtering)
  | 'Field:mask'         // Boolean/unit mask per element
  | 'Signal:mask';       // Time-varying mask
```

---

## SlotType Additions

Add to `editor/types.ts`:

```typescript
export type SlotType =
  // Existing...

  // 3D positions/vectors
  | 'Field<vec3>'
  | 'Signal<vec3>'
  | 'Scalar:vec3'

  // Transforms
  | 'Field<mat4>'
  | 'Signal<mat4>'
  | 'Scalar:mat4'

  // Rotations
  | 'Field<quat>'
  | 'Signal<quat>'
  | 'Scalar:quat'

  // Scene elements
  | 'Camera'
  | 'Light'
  | 'Mesh'
  | 'Material'

  // Masking
  | 'Field<mask>'
  | 'Signal<mask>';
```

---

## TypeDesc Additions

Add to `SLOT_TYPE_TO_TYPE_DESC` in `editor/types.ts`:

```typescript
// 3D vectors
'Field<vec3>': { world: 'field', domain: 'vec3', category: 'core', busEligible: true },
'Signal<vec3>': { world: 'signal', domain: 'vec3', category: 'core', busEligible: true },
'Scalar:vec3': { world: 'signal', domain: 'vec3', category: 'core', busEligible: true, semantics: 'scalar' },

// Transforms (internal, not bus-eligible)
'Field<mat4>': { world: 'field', domain: 'mat4', category: 'internal', busEligible: false },
'Signal<mat4>': { world: 'signal', domain: 'mat4', category: 'internal', busEligible: false },
'Scalar:mat4': { world: 'signal', domain: 'mat4', category: 'internal', busEligible: false },

// Rotations
'Field<quat>': { world: 'field', domain: 'quat', category: 'internal', busEligible: false },
'Signal<quat>': { world: 'signal', domain: 'quat', category: 'internal', busEligible: false },
'Scalar:quat': { world: 'signal', domain: 'quat', category: 'internal', busEligible: false },

// Scene elements (internal)
'Camera': { world: 'signal', domain: 'camera', category: 'internal', busEligible: false },
'Light': { world: 'signal', domain: 'light', category: 'internal', busEligible: false },
'Mesh': { world: 'field', domain: 'mesh', category: 'internal', busEligible: false },
'Material': { world: 'signal', domain: 'material', category: 'internal', busEligible: false },

// Masking
'Field<mask>': { world: 'field', domain: 'boolean', category: 'core', busEligible: true, semantics: 'mask' },
'Signal<mask>': { world: 'signal', domain: 'boolean', category: 'core', busEligible: true, semantics: 'mask' },
```

---

## Domain Defaults

Add to `CORE_DOMAIN_DEFAULTS`:

```typescript
export const CORE_DOMAIN_DEFAULTS: Record<CoreDomain, unknown> = {
  // Existing...

  vec3: { x: 0, y: 0, z: 0 },
  mat4: IDENTITY_MAT4,  // Define 4x4 identity matrix constant
  quat: { x: 0, y: 0, z: 0, w: 1 },  // Identity quaternion
};
```

---

## RenderNode Structure (3D-Safe)

Replace the current loose `DrawNode` with explicit, extensible kinds:

```typescript
/**
 * RenderNode kinds - extensible but structured.
 */
export type RenderNodeKind =
  | 'group'
  | 'instances'
  | 'path'
  | 'mesh'
  | 'camera'
  | 'light'
  | 'effect';

/**
 * Dimensional space for render nodes.
 */
export type RenderSpace = '2d' | '3d';

/**
 * Instance primitive types.
 */
export type InstancePrimitive =
  | 'circle'
  | 'rect'
  | 'ellipse'
  | 'polygon'
  | 'glyph'
  | 'sprite'
  | 'sphere'
  | 'cube'
  | 'custom';

/**
 * Base render node interface.
 */
interface RenderNodeBase {
  id: NodeId;
  kind: RenderNodeKind;
  tags?: readonly string[];
  meta?: Record<string, unknown>;
}

/**
 * Group node - contains children.
 */
interface GroupNode extends RenderNodeBase {
  kind: 'group';
  children: readonly RenderNode[];
}

/**
 * Instance node - renders multiple instances of a primitive.
 */
interface InstancesNode extends RenderNodeBase {
  kind: 'instances';
  space: RenderSpace;
  primitive: InstancePrimitive;
  count: number;
  attrs: {
    position: readonly Vec2[] | readonly Vec3[];
    rotation?: readonly number[] | readonly Quat[];
    scale?: readonly number[] | readonly Vec2[] | readonly Vec3[];
    color?: readonly string[];
    opacity?: readonly number[];
    [key: string]: unknown;
  };
}

/**
 * Path node - 2D stroke/fill paths.
 */
interface PathNode extends RenderNodeBase {
  kind: 'path';
  paths: readonly PathData[];
  style: StrokeStyle | FillStyle;
}

/**
 * Mesh node - 3D geometry.
 */
interface MeshNode extends RenderNodeBase {
  kind: 'mesh';
  geometry: MeshGeometry;
  material: MaterialDef;
  transform?: Mat4;
}

/**
 * Camera node - defines view/projection.
 */
interface CameraNode extends RenderNodeBase {
  kind: 'camera';
  projection: 'perspective' | 'orthographic';
  position: Vec3;
  target: Vec3;
  up: Vec3;
  fov?: number;        // For perspective
  orthoScale?: number; // For orthographic
  near: number;
  far: number;
}

/**
 * Light node - defines lighting.
 */
interface LightNode extends RenderNodeBase {
  kind: 'light';
  lightType: 'ambient' | 'directional' | 'point' | 'spot';
  color: string;
  intensity: number;
  position?: Vec3;
  direction?: Vec3;
}

/**
 * Effect node - wraps child with effect.
 */
interface EffectNode extends RenderNodeBase {
  kind: 'effect';
  effect: EffectDef;
  child: RenderNode;
}

/**
 * Union of all render nodes.
 */
export type RenderNode =
  | GroupNode
  | InstancesNode
  | PathNode
  | MeshNode
  | CameraNode
  | LightNode
  | EffectNode;

/**
 * RenderTree is the root, always a group or single node.
 */
export type RenderTree = RenderNode;
```

---

## Position Semantic Convention

**Position is semantic, not always vec2.**

Renderers request the position type they need:

```typescript
// 2D renderer expects
interface Render2DInputs {
  position: Field<Vec2>;
}

// 3D renderer expects
interface Render3DInputs {
  position: Field<Vec3>;
}

// Dimension-agnostic renderer accepts either
interface RenderInstancesInputs {
  position: Field<Vec2> | Field<Vec3>;
}
```

Domain does not "have positions." Domain has identity. Fields provide attributes.

---

## Camera and Projection

Camera/projection is explicit, not smuggled into renderer state:

```typescript
// Camera as explicit input to 3D renderers
interface Render3DInputs {
  camera: Signal<CameraParams>;
  // ...
}

// Or as RenderTree node
const scene: RenderNode = {
  kind: 'group',
  children: [
    { kind: 'camera', projection: 'perspective', /* ... */ },
    { kind: 'instances', space: '3d', /* ... */ },
  ],
};
```

---

## Compositor Transforms

Transform compositors accept dimension-appropriate transforms:

```typescript
// 2D transform
interface Transform2DParams {
  translate?: Vec2;
  rotate?: number;      // Radians
  scale?: Vec2 | number;
  origin?: Vec2;
}

// 3D transform
interface Transform3DParams {
  translate?: Vec3;
  rotate?: Quat | Vec3; // Quaternion or Euler
  scale?: Vec3 | number;
  origin?: Vec3;
}

// Generic transform (mat4 covers both)
interface TransformParams {
  matrix?: Mat4;
}
```

---

## Migration Path

### Phase 1 (Now)
- Add types to ValueKind/SlotType (unused is fine)
- Update RenderNode to explicit kinds
- Rename `RenderInstances2D` → `RenderInstances` with `space: '2d'` default

### Phase 2 (When 3D needed)
- Implement Vec3/Mat4/Quat operations
- Add 3D position mappers
- Implement mesh renderer
- Add camera/light support

### Phase 3 (Full 3D)
- WebGL/WebGPU backend
- Material system
- Lighting pipeline

---

## Compatibility Checklist

Apply to every PR:

- [ ] Does this block assume vec2 for position? Can it accept vec3?
- [ ] Does this renderer hard-code 2D coordinates?
- [ ] Does this type definition prevent vec3/mat4/quat?
- [ ] Does this compositor assume 2D affine transforms?
- [ ] Does camera/projection leak into hidden state?

If any check fails, the PR must be modified to preserve 3D compatibility.
