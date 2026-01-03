# Implementation Plan: Canonical Adapter and Lens System

**Generated**: 2025-12-21
**Scenario**: Major architectural enhancement to existing bus-aware compiler
**Status**: Draft

## Executive Summary

This plan implements the canonical separation between **adapters** (type compatibility) and **lenses** (expressive transforms) as specified in design documents 16-19. The implementation provides:

1. **Clean conceptual separation** - Adapters make connections legal, lenses make them musical
2. **Auto-adapter selection** - Intelligent pathfinding with policy classes (AUTO/SUGGEST/EXPLICIT/FORBIDDEN)
3. **Canonical lens catalog** - Domain-specific, type-preserving transformations
4. **Default sources** - Lens parameters become animatable inputs, not opaque parameters

## Current State Analysis

### Existing Implementation
- ✅ Bus-aware compiler complete (WP2)
- ✅ Basic lens system exists (`src/editor/lenses.ts`, 506 lines)
- ✅ Type validation system in place
- ❌ No adapter registry or selection algorithm
- ❌ Lenses mixed with adapters (conceptual confusion)
- ❌ No default sources for lens parameters
- ❌ No type-preserving validation for lenses

### Key Issues to Resolve
1. **Conceptual confusion** - Current `lenses.ts` contains both adapters (broadcast) and lenses
2. **Missing adapter system** - No auto-selection, no canonical adapter table
3. **Parameter opacity** - Lens params are constants, not animatable inputs
5. **No validation** - Type preservation not enforced

## Phase 1: Core Type System Updates

### 1.1 Update Type Definitions

**File**: `src/editor/types.ts`

Add new interfaces to cleanly separate adapters from lenses:

```typescript
// Adapter policies (Doc 19)
export type AdapterPolicy = 'AUTO' | 'SUGGEST' | 'EXPLICIT' | 'FORBIDDEN';

// Cost classes for performance warnings
export type AdapterCost = 'cheap' | 'medium' | 'heavy';

// Enhanced adapter step with policy metadata
export interface AdapterStep {
  readonly adapterId: string;
  readonly params?: Record<string, unknown>;
  readonly policy: AdapterPolicy;  // Added for validation
  readonly cost: AdapterCost;      // Added for UI warnings
}

// Lens instance (replaces LensDefinition)
export interface LensInstance {
  readonly lensId: string;         // Registry identifier
  readonly params: Record<string, LensParamBinding>;  // ALWAYS bindings, never constants
  readonly enabled: boolean = true;
  readonly sortKey?: number;       // Optional for deterministic ordering
}

// Lens parameter binding (Doc 18)
export type LensParamBinding =
  | { kind: 'default'; defaultSourceId: string }
  | { kind: 'wire'; from: BindingEndpoint; adapterChain?: AdapterStep[]; lensStack?: LensInstance[] }
  | { kind: 'bus'; busId: string; adapterChain?: AdapterStep[]; lensStack?: LensInstance[] };

// Default source state for lens parameters
export interface DefaultSourceState {
  readonly id: string;
  readonly type: TypeDesc;
  readonly value: unknown;
  readonly uiHint?: UIControlHint;
  readonly rangeHint?: { min?: number; max?: number; step?: number; log?: boolean };
}

  readonly id: string;
  readonly busId: string;
  readonly from: BindingEndpoint;
  readonly adapterChain?: AdapterStep[];
  readonly enabled: boolean;
  readonly weight?: number;
  readonly sortKey: number;
}

  readonly id: string;
  readonly busId: string;
  readonly to: BindingEndpoint;
  readonly adapterChain?: AdapterStep[];
  readonly lensStack?: LensInstance[];  // Primary - replaces single lens
  readonly enabled: boolean;
  // Remove legacy lens field after migration
}

// Lens registry entry (Doc 17)
export interface LensRegistryEntry {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly inputType: TypeDesc;
  readonly outputType: TypeDesc;  // Must equal inputType for type preservation
  readonly paramSpecs: Record<string, LensParamSpec>;
  readonly costHint: 'cheap' | 'medium' | 'heavy';
  readonly stabilityHint: 'scrubSafe' | 'transportOnly' | 'either';
}

// Lens parameter specification
export interface LensParamSpec {
  readonly type: TypeDesc;
  readonly defaultValue: unknown;
  readonly uiHint: UIControlHint;
  readonly rangeHint?: { min?: number; max?: number; step?: number };
}

// Adapter registry entry (Doc 19)
export interface AdapterRegistryEntry {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly inputType: TypeDesc;
  readonly outputType: TypeDesc;
  readonly policy: AdapterPolicy;
  readonly cost: AdapterCost;
  readonly params?: Record<string, AdapterParamSpec>;
}

// Adapter parameter specification
export interface AdapterParamSpec {
  readonly type: TypeDesc;
  readonly defaultValue: unknown;
  readonly uiHint?: UIControlHint;
}
```

### 1.2 Create Registry Interfaces

**File**: `src/editor/registry/registryInterfaces.ts`

```typescript
export interface AdapterRegistry {
  // Get adapter by ID
  get(id: string): AdapterRegistryEntry | undefined;

  // Find adapter path from type A to type B
  findPath(fromType: TypeDesc, toType: TypeDesc, context: AdapterContext): AdapterPath | null;

  // Get all adapters
  getAll(): AdapterRegistryEntry[];

  // Validate adapter chain
  validateChain(chain: AdapterStep[], fromType: TypeDesc, toType: TypeDesc): ValidationResult;
}

export interface LensRegistry {
  // Get lens by ID
  get(id: string): LensRegistryEntry | undefined;

  // Get lenses for domain and endpoint type

  // Validate lens preserves type
  validateTypePreservation(lens: LensRegistryEntry): boolean;

  // Get all lenses
  getAll(): LensRegistryEntry[];
}

export interface DefaultSourceStore {
  // Get default source by ID
  get(id: string): DefaultSourceState | undefined;

  // Update default source value
  update(id: string, value: unknown): void;

  // Create default source
  create(spec: Omit<DefaultSourceState, 'id'>): string;

  // List all default sources
  getAll(): DefaultSourceState[];
}

// Context for adapter selection
export interface AdapterContext {
  readonly allowHeavy: boolean = false;
  readonly allowExplicit: boolean = false;
}

// Result of adapter path finding
export interface AdapterPath {
  readonly steps: AdapterStep[];
  readonly totalCost: number;
  readonly hasExplicit: boolean;
  readonly hasHeavy: boolean;
}

// Validation result
export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
}
```

## Phase 2: Canonical Adapter Implementation

### 2.1 Adapter Registry and Selection Algorithm

**File**: `src/editor/adapters/adapterRegistry.ts`

