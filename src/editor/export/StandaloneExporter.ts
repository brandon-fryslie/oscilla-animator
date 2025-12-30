/**
 * StandaloneExporter
 *
 * Exports animation as a self-contained HTML file that can be opened
 * in any browser without server or external dependencies.
 *
 * Features:
 * - Embedded IR program (JSON)
 * - Embedded runtime bundle (inline or CDN)
 * - Optional playback controls (play/pause, scrub, loop)
 * - Responsive canvas (fits viewport)
 * - Works offline (inline mode)
 *
 * Architecture:
 * 1. Serialize CompiledProgramIR to JSON
 * 2. Generate HTML template with embedded runtime
 * 3. Inject IR program data
 * 4. Return HTML blob
 *
 * Bundle modes:
 * - Inline: Embed runtime code directly in HTML (larger file, works offline)
 * - CDN: Link to external runtime bundle (smaller file, requires network)
 */

import type { CompiledProgramIR } from '../compiler/ir/program';
import type {
  StandaloneExportConfig,
  StandaloneExportResult,

} from './types';
import { InvalidExportConfigError } from './types';
import { serializeProgramToJSON } from '../compiler/ir/serialize';

/**
 * Generate HTML template for standalone player.
 *
 * This template includes:
 * - Canvas element (responsive)
 * - Runtime bundle (inline or CDN)
 * - Player initialization code
 * - Optional playback controls
 *
 * @param program - Compiled program IR
 * @param config - Export configuration
 * @param runtimeCode - Runtime bundle code (for inline mode)
 * @returns HTML string
 */
function generateHTML(
  program: CompiledProgramIR,
  config: StandaloneExportConfig,
  runtimeCode?: string
): string {
  const serializedProgram = serializeProgramToJSON(program, false);
  const cdnUrl = config.cdnBaseUrl || 'https://unpkg.com/oscilla-runtime@latest/dist/standalone.js';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Oscilla Animation</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: #000;
      display: flex;
      flex-direction: column;
      font-family: system-ui, -apple-system, sans-serif;
    }

    #canvas-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    #canvas {
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
    }

    ${config.includeControls ? `
    #controls {
      background: rgba(0, 0, 0, 0.8);
      padding: 12px;
      display: flex;
      align-items: center;
      gap: 12px;
      color: #fff;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    #controls button {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #fff;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.2s;
    }

    #controls button:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    #controls button:active {
      background: rgba(255, 255, 255, 0.3);
    }

    #scrubber {
      flex: 1;
      height: 4px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 2px;
      position: relative;
      cursor: pointer;
    }

    #scrubber-fill {
      height: 100%;
      background: #fff;
      border-radius: 2px;
      width: 0%;
      transition: width 0.05s linear;
    }

    #time-display {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.7);
      min-width: 80px;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    label {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.7);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    input[type="checkbox"] {
      cursor: pointer;
    }
    ` : ''}
  </style>
