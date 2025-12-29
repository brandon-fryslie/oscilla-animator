# Phase 8: Polish & Composites - Complete Handoff Document

**Mission:** Finalize the IR migration with export determinism, composite library, UI polish, and future-proofing.

**You are the finisher.** Phases 1-7 built the IR infrastructure. Your job is to:
1. Ensure exports are bit-for-bit reproducible
2. Build a library of user-ready composites
3. Add UX polish features
4. Clean up all technical debt
5. Prepare the IR for Rust/WASM port

---

## Table of Contents

1. [Philosophy](#philosophy)
2. [Topic 1: Export Determinism](#topic-1-export-determinism)
3. [Topic 2: Composite Library](#topic-2-composite-library)
4. [Topic 3: Replace Block UI](#topic-3-replace-block-ui)
5. [Topic 4: Technical Debt Cleanup](#topic-4-technical-debt-cleanup)
6. [Topic 5: Rust/WASM Prep](#topic-5-rustwasm-prep)
7. [Testing Strategy](#testing-strategy)
8. [Verification Checklist](#verification-checklist)

---

## Philosophy

### The "Fit and Finish" Mindset

Phase 8 is not about new architecture. It's about:

1. **Reliability** - What worked in testing must work identically in production
2. **Usability** - Users need instant gratification, not configuration
3. **Maintainability** - Clean up the migration scaffolding
4. **Portability** - Prepare for the next platform (Rust/WASM)

---

## Topic 1: Export Determinism

### The Problem

Export must produce identical output given identical inputs. This is hard because:

1. **Floating-point accumulation** - `integrate()` drifts over time
2. **Phase sampling** - Frame 0 ≠ phase 0 if player is running
3. **Random sources** - Must be seeded and deterministic
4. **Map iteration** - JavaScript Maps iterate in insertion order (unstable)

### Export Time Plans

```typescript
type ExportTimePlan =
  | { kind: 'finite'; durationMs: number; sample: SamplePlan }
  | { kind: 'cyclic'; periodMs: number; loops: number; sample: SamplePlan }
  | { kind: 'infinite'; windowMs: number; durationMs: number; sample: SamplePlan };

interface SamplePlan {
  fps: number;
  steps?: number;
  shutter?: number;
}
```

### Phase-Driven Evaluation

For cyclic exports, use phase instead of time:

```typescript
function exportCyclic(program: CyclicProgram, plan: SamplePlan): Frame[] {
  const framesPerCycle = plan.fps * (program.timeModel.periodMs / 1000);
  const N = Math.round(framesPerCycle);

  return range(N).map(i => {
    const phase = i / N;  // 0, 1/N, 2/N, ... (N-1)/N
    return evaluateAtPhase(program, phase);
  });
}
```

### Deterministic RNG

```typescript
function createDeterministicRng(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

### Export Manifest

```typescript
interface ExportManifest {
  patchHash: string;
  seed: number;
  plan: ExportTimePlan;
  timestamp: number;
  version: string;
}
```

---

## Topic 2: Composite Library

### The 17 Starter Composites

**A. Domain + Arrangement (4):**

| Composite | Internal Graph | Key Params |
|-----------|----------------|------------|
| GridPoints | DomainN → PositionMapGrid | rows, cols, spacing |
| CirclePoints | DomainN → PositionMapCircle | n, radius, center |
| LinePoints | DomainN → PositionMapLine | n, a, b |
| SVGSamplePoints | DomainFromSVGSample | asset, sampleCount |

**B. Per-Element Variation (4):**

| Composite | Internal Graph | Key Params |
|-----------|----------------|------------|
| PerElementRandom | FieldHash01ById | seed |
| PerElementPhaseOffset | Hash → MapNumber | seed, amount |
| PerElementSizeScatter | Hash → MapRange | seed, min, max |
| PerElementRotationScatter | Hash → MapRange | seed, amount |

**C. Motion (3):**

| Composite | Internal Graph | Key Params |
|-----------|----------------|------------|
| OrbitMotion | FieldMapVec2(rotate) | center, turns, radiusScale |
| WaveDisplace | Phase + Hash → Sin displacement | amp, frequency, axis |
| BreathingScale | PhaseA → MapRange | min, max, curve |

**D. Color (2):**

| Composite | Internal Graph | Key Params |
|-----------|----------------|------------|
| PaletteDrift | PhaseB → HueShift | hueRange, saturation |
| PerElementColorScatter | Hash → HueOffset | seed, amount |

**E. Render (2):**

| Composite | Internal Graph | Key Params |
|-----------|----------------|------------|
| DotsRenderer | Size+Color scatters → RenderInstances2D(circle) | baseSize, colorVar |
| GlyphRenderer | Same + pathAsset | pathAsset, rotScatter |

**F. Rhythm (2):**

| Composite | Internal Graph | Key Params |
|-----------|----------------|------------|
| PulseEnvelope | Trigger → EnvelopeAD | attack, decay |
| PhaseWrapPulse | PhaseA → TriggerOnWrap | (none) |

### Composite Definition Format

```typescript
interface CompositeDefinition {
  id: string;
  label: string;
  description: string;
  color: string;
  subcategory: BlockSubcategory;
  laneKind: LaneKind;
  tags: { origin: string; form: 'composite' };

  graph: {
    nodes: Record<string, {
      type: string;
      params: Record<string, ParamValue | { __fromParam: string }>;
    }>;
    edges: Array<{ from: string; to: string }>;
    inputMap: Record<string, string>;
    outputMap: Record<string, string>;
  };

  exposedInputs: ExposedPort[];
  exposedOutputs: ExposedPort[];
  exposedParams: Record<string, ParamSpec>;
}
```

### Example: DotsRenderer

```typescript
export const DotsRenderer = registerComposite({
  id: 'DotsRenderer',
  label: 'Dots Renderer',
  description: 'Instant ambient dots with size/color variation',
  color: '#22c55e',
  subcategory: 'Render',
  laneKind: 'Program',
  tags: { origin: 'starter-library', form: 'composite' },

  graph: {
    nodes: {
      sizeScatter: {
        type: 'FieldHash01ById',
        params: { seed: { __fromParam: 'sizeSeed' } }
      },
      sizeMap: {
        type: 'FieldMapRange',
        params: {
          min: { __fromParam: 'sizeMin' },
          max: { __fromParam: 'sizeMax' }
        }
      },
      render: {
        type: 'RenderInstances2D',
        params: { shape: 'circle' }
      }
    },
    edges: [
      { from: 'sizeScatter.out', to: 'sizeMap.input' },
      { from: 'sizeMap.out', to: 'render.size' }
    ],
    inputMap: {
      domain: 'sizeScatter.domain',
      pos: 'render.pos'
    },
    outputMap: {}
  },

  exposedInputs: [
    { id: 'domain', label: 'Domain', direction: 'input', slotType: 'Field<domain>', nodeId: 'sizeScatter', nodePort: 'domain' },
    { id: 'pos', label: 'Position', direction: 'input', slotType: 'Field<vec2>', nodeId: 'render', nodePort: 'pos' }
  ],
  exposedOutputs: [],

  exposedParams: {
    sizeSeed: { type: 'number', default: 42 },
    sizeMin: { type: 'number', default: 2 },
    sizeMax: { type: 'number', default: 10 }
  }
});
```

---

## Topic 3: Replace Block UI

### The Feature

Right-click a block → "Replace with..." → list of compatible blocks → swap preserving wiring.

### Type Compatibility

```typescript
function getCompatibleReplacements(block: BlockDefinition): BlockDefinition[] {
  return allBlocks.filter(candidate => {
    if (!inputsCompatible(block.inputs, candidate.inputs)) return false;
    if (!outputsCompatible(block.outputs, candidate.outputs)) return false;
    if (candidate.category !== block.category) return false;
    return true;
  });
}
```

### Replacement Algorithm

```typescript
function replaceBlock(
  patch: Patch,
  targetBlockId: string,
  newBlockType: string
): Patch {
  const target = patch.blocks.get(targetBlockId);
  const incomingWires = findWiresTo(patch, targetBlockId);
  const outgoingWires = findWiresFrom(patch, targetBlockId);

  const patchWithoutBlock = removeBlock(patch, targetBlockId);

  const newBlock = createBlock(newBlockType, {
    position: target.position,
    params: migrateParams(target.params, target.type, newBlockType)
  });
  const patchWithNewBlock = addBlock(patchWithoutBlock, newBlock);

  let result = patchWithNewBlock;
  for (const wire of incomingWires) {
    if (canReconnect(wire, newBlock, 'input')) {
      result = addWire(result, { ...wire, toBlockId: newBlock.id });
    }
  }
  for (const wire of outgoingWires) {
    if (canReconnect(wire, newBlock, 'output')) {
      result = addWire(result, { ...wire, fromBlockId: newBlock.id });
    }
  }

  return result;
}
```

---

## Topic 4: Technical Debt Cleanup

### Areas with Debt

| File | Count | Notes |
|------|-------|-------|
| `domain.ts` | 16 | Domain identity/resize edge cases |
| `ActionExecutor.ts` | 5 | Diagnostic action edge cases |
| `signal.ts` | 4 | Signal block edge cases |
| `TransactionBuilder.ts` | 3 | Transaction rollback |
| `time-root.ts` | 3 | Time model initialization |

### Cleanup Process

1. **Triage** - Categorize all TODO/FIXME/HACK
2. **Legacy Removal** - Remove dual-emit code paths, closure fallbacks
3. **Test Failures** - Fix remaining flaky tests
4. **Dead Code** - Remove unused exports and files

### Critical Areas

**Domain Identity on Resize:**
```typescript
// Ensure: resize from 10→20 elements preserves IDs 0-9
// Ensure: resize from 20→10 elements drops IDs 10-19 cleanly
```

**Transaction Rollback:**
```typescript
// Ensure: failed transaction leaves patch unchanged
// Ensure: nested transactions work correctly
```

---

## Topic 5: Rust/WASM Prep

### IR Portability Requirements

**1. No Closures**
```typescript
// BAD
interface BadSignalExpr {
  kind: 'closure';
  fn: (t: number) => number;
}

// GOOD
interface GoodSignalExpr {
  kind: 'map';
  opcode: OpCode.Sin;
  input: SigExprId;
}
```

**2. All Ops Are Opcodes**
```typescript
enum OpCode {
  Add = 1, Mul = 2, Sin = 3, Cos = 4,
  TimeAbsMs = 100, Phase01 = 102,
  Integrate = 200, DelayMs = 201,
  Broadcast = 300, Reduce = 301,
  // ... all ops must be here
}
```

**3. Typed Buffers Only**
```typescript
// BAD
const values: Array<{ x: number; y: number }> = [];

// GOOD
const valuesX: Float32Array = new Float32Array(count);
const valuesY: Float32Array = new Float32Array(count);
```

### Binary Serialization Format

```typescript
interface BinaryIR {
  magic: 0x4F534349;  // "OSCI"
  version: number;
  constPool: ArrayBuffer;
  sigTable: ArrayBuffer;
  fieldTable: ArrayBuffer;
  busTable: ArrayBuffer;
  schedule: ArrayBuffer;
  debugIndex?: ArrayBuffer;
}
```

### Validation

```typescript
function validateRustPortability(ir: CompiledProgramIR): ValidationResult {
  const errors: string[] = [];

  for (const node of ir.sigTable) {
    if ('closure' in node || 'fn' in node) {
      errors.push(`SignalExpr ${node.id} contains closure`);
    }
  }

  for (const node of ir.sigTable) {
    if (!isKnownOpcode(node.opcode)) {
      errors.push(`Unknown opcode ${node.opcode}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
```

---

## Testing Strategy

### Export Determinism Tests

```typescript
describe('export determinism', () => {
  it('produces identical output for same inputs', () => {
    const patch = loadGoldenPatch('breathing-constellation');
    const plan: ExportTimePlan = {
      kind: 'cyclic',
      periodMs: 2000,
      loops: 1,
      sample: { fps: 30 }
    };

    const export1 = exportAnimation(patch, plan);
    const export2 = exportAnimation(patch, plan);

    expect(hashBytes(export1)).toBe(hashBytes(export2));
  });

  it('cyclic export achieves exact loop closure', () => {
    const patch = loadGoldenPatch('cyclic-animation');
    const frames = exportCyclicFrames(patch, { fps: 30 });

    expect(framesEqual(frames[0], frames[frames.length])).toBe(true);
  });
});
```

### Composite Tests

```typescript
describe('composites', () => {
  it('DotsRenderer produces visible output', async () => {
    const patch = createMinimalPatch();
    addComposite(patch, 'GridPoints', { rows: 3, cols: 3 });
    addComposite(patch, 'DotsRenderer');
    connectPorts(patch, 'GridPoints.domain', 'DotsRenderer.domain');
    connectPorts(patch, 'GridPoints.pos', 'DotsRenderer.pos');

    const frame = renderFrame(patch);
    expect(frame.instanceCount).toBe(9);
    expect(frame.hasVisibleContent).toBe(true);
  });
});
```

### Rust Portability Tests

```typescript
describe('rust portability', () => {
  it('all signal expressions are closure-free', () => {
    const patch = loadGoldenPatch('breathing-constellation');
    const ir = compile(patch);

    for (const node of ir.sigTable) {
      expect('closure' in node).toBe(false);
    }
  });

  it('IR serializes and deserializes cleanly', () => {
    const patch = loadGoldenPatch('breathing-constellation');
    const ir = compile(patch);

    const binary = serializeIR(ir);
    const restored = deserializeIR(binary);

    expect(deepEqual(ir, restored)).toBe(true);
  });
});
```

---

## Verification Checklist

### Export Determinism
- [ ] Same patch + same settings = identical bytes

- [ ] Deterministic RNG with seed
- [ ] Export manifest includes reproducibility data
- [ ] Loop closure verified for cyclic exports

### Composite Library
- [ ] All 17 starter composites implemented
- [ ] Each produces visible output when connected
- [ ] Exposed params have sensible defaults
- [ ] Composites lower to valid IR

### Replace Block UI
- [ ] Right-click menu shows compatible replacements
- [ ] Replacement preserves wiring
- [ ] Parameter migration works
- [ ] Undo/redo works

### Technical Debt
- [ ] No closure fallbacks in evaluators
- [ ] Dual-emit code paths removed
- [ ] All TODO/FIXME triaged
- [ ] Dead code removed

### Rust/WASM Prep
- [ ] No closures in IR
- [ ] All ops are opcodes
- [ ] All storage is typed arrays
- [ ] Binary serialization format defined
- [ ] Portability validator passes

---

## Success Criteria

Phase 8 is complete when:

1. **Export is bulletproof** - `export(patch) === export(patch)` always
2. **Composites delight** - New user drops 2 blocks, sees beauty
3. **Replace block works** - Power users can swap blocks freely
4. **Codebase is clean** - No migration scaffolding, no dead code
5. **Rust path is clear** - IR validates as portable