```typescript
/**
 * Canonical adapter registry with auto-selection algorithm
 * Implements design document 19: Auto-Adapters Spec
 */

import type {
  AdapterRegistry,
  AdapterRegistryEntry,
  AdapterPath,
  AdapterContext,
  TypeDesc,
  AdapterStep,
  AdapterPolicy,
  AdapterCost
} from '../registry/registryInterfaces';
import { formatTypeDesc } from '../types';

// Canonical adapter table (Doc 19, Section 5)
const CANONICAL_ADAPTERS: AdapterRegistryEntry[] = [
  // World adapters (Section 5.1)
  {
    id: 'ConstToSignal',
    label: 'Constant to Signal',
    description: 'Lift compile-time constant to time-varying signal',
    inputType: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
    outputType: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
    policy: 'AUTO',
    cost: 'cheap'
  },
  {
    id: 'BroadcastScalarToField',
    label: 'Broadcast Scalar to Field',
    description: 'Lift scalar to uniform per-element field',
    inputType: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
    outputType: { world: 'field', domain: 'number', category: 'core', busEligible: true },
    policy: 'AUTO',
    cost: 'medium'
  },
  {
    id: 'BroadcastSignalToField',
    label: 'Broadcast Signal to Field',
    description: 'Apply signal uniformly to all elements',
    inputType: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
    outputType: { world: 'field', domain: 'number', category: 'core', busEligible: true },
    policy: 'AUTO',
    cost: 'medium'
  },
  {
    id: 'ReduceFieldToSignal',
    label: 'Reduce Field to Signal',
    description: 'Reduce per-element field to single signal',
    inputType: { world: 'field', domain: 'number', category: 'core', busEligible: true },
    outputType: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
    policy: 'EXPLICIT',
    cost: 'heavy',
    params: {
      mode: {
        type: { world: 'scalar', domain: 'string', category: 'internal', busEligible: false },
        defaultValue: 'mean',
        uiHint: { kind: 'select', options: [
          { value: 'mean', label: 'Mean' },
          { value: 'sum', label: 'Sum' },
          { value: 'min', label: 'Minimum' },
          { value: 'max', label: 'Maximum' }
        ]}
      }
    }
  },

  // Domain adapters (Section 5.2)
  {
    id: 'NormalizeToPhase',
    label: 'Normalize to Phase',
    description: 'Wrap number to phase range [0,1]',
    inputType: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
    outputType: { world: 'signal', domain: 'phase', category: 'core', busEligible: true },
    policy: 'SUGGEST',
    cost: 'cheap'
  },
  {
    id: 'PhaseToNumber',
    label: 'Phase to Number',
    description: 'Convert phase to number representation',
    inputType: { world: 'signal', domain: 'phase', category: 'core', busEligible: true },
    outputType: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
    policy: 'AUTO',
    cost: 'cheap'
  },
  {
    id: 'NumberToDurationMs',
    label: 'Number to Duration (ms)',
    description: 'Interpret number as duration in milliseconds',
    inputType: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
    outputType: { world: 'signal', domain: 'duration', category: 'internal', busEligible: false },
    policy: 'SUGGEST',
    cost: 'cheap'
  },
  {
    id: 'DurationToNumberMs',
    label: 'Duration to Number (ms)',
    description: 'Convert duration to number of milliseconds',
    inputType: { world: 'signal', domain: 'duration', category: 'internal', busEligible: false },
    outputType: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
    policy: 'AUTO',
    cost: 'cheap'
  }
];

export class AdapterRegistryImpl implements AdapterRegistry {
  private adapters: Map<string, AdapterRegistryEntry>;
  private pathCache: Map<string, AdapterPath | null>;

  constructor() {
    this.adapters = new Map();
    this.pathCache = new Map();

    // Register canonical adapters
    CANONICAL_ADAPTERS.forEach(adapter => {
      this.adapters.set(adapter.id, adapter);
    });
  }

  get(id: string): AdapterRegistryEntry | undefined {
    return this.adapters.get(id);
  }

  getAll(): AdapterRegistryEntry[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Find adapter path using deterministic algorithm (Doc 19, Section 3.2)
   */
  findPath(fromType: TypeDesc, toType: TypeDesc, context: AdapterContext): AdapterPath | null {
    const cacheKey = this.getCacheKey(fromType, toType, context);

    if (this.pathCache.has(cacheKey)) {
      return this.pathCache.get(cacheKey)!;
    }

    // Direct compatibility check
    if (this.isDirectlyCompatible(fromType, toType)) {
      const path: AdapterPath = {
        steps: [],
        totalCost: 0,
        hasExplicit: false,
        hasHeavy: false
      };
      this.pathCache.set(cacheKey, path);
      return path;
    }

    // Find all paths up to length 2
    const candidatePaths = this.findPathsUpToLength2(fromType, toType, context);

    // Filter by policy
    const validPaths = candidatePaths.filter(path =>
      this.isPathValidForPolicy(path, context)
    );

    if (validPaths.length === 0) {
      // Check for suggest paths
      const suggestPaths = candidatePaths.filter(path =>
        this.isPathSuggestOnly(path)
      );

      if (suggestPaths.length > 0) {
        // Return best suggest path but mark as requiring user confirmation
        const bestPath = this.selectBestPath(suggestPaths);
        this.pathCache.set(cacheKey, bestPath);
        return bestPath;
      }

      this.pathCache.set(cacheKey, null);
      return null;
    }

    // Select best path
    const bestPath = this.selectBestPath(validPaths);
    this.pathCache.set(cacheKey, bestPath);
    return bestPath;
  }

  validateChain(chain: AdapterStep[], fromType: TypeDesc, toType: TypeDesc): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check chain length
    if (chain.length > 2) {
      errors.push('Adapter chain cannot exceed 2 steps');
    }

    // Validate each adapter exists
    for (const step of chain) {
      const adapter = this.get(step.adapterId);
      if (!adapter) {
        errors.push(`Unknown adapter: ${step.adapterId}`);
      }
    }

    // Simulate type transformation
    let currentType = fromType;
    for (let i = 0; i < chain.length; i++) {
      const step = chain[i];
      const adapter = this.get(step.adapterId);

      if (!adapter) continue;

      if (!this.typesMatch(adapter.inputType, currentType)) {
        errors.push(`Adapter ${step.adapterId} input type mismatch at step ${i}`);
      }

      currentType = adapter.outputType;
    }

    // Check final type
    if (!this.typesMatch(currentType, toType)) {
      errors.push('Adapter chain does not produce target type');
    }

    // Check for heavy/explicit adapters
    for (const step of chain) {
      const adapter = this.get(step.adapterId);
      if (!adapter) continue;

      if (adapter.cost === 'heavy') {
        warnings.push(`Heavy adapter ${step.adapterId} may impact performance`);
      }

      if (adapter.policy === 'EXPLICIT') {
        warnings.push(`Adapter ${step.adapterId} requires explicit user confirmation`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Private helper methods

  private getCacheKey(fromType: TypeDesc, toType: TypeDesc, context: AdapterContext): string {
    return `${context.edgeKind}|${formatTypeDesc(fromType)}→${formatTypeDesc(toType)}`;
  }

  private isDirectlyCompatible(fromType: TypeDesc, toType: TypeDesc): boolean {
    // Exact match
    if (this.typesMatch(fromType, toType)) {
      return true;
    }

    // Core domains are assignable to internal domains with same name
    if (fromType.domain === toType.domain &&
        fromType.world === toType.world &&
        fromType.category === 'core' && toType.category === 'internal') {
      return true;
    }

    return false;
  }

  private findPathsUpToLength2(fromType: TypeDesc, toType: TypeDesc, context: AdapterContext): AdapterPath[] {
    const paths: AdapterPath[] = [];

    // Direct paths (1 step)
    for (const adapter of this.adapters.values()) {
      if (this.typesMatch(adapter.inputType, fromType) &&
          this.typesMatch(adapter.outputType, toType)) {
        paths.push({
          steps: [{
            adapterId: adapter.id,
            policy: adapter.policy,
            cost: adapter.cost
          }],
          totalCost: this.getCostValue(adapter.cost),
          hasExplicit: adapter.policy === 'EXPLICIT',
          hasHeavy: adapter.cost === 'heavy'
        });
      }
    }

    // Two-step paths
    if (paths.length === 0) {
      for (const adapter1 of this.adapters.values()) {
        if (!this.typesMatch(adapter1.inputType, fromType)) continue;

        for (const adapter2 of this.adapters.values()) {
          if (this.typesMatch(adapter1.outputType, adapter2.inputType) &&
              this.typesMatch(adapter2.outputType, toType)) {
            paths.push({
              steps: [
                {
                  adapterId: adapter1.id,
                  policy: adapter1.policy,
                  cost: adapter1.cost
                },
                {
                  adapterId: adapter2.id,
                  policy: adapter2.policy,
                  cost: adapter2.cost
                }
              ],
              totalCost: this.getCostValue(adapter1.cost) + this.getCostValue(adapter2.cost),
              hasExplicit: adapter1.policy === 'EXPLICIT' || adapter2.policy === 'EXPLICIT',
              hasHeavy: adapter1.cost === 'heavy' || adapter2.cost === 'heavy'
            });
          }
        }
      }
    }

    return paths;
  }

  private isPathValidForPolicy(path: AdapterPath, context: AdapterContext): boolean {
    // For auto-insertion, all steps must be AUTO
    if (!context.allowExplicit && path.hasExplicit) {
      return false;
    }

    if (!context.allowHeavy && path.hasHeavy) {
      return false;
    }

    return path.steps.every(step => step.policy === 'AUTO');
  }

  private isPathSuggestOnly(path: AdapterPath): boolean {
    return path.steps.every(step =>
      step.policy === 'AUTO' || step.policy === 'SUGGEST'
    ) && path.steps.some(step => step.policy === 'SUGGEST');
  }

  private selectBestPath(paths: AdapterPath[]): AdapterPath {
    // Sort by: total cost, then number of steps, then lexicographic adapter IDs
    return paths.sort((a, b) => {
      if (a.totalCost !== b.totalCost) {
        return a.totalCost - b.totalCost;
      }

      if (a.steps.length !== b.steps.length) {
        return a.steps.length - b.steps.length;
      }

      const aIds = a.steps.map(s => s.adapterId).join(',');
      const bIds = b.steps.map(s => s.adapterId).join(',');

      return aIds.localeCompare(bIds);
    })[0];
  }

  private typesMatch(type1: TypeDesc, type2: TypeDesc): boolean {
    return type1.world === type2.world &&
           type1.domain === type2.domain &&
           (type1.category === type2.category ||
            (type1.category === 'core' && type2.category === 'internal') ||
            (type1.category === 'internal' && type2.category === 'core'));
  }

  private getCostValue(cost: AdapterCost): number {
    switch (cost) {
      case 'cheap': return 1;
      case 'medium': return 10;
      case 'heavy': return 100;
      default: return 1000;
    }
  }
}
```

