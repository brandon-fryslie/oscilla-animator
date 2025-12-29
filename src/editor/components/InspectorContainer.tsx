/**
 * InspectorContainer - Shared container component for all inspector panels
 *
 * Provides consistent styling with:
 * - Color-coded left border
 * - Title and category badge
 * - Back button for navigation
 * - Consistent header/body structure
 */

import type { ReactNode, JSX } from 'react';
import './InspectorContainer.css';

export interface InspectorContainerProps {
  /** Title displayed in the header */
  title: string;
  /** Optional type code shown below title */
  typeCode?: string;
  /** Category badge text */
  category?: string;
  /** Color for left border and category badge */
  color?: string;
  /** Optional back button handler - if provided, shows back button */
  onBack?: () => void;
  /** Back button label */
  backLabel?: string;
  /** Children rendered in the body */
  children: ReactNode;
  /** Additional class names */
  className?: string;
}

export function InspectorContainer({
  title,
  typeCode,
  category,
  color = '#666',
  onBack,
  backLabel = 'Back',
  children,
  className = '',
}: InspectorContainerProps): JSX.Element {
  return (
    <div className={`inspector-container ${className}`}>
      <div className="inspector-container-header" style={{ borderLeftColor: color }}>
        <div className="inspector-header-top">
          {onBack !== undefined && (
            <button
              className="inspector-back-btn"
              onClick={onBack}
              title={backLabel}
            >
              ← {backLabel}
            </button>
          )}
          {onBack !== undefined && (
            <button
              className="inspector-close-btn"
              onClick={onBack}
              title="Close"
            >
              ×
            </button>
          )}
        </div>
        <div className="inspector-title-row">
          <span className="inspector-title">{title}</span>
          {(category !== undefined && category !== '') && (
            <span className="inspector-category" style={{ background: color }}>
              {category}
            </span>
          )}
        </div>
        {(typeCode !== undefined && typeCode !== '') && <code className="inspector-type-code">{typeCode}</code>}
      </div>
      <div className="inspector-container-body">
        {children}
      </div>
    </div>
  );
}
