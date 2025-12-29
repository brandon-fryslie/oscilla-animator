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

  const nodeEntries = Object.entries(programIR.nodes);
  const busEntries = Object.entries(programIR.buses);

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
          <span className="ir-tab-section-title">Nodes ({nodeEntries.length})</span>
        </button>

        {expandedSections.has('nodes') && (
          <div className="ir-tab-section-content">
            {nodeEntries.length === 0 ? (
              <div className="ir-tab-empty-section">No nodes</div>
            ) : (
              <div className="ir-tab-node-list">
                {nodeEntries.map(([nodeId, node]) => (
                  <div key={nodeId} className="ir-tab-node-item">
                    <button
                      className={`ir-tab-node-button ${selectedNodeId === nodeId ? 'active' : ''}`}
                      onClick={() => setSelectedNodeId(selectedNodeId === nodeId ? null : nodeId)}
                      type="button"
                    >
                      <span className="ir-tab-node-id">{nodeId}</span>
                      <span className="ir-tab-node-type">{node.type || 'unknown'}</span>
                    </button>

                    {selectedNodeId === nodeId && (
                      <div className="ir-tab-node-details">
                        {node.inputs && node.inputs.length > 0 && (
                          <div className="ir-tab-node-detail-section">
                            <div className="ir-tab-node-detail-label">Inputs:</div>
                            <ul className="ir-tab-node-detail-list">
                              {node.inputs.map((input: unknown, idx: number) => (
                                <li key={idx}>
                                  {typeof input === 'object' && input !== null
                                    ? JSON.stringify(input)
                                    : String(input)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {node.outputs && node.outputs.length > 0 && (
                          <div className="ir-tab-node-detail-section">
                            <div className="ir-tab-node-detail-label">Outputs:</div>
                            <ul className="ir-tab-node-detail-list">
                              {node.outputs.map((output: unknown, idx: number) => (
                                <li key={idx}>
                                  {typeof output === 'object' && output !== null
                                    ? JSON.stringify(output)
                                    : String(output)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {node.params && Object.keys(node.params).length > 0 && (
                          <div className="ir-tab-node-detail-section">
                            <div className="ir-tab-node-detail-label">Params:</div>
                            <ul className="ir-tab-node-detail-list">
                              {Object.entries(node.params).map(([key, value]) => (
                                <li key={key}>
                                  <span className="ir-tab-param-key">{key}:</span>{' '}
                                  {typeof value === 'object' && value !== null
                                    ? JSON.stringify(value)
                                    : String(value)}
                                </li>
                              ))}
                            </ul>
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
          <span className="ir-tab-section-title">Buses ({busEntries.length})</span>
        </button>

        {expandedSections.has('buses') && (
          <div className="ir-tab-section-content">
            {busEntries.length === 0 ? (
              <div className="ir-tab-empty-section">No buses</div>
            ) : (
              <div className="ir-tab-bus-list">
                {busEntries.map(([busId, bus]) => (
                  <div key={busId} className="ir-tab-bus-item">
                    <span className="ir-tab-bus-id">{busId}</span>
                    {bus.name && <span className="ir-tab-bus-name">"{bus.name}"</span>}
                    {bus.type && (
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
