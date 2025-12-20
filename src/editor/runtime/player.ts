/**
 * Player: Animation Runtime
 *
 * Single authoritative source for:
 * - Current time (tMs)
 * - Playback state (playing/paused)
 * - Program lifecycle (hot swap)
 *
 * Key invariants:
 * - Time is an input, not integrated state
 * - Programs can be swapped without resetting time
 * - Scrubbing works independently of RAF
 */

import type { RenderTree } from './renderTree';
import type { CompileCtx, RuntimeCtx, Program, Seed, TimelineHint, CuePoint, TimeModel } from '../compiler/types';

// =============================================================================
// Types
// =============================================================================

/**
 * A ProgramFactory creates a Program from seed, scene, and compile context.
 * This is what the patch compiler produces.
 */
export type ProgramFactory<T> = (
  seed: Seed,
  scene: Scene,
  ctx: CompileCtx
) => Program<T>;

/**
 * Scene represents the target geometry/content.
 * For now, a minimal stub - will be expanded.
 */
export interface Scene {
  id: string;
  targets?: readonly { x: number; y: number }[];
  paths?: readonly string[];
  bounds?: { width: number; height: number };
}

export type PlayState = 'playing' | 'paused';

/**
 * @deprecated LoopMode is deprecated. Looping behavior is now determined by TimeModel.
 * - Cyclic time models loop automatically
 * - Finite time models pause at end
 * - Infinite time models advance unbounded
 */
export type LoopMode = 'none' | 'loop' | 'pingpong';

export interface PlayerOptions {
  compileCtx: CompileCtx;
  runtimeCtx: RuntimeCtx;
  onFrame: (tree: RenderTree, tMs: number) => void;
  onStateChange?: (state: PlayState) => void;
  onTimeChange?: (tMs: number) => void;
  /** @deprecated Use TimeModel instead. Looping is now structural. */
  onLoopModeChange?: (mode: LoopMode) => void;
  onTimelineChange?: (hint: TimelineHint | null) => void;
  onCuePointsChange?: (cuePoints: readonly CuePoint[]) => void;
  /** If true, automatically apply timeline hints from programs */
  autoApplyTimeline?: boolean;
}

// =============================================================================
// Player Implementation
// =============================================================================

export class Player {
  private programFactory: ProgramFactory<RenderTree> | null = null;
  private program: Program<RenderTree> | null = null;

  private seed: Seed = 1;
  private scene: Scene | null = null;

  private compileCtx: CompileCtx;
  private runtimeCtx: RuntimeCtx;

  private playState: PlayState = 'paused';
  private tMs = 0;
  private lastFrameMs = 0;
  private rafId: number | null = null;

  private speed = 1.0;
  private loopMode: LoopMode = 'loop'; // Default to looping
  private maxTime = 10000; // 10 seconds default
  private playDirection = 1; // 1 = forward, -1 = backward (for pingpong)

  // Timeline hints from the current program
  private currentTimeline: TimelineHint | null = null;
  private cuePoints: readonly CuePoint[] = [];
  private autoApplyTimeline: boolean;

  // TimeModel from compiler (Phase 3: TimeRoot)
  private timeModel: TimeModel | null = null;

  // Finite loop mode: if true, finite animations loop; if false, they stop at end
  private finiteLoopMode = false;

  private onFrame: (tree: RenderTree, tMs: number) => void;
  private onStateChange?: (state: PlayState) => void;
  private onTimeChange?: (tMs: number) => void;
  private onLoopModeChange?: (mode: LoopMode) => void;
  private onTimelineChange?: (hint: TimelineHint | null) => void;
  private onCuePointsChange?: (cuePoints: readonly CuePoint[]) => void;

  constructor(opts: PlayerOptions) {
    this.compileCtx = opts.compileCtx;
    this.runtimeCtx = opts.runtimeCtx;
    this.onFrame = opts.onFrame;
    this.onStateChange = opts.onStateChange;
    this.onTimeChange = opts.onTimeChange;
    this.onLoopModeChange = opts.onLoopModeChange;
    this.onTimelineChange = opts.onTimelineChange;
    this.onCuePointsChange = opts.onCuePointsChange;
    this.autoApplyTimeline = opts.autoApplyTimeline ?? true;
  }

