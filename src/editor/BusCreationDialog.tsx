/**
 * BusCreationDialog Component
 *
 * Modal dialog for creating new buses with three entry paths:
 * 1. From Bus Board "New Bus" button
 * 2. From output port (auto-publish after creation)
 * 3. From input port (auto-subscribe after creation)
 */

import { observer } from 'mobx-react-lite';
import { useState, useEffect, useCallback } from 'react';
import { useStore } from './stores';
import type { TypeDesc, BusCombineMode, CoreDomain } from './types';
import type { RootStore } from './stores/RootStore';
import { isBusEligible } from './types';
import { isNonEmptyString } from './types/helpers';
import './BusCreationDialog.css';

interface BusCreationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (busId: string) => void;

  // For pre-filling when creating from output/input port
  suggestedType?: TypeDesc;
  suggestedName?: string;

  // For context-aware naming
  sourceBlockLabel?: string;
  sourcePortName?: string;

  // For auto-publish/subscribe after creation
  autoPublishFromBlock?: string;
  autoPublishFromPort?: string;
  autoSubscribeToBlock?: string;
  autoSubscribeToPort?: string;
}

/**
 * Default bus names by domain (per spec).
 */
const DEFAULT_BUS_NAMES: Record<CoreDomain, string> = {
  number: 'energy',
  vec2: 'position',
  vec3: 'cam',
  color: 'palette',
  phase: 'phaseA',
  phase01: 'phaseA',
  time: 'clock',
  rate: 'speed',
  trigger: 'pulse',
  boolean: 'gate',
};

/**
 * Default combine modes by domain (per spec).
 */
const DEFAULT_COMBINE_MODES: Record<CoreDomain, BusCombineMode> = {
  number: 'sum',
  vec2: 'sum',
  vec3: 'last',
  color: 'layer',
  phase01: 'last',
  phase: 'last',
  time: 'last',
  rate: 'last',
  trigger: 'last', // Note: spec says "or" but type system uses 'last' for now
  boolean: 'last', // Note: spec says "or" but type system uses 'last' for now
};

/**
 * Get combine mode options for a domain (per spec).
 */
function getCombineModeOptions(domain: CoreDomain): BusCombineMode[] {
  const options: Record<CoreDomain, BusCombineMode[]> = {
    number: ['sum', 'average', 'max', 'min', 'last'],
    vec2: ['sum', 'average', 'last'],
    vec3: ['sum', 'average', 'last'],
    phase01: ['last'],
    color: ['layer', 'last'],
    phase: ['last'],
    time: ['last'],
    rate: ['last'],
    trigger: ['last'], // Note: "or" in spec but not in type system yet
    boolean: ['last'], // Note: "or" in spec but not in type system yet
  };
  return options[domain] ?? ['last'];
}

/**
 * Core bus-eligible Signal types only.
 */
const CORE_SIGNAL_TYPES: Array<{ domain: CoreDomain; label: string }> = [
  { domain: 'number', label: 'Number (scalar)' },
  { domain: 'vec2', label: 'Vec2 (2D position/vector)' },
  { domain: 'color', label: 'Color' },
  { domain: 'boolean', label: 'Boolean (true/false)' },
  { domain: 'time', label: 'Time (seconds)' },
  { domain: 'phase', label: 'Phase [0,1]' },
  { domain: 'rate', label: 'Rate (multiplier)' },
  { domain: 'trigger', label: 'Trigger (pulse/event)' },
];

/**
 * Check if a bus name already exists (case-insensitive).
 */
function busNameExists(store: RootStore, name: string): boolean {
  const lowerName = name.toLowerCase().trim();
  return store.busStore.buses.some((b) => b.name.toLowerCase() === lowerName);
}

/**
 * Sanitize a name for use as a bus name.
 * Converts to lowercase, replaces spaces with underscores.
 * Returns empty string if sanitization fails.
 */
function sanitizeName(name: string): string {
  const sanitized = name.toLowerCase().replace(/\s+/g, '_').trim();
  // Only allow alphanumeric, underscore, hyphen
  if (!/^[a-z0-9_-]+$/.test(sanitized)) {
    return '';
  }
  return sanitized;
}

/**
 * Generate a context-aware bus name from block label and port name.
 * Returns empty string if sanitization fails or inputs are invalid.
 */
function generateContextAwareName(blockLabel?: string, portName?: string): string {
  if (blockLabel === undefined || blockLabel === null || blockLabel === '') {
    return '';
  }

  // Try block_port pattern first
  if (portName !== undefined && portName !== null && portName !== '') {
    const combined = `${blockLabel}_${portName}`;
    const sanitized = sanitizeName(combined);
    if (sanitized) return sanitized;
  }

  // Fallback to just block label
  return sanitizeName(blockLabel);
}

