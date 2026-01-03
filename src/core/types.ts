/**
 * V4 Animation Framework - Core Types
 *
 * A comprehensive, pure, composable kernel with 8 primitives:
 * 1. Signal<A>        - (t: Time) => A  (continuous, scrubbable)
 * 2. Event<A>         - Stream of (time, value) occurrences
 * 3. map/zip          - Signal combinators
 * 4. delay/stretch/warp - Time transforms
 * 5. switch/until     - Event-driven signal switching
 * 6. scan             - (state, dt, input) => state' (pure state)
 * 7. Rand<A>          - Seedable random sampler
 * 8. RenderTree       - Backend-neutral output
 */

// =============================================================================
// Primitives
// =============================================================================

/** Time in seconds (wall clock). */
export type Time = number;

/** Normalized progress in [0, 1]. */
export type Unit = number;

/** PRNG seed for reproducible randomness. */
export type Seed = int;

/** 2D point/vector. */
export type Point = {
  readonly x: number;
  readonly y: number;
};

/** Vec2 alias for Point (matches reference kernel naming). */
export type Vec2 = Point;

/** Duration in seconds. */
export type Duration = number;

/** Stable identity for render nodes. */
export type Id = string;

/** HSL color. */
export type HSL = {
  readonly h: number;  // 0-360
  readonly s: number;  // 0-100
  readonly l: number;  // 0-100
};

/** RGBA color (for Canvas). */
export type RGBA = {
  readonly r: number;  // 0-255
  readonly g: number;  // 0-255
  readonly b: number;  // 0-255
  readonly a: number;  // 0-1
};

// =============================================================================
// Environment (static info about the rendering context)
// =============================================================================

/**
 * Env contains static information about the rendering environment.
 * Extend freely: dpi, reducedMotion, theme, etc.
 */
export type Env = {
  readonly viewport: { width: number; height: number };
};

// =============================================================================
// Runtime Input (reactive signals available during sampling)
// =============================================================================

/**
 * Input represents external reactive signals that can influence animation.
 * Available at every sample point.
 */
export type Input = {
  readonly pointer: { x: number; y: number; down: boolean };
  readonly scrollY: number;
  readonly keysDown: ReadonlySet<string>;
  readonly scrubPosition?: number;  // For explicit scrub control
};

// =============================================================================
// Context (combines Env + Input for Signal sampling)
// =============================================================================

/**
 * Context is passed to every Signal sample.
 * Combines static environment info with dynamic input.
 */
export type Context = {
  readonly env: Env;
  readonly input: Input;
};

/**
 * Default context for testing and simple usage.
 */
export const DEFAULT_CONTEXT: Context = {
  env: { viewport: { width: 800, height: 600 } },
  input: {
    pointer: { x: 0, y: 0, down: false },
    scrollY: 0,
    keysDown: new Set(),
  },
};


// =============================================================================
// Compile-Time Context (static info available during plan compilation)
// =============================================================================

/**
 * Context available at compile time (not during animation).
 * Used by Fields to generate initial conditions.
 */
export type CompileCtx = {
  readonly viewport: { width: number; height: number };
  readonly elementCount: number;
};

// =============================================================================
// Time Transform
// =============================================================================

/**
 * A TimeTransform warps time for signals.
 * Used for delay, stretch, loop, etc.
 */
export type TimeTransform = (t: Time) => Time;

// =============================================================================
// Signal<A> - Continuous Time-Indexed Values
// =============================================================================

/**
 * A Signal is a continuous function from time and context to a value.
 * Signals are the core abstraction for scrubbable animations.
 *
 * Key properties:
 * - Pure: same (t, ctx) always produces same result
 * - Scrubbable: can sample at any t, in any order
 * - Composable: signals combine via map, zip, etc.
 */
export type Signal<A> = (t: Time, ctx: Context) => A;

// =============================================================================
// Event<A> - Discrete Occurrences
// =============================================================================

/**
 * An EventOccurrence is a timestamped value.
 * Events model discrete happenings: phase changes, spawns, key presses.
 */
export type EventOccurrence<A> = {
  readonly time: Time;
  readonly value: A;
};

