/**
 * SaveCompositeDialog Component
 *
 * Dialog for saving selected blocks as a custom composite.
 * Allows user to name the composite, set description, choose subcategory,
 * and select which ports and parameters to expose.
 */

import { useState, useEffect, useMemo } from 'react';
import type { Block, Connection, Composite, ExposedParam } from '../types';
import type { ExposedPort } from '../composites';
import { getTypeDesc } from '../semantic';
import {
  detectExposedPorts,
  detectExposableParameters,
  validateCompositeName,
  createCompositeFromSelection,
  generateCompositeId,
  
} from '../composite-utils';
import './SaveCompositeDialog.css';

interface SaveCompositeDialogProps {
  /** Selected blocks to include in the composite */
  selectedBlocks: Block[];
  /** All connections in the patch (to filter internal ones) */
  allConnections: Connection[];
  /** Existing composites (for duplicate detection) */
  existingComposites: Composite[];
  /** Callback when save is clicked */
  onSave: (composite: Composite, exposedInputs: ExposedPort[], exposedOutputs: ExposedPort[]) => void;
  /** Callback when cancel is clicked */
  onCancel: () => void;
}

const SUBCATEGORIES = [
  { value: 'Domain', label: 'Domain' },
  { value: 'Signal', label: 'Signal' },
  { value: 'Field', label: 'Field' },
  { value: 'Render', label: 'Render' },
  { value: 'Other', label: 'Other' },
];

type Tab = 'ports' | 'parameters';

