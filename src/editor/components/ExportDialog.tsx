/**
 * ExportDialog Component
 *
 * Modal dialog for exporting animations as image sequences, video, GIF, or standalone HTML player.
 * Supports PNG/WebP/JPEG formats, H.264/VP9 video codecs, animated GIFs, and self-contained HTML export.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Modal } from '../Modal';
import { ImageSequenceExporter } from '../export/ImageSequenceExporter';
import { VideoExporter } from '../export/VideoExporter';
import { GifExporter } from '../export/GifExporter';
import { StandaloneExporter } from '../export/StandaloneExporter';
import { isWebCodecsSupported, getRecommendedBitrate } from '../export/codecs';
import type {
  ImageSequenceExportConfig,
  VideoExportConfig,
  GifExportConfig,
  StandaloneExportConfig,
  ExportProgress,
  ImageFormat,
  VideoCodec,
  DitheringMode,
  RuntimeBundleMode,
} from '../export/types';
import type { CompiledProgramIR } from '../compiler/ir/program';
import './ExportDialog.css';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Compiled program to export (null if no program available) */
  program: CompiledProgramIR | null;
  /** Default resolution from viewport */
  defaultWidth: number;
  defaultHeight: number;
}

type ExportType = 'image' | 'video' | 'gif' | 'standalone';

/**
 * Download blobs as individual files or zip (depending on browser support).
 * For now, we'll download individual files with a sequential naming pattern.
 */