  // ===========================================================================
  // Program Lifecycle
  // ===========================================================================

  /**
   * Set the program factory (compiled patch output).
   * Instantiates a new program but preserves current time.
   */
  setFactory(factory: ProgramFactory<RenderTree>): void {
    this.programFactory = factory;
    this.instantiateProgram();
  }

  /**
   * Set the random seed.
   * Reinstantiates the program with new seed.
   */
  setSeed(seed: Seed): void {
    this.seed = seed;
    this.instantiateProgram();
  }

  /**
   * Set the scene (target geometry).
   * Reinstantiates the program with new scene.
   */
  setScene(scene: Scene): void {
    this.scene = scene;
    this.instantiateProgram();
  }

  /**
   * Set playback speed multiplier.
   */
  setSpeed(speed: number): void {
    this.speed = Math.max(0.1, Math.min(4, speed));
  }

  /**
   * Set loop mode.
   * @deprecated Use TimeModel for looping behavior. This is only for backward compatibility.
   * When TimeModel is set, loopMode is ignored.
   */
  setLoopMode(mode: LoopMode): void {
    this.loopMode = mode;
    this.playDirection = 1; // Reset direction when changing mode
    this.onLoopModeChange?.(mode);
  }

  /**
   * Get current loop mode.
   * @deprecated Use getTimeModel() instead. When TimeModel is set, loopMode is ignored.
   */
  getLoopMode(): LoopMode {
    return this.loopMode;
  }

  /**
   * Set finite loop mode.
   * When true, finite animations loop back to start when they reach the end.
   * When false, finite animations pause at the end (default behavior).
   */
  setFiniteLoopMode(enabled: boolean): void {
    this.finiteLoopMode = enabled;
  }

  /**
   * Get current finite loop mode.
   */
  getFiniteLoopMode(): boolean {
    return this.finiteLoopMode;
  }

  /**
   * Set max time for looping.
   */
  setMaxTime(maxTime: number): void {
    this.maxTime = maxTime;
  }

  /**
   * Get max time.
   */
  getMaxTime(): number {
    return this.maxTime;
  }

  /**
   * Get current program (for inspection/debugging).
   */
  getProgram(): Program<RenderTree> | null {
    return this.program;
  }

  /**
   * Get current time in milliseconds.
   */
  getTime(): number {
    return this.tMs;
  }

  /**
   * Get current playback state.
   */
  getState(): PlayState {
    return this.playState;
  }

  /**
   * Get the current timeline hint from the program.
   */
  getTimeline(): TimelineHint | null {
    return this.currentTimeline;
  }

  /**
   * Get cue points from the current timeline.
   */
  getCuePoints(): readonly CuePoint[] {
    return this.cuePoints;
  }

  /**
   * Check if the current program has a finite duration.
   */
  hasFiniteDuration(): boolean {
    return this.currentTimeline?.kind === 'finite';
  }

  /**
   * Get the program's recommended duration (if finite).
   */
  getProgramDuration(): number | null {
    if (this.currentTimeline?.kind === 'finite') {
      return this.currentTimeline.durationMs;
    }
    return null;
  }

  /**
   * Enable or disable automatic timeline application.
   */
  setAutoApplyTimeline(enabled: boolean): void {
    this.autoApplyTimeline = enabled;
  }

  private instantiateProgram(): void {
    if (!this.programFactory || !this.scene) return;

    this.program = this.programFactory(this.seed, this.scene, this.compileCtx);

    // Extract timeline hints from the program
    this.extractTimelineHints();

    // NOTE: We intentionally do NOT reset tMs
    // This preserves scrubbing + temporal continuity during hot swap

    // Render once to show new program at current time
    this.renderOnce();
  }