/**
 * An EventStream is a sorted list of occurrences.
 * Immutable and sorted by time (ascending).
 */
export type EventStream<A> = readonly EventOccurrence<A>[];

/**
 * An EventScript generates an EventStream from a seed.
 * Used for procedural event generation (typewriter timing, etc.)
 */
export type EventScript<A> = (seed: Seed) => EventStream<A>;

// =============================================================================
// Rand<A> - Explicit Randomness
// =============================================================================

/**
 * PRNG interface for seedable randomness.
 */
export type PRNG = {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  vary(base: number, variance: number): number;
  varyPercent(base: number, percent: number): number;
  getState(): number;
  fork(): PRNG;
};

/**
 * Rand<A> is a computation that uses randomness.
 * Run it with a seed to get a deterministic result.
 */
export type Rand<A> = (rng: PRNG) => A;

// =============================================================================
// Field<A> - Per-Element Initial Conditions
// =============================================================================

/**
 * A Field generates per-element values at compile time.
 * This is the key abstraction for "where things start" and "when things start".
 *
 * Fields are evaluated once at compile time, not during animation.
 * They produce N values for N elements.
 */
export type Field<A> = (seed: Seed, n: number, ctx: CompileCtx) => readonly A[];

// =============================================================================
// Stepper - Pure State Evolution
// =============================================================================

/**
 * A Stepper defines how state evolves over a time step.
 * Used with scan() to create stateful signals that remain pure.
 *
 * @param state - Current state
 * @param dt - Time delta since last step
 * @param input - Current input signals
 * @returns New state
 */
export type Stepper<S, I = void> = (state: S, dt: number, input: I) => S;

// =============================================================================
// Easing Functions
// =============================================================================

/**
 * An Ease function maps [0,1] to [0,1] with different acceleration curves.
 */
export type Ease = (u: Unit) => Unit;

// =============================================================================
// Phase - Animation Segments
// =============================================================================

/**
 * Phase names are strings for flexibility.
 * Common names: 'entrance', 'hold', 'exit'
 */
export type PhaseName = string;

/**
 * A Phase defines a named segment of time with optional easing.
 */
export type Phase = {
  readonly name: PhaseName;
  readonly duration: Duration;
  readonly ease?: Ease;
};


/**
 * PhaseMachine is a sequence of phases.
 */
export type PhaseMachine = {
  readonly phases: readonly Phase[];
};

/**
 * PhaseSample contains information about the current phase at a given time.
 */
export type PhaseSample = {
  readonly phase: PhaseName;
  readonly index: number;       // Index of current phase
  readonly progress: Unit;      // Eased progress within phase [0,1]
  readonly progressRaw: Unit;   // Raw progress within phase [0,1]
  readonly localTime: Time;     // Time within current phase
  readonly globalTime: Time;    // Total time into animation
};


// =============================================================================
// Program - The Complete Animation
// =============================================================================

/**
 * A Scene is the static description of what to animate.
 * It's the "what" without the "how" or "when".
 */
export type Scene<S> = S;

/**
 * Event as a function (alternative representation from reference).
 * Returns occurrences at time t. Can have multiple or zero occurrences.
 */
export type EventFn<A> = (t: Time, ctx: Context) => readonly A[];

/**
 * A Program produces both a continuous signal and discrete events.
 * This matches the reference kernel's Program type.
 */
export type Program<Out, Ev = never> = {
  readonly signal: Signal<Out>;
  readonly event: EventFn<Ev>;
};

/**
 * A Compiler takes a scene and seed and produces a Program.
 */
export type Compiler<SceneType, Out, Ev = never> = (
  scene: SceneType,
  seed: Seed
) => Program<Out, Ev>;


// =============================================================================
// Composition Laws
// =============================================================================

/**
 * Compose describes how animations combine.
 */
export type Compose =
  | { readonly kind: 'parallel' }
  | { readonly kind: 'sequence' }
  | { readonly kind: 'stagger'; readonly offsets: Field<Duration> }
  | { readonly kind: 'trigger'; readonly on: EventFn<unknown> };

// =============================================================================
// Vec2 Utilities (inline for convenience)
// =============================================================================

