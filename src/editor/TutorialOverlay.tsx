/**
 * @file TutorialOverlay - Interactive tutorial UI
 *
 * Displays tutorial instructions and tracks progress as the user
 * completes each step by making connections.
 */

import { observer } from 'mobx-react-lite';
import { useStore } from './stores';
import './TutorialOverlay.css';

/**
 * TutorialOverlay renders the interactive tutorial panel.
 * Only visible when a tutorial is active.
 */
export const TutorialOverlay = observer(() => {
  const store = useStore();
  const { tutorialStore } = store;

  if (!tutorialStore.isActive) {
    return null;
  }

  const step = tutorialStore.currentStep;
  if (!step) {
    return null;
  }

  const isLastStep = step.criteria.type === 'manual';
  const stepNumber = tutorialStore.currentStepIndex + 1;
  const totalSteps = tutorialStore.steps.length;

  const handleNext = () => {
    if (isLastStep) {
      tutorialStore.stop();
    } else {
      tutorialStore.nextStep();
    }
  };

  const handleSkip = () => {
    tutorialStore.stop();
  };

  const handlePrevious = () => {
    tutorialStore.previousStep();
  };

  return (
    <div className="tutorial-overlay">
      <div className="tutorial-panel">
        {/* Header */}
        <div className="tutorial-header">
          <div className="tutorial-progress">
            <span className="tutorial-step-count">
              Step {stepNumber} of {totalSteps}
            </span>
            <div className="tutorial-progress-bar">
              <div
                className="tutorial-progress-fill"
                style={{ width: `${tutorialStore.progress * 100}%` }}
              />
            </div>
          </div>
          <button
            className="tutorial-close"
            onClick={handleSkip}
            title="Skip Tutorial"
          >
            ×
          </button>
        </div>

        {/* Title */}
        <h2 className="tutorial-title">{step.title}</h2>

        {/* Instructions */}
        <div className="tutorial-instructions">
          {step.instructions.split('\n').map((line, i) => {
            // Simple markdown-like formatting
            if (line.startsWith('**') && line.endsWith('**')) {
              return (
                <p key={i} className="tutorial-emphasis">
                  {line.slice(2, -2)}
                </p>
              );
            }
            if (line.startsWith('_') && line.endsWith('_')) {
              return (
                <p key={i} className="tutorial-note">
                  {line.slice(1, -1)}
                </p>
              );
            }
            if (line.startsWith('•')) {
              return (
                <li key={i} className="tutorial-list-item">
                  {formatInlineMarkdown(line.slice(1).trim())}
                </li>
              );
            }
            if (line.trim() === '') {
              return <br key={i} />;
            }
            return (
              <p key={i}>{formatInlineMarkdown(line)}</p>
            );
          })}
        </div>

        {/* Hint */}
        {step.hint && (
          <div className="tutorial-hint">
            <span className="tutorial-hint-icon">💡</span>
            <span>{step.hint}</span>
          </div>
        )}

        {/* Navigation */}
        <div className="tutorial-nav">
          <button
            className="tutorial-btn tutorial-btn-secondary"
            onClick={handlePrevious}
            disabled={tutorialStore.currentStepIndex === 0}
          >
            ← Back
          </button>

          {isLastStep ? (
            <button
              className="tutorial-btn tutorial-btn-primary"
              onClick={handleNext}
            >
              Finish Tutorial
            </button>
          ) : (
            <button
              className="tutorial-btn tutorial-btn-skip"
              onClick={handleNext}
            >
              Skip Step →
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * Format inline markdown (bold, code).
 */
function formatInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Check for bold (**text**)
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    if (boldMatch && boldMatch.index !== undefined) {
      if (boldMatch.index > 0) {
        parts.push(remaining.slice(0, boldMatch.index));
      }
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
      continue;
    }

    // Check for code (`text`)
    const codeMatch = remaining.match(/`([^`]+)`/);
    if (codeMatch && codeMatch.index !== undefined) {
      if (codeMatch.index > 0) {
        parts.push(remaining.slice(0, codeMatch.index));
      }
      parts.push(<code key={key++}>{codeMatch[1]}</code>);
      remaining = remaining.slice(codeMatch.index + codeMatch[0].length);
      continue;
    }

    // No more matches, add remaining text
    parts.push(remaining);
    break;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}
