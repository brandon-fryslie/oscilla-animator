/**
 * PreviewPanel Component
 *
 * Integrates Player + SvgRenderer to show live animation preview.
 * Supports:
 * - Play/pause/scrub
 * - Hot swap when program changes
 * - Uses last good program on compilation errors
 *
 * Uses TimeConsole for mode-aware time controls based on TimeModel.
 */

import { observer } from 'mobx-react-lite';
import { useRef, useEffect, useState, useCallback } from 'react';
import {
  createPlayer,
  SvgRenderer,
  Canvas2DRenderer,
  group,
  type PlayState,
  type SvgRenderTree,
  type Scene,
  type CuePoint,
  type TimeModel,
  type Player,
} from './runtime';
import type { CompilerService, Viewport } from './compiler';
import type { Program, CanvasProgram } from './compiler/types';
import { useStore } from './stores';
import { TimeConsole } from './components/TimeConsole';
import { IRRuntimeAdapter } from './runtime/executor/IRRuntimeAdapter';
import './PreviewPanel.css';

/**
 * Empty placeholder program shown when no patch is compiled.
 * Renders nothing - just an empty group.
 */
const EMPTY_PROGRAM: Program<SvgRenderTree> = {
  signal: () => group('empty', []),
  event: () => [],
};

interface PanOffset {
  x: number;
  y: number;
}

interface PreviewPanelProps {
  compilerService?: CompilerService;
  isPlaying?: boolean;
  onShowHelp?: () => void;
}

/**
 * Default scene bounds.
 */
const DEFAULT_SCENE: Scene = {
  id: 'default',
  bounds: { width: 800, height: 600 },
};

const DEFAULT_VIEWPORT: Viewport = { width: 800, height: 600 };

/**
 * Default TimeModel for when no program is compiled yet.
 */
const DEFAULT_TIME_MODEL: TimeModel = {
  kind: 'infinite',
  windowMs: 10000,
};

