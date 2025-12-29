/**
 * IR Tab Component
 *
 * Displays the compiled IR structure:
 * - IR summary header (irVersion, patchId, seed)
 * - Collapsible "Nodes" section listing all nodes
 * - Collapsible "Buses" section listing all buses
 * - Collapsible "Time Model" section showing kind and parameters
 */

import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import type { CompiledProgramIR } from '../compiler/ir';
import './IRTab.css';

/**
 * Get the latest compile result from window.__compilerService
 */
function getCompileResult(): { programIR?: CompiledProgramIR } | null {
  const compilerService = (window as unknown as { __compilerService?: { getLatestResult(): unknown } }).__compilerService;
  if (!compilerService) return null;

  const result = compilerService.getLatestResult();
  if (!result || typeof result !== 'object') return null;

  return result as { programIR?: CompiledProgramIR };
}

export const IRTab = observer(function IRTab() {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['nodes']));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const result = getCompileResult();
  const programIR = result?.programIR;

  if (!programIR) {
    return (
      <div className="ir-tab">
        <div className="ir-tab-empty">
          No IR available. Create a patch with blocks to see compiled IR.
        </div>
      </div>
    );
  }

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const nodes = programIR.nodes?.nodes ?? [];
  const buses = programIR.buses?.buses ?? [];

  return (
    <div className="ir-tab">
      {/* Summary Header */}
      <div className="ir-tab-header">
        <div className="ir-tab-header-item">
          <span className="ir-tab-header-label">IR Version:</span>
          <span className="ir-tab-header-value">{programIR.irVersion}</span>
        </div>
        <div className="ir-tab-header-item">
          <span className="ir-tab-header-label">Patch ID:</span>
          <span className="ir-tab-header-value ir-tab-header-mono">{programIR.patchId}</span>
        </div>
        <div className="ir-tab-header-item">
          <span className="ir-tab-header-label">Seed:</span>
          <span className="ir-tab-header-value">{programIR.seed}</span>
        </div>
      </div>

      {/* Nodes Section */}
      <section className="ir-tab-section">
        <button
          className="ir-tab-section-header"
          onClick={() => toggleSection('nodes')}
          type="button"
        >
          <span className="ir-tab-section-icon">
            {expandedSections.has('nodes') ? '▼' : '▶'}
          </span>
          <span className="ir-tab-section-title">Nodes ({nodes.length})</span>
        </button>

        {expandedSections.has('nodes') && (
          <div className="ir-tab-section-content">
            {nodes.length === 0 ? (
              <div className="ir-tab-empty-section">No nodes</div>
            ) : (
              <div className="ir-tab-node-list">
                {nodes.map((node) => (
                  <div key={node.id} className="ir-tab-node-item">
                    <button
                      className={`ir-tab-node-button ${selectedNodeId === node.id ? 'active' : ''}`}
                      onClick={() => setSelectedNodeId(selectedNodeId === node.id ? null : node.id)}
                      type="button"
                    >
                      <span className="ir-tab-node-id">{node.id}</span>
                      <span className="ir-tab-node-type">typeId={node.typeId}</span>
                    </button>

                    {selectedNodeId === node.id && (
                      <div className="ir-tab-node-details">
                        <div className="ir-tab-node-detail-section">
                          <div className="ir-tab-node-detail-label">Input Count:</div>
                          <span>{node.inputCount}</span>
                        </div>
                        <div className="ir-tab-node-detail-section">
                          <div className="ir-tab-node-detail-label">Output Count:</div>
                          <span>{node.outputCount}</span>
                        </div>
                        {node.compilerTag !== undefined && (
                          <div className="ir-tab-node-detail-section">
                            <div className="ir-tab-node-detail-label">Compiler Tag:</div>
                            <span>{node.compilerTag}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Buses Section */}
      <section className="ir-tab-section">
        <button
          className="ir-tab-section-header"
          onClick={() => toggleSection('buses')}
          type="button"
        >
          <span className="ir-tab-section-icon">
            {expandedSections.has('buses') ? '▼' : '▶'}
          </span>
          <span className="ir-tab-section-title">Buses ({buses.length})</span>
        </button>

        {expandedSections.has('buses') && (
          <div className="ir-tab-section-content">
            {buses.length === 0 ? (
              <div className="ir-tab-empty-section">No buses</div>
            ) : (
              <div className="ir-tab-bus-list">
                {buses.map((bus) => (
                  <div key={bus.id} className="ir-tab-bus-item">
                    <span className="ir-tab-bus-id">{bus.id}</span>
                    {bus.type !== undefined && (
                      <span className="ir-tab-bus-type">
                        ({typeof bus.type === 'object' ? JSON.stringify(bus.type) : String(bus.type)})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Time Model Section */}
      <section className="ir-tab-section">
        <button
          className="ir-tab-section-header"
          onClick={() => toggleSection('timeModel')}
          type="button"
        >
          <span className="ir-tab-section-icon">
            {expandedSections.has('timeModel') ? '▼' : '▶'}
          </span>
          <span className="ir-tab-section-title">Time Model</span>
        </button>

        {expandedSections.has('timeModel') && (
          <div className="ir-tab-section-content">
            <div className="ir-tab-time-model">
              <div className="ir-tab-time-model-item">
                <span className="ir-tab-time-model-label">Kind:</span>
                <span className="ir-tab-time-model-value">{programIR.timeModel.kind}</span>
              </div>

              {programIR.timeModel.kind === 'cyclic' && 'periodMs' in programIR.timeModel && (
                <div className="ir-tab-time-model-item">
                  <span className="ir-tab-time-model-label">Period:</span>
                  <span className="ir-tab-time-model-value">{programIR.timeModel.periodMs}ms</span>
                </div>
              )}

              {programIR.timeModel.kind === 'finite' && 'durationMs' in programIR.timeModel && (
                <div className="ir-tab-time-model-item">
                  <span className="ir-tab-time-model-label">Duration:</span>
                  <span className="ir-tab-time-model-value">{programIR.timeModel.durationMs}ms</span>
                </div>
              )}

              {programIR.timeModel.kind === 'infinite' && 'windowMs' in programIR.timeModel && (
                <div className="ir-tab-time-model-item">
                  <span className="ir-tab-time-model-label">Window:</span>
                  <span className="ir-tab-time-model-value">{programIR.timeModel.windowMs}ms</span>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
});
