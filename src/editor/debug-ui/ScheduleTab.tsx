/**
 * Schedule Tab Component
 *
 * Displays the execution schedule:
 * - Schedule summary header (step count, time model kind)
 * - List of all steps with kind, index, and key information
 * - Click-to-expand step details
 */

import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import type { CompiledProgramIR, StepIR } from '../compiler/ir';
import './ScheduleTab.css';

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

/**
 * Get color class for step kind
 */
function getStepKindColor(kind: string): string {
  switch (kind) {
    case 'timeDerive':
      return 'schedule-step-kind-time';
    case 'signalEval':
    case 'nodeEval':
      return 'schedule-step-kind-signal';
    case 'busEval':
    case 'eventBusEval':
      return 'schedule-step-kind-bus';
    case 'materialize':
    case 'materializeColor':
    case 'materializePath':
    case 'materializeTestGeometry':
      return 'schedule-step-kind-materialize';
    case 'renderAssemble':
      return 'schedule-step-kind-render';
    case 'debugProbe':
      return 'schedule-step-kind-debug';
    default:
      return 'schedule-step-kind-default';
  }
}

/**
 * Get short label for step kind
 */
function getStepKindLabel(kind: string): string {
  switch (kind) {
    case 'timeDerive':
      return 'TIME';
    case 'signalEval':
      return 'SIG';
    case 'nodeEval':
      return 'NODE';
    case 'busEval':
      return 'BUS';
    case 'eventBusEval':
      return 'EVENT';
    case 'materialize':
      return 'MATL';
    case 'materializeColor':
      return 'COLOR';
    case 'materializePath':
      return 'PATH';
    case 'materializeTestGeometry':
      return 'GEOM';
    case 'renderAssemble':
      return 'RNDR';
    case 'debugProbe':
      return 'DBG';
    default:
      return kind.toUpperCase().slice(0, 4);
  }
}

/**
 * Extract key information from a step for summary display
 */
function getStepSummary(step: StepIR): string {
  if ('node' in step && step.node) {
    return `node: ${step.node}`;
  }
  if ('slot' in step && step.slot !== undefined) {
    return `slot: ${step.slot}`;
  }
  if ('bus' in step && step.bus !== undefined) {
    return `bus: ${step.bus}`;
  }
  if ('expr' in step && step.expr !== undefined) {
    return `expr: ${step.expr}`;
  }
  return '';
}

export const ScheduleTab = observer(function ScheduleTab() {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const result = getCompileResult();
  const programIR = result?.programIR;

  if (!programIR) {
    return (
      <div className="schedule-tab">
        <div className="schedule-tab-empty">
          No schedule available. Create a patch with blocks to see execution schedule.
        </div>
      </div>
    );
  }

  const schedule = programIR.schedule;
  const steps = schedule?.steps || [];

  // Count steps by kind
  const stepKindCounts = steps.reduce((acc, step) => {
    acc[step.kind] = (acc[step.kind] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const toggleStep = (index: number) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSteps(newExpanded);
  };

  return (
    <div className="schedule-tab">
      {/* Summary Header */}
      <div className="schedule-tab-header">
        <div className="schedule-tab-header-item">
          <span className="schedule-tab-header-label">Steps:</span>
          <span className="schedule-tab-header-value">{steps.length}</span>
        </div>
        <div className="schedule-tab-header-item">
          <span className="schedule-tab-header-label">Time Model:</span>
          <span className="schedule-tab-header-value">
            {programIR.timeModel.kind}
            {programIR.timeModel.kind === 'cyclic' && 'periodMs' in programIR.timeModel &&
              ` (${programIR.timeModel.periodMs}ms)`}
            {programIR.timeModel.kind === 'finite' && 'durationMs' in programIR.timeModel &&
              ` (${programIR.timeModel.durationMs}ms)`}
          </span>
        </div>
      </div>

      {/* Step Kind Breakdown */}
      {Object.keys(stepKindCounts).length > 0 && (
        <div className="schedule-tab-breakdown">
          <div className="schedule-tab-breakdown-title">Step Types:</div>
          <div className="schedule-tab-breakdown-items">
            {Object.entries(stepKindCounts).map(([kind, count]) => (
              <div key={kind} className="schedule-tab-breakdown-item">
                <span className={`schedule-step-kind-badge ${getStepKindColor(kind)}`}>
                  {getStepKindLabel(kind)}
                </span>
                <span className="schedule-tab-breakdown-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step List */}
      <div className="schedule-tab-steps">
        {steps.length === 0 ? (
          <div className="schedule-tab-empty-section">No steps in schedule</div>
        ) : (
          steps.map((step, index) => (
            <div key={index} className="schedule-step-item">
              <button
                className={`schedule-step-button ${expandedSteps.has(index) ? 'active' : ''}`}
                onClick={() => toggleStep(index)}
                type="button"
              >
                <span className="schedule-step-index">{index}</span>
                <span className={`schedule-step-kind-badge ${getStepKindColor(step.kind)}`}>
                  {getStepKindLabel(step.kind)}
                </span>
                <span className="schedule-step-summary">{getStepSummary(step)}</span>
                <span className="schedule-step-expand-icon">
                  {expandedSteps.has(index) ? '▼' : '▶'}
                </span>
              </button>

              {expandedSteps.has(index) && (
                <div className="schedule-step-details">
                  <pre className="schedule-step-json">
                    {JSON.stringify(step, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
});