### 2.2 Adapter Implementation Functions

**File**: `src/editor/adapters/adapterImplementations.ts`

```typescript
/**
 * Canonical adapter implementations
 * Each adapter is a pure function that transforms artifacts
 */

import type { Artifact } from '../compiler/types';
import type { RuntimeCtx } from '../core/types';

// Type guard functions
function isSignalNumber(artifact: Artifact): artifact is { kind: 'Signal:number'; value: (t: number, ctx: RuntimeCtx) => number } {
  return artifact.kind === 'Signal:number';
}

function isFieldNumber(artifact: Artifact): artifact is { kind: 'Field:number'; value: Field } {
  return artifact.kind === 'Field:number';
}

// World adapters

export function applyConstToSignal(artifact: Artifact): Artifact {
  if (artifact.kind !== 'Const:number') {
    return {
      kind: 'Error',
      message: `ConstToSignal requires Const:number input, got ${artifact.kind}`
    };
  }

  const constValue = artifact.value;

  return {
    kind: 'Signal:number',
    value: (t: number, ctx: RuntimeCtx) => constValue
  };
}

export function applyBroadcastScalarToField(artifact: Artifact): Artifact {
  if (artifact.kind !== 'Const:number') {
    return {
      kind: 'Error',
      message: `BroadcastScalarToField requires Const:number input, got ${artifact.kind}`
    };
  }

  const constValue = artifact.value;

  return {
    kind: 'Field:number',
    value: (seed: number, n: number, ctx) => {
      const result = new Array(n);
      for (let i = 0; i < n; i++) {
        result[i] = constValue;
      }
      return result;
    }
  };
}

export function applyBroadcastSignalToField(artifact: Artifact): Artifact {
  if (!isSignalNumber(artifact)) {
    return {
      kind: 'Error',
      message: `BroadcastSignalToField requires Signal:number input, got ${artifact.kind}`
    };
  }

  const signal = artifact.value;

  return {
    kind: 'Field:number',
    value: (seed: number, n: number, ctx) => {
      // Sample signal at compile time t=0
      const sampleCtx: RuntimeCtx = { viewport: { w: 800, h: 600, dpr: 1 } };
      const value = signal(0, sampleCtx);

      const result = new Array(n);
      for (let i = 0; i < n; i++) {
        result[i] = value;
      }
      return result;
    }
  };
}

export function applyReduceFieldToSignal(artifact: Artifact, mode: 'mean' | 'sum' | 'min' | 'max' = 'mean'): Artifact {
  if (!isFieldNumber(artifact)) {
    return {
      kind: 'Error',
      message: `ReduceFieldToSignal requires Field:number input, got ${artifact.kind}`
    };
  }

  const field = artifact.value;

  return {
    kind: 'Signal:number',
    value: (t: number, ctx: RuntimeCtx) => {
      // Note: This requires element count context
      // In full implementation, this would be resolved at compile time
      // For now, return 0 as placeholder
      console.warn('ReduceFieldToSignal: element count context not implemented');
      return 0;
    }
  };
}

// Domain adapters

export function applyNormalizeToPhase(artifact: Artifact): Artifact {
  if (!isSignalNumber(artifact)) {
    return {
      kind: 'Error',
      message: `NormalizeToPhase requires Signal:number input, got ${artifact.kind}`
    };
  }

  const signal = artifact.value;

  return {
    kind: 'Signal:phase',
    value: (t: number, ctx: RuntimeCtx) => {
      const value = signal(t, ctx);
      return value - Math.floor(value); // Wrap to [0,1)
    }
  };
}

export function applyPhaseToNumber(artifact: Artifact): Artifact {
  if (artifact.kind !== 'Signal:phase') {
    return {
      kind: 'Error',
      message: `PhaseToNumber requires Signal:phase input, got ${artifact.kind}`
    };
  }

  // Phase is already a number [0,1], just change the type tag
  return {
    kind: 'Signal:number',
    value: artifact.value
  };
}

export function applyNumberToDurationMs(artifact: Artifact): Artifact {
  if (!isSignalNumber(artifact)) {
    return {
      kind: 'Error',
      message: `NumberToDurationMs requires Signal:number input, got ${artifact.kind}`
    };
  }

  // Duration is just number with semantic meaning
  return {
    kind: 'Signal:duration',
    value: artifact.value
  };
}

export function applyDurationToNumberMs(artifact: Artifact): Artifact {
  if (artifact.kind !== 'Signal:duration') {
    return {
      kind: 'Error',
      message: `DurationToNumberMs requires Signal:duration input, got ${artifact.kind}`
    };
  }

  // Duration is just number with semantic meaning
  return {
    kind: 'Signal:number',
    value: artifact.value
  };
}
```