export const Vec2 = {
  /** Create a Vec2 from x, y components. */
  of: (x: number, y: number): Vec2 => ({ x, y }),

  /** Zero vector. */
  zero: { x: 0, y: 0 } as Vec2,

  /** Add two vectors. */
  add: (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y }),

  /** Subtract b from a. */
  sub: (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y }),

  /** Scale a vector. */
  scale: (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s }),

  /** Linear interpolation between two vectors. */
  lerp: (a: Vec2, b: Vec2, t: number): Vec2 => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  }),

  /** Dot product. */
  dot: (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y,

  /** Length/magnitude. */
  length: (v: Vec2): number => Math.sqrt(v.x * v.x + v.y * v.y),

  /** Normalize to unit length. */
  normalize: (v: Vec2): Vec2 => {
    const len = Vec2.length(v);
    return len > 0 ? Vec2.scale(v, 1 / len) : Vec2.zero;
  },

  /** Distance between two points. */
  distance: (a: Vec2, b: Vec2): number => Vec2.length(Vec2.sub(b, a)),
};

// =============================================================================
// TimeTransform Utilities
// =============================================================================

export const TimeTransforms = {
  /** Identity transform (no change). */
  identity: ((t: Time) => t) as TimeTransform,

  /** Shift time by a delay. */
  shift: (delay: Duration): TimeTransform => (t) => t - delay,

  /** Scale time by a factor. */
  scale: (factor: number): TimeTransform => (t) => t * factor,

  /** Clamp time to a range. */
  clamp: (min: Time, max: Time): TimeTransform => (t) =>
    Math.max(min, Math.min(max, t)),

  /** Compose two transforms: apply b first, then a. */
  compose: (a: TimeTransform, b: TimeTransform): TimeTransform => (t) =>
    a(b(t)),
};

// =============================================================================
// PhaseMachine Utilities
// =============================================================================

export const PhaseMachines = {
  /** Create a PhaseMachine from phases. */
  of: (phases: readonly Phase[]): PhaseMachine => ({ phases }),

  /** Get total duration of all phases. */
  total: (pm: PhaseMachine): Duration =>
    pm.phases.reduce((acc, p) => acc + p.duration, 0),

  /** Sample the phase machine at a given time. */
  sample: (pm: PhaseMachine, t: Time): PhaseSample => {
    const total = PhaseMachines.total(pm);
    const clampedT = Math.max(0, Math.min(t, total));

    let accumulated = 0;
    for (let i = 0; i < pm.phases.length; i++) {
      const phase = pm.phases[i];
      const phaseEnd = accumulated + phase.duration;

      if (clampedT < phaseEnd || i === pm.phases.length - 1) {
        const localTime = clampedT - accumulated;
        const progressRaw =
          phase.duration > 0
            ? Math.max(0, Math.min(1, localTime / phase.duration))
            : 1;
        const progress = phase.ease ? phase.ease(progressRaw) : progressRaw;

        return {
          phase: phase.name,
          index: i,
          progress,
          progressRaw,
          localTime,
          globalTime: clampedT,
        };
      }
      accumulated = phaseEnd;
    }

    // Fallback (should never reach)
    const lastPhase = pm.phases[pm.phases.length - 1];
    return {
      phase: lastPhase.name,
      index: pm.phases.length - 1,
      progress: 1,
      progressRaw: 1,
      localTime: lastPhase.duration,
      globalTime: total,
    };
  },

  /** Create a signal that samples the phase machine. */
  toSignal: (pm: PhaseMachine): Signal<PhaseSample> => (t, _ctx) =>
    PhaseMachines.sample(pm, t),
};

// =============================================================================
// Unified Type System (Type Contracts + IR Plumbing)
// =============================================================================

/**
 * Top-level categorization of values in the Oscilla system.
 *
 * - `signal`: Time-varying values (functions of time, evaluated per-frame)
 * - `event`: Discrete event streams (sparse, edge-triggered)
 * - `field`: Domain-varying values (per-element lazy expressions)
 * - `scalar`: Compile-time constants (immediate values)
 * - `config`: Configuration values (not runtime-evaluated, used for setup)
 */
