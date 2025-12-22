import { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import ImageTracer from 'imagetracerjs';
import { Modal } from './Modal';
import { pathLibrary, type PathEntry } from './pathLibrary';
import './PathManagerModal.css';

type TabId = 'import' | 'library';

interface PathManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PLACEHOLDER_THUMBNAIL = `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg">
  <rect width="120" height="80" fill="#0d0d0d" stroke="#333" stroke-width="2"/>
  <text x="60" y="44" text-anchor="middle" fill="#555" font-size="12">No Preview</text>
</svg>`;

const MAX_TRACE_DIMENSION = 640;
const MAX_TRACE_PATHS = 250;

function formatSourceLabel(source: PathEntry['source']) {
  if (source === 'builtin') return 'Built-in';
  if (source === 'imported') return 'Imported';
  return 'Pasted';
}

function ensureUniqueName(baseName: string): string {
  const existingNames = pathLibrary.getAll().map((e) => e.name);
  if (!existingNames.includes(baseName)) return baseName;

  let counter = 2;
  while (existingNames.includes(`${baseName} ${counter}`)) {
    counter += 1;
  }
  return `${baseName} ${counter}`;
}

function isLikelyJSON(text: string) {
  const trimmed = text.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

export const PathManagerModal = observer(({ isOpen, onClose }: PathManagerModalProps) => {
  const [activeTab, setActiveTab] = useState<TabId>('library');
  const [importText, setImportText] = useState('');
  const [importName, setImportName] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isTracing, setIsTracing] = useState(false);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [previewEntry, setPreviewEntry] = useState<PathEntry | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const traceInputRef = useRef<HTMLInputElement>(null);

  const entries = pathLibrary.getAll();
  const userEntries = pathLibrary.getUserPaths();

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSuccess(null);
  }, [isOpen]);

  useEffect(() => {
    if (success === null) return;
    const timer = setTimeout(() => setSuccess(null), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    if (tab === 'library') {
      setSuccess(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file === undefined) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = (event.target?.result as string) ?? '';
      setImportText(text);
      setImportName(file.name.replace(/\.(svg|json)$/i, ''));
      setActiveTab('import');
      setError(null);
      setSuccess(null);
      if (fileInputRef.current !== null) {
        fileInputRef.current.value = '';
      }
      requestAnimationFrame(() => {
        nameInputRef.current?.focus();
      });
    };
    reader.onerror = () => {
      setError('Failed to read file. Please try again.');
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    const trimmed = importText.trim();
    if (trimmed === '') {
      setError('Paste SVG code or choose a file to import.');
      return;
    }

    setIsImporting(true);
    setError(null);
    setSuccess(null);

    try {
      let result:
        | { success: boolean; entry?: PathEntry; error?: string }
        | undefined;

      if (isLikelyJSON(trimmed)) {
        result = pathLibrary.importFromJSON(trimmed);
      } else {
        const name = ensureUniqueName(
          (importName || 'Imported Path').trim()
        );
        result = pathLibrary.importFromString(trimmed, name);
      }

      if (result?.success !== true || result.entry === undefined) {
        setError(result?.error ?? 'Import failed.');
        return;
      }

      setSuccess(`Imported "${result.entry.name}"`);
      setImportText('');
      setImportName('');
      setActiveTab('library');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown import error';
      setError(message);
    } finally {
      setIsImporting(false);
    }
  };

  const deriveNameFromUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      const base = parsed.pathname.split('/').pop();
      return ensureUniqueName((base?.replace(/\.svg$/i, '') ?? '') || 'Remote SVG');
    } catch {
      return ensureUniqueName('Remote SVG');
    }
  };

  const handleImportFromUrl = async () => {
    if (remoteUrl.trim() === '') {
      setError('Enter a URL to import from (for example, an unDraw SVG link).');
      return;
    }

    setIsFetchingUrl(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(remoteUrl.trim());
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const text = await response.text();
      setImportText(text);
      setImportName(deriveNameFromUrl(remoteUrl));
      setActiveTab('import');
      setSuccess('Fetched remote SVG. Review and click Import.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fetch failed';
      setError(`Could not fetch from URL: ${message}`);
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const loadImageFromFile = (file: File): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not load image'));
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
  };

  const downsampleImage = (img: HTMLImageElement) => {
    const scale = Math.min(1, MAX_TRACE_DIMENSION / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('Could not create canvas context');
    ctx.drawImage(img, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
  };

  const countPaths = (svg: string) => {
    return (svg.match(/<path\b/gi) || []).length;
  };

  const traceImageToSvg = (imageData: ImageData) => {
    const attempts = [
      { numberofcolors: 8, ltres: 0.8, qtres: 0.8, pathomit: 2, roundcoords: 1 },
      { numberofcolors: 6, ltres: 1, qtres: 1, pathomit: 4, roundcoords: 1 },
      { numberofcolors: 4, ltres: 1.1, qtres: 1.1, pathomit: 6, roundcoords: 1 },
      { numberofcolors: 3, ltres: 1.2, qtres: 1.2, pathomit: 10, roundcoords: 1 },
    ];

    let bestSvg = '';
    let bestCount = Infinity;

    for (const opts of attempts) {
      const svg = ImageTracer.imagedataToSVG(imageData, opts);
      const pathCount = countPaths(svg);
      if (pathCount < bestCount) {
        bestCount = pathCount;
        bestSvg = svg;
      }
      if (pathCount <= MAX_TRACE_PATHS) {
        return { svg, pathCount };
      }
    }

    return { svg: bestSvg, pathCount: bestCount };
  };

  const handleTraceFile = async (file: File) => {
    setIsTracing(true);
    setError(null);
    setSuccess(null);

    try {
      const image = await loadImageFromFile(file);
      const data = downsampleImage(image);
      const { svg, pathCount } = traceImageToSvg(data);

      if (svg === '') {
        throw new Error('Tracing failed to generate SVG.');
      }

      if (pathCount > MAX_TRACE_PATHS) {
        throw new Error(`Tracing created ${pathCount} paths (limit ${MAX_TRACE_PATHS}). Try a simpler image or smaller size.`);
      }

      setImportText(svg);
      setImportName(ensureUniqueName(file.name.replace(/\.[^.]+$/, '') || 'Traced Image'));
      setActiveTab('import');
      setSuccess(`Traced image to SVG with ${pathCount} paths.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Image trace failed';
      setError(message);
    } finally {
      setIsTracing(false);
      if (traceInputRef.current !== null) {
        traceInputRef.current.value = '';
      }
    }
  };

  const handleTraceDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file === undefined) return;
    if (!file.type.startsWith('image/')) {
      setError('Please drop an image file (png or jpg).');
      return;
    }
    void handleTraceFile(file);
  };

  const handleTraceBrowse = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file === undefined) return;
    void handleTraceFile(file);
  };

  const handleExport = (id: string) => {
    const json = pathLibrary.exportAsJSON(id);
    if (json === undefined) return;

    const entry = pathLibrary.getById(id);
    const filename = `path-${entry?.name ?? 'export'}-${Date.now()}.json`;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = (id: string) => {
    const entry = pathLibrary.getById(id);
    if (entry === undefined || entry.source === 'builtin') return;

    const confirmDelete = window.confirm(`Delete "${entry.name}"?`);
    if (confirmDelete === false) return;

    setIsDeleting(id);
    try {
      pathLibrary.remove(id);
    } finally {
      setIsDeleting(null);
    }
  };

  const handleClose = () => {
    if (importText.trim() !== '') {
      const shouldClose = window.confirm('Discard your current import text?');
      if (shouldClose === false) return;
    }
    onClose();
  };

  const libraryCountLabel = useMemo(() => {
    const count = entries.length;
    return count === 1 ? '1 path' : `${count} paths`;
  }, [entries.length]);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title="Path Manager"
        width="large"
      >
        <div className="path-manager">
          <div className="path-manager-tabs">
            <button
              className={`path-tab ${activeTab === 'import' ? 'active' : ''}`}
              onClick={() => handleTabChange('import')}
            >
              Import
            </button>
            <button
              className={`path-tab ${activeTab === 'library' ? 'active' : ''}`}
              onClick={() => handleTabChange('library')}
            >
              Library <span className="path-tab-count">{libraryCountLabel}</span>
            </button>
          </div>

          <div className="path-tab-panels">
            <div className={`path-tab-panel ${activeTab === 'import' ? 'active' : ''}`}>
              <div className="import-form">
                <div className="import-row">
                  <label className="import-label">Trace an image (PNG/JPG)</label>
                  <div
                    className={`trace-dropzone ${isTracing ? 'busy' : ''}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleTraceDrop}
                  >
                    <div className="trace-dropzone-text">
                      {isTracing ? 'Tracing image...' : 'Drop an image here to trace to SVG'}
                      <span className="trace-dropzone-sub">
                        Downsamples to {MAX_TRACE_DIMENSION}px max and caps at {MAX_TRACE_PATHS} paths.
                      </span>
                    </div>
                    <div className="trace-actions">
                      <input
                        ref={traceInputRef}
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={handleTraceBrowse}
                      />
                      <button
                        className="import-secondary-btn"
                        onClick={() => traceInputRef.current?.click()}
                        disabled={isTracing}
                      >
                        Browse Image
                      </button>
                    </div>
                  </div>
                </div>

                <div className="import-row">
                  <label className="import-label">SVG File</label>
                  <div className="file-input-row">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".svg,.json,.txt"
                      onChange={handleFileUpload}
                    />
                    <button
                      className="import-secondary-btn"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Choose File
                    </button>
                  </div>
                </div>

                <div className="import-row">
                  <label className="import-label">Import from URL (e.g., unDraw SVG link)</label>
                  <div className="remote-row">
                    <input
                      className="import-input"
                      type="url"
                      placeholder="https://undraw.co/illustrations/..."
                      value={remoteUrl}
                      onChange={(e) => setRemoteUrl(e.target.value)}
                    />
                    <button
                      className="import-secondary-btn"
                      onClick={() => void handleImportFromUrl()}
                      disabled={isFetchingUrl}
                    >
                      {isFetchingUrl ? 'Fetching...' : 'Fetch'}
                    </button>
                  </div>
                </div>

                <div className="import-row">
                  <label className="import-label">Paste SVG or JSON</label>
                  <textarea
                    className="import-textarea"
                    placeholder="<svg>... paste SVG content ...</svg>"
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                  />
                </div>

                <div className="import-row">
                  <label className="import-label">Name</label>
                  <input
                    ref={nameInputRef}
                    className="import-input"
                    type="text"
                    placeholder="Imported Path"
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                  />
                </div>

                <div className="import-actions">
                  <div className="import-messages">
                    {error !== null && (
                      <div className="import-error">
                        <span className="import-error-icon">&#9888;</span>
                        <span>{error}</span>
                      </div>
                    )}
                    {success !== null && (
                      <div className="import-success">
                        <span className="import-success-icon">&#10003;</span>
                        <span>{success}</span>
                        <button
                          className="import-success-link"
                          onClick={() => handleTabChange('library')}
                        >
                          View in Library
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="import-buttons">
                    <button
                      className="import-secondary-btn"
                      onClick={() => {
                        setImportText('');
                        setImportName('');
                        setError(null);
                        setSuccess(null);
                      }}
                      disabled={importText === '' && importName === ''}
                    >
                      Clear
                    </button>
                    <button
                      className="import-primary-btn"
                      onClick={() => void handleImport()}
                      disabled={importText.trim() === '' || isImporting}
                    >
                      {isImporting ? 'Importing...' : 'Import'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className={`path-tab-panel ${activeTab === 'library' ? 'active' : ''}`}>
              <div className="library-grid">
                {entries.map((entry) => (
                  <div className="path-card" key={entry.id}>
                    <div
                      className="path-card-thumbnail"
                      dangerouslySetInnerHTML={{ __html: entry.thumbnail !== null ? entry.thumbnail : PLACEHOLDER_THUMBNAIL }}
                    />
                    <div className="path-card-body">
                      <div className="path-card-header">
                        <span className="path-card-name" title={entry.name}>
                          {entry.name}
                        </span>
                        <span className={`path-card-badge badge-${entry.source}`}>
                          {formatSourceLabel(entry.source)}
                        </span>
                      </div>
                      <div className="path-card-actions">
                        <button
                          className="path-card-btn"
                          onClick={() => setPreviewEntry(entry)}
                          title="Preview"
                        >
                          Preview
                        </button>
                        <button
                          className="path-card-btn"
                          onClick={() => handleExport(entry.id)}
                          title="Export as JSON"
                        >
                          Export
                        </button>
                        {entry.source !== 'builtin' && (
                          <button
                            className="path-card-btn danger"
                            onClick={() => handleDelete(entry.id)}
                            disabled={isDeleting === entry.id}
                            title="Delete path"
                          >
                            {isDeleting === entry.id ? 'Deleting...' : 'Delete'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {userEntries.length === 0 && (
                <div className="library-empty">
                  <div className="library-empty-title">No user paths yet</div>
                  <div className="library-empty-body">
                    Import an SVG to see it here. Built-in paths stay available even when the library is empty.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {previewEntry !== null ? (
        <Modal
          isOpen
          onClose={() => setPreviewEntry(null)}
          title={`Preview: ${previewEntry.name}`}
          width="large"
          zIndex={1400}
        >
          <div className="preview-pane">
            <div
              className="preview-svg"
              dangerouslySetInnerHTML={{
                __html: previewEntry.meta?.originalSVG !== undefined
                  ? previewEntry.meta.originalSVG
                  : previewEntry.thumbnail !== null
                    ? previewEntry.thumbnail
                    : PLACEHOLDER_THUMBNAIL,
              }}
            />
            <div className="preview-meta">
              <div className="preview-row">
                <span className="preview-label">Source</span>
                <span className="preview-value">{formatSourceLabel(previewEntry.source)}</span>
              </div>
              {previewEntry.meta?.viewBox !== undefined && (
                <div className="preview-row">
                  <span className="preview-label">ViewBox</span>
                  <span className="preview-value">{previewEntry.meta.viewBox}</span>
                </div>
              )}
              <div className="preview-row">
                <span className="preview-label">Path Count</span>
                <span className="preview-value">{previewEntry.data.length}</span>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
});