async function downloadBlobs(
  blobs: Blob[],
  format: ImageFormat,
  config: ImageSequenceExportConfig
): Promise<void> {
  const ext = format === 'jpeg' ? 'jpg' : format;

  for (let i = 0; i < blobs.length; i++) {
    const blob = blobs[i];
    const frameNumber = config.startFrame + (i * config.frameStep);
    const paddedFrame = String(frameNumber).padStart(4, '0');
    const filename = `frame-${paddedFrame}.${ext}`;

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    // Cleanup
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Small delay between downloads to avoid browser blocking
    if (i < blobs.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

/**
 * Download single video blob.
 */
function downloadVideoBlob(blob: Blob, codec: VideoCodec): void {
  const ext = codec === 'h264' ? 'mp4' : 'webm';
  const filename = `animation.${ext}`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Cleanup
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download GIF blob.
 */
function downloadGifBlob(blob: Blob): void {
  const filename = 'animation.gif';

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Cleanup
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download standalone HTML blob.
 */
function downloadStandaloneBlob(blob: Blob): void {
  const filename = 'animation.html';

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Cleanup
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportDialog({
  isOpen,
  onClose,
  program,
  defaultWidth,
  defaultHeight,
}: ExportDialogProps): React.ReactElement {
  // Export type selection
  const [exportType, setExportType] = useState<ExportType>('image');

  // Form state (shared)
  const [width, setWidth] = useState(defaultWidth);
  const [height, setHeight] = useState(defaultHeight);
  const [startFrame, setStartFrame] = useState(0);
  const [endFrame, setEndFrame] = useState(60);
  const [fps, setFps] = useState(60);

  // Image-specific state
  const [frameStep, setFrameStep] = useState(1);
  const [format, setFormat] = useState<ImageFormat>('png');
  const [quality, setQuality] = useState(90);

  // Video-specific state
  const [codec, setCodec] = useState<VideoCodec>('h264');
  const [bitrate, setBitrate] = useState(5_000_000); // 5 Mbps default

  // GIF-specific state
  const [maxColors, setMaxColors] = useState(128);
  const [dithering, setDithering] = useState<DitheringMode>('none');
  const [loopCount, setLoopCount] = useState(0); // 0 = infinite

  // Standalone-specific state
  const [includeControls, setIncludeControls] = useState(true);
  const [bundleMode, setBundleMode] = useState<RuntimeBundleMode>('cdn');

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const imageExporterRef = useRef<ImageSequenceExporter | null>(null);
  const videoExporterRef = useRef<VideoExporter | null>(null);
  const gifExporterRef = useRef<GifExporter | null>(null);

  // Check WebCodecs support
  const webCodecsSupported = isWebCodecsSupported();

  // Update defaults when props change
  useEffect(() => {
    setWidth(defaultWidth);
    setHeight(defaultHeight);
  }, [defaultWidth, defaultHeight]);

  // Update recommended bitrate when resolution changes
  useEffect(() => {
    if (exportType === 'video') {
      const recommended = getRecommendedBitrate(width, height);
      setBitrate(recommended);
    }
  }, [width, height, exportType]);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setProgress(null);
      setIsExporting(false);
    }
  }, [isOpen]);

  // Calculate derived values
  const totalFrames = exportType === 'image'
    ? Math.floor((endFrame - startFrame) / frameStep) + 1
    : endFrame - startFrame + 1;
  const durationSeconds = (endFrame - startFrame) / fps;

  // Validation
  const isValidConfig =
    width > 0 &&
    height > 0 &&
    startFrame >= 0 &&
    endFrame >= startFrame &&
    fps > 0 &&
    totalFrames > 0 &&
    (exportType === 'image' ? frameStep > 0 : true) &&
    (exportType === 'video' ? bitrate > 0 : true) &&
    (exportType === 'gif' ? (maxColors >= 2 && maxColors <= 256) : true);

  const canExport = isValidConfig && program !== null && !isExporting &&
    (exportType === 'image' || exportType === 'gif' || exportType === 'standalone' || webCodecsSupported);

  const handleImageExport = useCallback(async () => {
    if (!program || !canExport) return;

    setIsExporting(true);
    setError(null);
    setProgress(null);

    const config: ImageSequenceExportConfig = {
      width,
      height,
      startFrame,
      endFrame,
      frameStep,
      fps,
      format,
      quality: format === 'png' ? undefined : quality,
    };

    try {
      const exporter = new ImageSequenceExporter();
      imageExporterRef.current = exporter;

      const result = await exporter.export(
        program,
        config,
        (p) => setProgress(p)
      );

      // Download blobs
      await downloadBlobs(result.blobs, format, config);

      // Success - close dialog
      onClose();
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('cancelled')) {
          setError('Export cancelled');
        } else {
          setError(err.message);
        }
      } else {
        setError('Export failed');
      }
    } finally {
      setIsExporting(false);
      imageExporterRef.current = null;
    }
  }, [program, canExport, width, height, startFrame, endFrame, frameStep, fps, format, quality, onClose]);

  const handleVideoExport = useCallback(async () => {
    if (!program || !canExport || !webCodecsSupported) return;

    setIsExporting(true);
    setError(null);
    setProgress(null);

    const config: VideoExportConfig = {
      width,
      height,
      startFrame,
      endFrame,
      fps,
      codec,
      bitrate,
    };

    try {
      const exporter = new VideoExporter();
      videoExporterRef.current = exporter;

      const result = await exporter.export(
        program,
        config,
        (p) => setProgress(p)
      );

      // Download video blob
      downloadVideoBlob(result.blob, codec);

      // Success - close dialog
      onClose();
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('cancelled')) {
          setError('Export cancelled');
        } else {
          setError(err.message);
        }
      } else {
        setError('Export failed');
      }
    } finally {
      setIsExporting(false);
      videoExporterRef.current = null;
    }
  }, [program, canExport, webCodecsSupported, width, height, startFrame, endFrame, fps, codec, bitrate, onClose]);

  const handleGifExport = useCallback(async () => {
    if (!program || !canExport) return;

    setIsExporting(true);
    setError(null);
    setProgress(null);

    const config: GifExportConfig = {
      width,
      height,
      startFrame,
      endFrame,
      fps,
      maxColors,
      dithering,
      loopCount,
    };

    try {
      const exporter = new GifExporter();
      gifExporterRef.current = exporter;

      const result = await exporter.export(
        program,
        config,
        (p) => setProgress(p)
      );

      // Download GIF blob
      downloadGifBlob(result.blob);

      // Success - close dialog
      onClose();
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('cancelled')) {
          setError('Export cancelled');
        } else {
          setError(err.message);
        }
      } else {
        setError('Export failed');
      }
    } finally {
      setIsExporting(false);
      gifExporterRef.current = null;
    }
  }, [program, canExport, width, height, startFrame, endFrame, fps, maxColors, dithering, loopCount, onClose]);

  const handleStandaloneExport = useCallback(async () => {
    if (!program || !canExport) return;

    setIsExporting(true);
    setError(null);
    setProgress(null);

    const config: StandaloneExportConfig = {
      width,
      height,
      includeControls,
      bundleMode,
      seed: program.seed,
    };

    try {
      const exporter = new StandaloneExporter();
      const result = await exporter.export(program, config);

      // Download HTML blob
      downloadStandaloneBlob(result.blob);

      // Success - close dialog
      onClose();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Export failed');
      }
    } finally {
      setIsExporting(false);
    }
  }, [program, canExport, width, height, includeControls, bundleMode, onClose]);

  const handleExport = useCallback(() => {
    if (exportType === 'image') {
      void handleImageExport();
    } else if (exportType === 'video') {
      void handleVideoExport();
    } else if (exportType === 'gif') {
      void handleGifExport();
    } else {
      void handleStandaloneExport();
    }
  }, [exportType, handleImageExport, handleVideoExport, handleGifExport, handleStandaloneExport]);

  const handleCancel = useCallback(() => {
    if (imageExporterRef.current) {
      imageExporterRef.current.cancel();
    }
    if (videoExporterRef.current) {
      videoExporterRef.current.cancel();
    }
    if (gifExporterRef.current) {
      gifExporterRef.current.cancel();
    }
  }, []);

  const handleClose = useCallback(() => {
    if (isExporting) {
      handleCancel();
    }
    onClose();
  }, [isExporting, handleCancel, onClose]);

  const getTitle = () => {
    switch (exportType) {
      case 'image': return 'Export Image Sequence';
      case 'video': return 'Export Video';
      case 'gif': return 'Export GIF';
      case 'standalone': return 'Export Standalone Player';
      default: return 'Export';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={getTitle()}
      width="medium"
      footer={
        <>
          <button
            className="export-dialog-button export-dialog-button--secondary"
            onClick={handleClose}
            disabled={isExporting}
          >
            {isExporting ? 'Cancel' : 'Close'}
          </button>
          <button
            className="export-dialog-button export-dialog-button--primary"
            onClick={handleExport}
            disabled={!canExport}
          >
            {isExporting ? 'Exporting...' : 'Export'}
          </button>
        </>
      }
    >
      <div className="export-dialog-content">
        {!program && (
          <div className="export-dialog-warning">
            No compiled program available. Make sure your patch compiles successfully before exporting.
          </div>
        )}

        {/* Export Type Selector */}
        <div className="export-dialog-section">
          <h3 className="export-dialog-section-title">Export Type</h3>
          <div className="export-dialog-row">
            <div className="export-dialog-field">
              <label htmlFor="export-type">Type</label>
              <select
                id="export-type"
                value={exportType}
                onChange={(e) => setExportType(e.target.value as ExportType)}
                disabled={isExporting}
              >
                <option value="image">Image Sequence</option>
                <option value="video" disabled={!webCodecsSupported}>
                  Video {!webCodecsSupported ? '(not supported)' : ''}
                </option>
                <option value="gif">Animated GIF</option>
                <option value="standalone">Standalone Player (HTML)</option>
              </select>
            </div>
          </div>
          {exportType === 'video' && !webCodecsSupported && (
            <div className="export-dialog-warning">
              Video export requires WebCodecs API (Chrome 94+, Edge 94+, Safari 16.4+).
              Please use image sequence or GIF export instead.
            </div>
          )}
          {exportType === 'standalone' && (
            <div className="export-dialog-info">
              Export as self-contained HTML file that can be opened in any browser.
            </div>
          )}
        </div>

        {/* Resolution */}
        <div className="export-dialog-section">
          <h3 className="export-dialog-section-title">Resolution</h3>
          <div className="export-dialog-row">
            <div className="export-dialog-field">
              <label htmlFor="export-width">Width (px)</label>
              <input
                id="export-width"
                type="number"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                min={1}
                max={7680}
                disabled={isExporting}
              />
            </div>
            <div className="export-dialog-field">
              <label htmlFor="export-height">Height (px)</label>
              <input
                id="export-height"
                type="number"
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                min={1}
                max={4320}
                disabled={isExporting}
              />
            </div>
          </div>
        </div>

        {/* Frame Range (not for standalone) */}
        {exportType !== 'standalone' && (
          <div className="export-dialog-section">
            <h3 className="export-dialog-section-title">Frame Range</h3>
            <div className="export-dialog-row">
              <div className="export-dialog-field">
                <label htmlFor="export-start-frame">Start Frame</label>
                <input
                  id="export-start-frame"
                  type="number"
                  value={startFrame}
                  onChange={(e) => setStartFrame(Number(e.target.value))}
                  min={0}
                  disabled={isExporting}
                />
              </div>
              <div className="export-dialog-field">
                <label htmlFor="export-end-frame">End Frame</label>
                <input
                  id="export-end-frame"
                  type="number"
                  value={endFrame}
                  onChange={(e) => setEndFrame(Number(e.target.value))}
                  min={0}
                  disabled={isExporting}
                />
              </div>
              {exportType === 'image' && (
                <div className="export-dialog-field">
                  <label htmlFor="export-frame-step">Step</label>
                  <input
                    id="export-frame-step"
                    type="number"
                    value={frameStep}
                    onChange={(e) => setFrameStep(Number(e.target.value))}
                    min={1}
                    disabled={isExporting}
                  />
                </div>
              )}
            </div>
            <div className="export-dialog-row">
              <div className="export-dialog-field">
                <label htmlFor="export-fps">FPS</label>
                {exportType === 'gif' ? (
                  <select
                    id="export-fps"
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value))}
                    disabled={isExporting}
                  >
                    <option value={10}>10 fps</option>
                    <option value={15}>15 fps</option>
                    <option value={24}>24 fps</option>
                    <option value={30}>30 fps</option>
                    <option value={60}>60 fps</option>
                  </select>
                ) : (
                  <input
                    id="export-fps"
                    type="number"
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value))}
                    min={1}
                    max={120}
                    disabled={isExporting}
                  />
                )}
              </div>
            </div>
            <div className="export-dialog-info">
              {totalFrames} frame{totalFrames !== 1 ? 's' : ''} ({durationSeconds.toFixed(2)}s)
            </div>
          </div>
        )}

        {/* Format (Image) or Codec (Video) or GIF Settings or Standalone Settings */}
        {exportType === 'image' ? (
          <div className="export-dialog-section">
            <h3 className="export-dialog-section-title">Format</h3>
            <div className="export-dialog-row">
              <div className="export-dialog-field">
                <label htmlFor="export-format">Image Format</label>
                <select
                  id="export-format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as ImageFormat)}
                  disabled={isExporting}
                >
                  <option value="png">PNG (lossless)</option>
                  <option value="webp">WebP (lossy/lossless)</option>
                  <option value="jpeg">JPEG (lossy)</option>
                </select>
              </div>
            </div>

            {/* Quality slider (hidden for PNG) */}
            {format !== 'png' && (
              <div className="export-dialog-row">
                <div className="export-dialog-field">
                  <label htmlFor="export-quality">
                    Quality ({quality}%)
                  </label>
                  <input
                    id="export-quality"
                    type="range"
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                    min={1}
                    max={100}
                    disabled={isExporting}
                    className="export-dialog-slider"
                  />
                </div>
              </div>
            )}
          </div>
        ) : exportType === 'video' ? (
          <div className="export-dialog-section">
            <h3 className="export-dialog-section-title">Video Settings</h3>
            <div className="export-dialog-row">
              <div className="export-dialog-field">
                <label htmlFor="export-codec">Codec</label>
                <select
                  id="export-codec"
                  value={codec}
                  onChange={(e) => setCodec(e.target.value as VideoCodec)}
                  disabled={isExporting}
                >
                  <option value="h264">H.264 (MP4)</option>
                  <option value="vp9">VP9 (WebM)</option>
                </select>
              </div>
            </div>

            {/* Bitrate slider */}
            <div className="export-dialog-row">
              <div className="export-dialog-field">
                <label htmlFor="export-bitrate">
                  Bitrate ({(bitrate / 1_000_000).toFixed(1)} Mbps)
                </label>
                <input
                  id="export-bitrate"
                  type="range"
                  value={bitrate}
                  onChange={(e) => setBitrate(Number(e.target.value))}
                  min={1_000_000}
                  max={20_000_000}
                  step={500_000}
                  disabled={isExporting}
                  className="export-dialog-slider"
                />
              </div>
            </div>
            <div className="export-dialog-info">
              Recommended bitrate: {(getRecommendedBitrate(width, height) / 1_000_000).toFixed(1)} Mbps
            </div>
          </div>
        ) : exportType === 'gif' ? (
          <div className="export-dialog-section">
            <h3 className="export-dialog-section-title">GIF Settings</h3>

            {/* Quality slider (max colors) */}
            <div className="export-dialog-row">
              <div className="export-dialog-field">
                <label htmlFor="export-max-colors">
                  Quality ({maxColors} colors)
                </label>
                <input
                  id="export-max-colors"
                  type="range"
                  value={maxColors}
                  onChange={(e) => setMaxColors(Number(e.target.value))}
                  min={16}
                  max={256}
                  step={16}
                  disabled={isExporting}
                  className="export-dialog-slider"
                />
              </div>
            </div>
            <div className="export-dialog-info">
              More colors = better quality but larger file size
            </div>

            {/* Dithering selector */}
            <div className="export-dialog-row">
              <div className="export-dialog-field">
                <label htmlFor="export-dithering">Dithering</label>
                <select
                  id="export-dithering"
                  value={dithering}
                  onChange={(e) => setDithering(e.target.value as DitheringMode)}
                  disabled={isExporting}
                >
                  <option value="none">None (fastest)</option>
                  <option value="floyd-steinberg">Floyd-Steinberg (best quality)</option>
                  <option value="ordered">Ordered (balanced)</option>
                </select>
              </div>
            </div>

            {/* Loop mode */}
            <div className="export-dialog-row">
              <div className="export-dialog-field">
                <label htmlFor="export-loop-count">Loop Mode</label>
                <select
                  id="export-loop-count"
                  value={loopCount}
                  onChange={(e) => setLoopCount(Number(e.target.value))}
                  disabled={isExporting}
                >
                  <option value={0}>Infinite</option>
                  <option value={1}>Once</option>
                  <option value={2}>2 times</option>
                  <option value={3}>3 times</option>
                  <option value={5}>5 times</option>
                </select>
              </div>
            </div>
          </div>
        ) : (
          <div className="export-dialog-section">
            <h3 className="export-dialog-section-title">Player Settings</h3>

            {/* Include controls */}
            <div className="export-dialog-row">
              <div className="export-dialog-field">
                <label htmlFor="export-include-controls">
                  <input
                    type="checkbox"
                    id="export-include-controls"
                    checked={includeControls}
                    onChange={(e) => setIncludeControls(e.target.checked)}
                    disabled={isExporting}
                  />
                  Include playback controls
                </label>
              </div>
            </div>
            <div className="export-dialog-info">
              Controls include play/pause button, timeline scrubber, and loop toggle
            </div>

            {/* Bundle mode */}
            <div className="export-dialog-row">
              <div className="export-dialog-field">
                <label htmlFor="export-bundle-mode">Runtime Bundle</label>
                <select
                  id="export-bundle-mode"
                  value={bundleMode}
                  onChange={(e) => setBundleMode(e.target.value as RuntimeBundleMode)}
                  disabled={isExporting}
                >
                  <option value="cdn">CDN (smaller file, requires network)</option>
                  <option value="inline" disabled>Inline (larger file, works offline) - Coming Soon</option>
                </select>
              </div>
            </div>
            <div className="export-dialog-info">
              CDN mode links to external runtime. Inline mode embeds runtime in HTML (not yet implemented).
            </div>
          </div>
        )}

        {/* Progress */}
        {isExporting && progress && (
          <div className="export-dialog-section">
            <h3 className="export-dialog-section-title">Progress</h3>
            <div className="export-dialog-progress-bar">
              <div
                className="export-dialog-progress-fill"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
            <div className="export-dialog-progress-text">
              Frame {progress.current} / {progress.total} ({progress.percentage.toFixed(1)}%)
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="export-dialog-error">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