export function SaveCompositeDialog({
  selectedBlocks,
  allConnections,
  existingComposites,
  onSave,
  onCancel,
}: SaveCompositeDialogProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('ports');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [subcategory, setSubcategory] = useState('Other');
  const [nameError, setNameError] = useState<string | undefined>();

  // Auto-detect exposed ports
  const detectedPorts = useMemo(
    () => detectExposedPorts(selectedBlocks, allConnections),
    [selectedBlocks, allConnections]
  );
  const [exposedInputIds, setExposedInputIds] = useState<Set<string>>(
    () => new Set(detectedPorts.inputs.map(p => p.id))
  );
  const [exposedOutputIds, setExposedOutputIds] = useState<Set<string>>(
    () => new Set(detectedPorts.outputs.map(p => p.id))
  );

  // Auto-detect exposable parameters
  const detectedParams = useMemo(
    () => detectExposableParameters(selectedBlocks),
    [selectedBlocks]
  );

  // Track which parameters are exposed and their custom labels
  const [exposedParamIds, setExposedParamIds] = useState<Set<string>>(new Set());
  const [paramLabels, setParamLabels] = useState<Map<string, string>>(new Map());

  // Validate name on change
  useEffect(() => {
    if (name.trim() === '') {
      setNameError(undefined);
      return;
    }
    const validation = validateCompositeName(name, existingComposites);
    setNameError(validation.error);
  }, [name, existingComposites]);

  const handleToggleInput = (portId: string) => {
    setExposedInputIds(prev => {
      const next = new Set(prev);
      if (next.has(portId)) {
        next.delete(portId);
      } else {
        next.add(portId);
      }
      return next;
    });
  };

  const handleToggleOutput = (portId: string) => {
    setExposedOutputIds(prev => {
      const next = new Set(prev);
      if (next.has(portId)) {
        next.delete(portId);
      } else {
        next.add(portId);
      }
      return next;
    });
  };

  const handleToggleParam = (paramId: string) => {
    setExposedParamIds(prev => {
      const next = new Set(prev);
      if (next.has(paramId)) {
        next.delete(paramId);
      } else {
        next.add(paramId);
      }
      return next;
    });
  };

  const handleParamLabelChange = (paramId: string, label: string) => {
    setParamLabels(prev => {
      const next = new Map(prev);
      next.set(paramId, label);
      return next;
    });
  };

  const handleSave = () => {
    const validation = validateCompositeName(name, existingComposites);
    if (!validation.valid) {
      setNameError(validation.error);
      return;
    }

    // Build exposedParams array from selected parameters
    const exposedParams: ExposedParam[] = Array.from(exposedParamIds)
      .map(paramId => {
        const param = detectedParams.find(p => p.id === paramId);
        if (!param) return null;

        return {
          id: paramId,
          label: paramLabels.get(paramId) || param.label,
          blockId: param.blockId,
          paramKey: param.paramKey,
        };
      })
      .filter((p): p is ExposedParam => p !== null);

    const composite = createCompositeFromSelection(
      name,
      description || undefined,
      subcategory,
      selectedBlocks,
      allConnections,
      exposedInputIds,
      exposedOutputIds,
      exposedParams
    );

    // Filter exposed ports to only include selected ones
    const finalInputs = detectedPorts.inputs.filter(p => exposedInputIds.has(p.id));
    const finalOutputs = detectedPorts.outputs.filter(p => exposedOutputIds.has(p.id));

    onSave(composite, finalInputs, finalOutputs);
  };

  const canSave = name.trim() !== '' && !nameError;

  return (
    <div className="save-composite-dialog-overlay" onClick={onCancel}>
      <div className="save-composite-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="save-composite-dialog__header">
          <h2>Save as Composite</h2>
          <button
            className="save-composite-dialog__close"
            onClick={onCancel}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="save-composite-dialog__body">
          {/* Name */}
          <div className="save-composite-dialog__field">
            <label htmlFor="composite-name">
              Name <span className="required">*</span>
            </label>
            <input
              id="composite-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Custom Composite"
              autoFocus
            />
            {nameError && <div className="save-composite-dialog__error">{nameError}</div>}
            {name && !nameError && (
              <div className="save-composite-dialog__hint">
                ID: {generateCompositeId(name)}
              </div>
            )}
          </div>

          {/* Description */}
          <div className="save-composite-dialog__field">
            <label htmlFor="composite-description">Description</label>
            <textarea
              id="composite-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
            />
          </div>

          {/* Subcategory */}
          <div className="save-composite-dialog__field">
            <label htmlFor="composite-subcategory">Subcategory</label>
            <select
              id="composite-subcategory"
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
            >
              {SUBCATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Tab Navigation */}
          <div className="save-composite-dialog__tabs">
            <button
              className={`save-composite-dialog__tab ${activeTab === 'ports' ? 'active' : ''}`}
              onClick={() => setActiveTab('ports')}
            >
              Ports
            </button>
            <button
              className={`save-composite-dialog__tab ${activeTab === 'parameters' ? 'active' : ''}`}
              onClick={() => setActiveTab('parameters')}
            >
              Parameters {detectedParams.length > 0 && `(${detectedParams.length})`}
            </button>
          </div>

          {/* Ports Tab */}
          {activeTab === 'ports' && (
            <>
              {/* Exposed Inputs */}
              {detectedPorts.inputs.length > 0 && (
                <div className="save-composite-dialog__field">
                  <label>Exposed Inputs</label>
                  <div className="save-composite-dialog__port-list">
                    {detectedPorts.inputs.map(port => {
                      const typeDesc = getTypeDesc(port.slotType);
                      return (
                        <label key={port.id} className="save-composite-dialog__port-item">
                          <input
                            type="checkbox"
                            checked={exposedInputIds.has(port.id)}
                            onChange={() => handleToggleInput(port.id)}
                          />
                          <span>{port.label}</span>
                          <span className="save-composite-dialog__port-type">
                            {typeDesc ? `${typeDesc.world}.${typeDesc.domain}` : String(port.slotType)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Exposed Outputs */}
              {detectedPorts.outputs.length > 0 && (
                <div className="save-composite-dialog__field">
                  <label>Exposed Outputs</label>
                  <div className="save-composite-dialog__port-list">
                    {detectedPorts.outputs.map(port => {
                      const typeDesc = getTypeDesc(port.slotType);
                      return (
                        <label key={port.id} className="save-composite-dialog__port-item">
                          <input
                            type="checkbox"
                            checked={exposedOutputIds.has(port.id)}
                            onChange={() => handleToggleOutput(port.id)}
                          />
                          <span>{port.label}</span>
                          <span className="save-composite-dialog__port-type">
                            {typeDesc ? `${typeDesc.world}.${typeDesc.domain}` : String(port.slotType)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Parameters Tab */}
          {activeTab === 'parameters' && (
            <div className="save-composite-dialog__field">
              <label>Exposable Parameters</label>
              {detectedParams.length === 0 ? (
                <div className="save-composite-dialog__hint">
                  No parameters found in selected blocks.
                </div>
              ) : (
                <div className="save-composite-dialog__param-list">
                  {detectedParams.map(param => {
                    const isExposed = exposedParamIds.has(param.id);
                    const customLabel = paramLabels.get(param.id) || param.label;

                    return (
                      <div key={param.id} className="save-composite-dialog__param-item">
                        <label className="save-composite-dialog__param-checkbox">
                          <input
                            type="checkbox"
                            checked={isExposed}
                            onChange={() => handleToggleParam(param.id)}
                          />
                          <div className="save-composite-dialog__param-info">
                            <span className="save-composite-dialog__param-label">
                              {param.label}
                            </span>
                            <span className="save-composite-dialog__param-type">
                              {param.schema.type}
                            </span>
                          </div>
                        </label>
                        {isExposed && (
                          <input
                            type="text"
                            className="save-composite-dialog__param-name-input"
                            placeholder="Custom label (optional)"
                            value={customLabel}
                            onChange={(e) => handleParamLabelChange(param.id, e.target.value)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Block Count */}
          <div className="save-composite-dialog__info">
            {selectedBlocks.length} block{selectedBlocks.length !== 1 ? 's' : ''} selected
          </div>
        </div>

        <div className="save-composite-dialog__footer">
          <button
            className="save-composite-dialog__button save-composite-dialog__button--secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="save-composite-dialog__button save-composite-dialog__button--primary"
            onClick={handleSave}
            disabled={!canSave}
          >
            Save Composite
          </button>
        </div>
      </div>
    </div>
  );
}