/**
 * Generate a unique bus name based on a base name.
 * Handles collision by appending letter (A-Z) or number.
 *
 * Collision sequence:
 * - "energy" exists → "energyA"
 * - "energyA" exists → "energyB"
 * - "energyZ" exists → "energy1"
 * - "energy1" exists → "energy2"
 *
 * For names ending with a letter:
 * - "phaseA" exists → "phaseB"
 * - "phaseZ" exists → "phase1"
 */
function generateUniqueBusName(baseName: string, existingNames: string[]): string {
  const normalizedExisting = existingNames.map(n => n.toLowerCase());

  // If base name is unique, use it
  if (!normalizedExisting.includes(baseName.toLowerCase())) {
    return baseName;
  }

  // Check if base name ends with a letter (A-Z)
  const letterMatch = baseName.match(/^(.+?)([A-Z])$/);

  if (letterMatch) {
    // Base name ends with a letter, increment it
    const prefix = letterMatch[1];
    const currentLetter = letterMatch[2];
    const currentCode = currentLetter.charCodeAt(0);

    // Try next letters
    for (let code = currentCode + 1; code <= 'Z'.charCodeAt(0); code++) {
      const candidate = prefix + String.fromCharCode(code);
      if (!normalizedExisting.includes(candidate.toLowerCase())) {
        return candidate;
      }
    }

    // All letters exhausted, start with numbers
    const numericPrefix = prefix.replace(/[A-Z]$/, '');
    for (let i = 1; i < 1000; i++) {
      const candidate = `${numericPrefix}${i}`;
      if (!normalizedExisting.includes(candidate.toLowerCase())) {
        return candidate;
      }
    }
  } else {
    // Base name doesn't end with a letter
    // Try appending A-Z first
    for (let code = 'A'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code++) {
      const candidate = baseName + String.fromCharCode(code);
      if (!normalizedExisting.includes(candidate.toLowerCase())) {
        return candidate;
      }
    }

    // All letters exhausted, use numbers
    for (let i = 1; i < 1000; i++) {
      const candidate = `${baseName}${i}`;
      if (!normalizedExisting.includes(candidate.toLowerCase())) {
        return candidate;
      }
    }
  }

  // Fallback (should never reach here)
  return baseName + '_' + Date.now();
}

/**
 * Generate the initial suggested name for a new bus.
 * Priority:
 * 1. Context-aware from block/port (if available and valid)
 * 2. Suggested name (if provided)
 * 3. Default by domain
 * Then make it unique by handling collisions.
 */
function generateInitialName(
  store: RootStore,
  domain: CoreDomain,
  suggestedName?: string,
  blockLabel?: string,
  portName?: string
): string {
  const existingNames = store.busStore.buses.map(b => b.name);

  // Try context-aware naming first
  if (isNonEmptyString(blockLabel)) {
    const contextName = generateContextAwareName(blockLabel, portName);
    if (contextName) {
      return generateUniqueBusName(contextName, existingNames);
    }
  }

  // Use suggested name if provided
  if (isNonEmptyString(suggestedName)) {
    const sanitized = sanitizeName(suggestedName);
    if (sanitized) {
      return generateUniqueBusName(sanitized, existingNames);
    }
  }

  // Fallback to domain default
  const defaultName = DEFAULT_BUS_NAMES[domain];
  return generateUniqueBusName(defaultName, existingNames);
}

/**
 * Bus creation dialog.
 */
