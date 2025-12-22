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
import type { EventDispatcher } from '../events/EventDispatcher';

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

export interface PlayerOptions {
  compileCtx: CompileCtx;
  runtimeCtx: RuntimeCtx;
  onFrame: (tree: RenderTree, tMs: number) => void;
  onStateChange?: (state: PlayState) => void;
  onTimeChange?: (tMs: number) => void;
  onTimelineChange?: (hint: TimelineHint | null) => void;
  onCuePointsChange?: (cuePoints: readonly CuePoint[]) => void;
  /** If true, automatically apply timeline hints from programs */
  autoApplyTimeline?: boolean;
  /** Optional event dispatcher for runtime health snapshots */
  events?: EventDispatcher;
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
  private maxTime = 10000; // 10 seconds default

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
  private onTimelineChange?: (hint: TimelineHint | null) => void;
  private onCuePointsChange?: (cuePoints: readonly CuePoint[]) => void;

  // Event dispatcher for runtime health snapshots
  private events?: EventDispatcher;

  // Runtime health tracking
  private activePatchRevision = 0;
  private lastHealthEmitMs = 0;
  private frameTimes: number[] = [];
  private nanCount = 0;
  private infCount = 0;
  private static readonly FRAME_TIME_WINDOW = 60; // Keep last 60 frames
  private static readonly HEALTH_EMIT_INTERVAL_MS = 250; // 4 Hz

