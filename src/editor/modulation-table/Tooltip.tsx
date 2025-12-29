/**
 * Styled tooltip component using Tippy.js
 * Matches the app's dark theme styling
 */
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import type { ReactNode, ReactElement } from 'react';

interface TooltipProps {
  /** Content to display in the tooltip */
  content: ReactNode;
  /** Element to attach the tooltip to */
  children: ReactElement;
  /** Placement of the tooltip */
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** Delay before showing tooltip [show, hide] in ms */
  delay?: [number, number];
  /** Whether the tooltip is disabled */
  disabled?: boolean;
}

/**
 * Styled tooltip that matches the app's dark theme.
 */
export function Tooltip({
  content,
  children,
  placement = 'top',
  delay = [300, 0],
  disabled = false,
}: TooltipProps): ReactElement {
  if (disabled || content == null || content === '') {
    return children;
  }

  return (
    <Tippy
      content={content}
      placement={placement}
      delay={delay}
      arrow={true}
      theme="dark-custom"
      animation="shift-away"
      className="modulation-tooltip"
    >
      {children}
    </Tippy>
  );
}

/**
 * Tooltip content formatter for cells.
 */
export function formatCellTooltip(
  status: string,
  lensChain?: readonly { type: string }[],
  costClass?: string
): string {
  if (status === 'bound') {
    if (lensChain != null && lensChain.length > 0) {
      return `Bound via: ${lensChain.map((l) => l.type).join(' → ')}`;
    }
    return 'Direct binding';
  }
  if (status === 'convertible') {
    const costLabel = costClass === 'heavy' ? 'expensive' : costClass === 'moderate' ? 'moderate' : 'cheap';
    return `Adapter available (${costLabel} conversion)`;
  }
  if (status === 'incompatible') {
    return 'Types incompatible';
  }
  return status;
}