export const BusCreationDialog = observer((props: BusCreationDialogProps): React.ReactElement | null => {
  const store = useStore();
  const {
    isOpen,
    onClose,
    onCreated,
    suggestedType,
    suggestedName,
    sourceBlockLabel,
    sourcePortName,
    autoPublishFromBlock,
    autoPublishFromPort,
    autoSubscribeToBlock,
    autoSubscribeToPort,
  } = props;

  // Determine initial type from suggestion or default to number
  // Use useCallback to make this stable for the useEffect dependency array
  const getInitialDomain = useCallback((): CoreDomain => {
    if (suggestedType && isBusEligible(suggestedType)) {
      return suggestedType.domain as CoreDomain;
    }
    return 'number';
  }, [suggestedType]);

  const [selectedDomain, setSelectedDomain] = useState<CoreDomain>(getInitialDomain());
  const [busName, setBusName] = useState<string>('');
  const [combineMode, setCombineMode] = useState<BusCombineMode>('last');
  const [validationError, setValidationError] = useState<string>('');
  const [userHasEdited, setUserHasEdited] = useState<boolean>(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      const domain = getInitialDomain();
      setSelectedDomain(domain);

      // Generate initial name with auto-suggestion
      const initialName = generateInitialName(
        store,
        domain,
        suggestedName,
        sourceBlockLabel,
        sourcePortName
      );
      setBusName(initialName);

      // Set combine mode: default by domain
      setCombineMode(DEFAULT_COMBINE_MODES[domain]);

      setValidationError('');
      setUserHasEdited(false);
    }
  }, [isOpen, getInitialDomain, store, suggestedName, sourceBlockLabel, sourcePortName]);

  // Update combine mode when domain changes
  useEffect(() => {
    setCombineMode(DEFAULT_COMBINE_MODES[selectedDomain]);
  }, [selectedDomain]);

  const handleDomainChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const domain = e.target.value as CoreDomain;
    setSelectedDomain(domain);

    // Update name only if user hasn't manually edited it
    if (!userHasEdited) {
      const newName = generateInitialName(
        store,
        domain,
        suggestedName,
        sourceBlockLabel,
        sourcePortName
      );
      setBusName(newName);
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBusName(e.target.value);
    setValidationError('');
    setUserHasEdited(true);
  };

  const handleCreate = () => {
    // Validation
    const trimmedName = busName.trim();

    if (!trimmedName) {
      setValidationError('Bus name cannot be empty');
      return;
    }

    if (busNameExists(store, trimmedName)) {
      setValidationError(`Bus named "${trimmedName}" already exists (case-insensitive)`);
      return;
    }

    // Create TypeDesc for the bus
    const typeDesc: TypeDesc = {
      world: 'signal',
      domain: selectedDomain,
      category: 'core',
      busEligible: true,
    };

    // Create the bus
    const busId = store.busStore.createBus(typeDesc, trimmedName, combineMode);

    // Auto-publish if requested
    if (
      autoPublishFromBlock !== undefined &&
      autoPublishFromBlock !== null &&
      autoPublishFromPort !== undefined &&
      autoPublishFromPort !== null
    ) {
      store.busStore.addPublisher(busId, autoPublishFromBlock, autoPublishFromPort);
    }

    // Auto-subscribe if requested
    if (
      autoSubscribeToBlock !== undefined &&
      autoSubscribeToBlock !== null &&
      autoSubscribeToPort !== undefined &&
      autoSubscribeToPort !== null
    ) {
      store.busStore.addListener(busId, autoSubscribeToBlock, autoSubscribeToPort);
    }

    // Notify caller
    onCreated?.(busId);

    // Close dialog
    onClose();
  };

  const handleCancel = () => {
    setValidationError('');
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter' && !validationError) {
      handleCreate();
    }
  };

  if (!isOpen) return null;

  const combineOptions = getCombineModeOptions(selectedDomain);

  return (
    <div className="bus-creation-dialog-overlay" onClick={handleCancel}>
      <div
        className="bus-creation-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="bus-creation-dialog-header">
          <h2>Create New Bus</h2>
          <button className="bus-creation-close-btn" onClick={handleCancel} title="Close (Esc)">
            ×
          </button>
        </div>

        <div className="bus-creation-dialog-body">
          {/* Bus Name */}
          <div className="bus-creation-field">
            <label htmlFor="bus-name" className="bus-creation-label">
              Bus Name
            </label>
            <input
              id="bus-name"
              type="text"
              className="bus-creation-input"
              value={busName}
              onChange={handleNameChange}
              autoFocus
              placeholder="Enter bus name"
            />
            {validationError && <div className="bus-creation-error">{validationError}</div>}
          </div>

          {/* Type Picker (Signal types, core domains only) */}
          <div className="bus-creation-field">
            <label htmlFor="bus-type" className="bus-creation-label">
              Type
            </label>
            <select
              id="bus-type"
              className="bus-creation-select"
              value={selectedDomain}
              onChange={handleDomainChange}
            >
              {CORE_SIGNAL_TYPES.map(({ domain, label }) => (
                <option key={domain} value={domain}>
                  Signal&lt;{label}&gt;
                </option>
              ))}
            </select>
          </div>

          {/* Combine Mode Picker */}
          <div className="bus-creation-field">
            <label htmlFor="bus-combine-mode" className="bus-creation-label">
              Combine Mode
            </label>
            <select
              id="bus-combine-mode"
              className="bus-creation-select"
              value={combineMode}
              onChange={(e) => setCombineMode(e.target.value as BusCombineMode)}
            >
              {combineOptions.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
            <div className="bus-creation-hint">How to combine multiple publishers</div>
          </div>
        </div>

        <div className="bus-creation-dialog-footer">
          <button className="bus-creation-btn bus-creation-cancel-btn" onClick={handleCancel}>
            Cancel
          </button>
          <button
            className="bus-creation-btn bus-creation-create-btn"
            onClick={handleCreate}
            disabled={!!validationError || !busName.trim()}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
});