## Phase 3: Canonical Lens Implementation

### 3.1 Lens Registry with Domain Catalogs

**File**: `src/editor/lenses/lensRegistry.ts`

```typescript
/**
 * Canonical lens registry with domain-specific catalogs
 * Implements design document 17: Canonical Lenses
 */

import type {
  LensRegistry,
  LensRegistryEntry,
  LensParamSpec,
  TypeDesc,
  Domain,
  UIControlHint
} from '../registry/registryInterfaces';

// Number domain lenses (Doc 17, Section 0)
const NUMBER_LENSES: LensRegistryEntry[] = [
  {
    id: 'gain',
    label: 'Gain',
    description: 'Apply gain and bias to signal',
    inputType: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
    outputType: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    allowedOn: 'both',
    paramSpecs: {
      gain: {
        type: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
        defaultValue: 1,
        uiHint: { kind: 'number', min: 0, max: 4, step: 0.1 },
        rangeHint: { min: 0, max: 4, step: 0.1 }
      },
      bias: {
        type: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
        defaultValue: 0,
        uiHint: { kind: 'number', min: -2, max: 2, step: 0.1 },
        rangeHint: { min: -2, max: 2, step: 0.1 }
      }
    }
  },
  {
    id: 'polarity',
    label: 'Polarity',
    description: 'Invert signal polarity',
    inputType: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
    outputType: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    allowedOn: 'both',
    paramSpecs: {
      invert: {
        type: { world: 'scalar', domain: 'boolean', category: 'internal', busEligible: false },
        defaultValue: false,
        uiHint: { kind: 'boolean' }
      }
    }
  },
  {
    id: 'clamp',
    label: 'Clamp',
    description: 'Clamp signal to range',
    inputType: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
    outputType: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    allowedOn: 'both',
    paramSpecs: {
      min: {
        type: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
        defaultValue: 0,
        uiHint: { kind: 'number', min: -10, max: 10 }
      },
      max: {
        type: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
        defaultValue: 1,
        uiHint: { kind: 'number', min: -10, max: 10 }
      }
    }
  },
  {
    id: 'slew',
    label: 'Slew',
    description: 'Rate-limited smoothing',
    inputType: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
    outputType: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
    costHint: 'medium',
    stabilityHint: 'transportOnly',
    allowedOn: 'both',
    paramSpecs: {
      riseMs: {
        type: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
        defaultValue: 100,
        uiHint: { kind: 'number', min: 0, max: 5000, step: 10 }
      },
      fallMs: {
        type: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
        defaultValue: 100,
        uiHint: { kind: 'number', min: 0, max: 5000, step: 10 }
      }
    }
  },
  {
    id: 'quantize',
    label: 'Quantize',
    description: 'Snap to discrete steps',
    inputType: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
    outputType: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    allowedOn: 'both',
    paramSpecs: {
      step: {
        type: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
        defaultValue: 0.25,
        uiHint: { kind: 'number', min: 0.01, max: 1, step: 0.01 }
      },
      mode: {
        type: { world: 'scalar', domain: 'string', category: 'internal', busEligible: false },
        defaultValue: 'round',
        uiHint: { kind: 'select', options: [
          { value: 'round', label: 'Round' },
          { value: 'floor', label: 'Floor' },
          { value: 'ceil', label: 'Ceil' }
        ]}
      }
    }
  },

  {
    id: 'ease',
    label: 'Ease',
    description: 'Apply easing curve (expects 0-1 input)',
    inputType: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
    outputType: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    paramSpecs: {
      curve: {
        type: { world: 'scalar', domain: 'string', category: 'internal', busEligible: false },
        defaultValue: 'easeInOutSine',
        uiHint: { kind: 'select', options: [
          { value: 'linear', label: 'Linear' },
          { value: 'easeInSine', label: 'Ease In Sine' },
          { value: 'easeOutSine', label: 'Ease Out Sine' },
          { value: 'easeInOutSine', label: 'Ease In Out Sine' },
          { value: 'easeInQuad', label: 'Ease In Quad' },
          { value: 'easeOutQuad', label: 'Ease Out Quad' },
          { value: 'easeInOutQuad', label: 'Ease In Out Quad' },
          { value: 'easeInCubic', label: 'Ease In Cubic' },
          { value: 'easeOutCubic', label: 'Ease Out Cubic' },
          { value: 'easeInOutCubic', label: 'Ease In Out Cubic' }
        ]}
      },
      amount: {
        type: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
        defaultValue: 1,
        uiHint: { kind: 'number', min: 0, max: 1, step: 0.1 }
      }
    }
  },
  {
    id: 'mapRange',
    label: 'Map Range',
    description: 'Map input range to output range',
    inputType: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
    outputType: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    paramSpecs: {
      inMin: {
        type: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
        defaultValue: 0,
        uiHint: { kind: 'number' }
      },
      inMax: {
        type: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
        defaultValue: 1,
        uiHint: { kind: 'number' }
      },
      outMin: {
        type: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
        defaultValue: 0,
        uiHint: { kind: 'number' }
      },
      outMax: {
        type: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
        defaultValue: 1,
        uiHint: { kind: 'number' }
      },
      clamp: {
        type: { world: 'scalar', domain: 'boolean', category: 'internal', busEligible: false },
        defaultValue: true,
        uiHint: { kind: 'boolean' }
      }
    }
  }
];

// Phase domain lenses (Doc 17, Section 1)
const PHASE_LENSES: LensRegistryEntry[] = [
  {
    id: 'phaseOffset',
    label: 'Phase Offset',
    description: 'Add constant phase offset',
    inputType: { world: 'signal', domain: 'phase', category: 'core', busEligible: true },
    outputType: { world: 'signal', domain: 'phase', category: 'core', busEligible: true },
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    allowedOn: 'both',
    paramSpecs: {
      offset: {
        type: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
        defaultValue: 0,
        uiHint: { kind: 'number', min: 0, max: 1, step: 0.01 }
      }
    }
  },
  {
    id: 'phaseScale',
    label: 'Phase Scale',
    description: 'Scale phase (creates faster cycles)',
    inputType: { world: 'signal', domain: 'phase', category: 'core', busEligible: true },
    outputType: { world: 'signal', domain: 'phase', category: 'core', busEligible: true },
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    allowedOn: 'both',
    paramSpecs: {
      scale: {
        type: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
        defaultValue: 1,
        uiHint: { kind: 'number', min: 0.1, max: 10, step: 0.1 }
      }
    }
  },
  {
    id: 'pingPong',
    label: 'Ping Pong',
    description: 'Triangle fold phase',
    inputType: { world: 'signal', domain: 'phase', category: 'core', busEligible: true },
    outputType: { world: 'signal', domain: 'phase', category: 'core', busEligible: true },
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    allowedOn: 'both',
    paramSpecs: {} // No params
  },
  {
    id: 'phaseQuantize',
    label: 'Phase Quantize',
    description: 'Quantize phase to discrete steps',
    inputType: { world: 'signal', domain: 'phase', category: 'core', busEligible: true },
    outputType: { world: 'signal', domain: 'phase', category: 'core', busEligible: true },
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    allowedOn: 'both',
    paramSpecs: {
      steps: {
        type: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
        defaultValue: 4,
        uiHint: { kind: 'number', min: 1, max: 32, step: 1 }
      }
    }
  }
];

// Vec2 domain lenses (Doc 17, Section 2)
const VEC2_LENSES: LensRegistryEntry[] = [
  {
    id: 'vec2GainBias',
    label: 'Vec2 Gain/Bias',
    description: 'Apply gain and bias to vector components',
    inputType: { world: 'signal', domain: 'vec2', category: 'core', busEligible: true },
    outputType: { world: 'signal', domain: 'vec2', category: 'core', busEligible: true },
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    allowedOn: 'both',
    paramSpecs: {
      gain: {
        type: { world: 'scalar', domain: 'vec2', category: 'internal', busEligible: false },
        defaultValue: { x: 1, y: 1 },
        uiHint: { kind: 'number' }
      },
      bias: {
        type: { world: 'scalar', domain: 'vec2', category: 'internal', busEligible: false },
        defaultValue: { x: 0, y: 0 },
        uiHint: { kind: 'number' }
      }
    }
  },
  {
    id: 'rotate2D',
    label: 'Rotate 2D',
    description: 'Rotate vector around origin',
    inputType: { world: 'signal', domain: 'vec2', category: 'core', busEligible: true },
    outputType: { world: 'signal', domain: 'vec2', category: 'core', busEligible: true },
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    allowedOn: 'both',
    paramSpecs: {
      turns: {
        type: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
        defaultValue: 0,
        uiHint: { kind: 'number', min: -1, max: 1, step: 0.01 }
      }
    }
  },
  {
    id: 'translate2D',
    label: 'Translate 2D',
    description: 'Translate vector by delta',
    inputType: { world: 'signal', domain: 'vec2', category: 'core', busEligible: true },
    outputType: { world: 'signal', domain: 'vec2', category: 'core', busEligible: true },
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    allowedOn: 'both',
    paramSpecs: {
      delta: {
        type: { world: 'scalar', domain: 'vec2', category: 'internal', busEligible: false },
        defaultValue: { x: 0, y: 0 },
        uiHint: { kind: 'number' }
      }
    }
  }
];

// Color domain lenses (Doc 17, Section 3)
const COLOR_LENSES: LensRegistryEntry[] = [
  {
    id: 'colorGain',
    label: 'Color Gain',
    description: 'Scale color brightness',
    inputType: { world: 'signal', domain: 'color', category: 'core', busEligible: true },
    outputType: { world: 'signal', domain: 'color', category: 'core', busEligible: true },
    costHint: 'cheap',
    stabilityHint: 'scrubSafe',
    allowedOn: 'both',
    paramSpecs: {
      gain: {
        type: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
        defaultValue: 1,
        uiHint: { kind: 'number', min: 0, max: 4, step: 0.1 }
      },
      alphaGain: {
        type: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
        defaultValue: 1,
        uiHint: { kind: 'number', min: 0, max: 1, step: 0.1 }
      }
    }
  },
  {
    id: 'hueShift',
    label: 'Hue Shift',
    description: 'Shift color hue',
    inputType: { world: 'signal', domain: 'color', category: 'core', busEligible: true },
    outputType: { world: 'signal', domain: 'color', category: 'core', busEligible: true },
    costHint: 'medium',
    stabilityHint: 'scrubSafe',
    allowedOn: 'both',
    paramSpecs: {
      turns: {
        type: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
        defaultValue: 0,
        uiHint: { kind: 'number', min: -1, max: 1, step: 0.01 }
      }
    }
  },
  {
    id: 'saturate',
    label: 'Saturate',
    description: 'Adjust color saturation',
    inputType: { world: 'signal', domain: 'color', category: 'core', busEligible: true },
    outputType: { world: 'signal', domain: 'color', category: 'core', busEligible: true },
    costHint: 'medium',
    stabilityHint: 'scrubSafe',
    allowedOn: 'both',
    paramSpecs: {
      amount: {
        type: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
        defaultValue: 1,
        uiHint: { kind: 'number', min: 0, max: 2, step: 0.1 }
      }
    }
  }
];

export class LensRegistryImpl implements LensRegistry {
  private lenses: Map<string, LensRegistryEntry>;
  private lensesByDomain: Map<Domain, LensRegistryEntry[]>;

  constructor() {
    this.lenses = new Map();
    this.lensesByDomain = new Map();

    // Register all lenses
    this.registerDomainLenses('number', NUMBER_LENSES);
    this.registerDomainLenses('phase', PHASE_LENSES);
    this.registerDomainLenses('vec2', VEC2_LENSES);
    this.registerDomainLenses('color', COLOR_LENSES);
  }

  get(id: string): LensRegistryEntry | undefined {
    return this.lenses.get(id);
  }

  getAll(): LensRegistryEntry[] {
    return Array.from(this.lenses.values());
  }

    const domainLenses = this.lensesByDomain.get(domain) || [];

    return domainLenses.filter(lens =>
      lens.allowedOn === 'both' || lens.allowedOn === endpointType
    );
  }

  validateTypePreservation(lens: LensRegistryEntry): boolean {
    // Type preservation: input and output types must be identical
    return lens.inputType.world === lens.outputType.world &&
           lens.inputType.domain === lens.outputType.domain &&
           lens.inputType.category === lens.outputType.category;
  }

  private registerDomainLenses(domain: Domain, lenses: LensRegistryEntry[]): void {
    // Validate type preservation
    lenses.forEach(lens => {
      if (!this.validateTypePreservation(lens)) {
        throw new Error(`Lens ${lens.id} does not preserve type`);
      }
    });

    // Register lenses
    lenses.forEach(lens => {
      this.lenses.set(lens.id, lens);
    });

    // Index by domain
    this.lensesByDomain.set(domain, lenses);
  }
}
```

