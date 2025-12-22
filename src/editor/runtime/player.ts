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
import type { CompileCtx, RuntimeCtx, Program, Seed, CuePoint, TimeModel } from '../compiler/types';
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
  onCuePointsChange?: (cuePoints: readonly CuePoint[]) => void;
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

  private readonly compileCtx: CompileCtx;
  private readonly runtimeCtx: RuntimeCtx;

  private playState: PlayState = 'paused';
  private tMs = 0;
  private lastFrameMs = 0;
  private rafId: number | null = null;

  private speed = 1.0;
  private cuePoints: readonly CuePoint[] = [];

  // TimeModel from compiler (Phase 3: TimeRoot)
  private timeModel: TimeModel | null = null;

  private readonly onFrame: (tree: RenderTree, tMs: number) => void;
  private readonly onStateChange?: (state: PlayState) => void;
  private readonly onTimeChange?: (tMs: number) => void;
  private readonly onCuePointsChange?: (cuePoints: readonly CuePoint[]) => void;

  // Event dispatcher for runtime health snapshots
  private readonly events?: EventDispatcher;

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
    this.onCuePointsChange = opts.onCuePointsChange;
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
   * Get cue points from the current timeline.
   */
  getCuePoints(): readonly CuePoint[] {
    return this.cuePoints;
  }

  /**
   * Check if the current program has a finite duration.
   */
  hasFiniteDuration(): boolean {
    return this.timeModel?.kind === 'finite';
  }

  /**
   * Get the program's recommended duration (if finite).
   */
  getProgramDuration(): number | null {
    if (this.timeModel?.kind === 'finite') {
      return this.timeModel.durationMs;
    }
    return null;
  }

  /**
   * Set the active patch revision for runtime health tracking.
   * Emits ProgramSwapped event to sync diagnostic hub.
   */
  setActivePatchRevision(revision: number): void {
    const previousRevision = this.activePatchRevision;
    this.activePatchRevision = revision;

    // Emit ProgramSwapped event to sync DiagnosticHub's active revision
    if (this.events !== null && this.events !== undefined && revision !== previousRevision) {
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
    if (this.programFactory === null || this.programFactory === undefined || this.scene === null) return;

    this.program = this.programFactory(this.seed, this.scene, this.compileCtx);

    // NOTE: We intentionally do NOT reset tMs
    // This preserves scrubbing + temporal continuity during hot swap

    // Render once to show new program at current time
    this.renderOnce();
  }

  // ===========================================================================
  // TimeModel (Phase 3: TimeRoot)
  // ===========================================================================

  /**
   * Apply a TimeModel from the compiler.
   *
   * The Player no longer wraps time; signals handle their own phase/looping.
   */
  applyTimeModel(model: TimeModel): void {
    this.timeModel = model;
    this.cuePoints = model.kind === 'finite' ? (model.cuePoints ?? []) : [];
    this.onCuePointsChange?.(this.cuePoints);
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

  private readonly tick = (): void => {
    if (this.playState !== 'playing') return;

    const now = performance.now();
    const realDt = now - this.lastFrameMs; // Real frame time in ms
    const dt = realDt * this.speed;
    this.lastFrameMs = now;
    this.tMs += dt;

    // Track frame time for health monitoring
    this.trackFrameTime(realDt);

    if (this.tMs < 0) {
      this.tMs = 0;
    }

    this.onTimeChange?.(this.tMs);
    this.renderOnce();

    // Emit health snapshot if interval elapsed
    this.emitHealthSnapshot(now);

    this.rafId = requestAnimationFrame(this.tick);
  };

  private renderOnce(): void {
    if (this.program === null || this.program === undefined) return;

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
    if (typeof tree !== 'object') {
      this.nanCount++;
    }
  }

  /**
   * Emit RuntimeHealthSnapshot event if interval has elapsed.
   */
  private emitHealthSnapshot(nowMs: number): void {
    if (this.events === null || this.events === undefined) return;

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
    onCuePointsChange?: (cuePoints: readonly CuePoint[]) => void;
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
    onCuePointsChange: opts?.onCuePointsChange,
    events: opts?.events,
  });
}
