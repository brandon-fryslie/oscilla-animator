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
  Player,
  createPlayer,
  SvgRenderer,
  group,
  type PlayState,
  type RenderTree,
  type Scene,
  type CuePoint,
  type TimeModel,
} from './runtime';
import type { CompilerService, Viewport } from './compiler';
import type { Program } from './compiler/types';
import { useStore } from './stores';
import { TimeConsole } from './components/TimeConsole';
import './PreviewPanel.css';

/**
 * Empty placeholder program shown when no patch is compiled.
 * Renders nothing - just an empty group.
 */
const EMPTY_PROGRAM: Program<RenderTree> = {
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

export const PreviewPanel = observer(({ compilerService, isPlaying, onShowHelp }: PreviewPanelProps) => {
  const store = useStore();
  const logStore = store.logStore;
  const svgRef = useRef<SVGSVGElement>(null);
  const playerRef = useRef<Player | null>(null);
  const rendererRef = useRef<SvgRenderer | null>(null);
  const lastGoodProgramRef = useRef<Program<RenderTree> | null>(null);

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
  const finiteLoopMode = store.uiStore.settings.finiteLoopMode;

  // Derive dimensions from viewport
  const { width, height } = viewport;

  // Initialize player and renderer ONCE (never destroy/recreate)
  useEffect(() => {
    if (!svgRef.current) return;
    if (playerRef.current) return; // Already initialized

    const svg = svgRef.current;
    const renderer = new SvgRenderer(svg);
    rendererRef.current = renderer;

    const handleStateChange = (state: PlayState) => {
      setPlayState(state);
      store.uiStore.setPlaying(state === 'playing');
    };

    const player = createPlayer(
      (tree: RenderTree, _tMs: number) => {
        renderer.render(tree);
      },
      {
        width,
        height,
        onStateChange: handleStateChange,
        onTimeChange: setCurrentTime,
        onCuePointsChange: setCuePoints,
        autoApplyTimeline: true,
        events: store.events, // Pass EventDispatcher for runtime health snapshots
      }
    );
    playerRef.current = player;

    // Set initial scene
    player.setScene(DEFAULT_SCENE);

    // Set initial program from compiler service
    if (compilerService) {
      const compiledProgram = compilerService.getProgram();
      if (compiledProgram) {
        // Cast to runtime RenderTree type (structurally compatible)
        const program = compiledProgram.program as unknown as Program<RenderTree>;
        player.setFactory(() => program);
        player.applyTimeModel(compiledProgram.timeModel);
        player.setActivePatchRevision(store.patchStore.patchRevision);
        setTimeModel(compiledProgram.timeModel);
        lastGoodProgramRef.current = program;
        setHasCompiledProgram(true);
        logStore.info('renderer', `Loaded compiled program (timeModel: ${compiledProgram.timeModel.kind})`);
      } else {
        // No compiled program yet - show empty canvas
        player.setFactory(() => EMPTY_PROGRAM);
        logStore.info('renderer', 'No compiled program yet, showing empty canvas');
      }
    } else {
      // No compiler service - show empty canvas
      player.setFactory(() => EMPTY_PROGRAM);
      logStore.info('renderer', 'No compiler service, showing empty canvas');
    }

    // Start playing immediately
    player.play();

    return () => {
      player.destroy();
      renderer.clear();
    };
  }, []); // Empty deps - only run once

  // Sync with external isPlaying prop
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    if (isPlaying && playState !== 'playing') {
      player.play();
    } else if (!isPlaying && playState === 'playing') {
      player.pause();
    }
  }, [isPlaying, playState]);

  // Sync finiteLoopMode with player
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    player.setFiniteLoopMode(finiteLoopMode);
  }, [finiteLoopMode]);

  // Watch for compiler service program and viewport changes
  useEffect(() => {
    if (!compilerService) return;

    // Poll for changes (in future, use MobX reaction)
    const interval = setInterval(() => {
      // Check for program changes
      const compiledProgram = compilerService.getProgram();
      if (compiledProgram && compiledProgram.program !== (lastGoodProgramRef.current as unknown)) {
        const player = playerRef.current;
        if (player) {
          // Cast to runtime RenderTree type (structurally compatible)
          const program = compiledProgram.program as unknown as Program<RenderTree>;
          player.setFactory(() => program);
          player.applyTimeModel(compiledProgram.timeModel);
          player.setActivePatchRevision(store.patchStore.patchRevision);
          setTimeModel(compiledProgram.timeModel);
          lastGoodProgramRef.current = program;
          setHasCompiledProgram(true);
          logStore.debug('renderer', `Hot swapped to new compiled program (timeModel: ${compiledProgram.timeModel.kind})`);
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
  }, [compilerService, viewport.width, viewport.height, store.patchStore.patchRevision]);

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

  const handleFiniteLoopModeChange = useCallback((enabled: boolean) => {
    store.uiStore.setFiniteLoopMode(enabled);
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
        <svg
          ref={svgRef}
          width={width}
          height={height}
          viewBox={`${panOffset.x} ${panOffset.y} ${width / zoom} ${height / zoom}`}
          className="preview-svg"
        />

        {/* TimeConsole anchored inside preview canvas */}
        <TimeConsole
          timeModel={timeModel}
          currentTime={currentTime}
          playState={playState}
          speed={speed}
          seed={seed}
          cuePoints={cuePoints}
          finiteLoopMode={finiteLoopMode}
          onScrub={handleScrub}
          onPlay={handlePlay}
          onPause={handlePause}
          onReset={handleReset}
          onSpeedChange={handleSpeedChange}
          onSeedChange={handleSeedChange}
          onFiniteLoopModeChange={handleFiniteLoopModeChange}
        />
      </div>
    </div>
  );
});