export const PreviewPanel = observer(({ compilerService, isPlaying, onShowHelp }: PreviewPanelProps): React.ReactElement => {
  const store = useStore();
  const logStore = store.logStore;
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Player | null>(null);
  const rendererRef = useRef<SvgRenderer | null>(null);
  const canvasRendererRef = useRef<Canvas2DRenderer | null>(null);
  const lastGoodProgramRef = useRef<Program<SvgRenderTree> | null>(null);
  const lastGoodCanvasProgramRef = useRef<CanvasProgram | null>(null);
  const lastGoodIRProgramRef = useRef<Program<SvgRenderTree> | null>(null);

  // Which renderer is active: 'svg' or 'canvas'
  const [activeRenderer, setActiveRenderer] = useState<'svg' | 'canvas'>('svg');

  const [playState, setPlayState] = useState<PlayState>('playing');
  const [currentTime, setCurrentTime] = useState(0);
  const [hasCompiledProgram, setHasCompiledProgram] = useState(false);
  const [viewport, setViewport] = useState<Viewport>(
    compilerService?.getViewport() ?? DEFAULT_VIEWPORT
  );
  const [cuePoints, setCuePoints] = useState<readonly CuePoint[]>([]);
  const [timeModel, setTimeModel] = useState<TimeModel>(DEFAULT_TIME_MODEL);


  // Pan and zoom state
  const [panOffset, setPanOffset] = useState<PanOffset>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ mouseX: number; mouseY: number; panX: number; panY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const didPanRef = useRef(false); // Track if mouse moved during drag (to distinguish click from pan)

  // Speed and seed from store (with fallbacks)
  const speed = store.uiStore.settings.speed;
  const seed = store.uiStore.settings.seed;

  // Derive dimensions from viewport
  const { width, height } = viewport;

  // Initialize player and renderers ONCE (never destroy/recreate)
  // This effect intentionally has minimal dependencies to run only once on mount
  useEffect(() => {
    if (!svgRef.current) return;
    if (playerRef.current) return; // Already initialized

    const svg = svgRef.current;
    const svgRenderer = new SvgRenderer(svg);
    rendererRef.current = svgRenderer;

    // Initialize Canvas renderer if canvas element is available
    if (canvasElRef.current) {
      const canvasRenderer = new Canvas2DRenderer(canvasElRef.current);
      canvasRendererRef.current = canvasRenderer;
    }

    const handleStateChange = (state: PlayState) => {
      setPlayState(state);
      store.uiStore.setPlaying(state === 'playing');
    };

    const player = createPlayer(
      (tree: SvgRenderTree, _tMs: number) => {
        svgRenderer.render(tree);
      },
      {
        width,
        height,
        onStateChange: handleStateChange,
        onTimeChange: setCurrentTime,
        onCuePointsChange: setCuePoints,
        events: store.events, // Pass EventDispatcher for runtime health snapshots
      }
    );
    playerRef.current = player;

    // Set initial scene
    player.setScene(DEFAULT_SCENE);

    // Initial program is set via the polling useEffect, so we just show empty initially.
    player.setFactory(() => EMPTY_PROGRAM);
    logStore.info('renderer', 'Player initialized. Waiting for program...');

    // Start playing immediately
    player.play();

    return () => {
      player.destroy();
      svgRenderer.clear();
      canvasRendererRef.current?.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount - refs guard re-execution
  }, []);

  // Sync with external isPlaying prop
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    if (isPlaying === true && playState !== 'playing') {
      player.play();
    } else if (isPlaying === false && playState === 'playing') {
      player.pause();
    }
  }, [isPlaying, playState]);

  // Watch for compiler service program and viewport changes
  useEffect(() => {
    if (!compilerService) return;

    // Poll for changes (in future, use MobX reaction)
    const interval = setInterval(() => {
      // Check for program changes
      const result = compilerService.getLatestResult();
      const useIR = store.uiStore.settings.useNewCompiler;

      if (result && result.ok) {
        const player = playerRef.current;
        if (!player) return;

        // === IR PATH (NEW COMPILER) ===
        if (useIR && result.compiledIR) {
          const adapter = new IRRuntimeAdapter(result.compiledIR);
          const irProgram = adapter.createProgram();

          const isFirstProgram = lastGoodIRProgramRef.current === null && lastGoodProgramRef.current === null;

          // Set the IR program as the new source of truth for canvas rendering
          lastGoodIRProgramRef.current = irProgram;
          lastGoodCanvasProgramRef.current = null;
          lastGoodProgramRef.current = null;

          setActiveRenderer('canvas');
          player.setFactory(() => EMPTY_PROGRAM); // Time tracking only
          player.applyTimeModel(result.compiledIR.timeModel);
          setTimeModel(result.compiledIR.timeModel);
          setHasCompiledProgram(true);
          logStore.debug('renderer', `Hot swapped to IR program (timeModel: ${result.compiledIR.timeModel.kind})`);

          if (isFirstProgram) {
            player.play();
            store.uiStore.setPlaying(true);
          }
        }
        // === IR PATH FALLBACK - IR selected but not available ===
        else if (useIR && !result.compiledIR) {
          logStore.warn('renderer', 'IR compiler selected but CompiledProgramIR not available, using legacy');
          // Fall through to legacy path below
        }

        // === LEGACY PATH (OLD CLOSURE-BASED COMPILER) ===
        if (!useIR || !result.compiledIR) {
          if (result.canvasProgram && result.canvasProgram !== lastGoodCanvasProgramRef.current) {
            // New canvas program
            const isFirstProgram = lastGoodCanvasProgramRef.current === null && lastGoodProgramRef.current === null && lastGoodIRProgramRef.current === null;

            lastGoodCanvasProgramRef.current = result.canvasProgram;
            lastGoodProgramRef.current = null; // Clear SVG program
            lastGoodIRProgramRef.current = null; // Clear IR program
            setActiveRenderer('canvas');
            player.setFactory(() => EMPTY_PROGRAM); // Time tracking only
            player.applyTimeModel(result.timeModel!);
            player.setActivePatchRevision(store.patchStore.patchRevision);
            setTimeModel(result.timeModel!);
            setHasCompiledProgram(true);
            logStore.debug('renderer', `Hot swapped to Canvas program (timeModel: ${result.timeModel!.kind})`);

            if (isFirstProgram) {
              player.play();
              store.uiStore.setPlaying(true);
            }
          } else if (result.program && result.program !== (lastGoodProgramRef.current as unknown)) {
            // New SVG program
            const isFirstProgram = lastGoodProgramRef.current === null && lastGoodCanvasProgramRef.current === null && lastGoodIRProgramRef.current === null;

            const program = result.program as unknown as Program<SvgRenderTree>;
            player.setFactory(() => program);
            player.applyTimeModel(result.timeModel!);
            player.setActivePatchRevision(store.patchStore.patchRevision);
            setTimeModel(result.timeModel!);
            lastGoodProgramRef.current = program;
            lastGoodCanvasProgramRef.current = null; // Clear canvas program
            lastGoodIRProgramRef.current = null; // Clear IR program
            setActiveRenderer('svg');
            setHasCompiledProgram(true);
            logStore.debug('renderer', `Hot swapped to SVG program (timeModel: ${result.timeModel!.kind})`);

            // DO NOT REMOVE: Auto-play when FIRST program loads.
            if (isFirstProgram) {
              player.play();
              store.uiStore.setPlaying(true);
            }
          }
        }
      }

      // Check for viewport changes
      const newViewport = compilerService.getViewport();
      if (newViewport.width !== viewport.width || newViewport.height !== viewport.height) {
        setViewport(newViewport);
        logStore.debug('renderer', `Viewport changed to ${newViewport.width}x${newViewport.height}`);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [compilerService, logStore, store.patchStore.patchRevision, store.uiStore, store.uiStore.settings.useNewCompiler, viewport]);

  // Canvas render loop - renders when canvas mode is active
  useEffect(() => {
    if (activeRenderer !== 'canvas') return;
    if (!canvasRendererRef.current) return;

    const canvasRenderer = canvasRendererRef.current;
    let animationFrameId: number;

    // Update canvas size
    canvasRenderer.setViewport(width, height, window.devicePixelRatio);

    const renderFrame = () => {
      if (playState === 'playing' || playState === 'paused') {
        const tMs = currentTime;
        const ctx = {
          viewport: { w: width, h: height, dpr: window.devicePixelRatio },
        };

        let renderTree = null;

        // Prioritize IR program if available
        if (lastGoodIRProgramRef.current) {
          renderTree = lastGoodIRProgramRef.current.signal(tMs, ctx);
        }
        // Fallback to legacy canvas program
        else if (lastGoodCanvasProgramRef.current) {
          renderTree = lastGoodCanvasProgramRef.current.signal(tMs, ctx);
        }

        if (renderTree) {
          canvasRenderer.render(renderTree);
        }
      }

      animationFrameId = requestAnimationFrame(renderFrame);
    };

    animationFrameId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [activeRenderer, width, height, playState, currentTime]);

  // TimeConsole callbacks
  const handlePlay = useCallback(() => {
    playerRef.current?.play();
  }, []);

  const handlePause = useCallback(() => {
    playerRef.current?.pause();
  }, []);

  const handleReset = useCallback(() => {
    playerRef.current?.reset();
  }, []);

  const handleScrub = useCallback((tMs: number) => {
    playerRef.current?.scrubTo(tMs);
  }, []);

  const handleSpeedChange = useCallback((newSpeed: number) => {
    store.uiStore.setSpeed(newSpeed);
    playerRef.current?.setSpeed(newSpeed);
  }, [store]);

  const handleSeedChange = useCallback((newSeed: number) => {
    store.uiStore.setSeed(newSeed);
    // Seed change triggers recompilation via autoCompile
  }, [store]);

  // Pan handlers for mouse drag
  const handlePanStart = useCallback((e: React.MouseEvent) => {
    // Only start pan on primary mouse button
    if (e.button !== 0) return;

    setIsPanning(true);
    didPanRef.current = false; // Reset pan tracking
    panStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: panOffset.x,
      panY: panOffset.y,
    };
    e.preventDefault();
  }, [panOffset]);

  const handlePanMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || !panStartRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Mark that we actually panned (moved significantly)
    const deltaPixels = Math.abs(e.clientX - panStartRef.current.mouseX) +
                        Math.abs(e.clientY - panStartRef.current.mouseY);
    if (deltaPixels > 3) {
      didPanRef.current = true;
    }

    // Calculate scale between screen pixels and SVG coordinates (accounting for zoom)
    const scaleX = (width / zoom) / canvas.clientWidth;
    const scaleY = (height / zoom) / canvas.clientHeight;

    // Calculate delta in SVG coordinates (inverted for natural drag feel)
    const deltaX = (e.clientX - panStartRef.current.mouseX) * scaleX;
    const deltaY = (e.clientY - panStartRef.current.mouseY) * scaleY;

    setPanOffset({
      x: panStartRef.current.panX - deltaX,
      y: panStartRef.current.panY - deltaY,
    });
  }, [isPanning, width, height, zoom]);

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  // Click handler for play/pause toggle (only if not panning)
  const handleCanvasClick = useCallback(() => {
    if (didPanRef.current) {
      didPanRef.current = false;
      return; // Was a pan, not a click
    }
    // Toggle play/pause
    if (playState === 'playing') {
      handlePause();
    } else {
      handlePlay();
    }
  }, [playState, handlePlay, handlePause]);

  const handleResetView = useCallback(() => {
    setPanOffset({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Zoom factor per scroll tick
    const zoomFactor = 1.1;
    const direction = e.deltaY < 0 ? 1 : -1;
    const newZoom = Math.max(0.1, Math.min(10, zoom * Math.pow(zoomFactor, direction)));

    // Get mouse position relative to canvas
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert mouse position to SVG coordinates (before zoom change)
    const svgX = panOffset.x + (mouseX / rect.width) * (width / zoom);
    const svgY = panOffset.y + (mouseY / rect.height) * (height / zoom);

    // Calculate new pan offset to keep point under cursor fixed
    const newPanX = svgX - (mouseX / rect.width) * (width / newZoom);
    const newPanY = svgY - (mouseY / rect.height) * (height / newZoom);

    setZoom(newZoom);
    setPanOffset({ x: newPanX, y: newPanY });
  }, [zoom, panOffset, width, height]);

  return (
    <div className="preview-panel">
      <div className="preview-header">
        <span className="preview-title">Preview</span>
        <div className="preview-header-actions">
          {hasCompiledProgram && (
            <span
              className={`preview-renderer-badge ${activeRenderer}`}
              title={activeRenderer === 'canvas' ? 'Canvas 2D Renderer' : 'SVG Renderer'}
            >
              {activeRenderer === 'canvas' ? 'Canvas' : 'SVG'}
            </span>
          )}
          <button
            className="preview-help-btn"
            onClick={() => onShowHelp?.()}
            title="What is the Preview?"
          >
            ?
          </button>
          <span className="preview-status">
            {hasCompiledProgram ? '● Live' : '○ No program'}
          </span>
        </div>
      </div>

      <div
        ref={canvasRef}
        className="preview-canvas"
        style={{
          width: '100%',
          height: '100%',
          cursor: isPanning ? 'grabbing' : 'grab',
        }}
        onMouseDown={handlePanStart}
        onMouseMove={handlePanMove}
        onMouseUp={handlePanEnd}
        onMouseLeave={handlePanEnd}
        onClick={handleCanvasClick}
        onDoubleClick={handleResetView}
        onWheel={handleWheel}
      >
        {/* SVG Renderer - visible when activeRenderer is 'svg' */}
        <svg
          ref={svgRef}
          width={width}
          height={height}
          viewBox={`${panOffset.x} ${panOffset.y} ${width / zoom} ${height / zoom}`}
          className="preview-svg"
          style={{ display: activeRenderer === 'svg' ? 'block' : 'none' }}
        />

        {/* Canvas Renderer - visible when activeRenderer is 'canvas' */}
        <canvas
          ref={canvasElRef}
          width={width * window.devicePixelRatio}
          height={height * window.devicePixelRatio}
          className="preview-canvas-element"
          style={{
            display: activeRenderer === 'canvas' ? 'block' : 'none',
            width: `${width}px`,
            height: `${height}px`,
          }}
        />

        {/* TimeConsole anchored inside preview canvas */}
        <TimeConsole
          timeModel={timeModel}
          currentTime={currentTime}
          playState={playState}
          speed={speed}
          seed={seed}
          cuePoints={cuePoints}
          onScrub={handleScrub}
          onPlay={handlePlay}
          onPause={handlePause}
          onReset={handleReset}
          onSpeedChange={handleSpeedChange}
          onSeedChange={handleSeedChange}
        />
      </div>
    </div>
  );
});