## Phase 4: Default Sources Implementation

### 4.1 Default Source Store

**File**: `src/editor/stores/DefaultSourceStore.ts`

```typescript
/**
 * Default Source Store for lens parameters
 * Implements design document 18: Lens Parameters as Default Sources
 */

import { makeObservable, observable, action } from 'mobx';
import type {
  DefaultSourceStore as IDefaultSourceStore,
  DefaultSourceState,
  UIControlHint
} from '../types';
import type { RootStore } from './RootStore';

export class DefaultSourceStore implements IDefaultSourceStore {
  private sources: Map<string, DefaultSourceState>;
  root: RootStore;

  constructor(root: RootStore) {
    this.root = root;
    this.sources = new Map();

    makeObservable(this, {
      sources: observable,
      create: action,
      update: action,
      delete: action
    });
  }

  get(id: string): DefaultSourceState | undefined {
    return this.sources.get(id);
  }

  getAll(): DefaultSourceState[] {
    return Array.from(this.sources.values());
  }

  create(spec: Omit<DefaultSourceState, 'id'>): string {
    const id = this.root.generateId('ds');
    const source: DefaultSourceState = {
      id,
      ...spec
    };

    this.sources.set(id, source);
    return id;
  }

  update(id: string, value: unknown): void {
    const source = this.sources.get(id);
    if (!source) {
      throw new Error(`Default source not found: ${id}`);
    }

    // Type validation would happen here based on source.type
    source.value = value;
  }

  /**
   * Create default source for lens parameter
   */
  createForLensParam(
    bindingId: string,
    lensIndex: number,
    paramKey: string,
    paramSpec: { type: any; defaultValue: unknown; uiHint?: UIControlHint }
  ): string {
    const id = `ds:${bindingId}:${lensIndex}:${paramKey}`;

    const source: DefaultSourceState = {
      id,
      type: paramSpec.type,
      value: paramSpec.defaultValue,
      uiHint: paramSpec.uiHint
    };

    this.sources.set(id, source);
    return id;
  }

  /**
   * Resolve default source value to artifact
   */
  resolveToArtifact(id: string): any {
    const source = this.sources.get(id);
    if (!source) {
      throw new Error(`Default source not found: ${id}`);
    }

    // Convert to const artifact based on type
    return {
      kind: `Const:${source.type.domain}`,
      value: source.value
    };
  }

  delete(id: string): void {
    this.sources.delete(id);
  }
}
```

