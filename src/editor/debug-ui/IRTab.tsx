/**
 * IR Tab Component - Compiler Debug Tool
 *
 * Shows compilation state whether it succeeds or fails:
 * - Compile errors (with full context)
 * - Source patch (blocks, connections, buses)
 * - Intermediate IR (if available)
 * - Final programIR (if compilation succeeded)
 */

import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { useStore } from '../stores';
import type { CompiledProgramIR, LinkedGraphIR } from '../compiler/ir';
import type { CompileError } from '../compiler/types';
import './IRTab.css';

interface FullCompileResult {
  ok: boolean;
  errors: CompileError[];
  ir?: LinkedGraphIR;
  programIR?: CompiledProgramIR;
  irWarnings?: CompileError[];
}

/**
 * Get the latest compile result from window.__compilerService
 */
function getCompileResult(): FullCompileResult | null {
  const compilerService = (window as unknown as { __compilerService?: { getLatestResult(): unknown } }).__compilerService;
  if (compilerService === null || compilerService === undefined) return null;

  const result = compilerService.getLatestResult();
  if (result === null || result === undefined || typeof result !== 'object') return null;

  return result as FullCompileResult;
}

export const IRTab = observer(function IRTab() {
  const store = useStore();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['errors', 'blocks']));
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedErrorIdx, setSelectedErrorIdx] = useState<number | null>(null);

  const result = getCompileResult();
  const blocks = store.patchStore.blocks;
  const connections = store.patchStore.connections;
  const buses = store.busStore.buses;
  const publishers = store.busStore.publishers;
  const listeners = store.busStore.listeners;

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  // Status indicator
  const status = result === null || result === undefined
    ? 'no-compile'
    : result.ok
      ? 'success'
      : 'error';

  const statusLabel = {
    'no-compile': 'Not Compiled',
    'success': 'Compiled OK',
    'error': 'Compilation Failed',
  }[status];

  const statusClass = {
    'no-compile': 'ir-status-none',
    'success': 'ir-status-ok',
    'error': 'ir-status-error',
  }[status];

  return (
    <div className="ir-tab">
      {/* Status Header */}
      <div className="ir-tab-header">
        <div className={`ir-tab-status ${statusClass}`}>
          {statusLabel}
        </div>
        <div className="ir-tab-header-stats">
          <span>{blocks.length} blocks</span>
          <span>{connections.length} connections</span>
          <span>{buses.length} buses</span>
        </div>
      </div>

      {/* ERRORS Section - Most Important for Debugging */}
      {result !== null && result !== undefined && result.errors.length > 0 && (
        <section className="ir-tab-section ir-tab-section-errors">
          <button
            className="ir-tab-section-header ir-tab-section-header-error"
            onClick={() => toggleSection('errors')}
            type="button"
          >
            <span className="ir-tab-section-icon">
              {expandedSections.has('errors') ? '▼' : '▶'}
            </span>
            <span className="ir-tab-section-title">
              Errors ({result.errors.length})
            </span>
          </button>

          {expandedSections.has('errors') && (
            <div className="ir-tab-section-content">
              {result.errors.map((err, idx) => (
                <div
                  key={idx}
                  className={`ir-tab-error-item ${selectedErrorIdx === idx ? 'expanded' : ''}`}
                >
                  <button
                    className="ir-tab-error-header"
                    onClick={() => setSelectedErrorIdx(selectedErrorIdx === idx ? null : idx)}
                    type="button"
                  >
                    <span className="ir-tab-error-code">{err.code}</span>
                    {err.where?.blockId !== undefined && err.where.blockId.length > 0 && (
                      <span className="ir-tab-error-location">
                        @ {err.where.blockId}
                        {err.where.port !== undefined && err.where.port.length > 0 ? `.${err.where.port}` : ''}
                      </span>
                    )}
                  </button>

                  {selectedErrorIdx === idx && (
                    <div className="ir-tab-error-details">
                      <div className="ir-tab-error-message">{err.message}</div>
                      {err.where !== undefined && err.where !== null && (
                        <div className="ir-tab-error-where">
                          <pre>{JSON.stringify(err.where, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Warnings Section */}
      {result?.irWarnings !== undefined && result.irWarnings !== null && result.irWarnings.length > 0 && (
        <section className="ir-tab-section ir-tab-section-warnings">
          <button
            className="ir-tab-section-header ir-tab-section-header-warning"
            onClick={() => toggleSection('warnings')}
            type="button"
          >
            <span className="ir-tab-section-icon">
              {expandedSections.has('warnings') ? '▼' : '▶'}
            </span>
            <span className="ir-tab-section-title">
              Warnings ({result.irWarnings.length})
            </span>
          </button>

          {expandedSections.has('warnings') && (
            <div className="ir-tab-section-content">
              {result.irWarnings.map((warn, idx) => (
                <div key={idx} className="ir-tab-warning-item">
                  <span className="ir-tab-warning-code">{warn.code}</span>
                  <span className="ir-tab-warning-message">{warn.message}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Source Blocks - Always visible */}
      <section className="ir-tab-section">
        <button
          className="ir-tab-section-header"
          onClick={() => toggleSection('blocks')}
          type="button"
        >
          <span className="ir-tab-section-icon">
            {expandedSections.has('blocks') ? '▼' : '▶'}
          </span>
          <span className="ir-tab-section-title">Source Blocks ({blocks.length})</span>
        </button>

        {expandedSections.has('blocks') && (
          <div className="ir-tab-section-content">
            {blocks.length === 0 ? (
              <div className="ir-tab-empty-section">No blocks in patch</div>
            ) : (
              <div className="ir-tab-block-list">
                {blocks.map((block) => {
                  // Check if this block has errors
                  const blockErrors = result?.errors.filter(e => e.where?.blockId === block.id) ?? [];
                  const hasError = blockErrors.length > 0;

                  return (
                    <div key={block.id} className={`ir-tab-block-item ${hasError ? 'has-error' : ''}`}>
                      <button
                        className={`ir-tab-block-button ${selectedBlockId === block.id ? 'active' : ''}`}
                        onClick={() => setSelectedBlockId(selectedBlockId === block.id ? null : block.id)}
                        type="button"
                      >
                        <span className="ir-tab-block-id">{block.id}</span>
                        <span className="ir-tab-block-type">{block.type}</span>
                        {hasError && <span className="ir-tab-block-error-badge">!</span>}
                      </button>

                      {selectedBlockId === block.id && (
                        <div className="ir-tab-block-details">
                          <div className="ir-tab-detail-row">
                            <span className="ir-tab-detail-label">Type:</span>
                            <span className="ir-tab-detail-value">{block.type}</span>
                          </div>

                          {block.inputs.length > 0 && (
                            <div className="ir-tab-detail-row">
                              <span className="ir-tab-detail-label">Inputs:</span>
                              <ul className="ir-tab-detail-list">
                                {block.inputs.map(input => {
                                  const conn = connections.find(c => c.to.blockId === block.id && c.to.slotId === input.id);
                                  const listener = listeners.find(l => l.to.blockId === block.id && l.to.slotId === input.id);
                                  return (
                                    <li key={input.id} className="ir-tab-port-item">
                                      <span className="ir-tab-port-name">{input.id}</span>
                                      <span className="ir-tab-port-type">{input.type}</span>
                                      {conn !== undefined && (
                                        <span className="ir-tab-port-source">
                                          ← {conn.from.blockId}.{conn.from.slotId}
                                        </span>
                                      )}
                                      {listener !== undefined && (
                                        <span className="ir-tab-port-bus">
                                          ← bus:{listener.busId}
                                        </span>
                                      )}
                                      {conn === undefined && listener === undefined && (
                                        <span className="ir-tab-port-unconnected">unconnected</span>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}

                          {block.outputs.length > 0 && (
                            <div className="ir-tab-detail-row">
                              <span className="ir-tab-detail-label">Outputs:</span>
                              <ul className="ir-tab-detail-list">
                                {block.outputs.map(output => {
                                  const conns = connections.filter(c => c.from.blockId === block.id && c.from.slotId === output.id);
                                  const pubs = publishers.filter(p => p.from.blockId === block.id && p.from.slotId === output.id);
                                  return (
                                    <li key={output.id} className="ir-tab-port-item">
                                      <span className="ir-tab-port-name">{output.id}</span>
                                      <span className="ir-tab-port-type">{output.type}</span>
                                      {conns.map((conn, i) => (
                                        <span key={i} className="ir-tab-port-dest">
                                          → {conn.to.blockId}.{conn.to.slotId}
                                        </span>
                                      ))}
                                      {pubs.map((pub, i) => (
                                        <span key={i} className="ir-tab-port-bus">
                                          → bus:{pub.busId}
                                        </span>
                                      ))}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}

                          {Object.keys(block.params).length > 0 && (
                            <div className="ir-tab-detail-row">
                              <span className="ir-tab-detail-label">Params:</span>
                              <pre className="ir-tab-params-json">
                                {JSON.stringify(block.params, null, 2)}
                              </pre>
                            </div>
                          )}

                          {blockErrors.length > 0 && (
                            <div className="ir-tab-detail-row ir-tab-block-errors">
                              <span className="ir-tab-detail-label">Errors:</span>
                              <ul className="ir-tab-detail-list">
                                {blockErrors.map((err, i) => (
                                  <li key={i} className="ir-tab-block-error">
                                    <span className="ir-tab-error-code">{err.code}</span>
                                    <span className="ir-tab-error-message">{err.message}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Connections */}
      <section className="ir-tab-section">
        <button
          className="ir-tab-section-header"
          onClick={() => toggleSection('connections')}
          type="button"
        >
          <span className="ir-tab-section-icon">
            {expandedSections.has('connections') ? '▼' : '▶'}
          </span>
          <span className="ir-tab-section-title">Connections ({connections.length})</span>
        </button>

        {expandedSections.has('connections') && (
          <div className="ir-tab-section-content">
            {connections.length === 0 ? (
              <div className="ir-tab-empty-section">No connections</div>
            ) : (
              <div className="ir-tab-connection-list">
                {connections.map((conn, idx) => {
                  const connError = result?.errors.find(e =>
                    e.where?.connection?.from?.block === conn.from.blockId &&
                    e.where?.connection?.to?.block === conn.to.blockId
                  );
                  return (
                    <div key={idx} className={`ir-tab-connection-item ${connError !== undefined ? 'has-error' : ''}`}>
                      <span className="ir-tab-conn-from">
                        {conn.from.blockId}.{conn.from.slotId}
                      </span>
                      <span className="ir-tab-conn-arrow">→</span>
                      <span className="ir-tab-conn-to">
                        {conn.to.blockId}.{conn.to.slotId}
                      </span>
                      {connError !== undefined && (
                        <span className="ir-tab-conn-error" title={connError.message}>
                          {connError.code}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Buses & Routing */}
      <section className="ir-tab-section">
        <button
          className="ir-tab-section-header"
          onClick={() => toggleSection('buses')}
          type="button"
        >
          <span className="ir-tab-section-icon">
            {expandedSections.has('buses') ? '▼' : '▶'}
          </span>
          <span className="ir-tab-section-title">
            Buses ({buses.length}) / Publishers ({publishers.length}) / Listeners ({listeners.length})
          </span>
        </button>

        {expandedSections.has('buses') && (
          <div className="ir-tab-section-content">
            {buses.length === 0 ? (
              <div className="ir-tab-empty-section">No buses</div>
            ) : (
              <div className="ir-tab-bus-list">
                {buses.map((bus) => {
                  const busPubs = publishers.filter(p => p.busId === bus.id);
                  const busListeners = listeners.filter(l => l.busId === bus.id);
                  return (
                    <div key={bus.id} className="ir-tab-bus-item">
                      <div className="ir-tab-bus-header">
                        <span className="ir-tab-bus-id">{bus.id}</span>
                        <span className="ir-tab-bus-name">{bus.name}</span>
                        <span className="ir-tab-bus-type">{`${bus.type.world}:${bus.type.domain}`}</span>
                      </div>
                      {busPubs.length > 0 && (
                        <div className="ir-tab-bus-pubs">
                          Publishers: {busPubs.map(p => `${p.from.blockId}.${p.from.slotId}`).join(', ')}
                        </div>
                      )}
                      {busListeners.length > 0 && (
                        <div className="ir-tab-bus-listeners">
                          Listeners: {busListeners.map(l => `${l.to.blockId}.${l.to.slotId}`).join(', ')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Intermediate IR (LinkedGraphIR) - Available before final codegen */}
      {result?.ir !== undefined && result.ir !== null && (
        <section className="ir-tab-section">
          <button
            className="ir-tab-section-header"
            onClick={() => toggleSection('linkedIR')}
            type="button"
          >
            <span className="ir-tab-section-icon">
              {expandedSections.has('linkedIR') ? '▼' : '▶'}
            </span>
            <span className="ir-tab-section-title">Intermediate IR (LinkedGraphIR)</span>
          </button>

          {expandedSections.has('linkedIR') && (
            <div className="ir-tab-section-content">
              <pre className="ir-tab-ir-json">
                {JSON.stringify(result.ir, null, 2)}
              </pre>
            </div>
          )}
        </section>
      )}

      {/* Final Compiled IR - Only on success */}
      {result?.programIR !== undefined && result.programIR !== null && (
        <section className="ir-tab-section">
          <button
            className="ir-tab-section-header"
            onClick={() => toggleSection('programIR')}
            type="button"
          >
            <span className="ir-tab-section-icon">
              {expandedSections.has('programIR') ? '▼' : '▶'}
            </span>
            <span className="ir-tab-section-title">Compiled Program IR</span>
          </button>

          {expandedSections.has('programIR') && (
            <div className="ir-tab-section-content">
              <div className="ir-tab-programir-summary">
                <div>IR Version: {result.programIR.irVersion}</div>
                <div>Patch ID: {result.programIR.patchId}</div>
                <div>Seed: {result.programIR.seed}</div>
                <div>Time Model: {result.programIR.timeModel.kind}</div>
                <div>Nodes: {result.programIR.nodes?.nodes?.length ?? 0}</div>
                <div>Buses: {result.programIR.buses?.buses?.length ?? 0}</div>
                <div>Schedule Steps: {result.programIR.schedule?.steps?.length ?? 0}</div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
});