  constructor(opts: PlayerOptions) {
    this.compileCtx = opts.compileCtx;
    this.runtimeCtx = opts.runtimeCtx;
    this.onFrame = opts.onFrame;
    this.onStateChange = opts.onStateChange;
    this.onTimeChange = opts.onTimeChange;
    this.onTimelineChange = opts.onTimelineChange;
    this.onCuePointsChange = opts.onCuePointsChange;
    this.autoApplyTimeline = opts.autoApplyTimeline ?? true;
    this.events = opts.events;
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

  /**
   * Set the active patch revision for runtime health tracking.
   * Emits ProgramSwapped event to sync diagnostic hub.
   */
  setActivePatchRevision(revision: number): void {
    const previousRevision = this.activePatchRevision;
    this.activePatchRevision = revision;

    // Emit ProgramSwapped event to sync DiagnosticHub's active revision
    if (this.events && revision !== previousRevision) {
      this.events.emit({
        type: 'ProgramSwapped',
        patchId: 'default',
        patchRevision: revision,
        compileId: crypto.randomUUID(),
        swapMode: previousRevision === 0 ? 'hard' : 'soft',
        swapLatencyMs: 0,
        stateBridgeUsed: false,
      });
    }
  }

  /**
   * Get the active patch revision.
   */
  getActivePatchRevision(): number {
    return this.activePatchRevision;
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
    } else if (timeline.kind === 'infinite') {
      // Use suggested preview window or default
      this.maxTime = timeline.windowMs ?? 10000;
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
    const realDt = now - this.lastFrameMs; // Real frame time in ms
    const dt = realDt * this.speed;
    this.lastFrameMs = now;
    this.tMs += dt;

    // Track frame time for health monitoring
    this.trackFrameTime(realDt);

    // Time advancement is now monotonic for cyclic and infinite modes.
    // TimeRoot blocks handle phase derivation via modulo arithmetic.
    // Player only provides unbounded time and clamps to non-negative.
    if (this.timeModel) {
      switch (this.timeModel.kind) {
        case 'cyclic':
          // Cyclic: TimeRoot handles phase derivation via modulo
          // Player provides monotonic time - just clamp to non-negative
          if (this.tMs < 0) {
            this.tMs = 0;
          }
          break;

        case 'finite':
          // Finite: pause at end if not in loop mode
          if (this.tMs >= this.maxTime) {
            if (this.finiteLoopMode) {
              // Loop mode: wrap back to start
              this.tMs = this.tMs % this.maxTime;
            } else {
              // Once mode: pause at end
              this.tMs = this.maxTime;
              this.pause();
            }
          }
          if (this.tMs < 0) {
            this.tMs = 0;
          }
          break;

        case 'infinite':
          // Infinite: time advances unbounded
          // Just clamp to non-negative
          if (this.tMs < 0) {
            this.tMs = 0;
          }
          break;
      }
    } else {
      // Basic fallback when no TimeModel is set - just clamp to non-negative
      if (this.tMs < 0) {
        this.tMs = 0;
      }
    }

    this.onTimeChange?.(this.tMs);
    this.renderOnce();

    // Emit health snapshot if interval elapsed
    this.emitHealthSnapshot(now);

    this.rafId = requestAnimationFrame(this.tick);
  };

  private renderOnce(): void {
    if (!this.program) return;

    const tree = this.program.signal(this.tMs, this.runtimeCtx);

    // Basic health check for NaN/Infinity
    this.checkRenderHealth(tree);

    this.onFrame(tree, this.tMs);
  }

  // ===========================================================================
  // Runtime Health Tracking
  // ===========================================================================

  /**
   * Track frame time in rolling window.
   */
  private trackFrameTime(frameMs: number): void {
    this.frameTimes.push(frameMs);

    // Keep only the last N frames
    if (this.frameTimes.length > Player.FRAME_TIME_WINDOW) {
      this.frameTimes.shift();
    }
  }

  /**
   * Perform basic health check on render tree.
   */
  private checkRenderHealth(tree: RenderTree): void {
    // For now, just check if tree exists and is valid
    // Future: could add deep traversal to check for NaN/Infinity in coordinates
    if (!tree || typeof tree !== 'object') {
      this.nanCount++;
    }
  }

  /**
   * Emit RuntimeHealthSnapshot event if interval has elapsed.
   */
  private emitHealthSnapshot(nowMs: number): void {
    if (!this.events) return;

    const elapsed = nowMs - this.lastHealthEmitMs;
    if (elapsed < Player.HEALTH_EMIT_INTERVAL_MS) return;

    // Calculate frame statistics
    const fpsEstimate = this.calculateFPS();
    const avgFrameMs = this.calculateAvgFrameTime();
    const worstFrameMs = this.calculateWorstFrameTime();

    // Emit the event
    this.events.emit({
      type: 'RuntimeHealthSnapshot',
      patchId: 'patch', // For now, use constant ID
      activePatchRevision: this.activePatchRevision,
      tMs: this.tMs,
      frameBudget: {
        fpsEstimate,
        avgFrameMs,
        worstFrameMs,
      },
      evalStats: {
        nanCount: this.nanCount,
        infCount: this.infCount,
        fieldMaterializations: 0, // Not tracked yet
      },
    });

    // Reset counters and update last emit time
    this.nanCount = 0;
    this.infCount = 0;
    this.lastHealthEmitMs = nowMs;
  }

  /**
   * Calculate FPS estimate from frame times.
   */
  private calculateFPS(): number {
    if (this.frameTimes.length === 0) return 0;

    const avgFrameMs = this.calculateAvgFrameTime();
    if (avgFrameMs === 0) return 0;

    return 1000 / avgFrameMs;
  }

  /**
   * Calculate average frame time.
   */
  private calculateAvgFrameTime(): number {
    if (this.frameTimes.length === 0) return 0;

    const sum = this.frameTimes.reduce((acc, t) => acc + t, 0);
    return sum / this.frameTimes.length;
  }

  /**
   * Calculate worst (maximum) frame time.
   */
  private calculateWorstFrameTime(): number | undefined {
    if (this.frameTimes.length === 0) return undefined;

    return Math.max(...this.frameTimes);
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
    onTimelineChange?: (hint: TimelineHint | null) => void;
    onCuePointsChange?: (cuePoints: readonly CuePoint[]) => void;
    autoApplyTimeline?: boolean;
    events?: EventDispatcher;
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
    onTimelineChange: opts?.onTimelineChange,
    onCuePointsChange: opts?.onCuePointsChange,
    autoApplyTimeline: opts?.autoApplyTimeline,
    events: opts?.events,
  });
}