</head>
<body>
  <div id="canvas-container">
    <canvas id="canvas" width="${config.width}" height="${config.height}"></canvas>
  </div>

  ${config.includeControls ? `
  <div id="controls">
    <button id="play-pause">Play</button>
    <div id="scrubber">
      <div id="scrubber-fill"></div>
    </div>
    <div id="time-display">0.00s</div>
    <label>
      <input type="checkbox" id="loop-toggle" checked>
      Loop
    </label>
  </div>
  ` : ''}

  ${config.bundleMode === 'inline' && runtimeCode ? `
  <script>
    ${runtimeCode}
  </script>
  ` : `
  <script type="module" src="${cdnUrl}"></script>
  `}

  <script type="module">
    // Deserialize IR program
    const programData = ${serializedProgram};
    const program = OscillaRuntime.deserializeProgram(programData);

    // Initialize runtime
    const canvas = document.getElementById('canvas');
    const renderer = new OscillaRuntime.Canvas2DRenderer(canvas);
    renderer.setViewport(${config.width}, ${config.height}, 1.0);

    const executor = new OscillaRuntime.ScheduleExecutor();
    const runtime = OscillaRuntime.createRuntimeState(program, {
      width: ${config.width},
      height: ${config.height},
      dpr: 1.0,
    });

    // Player state
    let isPlaying = ${!config.includeControls};
    let currentTime = 0;
    let loopEnabled = true;
    let animationFrameId = null;
    let lastFrameTime = 0;

    // Get duration from time model
    const duration = program.timeModel.kind === 'finite'
      ? program.timeModel.durationMs / 1000
      : program.timeModel.kind === 'cyclic'
      ? program.timeModel.periodMs / 1000
      : 60; // Default 60s for infinite

    // Render function
    function render(time) {
      const frameIR = executor.executeFrame(program, runtime, currentTime * 1000);
      renderer.renderFrame(frameIR, runtime.values);
    }

    // Animation loop
    function animate(timestamp) {
      if (!isPlaying) {
        animationFrameId = null;
        return;
      }

      if (lastFrameTime === 0) {
        lastFrameTime = timestamp;
      }

      const deltaMs = timestamp - lastFrameTime;
      lastFrameTime = timestamp;

      currentTime += deltaMs / 1000;

      // Handle looping
      if (loopEnabled && currentTime > duration) {
        currentTime = currentTime % duration;
      } else if (currentTime > duration) {
        currentTime = duration;
        isPlaying = false;
        ${config.includeControls ? `updateControls();` : ''}
      }

      render(currentTime);
      ${config.includeControls ? `updateScrubber();` : ''}

      animationFrameId = requestAnimationFrame(animate);
    }

    ${config.includeControls ? `
    // Controls
    const playPauseBtn = document.getElementById('play-pause');
    const scrubber = document.getElementById('scrubber');
    const scrubberFill = document.getElementById('scrubber-fill');
    const timeDisplay = document.getElementById('time-display');
    const loopToggle = document.getElementById('loop-toggle');

    function updateControls() {
      playPauseBtn.textContent = isPlaying ? 'Pause' : 'Play';
    }

    function updateScrubber() {
      const progress = (currentTime / duration) * 100;
      scrubberFill.style.width = progress + '%';
      timeDisplay.textContent = currentTime.toFixed(2) + 's';
    }

    playPauseBtn.addEventListener('click', () => {
      isPlaying = !isPlaying;
      updateControls();

      if (isPlaying) {
        lastFrameTime = 0;
        animationFrameId = requestAnimationFrame(animate);
      } else if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    });

    scrubber.addEventListener('click', (e) => {
      const rect = scrubber.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const progress = x / rect.width;
      currentTime = progress * duration;
      render(currentTime);
      updateScrubber();
    });

    loopToggle.addEventListener('change', (e) => {
      loopEnabled = e.target.checked;
    });

    // Start paused
    updateControls();
    updateScrubber();
    ` : `
    // Auto-start animation
    lastFrameTime = 0;
    animationFrameId = requestAnimationFrame(animate);
    `}

    // Initial render
    render(currentTime);
  </script>
</body>
</html>`;
}

/**
 * StandaloneExporter - Export animation as self-contained HTML
 *
 * Creates a single HTML file that can be opened in any browser
 * to view the animation without server or external dependencies.
 */
export class StandaloneExporter {
  /**
   * Export animation as standalone HTML.
   *
   * @param program - Compiled animation program
   * @param config - Export configuration
   * @returns Export result with HTML blob
   * @throws {InvalidExportConfigError} - Invalid configuration
   */
  async export(
    program: CompiledProgramIR,
    config: StandaloneExportConfig
  ): Promise<StandaloneExportResult> {
    // Validate configuration
    this.validateConfig(config);

    const startTime = performance.now();

    // Get runtime code for inline mode
    let runtimeCode: string | undefined;
    if (config.bundleMode === 'inline') {
      // For now, we'll use CDN mode by default
      // TODO: Bundle runtime code with Vite in library mode
      // This requires a separate build step and bundling strategy
      throw new InvalidExportConfigError(
        'Inline runtime bundle mode not yet implemented. Please use CDN mode.'
      );
    }

    // Generate HTML
    const html = generateHTML(program, config, runtimeCode);

    // Create blob
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const sizeBytes = blob.size;

    const durationMs = performance.now() - startTime;

    return {
      blob,
      config,
      durationMs,
      sizeBytes,
    };
  }

  /**
   * Validate export configuration.
   *
   * @param config - Configuration to validate
   * @throws {InvalidExportConfigError} - If configuration is invalid
   */
  private validateConfig(config: StandaloneExportConfig): void {
    if (config.width <= 0 || config.height <= 0) {
      throw new InvalidExportConfigError('Width and height must be positive');
    }

    if (config.width > 7680 || config.height > 4320) {
      throw new InvalidExportConfigError('Resolution too large (max 7680x4320)');
    }

    if (config.bundleMode === 'cdn' && config.cdnBaseUrl) {
      // Validate CDN URL format
      try {
        new URL(config.cdnBaseUrl);
      } catch {
        throw new InvalidExportConfigError('Invalid CDN base URL');
      }
    }
  }
}