  /**
   * Extract and apply timeline hints from the current program.
   */
  private extractTimelineHints(): void {
    if (!this.program) {
      this.currentTimeline = null;
      this.cuePoints = [];
      this.onTimelineChange?.(null);
      this.onCuePointsChange?.([]);
      return;
    }

    // Get timeline from program if available
    const timeline = this.program.timeline?.() ?? null;
    this.currentTimeline = timeline;

    // Extract cue points
    if (timeline?.kind === 'finite' && timeline.cuePoints) {
      this.cuePoints = timeline.cuePoints;
    } else {
      this.cuePoints = [];
    }

    // Notify listeners
    this.onTimelineChange?.(timeline);
    this.onCuePointsChange?.(this.cuePoints);

    // Auto-apply timeline settings if enabled
    if (this.autoApplyTimeline && timeline) {
      this.applyTimelineHints(timeline);
    }
  }

  /**
   * Apply timeline hints to player settings.
   */
  private applyTimelineHints(timeline: TimelineHint): void {
    if (timeline.kind === 'finite') {
      // Set max time to program duration
      this.maxTime = timeline.durationMs;

      // Apply recommended loop mode if specified
      if (timeline.recommendedLoop) {
        this.setLoopMode(timeline.recommendedLoop);
      }
    } else if (timeline.kind === 'infinite') {
      // Use suggested preview window or default
      this.maxTime = timeline.windowMs ?? 10000;

      // Apply recommended loop mode
      if (timeline.recommendedLoop) {
        this.setLoopMode(timeline.recommendedLoop);
      }
    }
  }

  /**
   * Manually apply timeline hints (for when autoApply is disabled).
   */
  applyCurrentTimeline(): void {
    if (this.currentTimeline) {
      this.applyTimelineHints(this.currentTimeline);
    }
  }

  // ===========================================================================
  // TimeModel (Phase 3: TimeRoot)
  // ===========================================================================

  /**
   * Apply a TimeModel from the compiler.
   *
   * This sets maxTime based on the time model kind:
   * - finite: uses durationMs
   * - cyclic: uses periodMs
   * - infinite: uses windowMs
   *
   * The Player no longer wraps time; signals handle their own phase/looping.
   */
  applyTimeModel(model: TimeModel): void {
    this.timeModel = model;

    switch (model.kind) {
      case 'finite':
        this.maxTime = model.durationMs;
        // Extract cue points if available
        if (model.cuePoints) {
          this.cuePoints = model.cuePoints;
          this.onCuePointsChange?.(this.cuePoints);
        }
        break;
      case 'cyclic':
        this.maxTime = model.periodMs;
        // Apply loop mode from model if specified
        if (model.mode) {
          this.setLoopMode(model.mode);
        }
        break;
      case 'infinite':
        this.maxTime = model.windowMs;
        break;
    }
  }

  /**
   * Get the current time model.
   */
  getTimeModel(): TimeModel | null {
    return this.timeModel;
  }

  // ===========================================================================
  // Playback Control
  // ===========================================================================

  /**
   * Start playback.
   */
  play(): void {
    if (this.playState === 'playing') return;
    this.playState = 'playing';
    this.lastFrameMs = performance.now();
    this.onStateChange?.(this.playState);
    this.tick();
  }

  /**
   * Pause playback.
   */
  pause(): void {
    if (this.playState === 'paused') return;
    this.playState = 'paused';
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.onStateChange?.(this.playState);
  }