### 4.2 Binding Resolution System

**File**: `src/editor/compiler/bindingResolver.ts`

```typescript
/**
 * Binding resolution system for lens parameters
 * Resolves Default, Wire, and Bus bindings to artifacts
 */

import type {
  LensParamBinding,
  BindingEndpoint,
  AdapterStep,
  LensInstance,
  Artifact
} from '../types';
import type { DefaultSourceStore } from '../stores/DefaultSourceStore';
import type { BusStore } from '../stores/BusStore';
import type { PatchStore } from '../stores/PatchStore';
import type { AdapterRegistry } from '../registry/registryInterfaces';
import { MAX_LENS_NESTING_DEPTH } from '../constants';

export class BindingResolver {
  private defaultSourceStore: DefaultSourceStore;
  private busStore: BusStore;
  private patchStore: PatchStore;
  private adapterRegistry: AdapterRegistry;

  constructor(
    defaultSourceStore: DefaultSourceStore,
    busStore: BusStore,
    patchStore: PatchStore,
    adapterRegistry: AdapterRegistry
  ) {
    this.defaultSourceStore = defaultSourceStore;
    this.busStore = busStore;
    this.patchStore = patchStore;
    this.adapterRegistry = adapterRegistry;
  }

  /**
   * Resolve lens parameter binding to artifact
   * Implements safety rules from Doc 18, Section 4
   */
  async resolveLensParam(
    binding: LensParamBinding,
    context: BindingContext
  ): Promise<Artifact> {
    // Check nesting depth
    if (context.nestingDepth > MAX_LENS_NESTING_DEPTH) {
      return {
        kind: 'Error',
        message: 'Lens parameter nesting too deep'
      };
    }

    // Check for cyclic dependency
    if (this.isCyclicDependency(binding, context)) {
      return {
        kind: 'Error',
        message: 'Cyclic dependency in lens parameter'
      };
    }

    switch (binding.kind) {
      case 'default':
        return this.resolveDefault(binding.defaultSourceId);

      case 'wire':
        return this.resolveWire(binding.from, binding.adapterChain, binding.lensStack, context);

      case 'bus':
        return this.resolveBus(binding.busId, binding.adapterChain, binding.lensStack, context);

      default:
        return {
          kind: 'Error',
          message: `Unknown binding kind: ${(binding as any).kind}`
        };
    }
  }

  private resolveDefault(defaultSourceId: string): Artifact {
    return this.defaultSourceStore.resolveToArtifact(defaultSourceId);
  }

  private async resolveWire(
    from: BindingEndpoint,
    adapterChain?: AdapterStep[],
    lensStack?: LensInstance[],
    context: BindingContext
  ): Promise<Artifact> {
    // Get source block output
    const block = this.patchStore.getBlock(from.blockId);
    if (!block) {
      return {
        kind: 'Error',
        message: `Block not found: ${from.blockId}`
      };
    }

    // Compile block output
    const outputArtifact = await this.compileBlockOutput(block, from.slotId);

    if (outputArtifact.kind === 'Error') {
      return outputArtifact;
    }

    // Apply adapter chain
    const adaptedArtifact = this.applyAdapterChain(outputArtifact, adapterChain);

    if (adaptedArtifact.kind === 'Error') {
      return adaptedArtifact;
    }

    // Apply lens stack (recursive)
    return this.applyLensStack(adaptedArtifact, lensStack || [], {
      ...context,
      nestingDepth: context.nestingDepth + 1
    });
  }

  private async resolveBus(
    busId: string,
    adapterChain?: AdapterStep[],
    lensStack?: LensInstance[],
    context: BindingContext
  ): Promise<Artifact> {
    // Get bus
    const bus = this.busStore.getBusById(busId);
    if (!bus) {
      return {
        kind: 'Error',
        message: `Bus not found: ${busId}`
      };
    }

    // Compile bus artifact
    const busArtifact = await this.compileBus(bus);

    if (busArtifact.kind === 'Error') {
      return busArtifact;
    }

    // Apply adapter chain
    const adaptedArtifact = this.applyAdapterChain(busArtifact, adapterChain);

    if (adaptedArtifact.kind === 'Error') {
      return adaptedArtifact;
    }

    // Apply lens stack (recursive)
    return this.applyLensStack(adaptedArtifact, lensStack || [], {
      ...context,
      nestingDepth: context.nestingDepth + 1
    });
  }

  private applyAdapterChain(artifact: Artifact, adapterChain?: AdapterStep[]): Artifact {
    if (!adapterChain || adapterChain.length === 0) {
      return artifact;
    }

    let result = artifact;

    for (const step of adapterChain) {
      const adapter = this.adapterRegistry.get(step.adapterId);
      if (!adapter) {
        return {
          kind: 'Error',
          message: `Unknown adapter: ${step.adapterId}`
        };
      }

      // Apply adapter implementation
      result = this.applyAdapter(result, adapter, step.params);

      if (result.kind === 'Error') {
        return result;
      }
    }

    return result;
  }

  private async applyLensStack(
    artifact: Artifact,
    lensStack: LensInstance[],
    context: BindingContext
  ): Promise<Artifact> {
    if (lensStack.length === 0) {
      return artifact;
    }

    let result = artifact;

    // Sort by sortKey if provided, otherwise preserve order
    const sortedLenses = [...lensStack].sort((a, b) => {
      if (a.sortKey !== undefined && b.sortKey !== undefined) {
        return a.sortKey - b.sortKey;
      }
      return 0;
    });

    for (const lens of sortedLenses) {
      if (!lens.enabled) continue;

      // Resolve lens parameters
      const paramArtifacts: Record<string, Artifact> = {};

      for (const [paramKey, paramBinding] of Object.entries(lens.params)) {
        paramArtifacts[paramKey] = await this.resolveLensParam(paramBinding, context);
      }

      // Apply lens
      result = this.applyLens(result, lens.lensId, paramArtifacts);

      if (result.kind === 'Error') {
        return result;
      }
    }

    return result;
  }

  private isCyclicDependency(binding: LensParamBinding, context: BindingContext): boolean {
    // Implementation would check if binding depends on context.currentBinding
    // For now, return false
    return false;
  }

  // Placeholder methods - would be implemented with actual compilation
  private async compileBlockOutput(block: any, slotId: string): Promise<Artifact> {
    // TODO: Implement block compilation
    return { kind: 'Error', message: 'Not implemented' };
  }

  private async compileBus(bus: any): Promise<Artifact> {
    // TODO: Implement bus compilation
    return { kind: 'Error', message: 'Not implemented' };
  }

  private applyAdapter(artifact: Artifact, adapter: any, params?: any): Artifact {
    // TODO: Implement adapter application
    return { kind: 'Error', message: 'Not implemented' };
  }

  private applyLens(artifact: Artifact, lensId: string, paramArtifacts: Record<string, Artifact>): Artifact {
    // TODO: Implement lens application
    return { kind: 'Error', message: 'Not implemented' };
  }
}

interface BindingContext {
  currentBinding?: string;
  nestingDepth: number;
}
```

