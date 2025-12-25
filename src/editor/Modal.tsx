import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';

type ModalWidth = 'small' | 'medium' | 'large';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: ModalWidth;
  zIndex?: number;
}

function useFocusTrap(enabled: boolean, containerRef: React.RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const container = containerRef.current;
      if (!container) return;

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);

      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (active === first || !container.contains(active)) {
          event.preventDefault();
          last?.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, containerRef]);
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  width = 'medium',
  zIndex = 1200,
}: ModalProps): React.JSX.Element | null {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  useFocusTrap(isOpen, containerRef);

  useEffect(() => {
    if (!isOpen) return;

    const firstFocusable = containerRef.current?.querySelector<HTMLElement>(
      'input, button, textarea, select, [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();
    // Note: zIndex is intentionally omitted from deps - it only affects the backdrop styling,
    // not the focus behavior. The focus trap is managed by useFocusTrap which runs independently.
  }, [isOpen]);

  const content = useMemo(() => {
    if (!isOpen) return null;

    return (
      <div className="modal-backdrop" onClick={onClose} style={{ zIndex }}>
        <div
          ref={containerRef}
          className={`modal-content modal-${width}`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={title !== undefined && title !== null && title !== '' ? title : 'Modal dialog'}
        >
          {title !== undefined && title !== null && title !== '' && (
            <div className="modal-header">
              <h2 className="modal-title">{title}</h2>
              <button className="modal-close" onClick={onClose} aria-label="Close modal">
                &times;
              </button>
            </div>
          )}
          <div className="modal-body">{children}</div>
          {footer !== undefined && footer !== null && <div className="modal-footer">{footer}</div>}
        </div>
      </div>
    );
  }, [children, footer, isOpen, onClose, title, width, zIndex]);

  if (!isOpen) return null;
  return createPortal(content, document.body);
}