  /**
   * Toggle play/pause.
   */
  toggle(): void {
    if (this.playState === 'playing') {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Scrub to a specific time.
   * Works independently of RAF - just renders once at that time.
   */
  scrubTo(tMs: number): void {
    this.tMs = Math.max(0, tMs);
    this.onTimeChange?.(this.tMs);
    this.renderOnce();
  }

  /**
   * Reset to time 0.
   */
  reset(): void {
    this.scrubTo(0);
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.pause();
    this.program = null;
    this.programFactory = null;
  }

  // ===========================================================================
  // Frame Loop
  // ===========================================================================

  private tick = (): void => {
    if (this.playState !== 'playing') return;

    const now = performance.now();
    const dt = (now - this.lastFrameMs) * this.speed * this.playDirection;
    this.lastFrameMs = now;
    this.tMs += dt;

    // Time wrapping is determined by TimeModel, not loopMode.
    // - cyclic: wrap for continuous loop
    // - finite: pause at end (or loop if finiteLoopMode is enabled)
    // - infinite: advance unbounded
    if (this.timeModel) {
      switch (this.timeModel.kind) {
        case 'cyclic':
          // Cyclic time models wrap continuously
          if (this.tMs >= this.maxTime) {
            this.tMs = this.tMs % this.maxTime;
          } else if (this.tMs < 0) {
            this.tMs = this.maxTime + (this.tMs % this.maxTime);
          }
          break;

        case 'finite':
          // Finite animations can loop or pause based on finiteLoopMode
          if (this.tMs >= this.maxTime) {
            if (this.finiteLoopMode) {
              // Loop mode: rewind to start and keep playing
              this.tMs = 0;
            } else {
              // Once mode: pause at end
              this.tMs = this.maxTime;
              this.pause();
            }
          } else if (this.tMs < 0) {
            this.tMs = 0;
          }
          break;

        case 'infinite':
          // Infinite: time advances unbounded, no wrapping
          // Just clamp to non-negative
          if (this.tMs < 0) {
            this.tMs = 0;
          }
          break;
      }
    } else {
      // Legacy behavior when no TimeModel is set (backward compatibility)
      // Default to loop behavior to match pre-TimeModel expectations
      if (this.loopMode === 'loop') {
        if (this.tMs >= this.maxTime) {
          this.tMs = 0;
        } else if (this.tMs < 0) {
          this.tMs = this.maxTime;
        }
      } else if (this.loopMode === 'pingpong') {
        if (this.tMs >= this.maxTime) {
          this.tMs = this.maxTime;
          this.playDirection = -1;
        } else if (this.tMs <= 0) {
          this.tMs = 0;
          this.playDirection = 1;
        }
      } else {
        // No loop - clamp at max
        if (this.tMs >= this.maxTime) {
          this.tMs = this.maxTime;
          this.pause();
        }
      }
    }

    this.onTimeChange?.(this.tMs);
    this.renderOnce();

    this.rafId = requestAnimationFrame(this.tick);
  };

  private renderOnce(): void {
    if (!this.program) return;

    const tree = this.program.signal(this.tMs, this.runtimeCtx);
    this.onFrame(tree, this.tMs);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a Player with default contexts.
 */
export function createPlayer(
  onFrame: (tree: RenderTree, tMs: number) => void,
  opts?: {
    width?: number;
    height?: number;
    onStateChange?: (state: PlayState) => void;
    onTimeChange?: (tMs: number) => void;
    onLoopModeChange?: (mode: LoopMode) => void;
    onTimelineChange?: (hint: TimelineHint | null) => void;
    onCuePointsChange?: (cuePoints: readonly CuePoint[]) => void;
    autoApplyTimeline?: boolean;
  }
): Player {
  const compileCtx: CompileCtx = {
    env: {},
    geom: {
      get: <K extends object, V>(_key: K, compute: () => V) => compute(),
      invalidate: () => {},
    },
  };

  const runtimeCtx: RuntimeCtx = {
    viewport: {
      w: opts?.width ?? 800,
      h: opts?.height ?? 600,
      dpr: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    },
  };

  return new Player({
    compileCtx,
    runtimeCtx,
    onFrame,
    onStateChange: opts?.onStateChange,
    onTimeChange: opts?.onTimeChange,
    onLoopModeChange: opts?.onLoopModeChange,
    onTimelineChange: opts?.onTimelineChange,
    onCuePointsChange: opts?.onCuePointsChange,
    autoApplyTimeline: opts?.autoApplyTimeline,
  });
}