## Phase 5: Compiler Integration

### 5.1 Update Compilation Pipeline

**File**: `src/editor/compiler/busCompilation.ts`

Update bus compilation to apply adapters and lenses in correct order:

```typescript
/**
 * Enhanced bus compilation with adapter and lens support
 * Implements evaluation order from Doc 16, Section 2
 */

import type { AdapterRegistry } from '../registry/registryInterfaces';
import type { LensRegistry } from '../registry/registryInterfaces';
import { BindingResolver } from './bindingResolver';

export class BusCompiler {
  private adapterRegistry: AdapterRegistry;
  private lensRegistry: LensRegistry;
  private bindingResolver: BindingResolver;

  constructor(
    adapterRegistry: AdapterRegistry,
    lensRegistry: LensRegistry,
    bindingResolver: BindingResolver
  ) {
    this.adapterRegistry = adapterRegistry;
    this.lensRegistry = lensRegistry;
    this.bindingResolver = bindingResolver;
  }

  /**
   * Order: block output → adapterChain → lensStack → bus
   */

    if (outputArtifact.kind === 'Error') {
      return outputArtifact;
    }

    const adaptedArtifact = this.applyAdapterChain(
      outputArtifact,
    );

    if (adaptedArtifact.kind === 'Error') {
      return adaptedArtifact;
    }

    const lensedArtifact = await this.applyLensStack(
      adaptedArtifact,
    );

    return lensedArtifact;
  }

  /**
   * Order: bus → adapterChain → lensStack → block input
   */
    busArtifact: Artifact
  ): Promise<Artifact> {
    const adaptedArtifact = this.applyAdapterChain(
      busArtifact,
    );

    if (adaptedArtifact.kind === 'Error') {
      return adaptedArtifact;
    }

    const lensedArtifact = await this.applyLensStack(
      adaptedArtifact,
    );

    return lensedArtifact;
  }

  /**
   */

    // Find adapter path
    const adapterPath = this.adapterRegistry.findPath(
      blockOutputType,
      busType,
    );

    if (!adapterPath) {
      return {
        isValid: false,
        errors: [`Cannot convert ${formatTypeDesc(blockOutputType)} to ${formatTypeDesc(busType)}`],
        warnings: []
      };
    }

    // Validate adapter chain
      const chainValidation = this.adapterRegistry.validateChain(
        blockOutputType,
        busType
      );

      if (!chainValidation.isValid) {
        return chainValidation;
      }
    }

    // Validate lens stack type preservation
        const lensDef = this.lensRegistry.get(lens.lensId);
        if (!lensDef) {
          return {
            isValid: false,
            errors: [`Unknown lens: ${lens.lensId}`],
            warnings: []
          };
        }

        if (!this.lensRegistry.validateTypePreservation(lensDef)) {
          return {
            isValid: false,
            errors: [`Lens ${lens.lensId} does not preserve type`],
            warnings: []
          };
        }
      }
    }

    return {
      isValid: true,
      errors: [],
      warnings: adapterPath.hasHeavy ? ['Heavy adapter may impact performance'] : []
    };
  }

  /**
   */

    // Find adapter path
    const adapterPath = this.adapterRegistry.findPath(
      busType,
      blockInputType,
    );

    if (!adapterPath) {
      return {
        isValid: false,
        errors: [`Cannot convert ${formatTypeDesc(busType)} to ${formatTypeDesc(blockInputType)}`],
        warnings: []
      };
    }

    // (Implementation omitted for brevity)

    return { isValid: true, errors: [], warnings: [] };
  }

  // Private helper methods...
}
```

## Phase 6: Store Updates and Migration

### 6.1 Update BusStore

**File**: `src/editor/stores/BusStore.ts`


```typescript
// Add to constructor observable actions:

// Add methods:
/**
 */

  }


  this.root.events.emit({
    lens
  });
}

/**
 */


  if (removed) {
    this.root.events.emit({
      lensIndex
    });
  }
}

/**
 */


  this.root.events.emit({
  });
}
```

### 6.2 Update RootStore

