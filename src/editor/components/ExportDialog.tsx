/**
 * ExportDialog Component
 *
 * Modal dialog for exporting animations as image sequences.
 * Supports PNG/WebP/JPEG formats with configurable resolution,
 * frame range, and quality settings.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Modal } from '../Modal';
import { ImageSequenceExporter } from '../export/ImageSequenceExporter';
import type {
  ImageSequenceExportConfig,
  ExportProgress,
  ImageFormat,
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

export function ExportDialog({
  isOpen,
  onClose,
  program,
  defaultWidth,
  defaultHeight,
}: ExportDialogProps): React.ReactElement {
  // Form state
  const [width, setWidth] = useState(defaultWidth);
  const [height, setHeight] = useState(defaultHeight);
  const [startFrame, setStartFrame] = useState(0);
  const [endFrame, setEndFrame] = useState(60);
  const [frameStep, setFrameStep] = useState(1);
  const [fps, setFps] = useState(60);
  const [format, setFormat] = useState<ImageFormat>('png');
  const [quality, setQuality] = useState(90);

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exporterRef = useRef<ImageSequenceExporter | null>(null);

  // Update defaults when props change
  useEffect(() => {
    setWidth(defaultWidth);
    setHeight(defaultHeight);
  }, [defaultWidth, defaultHeight]);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setProgress(null);
      setIsExporting(false);
    }
  }, [isOpen]);

  // Calculate derived values
  const totalFrames = Math.floor((endFrame - startFrame) / frameStep) + 1;
  const durationSeconds = (endFrame - startFrame) / fps;

  // Validation
  const isValidConfig =
    width > 0 &&
    height > 0 &&
    startFrame >= 0 &&
    endFrame >= startFrame &&
    frameStep > 0 &&
    fps > 0 &&
    totalFrames > 0;

  const canExport = isValidConfig && program !== null && !isExporting;

  const handleExport = useCallback(async () => {
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
      exporterRef.current = exporter;

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
      exporterRef.current = null;
    }
  }, [program, canExport, width, height, startFrame, endFrame, frameStep, fps, format, quality, onClose]);

  const handleCancel = useCallback(() => {
    if (exporterRef.current) {
      exporterRef.current.cancel();
    }
  }, []);

  const handleClose = useCallback(() => {
    if (isExporting) {
      handleCancel();
    }
    onClose();
  }, [isExporting, handleCancel, onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Export Image Sequence"
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

        {/* Frame Range */}
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
          </div>
          <div className="export-dialog-row">
            <div className="export-dialog-field">
              <label htmlFor="export-fps">FPS</label>
              <input
                id="export-fps"
                type="number"
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                min={1}
                max={120}
                disabled={isExporting}
              />
            </div>
          </div>
          <div className="export-dialog-info">
            {totalFrames} frame{totalFrames !== 1 ? 's' : ''} ({durationSeconds.toFixed(2)}s)
          </div>
        </div>

        {/* Format */}
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
