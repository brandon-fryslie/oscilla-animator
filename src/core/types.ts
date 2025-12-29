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