**File**: `src/editor/stores/RootStore.ts`

```typescript
// Add to constructor:
this.defaultSourceStore = new DefaultSourceStore(this);
this.adapterRegistry = new AdapterRegistryImpl();
this.lensRegistry = new LensRegistryImpl();
this.bindingResolver = new BindingResolver(
  this.defaultSourceStore,
  this.busStore,
  this.patchStore,
  this.adapterRegistry
);

// Add to exports:
defaultSourceStore: DefaultSourceStore;
adapterRegistry: AdapterRegistry;
lensRegistry: LensRegistry;
bindingResolver: BindingResolver;
```

## Phase 7: UI Integration


**File**: `src/editor/components/BusBoard.tsx`


```tsx
  const [showLenses, setShowLenses] = useState(false);

  return (
      {/* Enable toggle */}
      <Toggle
      />

      {/* Primary lens control (if any) */}
        <div className="primary-lens-control">
          <Button
            size="sm"
            onClick={() => setShowLenses(!showLenses)}
          >
            ⋯
          </Button>
        </div>
      )}

      {/* Expanded lens stack */}
        <LensStackEditor
        />
      )}
    </div>
  );
};
```

### 7.2 Inspector Lens Editor

**File**: `src/editor/components/Inspector.tsx`

```tsx
// Lens parameter editor with binding
const LensParamEditor = ({
  binding,
  onChange
}: {
  binding: LensParamBinding;
  onChange: (binding: LensParamBinding) => void;
}) => {
  switch (binding.kind) {
    case 'default':
      return <DefaultSourceEditor sourceId={binding.defaultSourceId} />;

    case 'bus':
      return <BusBinding binding={binding} onChange={onChange} />;

    case 'wire':
      return <WireBinding binding={binding} onChange={onChange} />;
  }
};
```

## Phase 8: Validation and Testing

### 8.1 Type Preservation Validation

**File**: `src/editor/validation/lensValidation.ts`

```typescript
/**
 * Validate lens type preservation rule
 * Doc 17, Section 6: A lens is valid iff outputTypeDesc === inputTypeDesc
 */

export function validateLensTypePreservation(
  lensRegistry: LensRegistry,
  lensStack: LensInstance[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const lens of lensStack) {
    const lensDef = lensRegistry.get(lens.lensId);
    if (!lensDef) {
      errors.push(`Unknown lens: ${lens.lensId}`);
      continue;
    }

    // Check type preservation
    if (!lensRegistry.validateTypePreservation(lensDef)) {
      errors.push(`Lens ${lens.lensId} changes type - this should be an adapter`);
    }

    // Check parameter types
    for (const [paramKey, paramBinding] of Object.entries(lens.params)) {
      const paramSpec = lensDef.paramSpecs[paramKey];
      if (!paramSpec) {
        errors.push(`Unknown parameter ${paramKey} in lens ${lens.lensId}`);
        continue;
      }

      // Additional param type validation would go here
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}
```

### 8.2 Adapter Policy Validation

**File**: `src/editor/validation/adapterValidation.ts`

```typescript
/**
 * Validate adapter policies and user confirmations
 * Doc 19, Section 6.1
 */

export function validateAdapterPolicies(
  adapterRegistry: AdapterRegistry,
  adapterChain: AdapterStep[],
  requiresUserConfirmation: boolean = false
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const step of adapterChain) {
    const adapter = adapterRegistry.get(step.adapterId);
    if (!adapter) {
      errors.push(`Unknown adapter: ${step.adapterId}`);
      continue;
    }

    // Check policy
    if (adapter.policy === 'FORBIDDEN') {
      errors.push(`Adapter ${step.adapterId} is forbidden`);
    } else if (adapter.policy === 'EXPLICIT' && !requiresUserConfirmation) {
      errors.push(`Adapter ${step.adapterId} requires explicit user confirmation`);
    } else if (adapter.policy === 'EXPLICIT' && requiresUserConfirmation) {
      warnings.push(`Using explicit adapter ${step.adapterId} with user confirmation`);
    } else if (adapter.policy === 'SUGGEST') {
      warnings.push(`Using suggested adapter ${step.adapterId}`);
    }

    // Check cost warnings
    if (adapter.cost === 'heavy') {
      warnings.push(`Heavy adapter ${step.adapterId} may impact performance`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}
```

## Phase 9: Migration Path

### 9.1 Legacy Data Migration

**File**: `src/editor/migration/migrateToV2.ts`

```typescript
/**
 * Migrate legacy LensDefinition to new LensInstance
 */

export function migrateLensDefinition(
  legacyLens: LensDefinition,
  bindingId: string,
  defaultSourceStore: DefaultSourceStore
): LensInstance {
  const lensId = legacyLens.type;

  // Convert params to bindings
  const params: Record<string, LensParamBinding> = {};

  for (const [key, value] of Object.entries(legacyLens.params)) {
    // Create default source for each param
    const defaultSourceId = defaultSourceStore.createForLensParam(
      bindingId,
      0, // First lens in stack
      key,
      {
        type: { world: 'scalar', domain: 'number', category: 'internal', busEligible: false },
        defaultValue: value,
        uiHint: { kind: 'number' }
      }
    );

    params[key] = {
      kind: 'default',
      defaultSourceId
    };
  }

  return {
    lensId,
    params,
    enabled: true
  };
}

/**
 */
  defaultSourceStore: DefaultSourceStore
    return {
      lens: undefined // Remove legacy field
    };
  }

}
```

## Implementation Timeline

### Week 1: Foundation
- [ ] Update type definitions (Phase 1)
- [ ] Create registry interfaces (Phase 1)
- [ ] Implement adapter registry (Phase 2.1)

### Week 2: Core Systems
- [ ] Implement adapter selection algorithm
- [ ] Implement lens registry (Phase 3.1)
- [ ] Create default source store (Phase 4.1)

### Week 3: Integration
- [ ] Update compilation pipeline (Phase 5)
- [ ] Implement binding resolver (Phase 4.2)
- [ ] Update stores (Phase 6)

### Week 4: UI and Migration
- [ ] Implement migration path (Phase 9)
- [ ] Add validation and testing (Phase 8)

## Success Metrics

1. **Type Safety**: 100% of lenses preserve types (validated at compile time)
2. **Auto-Selection**: 90% of common connections use auto-adapters
3. **Performance**: Adapter/lens evaluation adds <5ms overhead
4. **User Experience**: No silent heavy adapters, clear warnings
5. **Migration**: All legacy data migrates without data loss

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|---------|------------|
| Performance impact from complex lens stacks | High | Limit lens nesting depth, cost hints in UI |
| User confusion between adapters and lenses | Medium | Clear UI separation, documentation |
| Migration data loss | High | Comprehensive migration testing |
| Cyclic dependencies in lens parameters | Medium | Dependency graph validation |

## Next Steps

1. Review and approve this plan
2. Create detailed DOD with acceptance criteria
3. Begin Phase 1 implementation
4. Weekly progress reviews
5. Integration testing after each phase