export type TypeWorld = 'signal' | 'event' | 'field' | 'scalar' | 'config' | 'special'; // DEPRECATED: 'special' → use 'config' instead

/**
 * Core domains - user-facing types in the bus system.
 * These are the learnable creative vocabulary.
 */
export type CoreDomain =
  | 'float'    // Floating-point values
  | 'int'      // Integer values
  | 'vec2'     // 2D positions/vectors
  | 'vec3'     // 3D positions/vectors
  | 'color'    // Color values
  | 'boolean'  // True/false values
  | 'time'     // Time values (always in seconds)
  | 'rate'     // Rate/multiplier values
  | 'trigger'; // Pulse/event signals

/**
 * Internal domains - engine types not directly exposed to users.
 * Used for internal plumbing and special resources.
 */
export type InternalDomain =
  | 'point'        // Point semantics
  | 'duration'     // Duration semantics
  | 'hsl'          // HSL color space
  | 'path'         // Path data
  | 'expression'   // DSL expression source
  | 'waveform'     // Oscillator waveform selector
  | 'phaseSample'  // PhaseMachine sample payload
  | 'phaseMachine' // PhaseMachine instance payload
  | 'wobble'       // Wobble modulator config
  | 'spiral'       // Spiral modulator config
  | 'wave'         // Wave modulator config
  | 'jitter'       // Jitter modulator config
  | 'program'      // Compiled program
  | 'renderTree'   // Render tree output
  | 'renderNode'   // Single render node
  | 'filterDef'    // SVG filter definition
  | 'strokeStyle'  // Stroke configuration
  | 'elementCount' // Number of elements
  | 'scene'        // Scene data
  | 'sceneTargets' // Scene target points
  | 'sceneStrokes' // Scene stroke paths
  | 'event'        // Generic events
  | 'string'       // String values (labels, etc.)
  | 'bounds'       // Bounding box / bounds
  | 'spec'         // Spec types (config that compiles to programs)
  | 'canvasRender' // Canvas 2D render commands
  | 'cameraRef'    // Camera resource reference (for 3D rendering)
  | 'vec4'         // 4D vector
  | 'quat'         // Quaternion for 3D rotations (x, y, z, w)
  | 'mat4'         // 4x4 transformation matrix
  | 'timeMs'       // Time in milliseconds
  | 'domain'       // Element identity handle
  | 'renderCmds'   // Render commands
  | 'mesh'         // 3D mesh
  | 'camera'       // Camera
  | 'matBuffer'    // Materialization buffer (Float32Array/Uint8Array/etc)
  | 'renderFrame'  // Render frame output
  | 'unknown';     // Unknown type

/**
 * All domains (core + internal).
 */
export type Domain = CoreDomain | InternalDomain;

/**
 * Category for type filtering.
 * - 'core': User-facing types (appear in bus system, UI)
 * - 'internal': Engine types (internal plumbing, not user-visible)
 */
export type TypeCategory = 'core' | 'internal';

/**
 * Unified type descriptor for values across editor and compiler.
 *
 * TypeDesc is the single authoritative type contract used throughout Oscilla.
 * It combines world (signal/field/scalar/event/config), domain (semantic type),
 * category (core vs internal), bus eligibility, and bundle shape.
 *
 * Key design decisions:
 * - `world` describes evaluation timing (signal=per-frame, field=lazy, scalar=compile-time, config=non-runtime)
 * - `domain` describes semantic meaning (float, vec2, color, etc.)
 * - `category` controls UI visibility (core types appear in bus system)
 * - `busEligible` explicitly marks which types can use buses
 * - `lanes` describes bundle shape (e.g., [3] = vec3, [4] = rgba, [3, 3] = two vec3s)
 * - Packing strategy (AoS/SoA, buffer formats) is IR/runtime-only, NOT in TypeDesc
 */
export interface TypeDesc {
  /** Top-level world classification (evaluation timing) */
  readonly world: TypeWorld;

  /** Domain-specific type (semantic meaning) */
  readonly domain: Domain;

  /** Category: core (user-facing) or internal (engine) */
  readonly category: TypeCategory;

  /** Whether this type can be used for buses */
  readonly busEligible: boolean;

