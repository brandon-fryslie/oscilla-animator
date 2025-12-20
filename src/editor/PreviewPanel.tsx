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

  // Infinite mode view offset state
  const [viewOffset, setViewOffset] = useState(0);

  // Pan and zoom state
  const [panOffset, setPanOffset] = useState<PanOffset>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ mouseX: number; mouseY: number; panX: number; panY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Speed and seed from store (with fallbacks)
  const speed = store.uiStore.settings.speed;
  const seed = store.uiStore.settings.seed;
  const finiteLoopMode = store.uiStore.settings.finiteLoopMode;

  // Create player and renderer once
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const player = createPlayer();
    playerRef.current = player;

    const renderer = new SvgRenderer(svg, DEFAULT_SCENE.bounds);
    rendererRef.current = renderer;

    // Set seed from store
    renderer.setSeed(seed);

    // Set up player state tracking
    player.on('playing', () => setPlayState('playing'));
    player.on('paused', () => setPlayState('paused'));
    player.on('tick', ({ time, cuePoints: pts }) => {
      setCurrentTime(time);
      setCuePoints(pts);
    });

    // Initialize with empty program or compiled program if available
    const compiledProgram = compilerService?.getCompiledProgram();
    if (compiledProgram?.program) {
      const program = compiledProgram.program as Program<RenderTree>;
      const tm = compiledProgram.timeModel ?? DEFAULT_TIME_MODEL;
      setTimeModel(tm);
      player.setFactory(() => program);
      if (tm.kind === 'infinite') {
        player.setTransform({ offsetMs: viewOffset });
      }
      lastGoodProgramRef.current = program;
      setHasCompiledProgram(true);
      logStore.info('renderer', `Loaded compiled program (timeModel: ${compiledProgram.timeModel.kind})`);
    } else {
      // No compiled program yet - show empty canvas
      player.setFactory(() => EMPTY_PROGRAM);
      logStore.info('renderer', 'No compiled program yet, showing empty canvas');
    }

    // Start rendering loop
    player.on('tick', ({ time }) => {
      const program = player.getProgram();
      const tree = program.signal(time, { seed, settings: { finiteLoopMode } });
      renderer.render(tree);
    });

    // Start playing
    player.play();

    return () => {
      player.stop();
    };
  }, [seed, finiteLoopMode]); // Re-create only when seed or finiteLoopMode changes

  // Sync player speed with store setting
  useEffect(() => {
    const player = playerRef.current;
    if (player) {
      player.setSpeed(speed);
    }
  }, [speed]);

  // Set renderer seed when it changes
  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer) {
      renderer.setSeed(seed);
    }
  }, [seed]);

  // Hot swap when compiled program changes
  useEffect(() => {
    if (!compilerService) return;

    const interval = setInterval(() => {
      const compiledProgram = compilerService.getCompiledProgram();
      if (compiledProgram?.program && compiledProgram.program !== lastGoodProgramRef.current) {
        const player = playerRef.current;
        if (player) {
          const program = compiledProgram.program as Program<RenderTree>;
          const tm = compiledProgram.timeModel ?? DEFAULT_TIME_MODEL;
          setTimeModel(tm);
          player.setFactory(() => program);
          if (tm.kind === 'infinite') {
            player.setTransform({ offsetMs: viewOffset });
          }
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
  }, [compilerService, viewport, viewOffset, logStore]);

  // Sync play/pause state
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    if (isPlaying && playState !== 'playing') {
      player.play();
    } else if (!isPlaying && playState !== 'paused') {
      player.pause();
    }
  }, [isPlaying, playState]);

  const handleSeek = useCallback((timeMs: number) => {
    const player = playerRef.current;
    if (player) {
      player.seek(timeMs);
    }
  }, []);

  const handleSetTransform = useCallback((transform: { offsetMs?: number; reverseTime?: boolean }) => {
    const player = playerRef.current;
    if (player) {
      player.setTransform(transform);
      if (transform.offsetMs !== undefined) {
        setViewOffset(transform.offsetMs);
      }
    }
  }, []);

  const handleSetSpeed = useCallback((newSpeed: number) => {
    store.uiStore.settings.speed = newSpeed;
  }, [store]);

  const handleToggleLoopMode = useCallback(() => {
    store.uiStore.settings.finiteLoopMode = !finiteLoopMode;
  }, [store, finiteLoopMode]);

  const handleTogglePlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    if (playState === 'playing') {
      player.pause();
    } else {
      player.play();
    }
  }, [playState]);

  const handleReset = useCallback(() => {
    const player = playerRef.current;
    if (player) {
      player.seek(0);
      setViewOffset(0);
      player.setTransform({ offsetMs: 0, reverseTime: false });
    }
  }, []);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prevZoom => Math.max(0.1, Math.min(10, prevZoom * delta)));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      return () => canvas.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  // Mouse pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && e.shiftKey) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        panX: panOffset.x,
        panY: panOffset.y,
      };
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isPanning && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.mouseX;
      const dy = e.clientY - panStartRef.current.mouseY;
      setPanOffset({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      });
    }
  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  useEffect(() => {
    if (isPanning) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isPanning, handleMouseMove, handleMouseUp]);

  const handleResetView = () => {
    setPanOffset({ x: 0, y: 0 });
    setZoom(1);
  };

  return (
    <div className="preview-panel">
      {/* Time Console */}
      <TimeConsole
        timeModel={timeModel}
        currentTime={currentTime}
        playState={playState}
        speed={speed}
        finiteLoopMode={finiteLoopMode}
        cuePoints={cuePoints}
        onSeek={handleSeek}
        onTogglePlay={handleTogglePlay}
        onReset={handleReset}
        onSetSpeed={handleSetSpeed}
        onToggleLoopMode={handleToggleLoopMode}
        onSetTransform={handleSetTransform}
        onShowHelp={onShowHelp}
      />

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="preview-canvas"
        onMouseDown={handleMouseDown}
        style={{ cursor: isPanning ? 'grabbing' : 'default' }}
      >
        <svg
          ref={svgRef}
          width={viewport.width}
          height={viewport.height}
          viewBox={`${-panOffset.x / zoom} ${-panOffset.y / zoom} ${viewport.width / zoom} ${viewport.height / zoom}`}
          style={{
            border: '1px solid #333',
            background: '#000',
          }}
        />

        {/* View controls */}
        <div className="view-controls">
          <button onClick={handleResetView} title="Reset view (Shift+drag to pan, scroll to zoom)">
            Reset View
          </button>
          <span className="zoom-level">Zoom: {(zoom * 100).toFixed(0)}%</span>
        </div>

        {!hasCompiledProgram && (
          <div className="no-program-message">
            No compiled program. Add blocks and connect them to create an animation.
          </div>
        )}
      </div>
    </div>
  );
});