  /**
   * Bundle shape - array of lane counts describing multi-component structure.
   *
   * Examples:
   * - Scalar: undefined or [1] (single value)
   * - Vec2: [2] (x, y components)
   * - Vec3: [3] (x, y, z components)
   * - RGBA: [4] (r, g, b, a components)
   * - Vec3 pair: [3, 3] (two 3-component vectors)
   * - Mat4: [16] (4x4 matrix as 16 components)
   *
   * Bundle shape describes semantic grouping, NOT memory layout.
   * The compiler/scheduler uses `lanes` for slot allocation and validation.
   * Packing strategy (AoS/SoA, buffer formats) is determined later in IR/runtime.
   */
  readonly lanes?: number[];

  /** Optional semantic annotation (e.g., "point", "hsl", "linearRGB", "bpm") */
  readonly semantics?: string;

  /** Optional unit annotation (e.g., "px", "deg", "ms", "seconds", "beats") */
  readonly unit?: string;
}

/**
 * Get the total number of scalar slots required for a TypeDesc.
 *
 * Returns the sum of all lane counts, defaulting to 1 for scalar types.
 * Used for slot allocation and bundle validation.
 *
 * @param type - Type descriptor
 * @returns Total number of scalar slots (defaults to 1)
 *
 * @example
 * getTypeArity({ world: 'signal', domain: 'float', ... }) // 1
 * getTypeArity({ world: 'signal', domain: 'vec3', lanes: [3], ... }) // 3
 * getTypeArity({ world: 'signal', domain: 'vec3', lanes: [3, 3], ... }) // 6
 */
export function getTypeArity(type: TypeDesc): number {
  if (!type.lanes || type.lanes.length === 0) {
    return 1;
  }
  return type.lanes.reduce((sum, count) => sum + count, 0);
}

/**
 * Infer bundle lanes from domain.
 *
 * Maps semantic type domains to their natural bundle shape.
 * Defaults to undefined (scalar) for non-bundle types.
 *
 * @param domain - The type domain
 * @returns The corresponding lane structure, or undefined for scalar
 *
 * @example
 * inferBundleLanes('float') // undefined (scalar)
 * inferBundleLanes('vec2') // [2]
 * inferBundleLanes('vec3') // [3]
 * inferBundleLanes('color') // [4] (RGBA)
 * inferBundleLanes('mat4') // [16]
 */
export function inferBundleLanes(domain: Domain): number[] | undefined {
  switch (domain) {
    case 'vec2':
      return [2];
    case 'vec3':
      return [3];
    case 'vec4':
      return [4];
    case 'quat':
      return [4];
    case 'mat4':
      return [16];
    case 'color':
      // Color defaults to RGBA (4 components)
      return [4];
    default:
      // All other types are scalar (no explicit lanes)
      return undefined;
  }
}

/**
 * Create a TypeDesc with automatic bundle inference.
 *
 * Convenience function that infers `lanes` from domain if not explicitly provided.
 *
 * @param world - Type world
 * @param domain - Type domain
 * @param category - Type category (core or internal)
 * @param busEligible - Whether this type can use buses
 * @param options - Optional semantic/unit annotations and lane override
 * @returns Complete TypeDesc with bundle information
 *
 * @example
 * createTypeDesc('signal', 'float', 'core', true)
 * // => { world: 'signal', domain: 'float', category: 'core', busEligible: true }
 *
 * createTypeDesc('signal', 'vec3', 'core', true)
 * // => { world: 'signal', domain: 'vec3', category: 'core', busEligible: true, lanes: [3] }
 *
 * createTypeDesc('signal', 'vec3', 'core', true, { lanes: [3, 3] })
 * // => Two vec3s (override auto-inference)
 */
export function createTypeDesc(
  world: TypeWorld,
  domain: Domain,
  category: TypeCategory,
  busEligible: boolean,
  options?: {
    semantics?: string;
    unit?: string;
    lanes?: number[]; // Override auto-inference if needed
  }
): TypeDesc {
  const lanes = options?.lanes ?? inferBundleLanes(domain);

  return {
    world,
    domain,
    category,
    busEligible,
    lanes,
    semantics: options?.semantics,
    unit: options?.unit,
  };
}
