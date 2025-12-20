/**
 * StatusBadge Component
 *
 * Shows overall system status (ok/warning/error).
 * Clicking when warning/error shows recent errors in a popup.
 */

import { observer } from 'mobx-react-lite';
import { useState, useRef, useEffect } from 'react';
import { logStore } from './logStore';
import { STATUS_CONFIG, LOG_LEVEL_CONFIG, LOG_COMPONENT_CONFIG } from './logTypes';
import './StatusBadge.css';

/**
 * Format timestamp as HH:MM:SS
 */
function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  const s = date.getSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * StatusBadge - shows ok/warning/error with popup for issues.
 */
export const StatusBadge = observer(() => {
  const [showPopup, setShowPopup] = useState(false);
  const badgeRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const status = logStore.status;
  const config = STATUS_CONFIG[status];
  const hasIssues = status !== 'ok';

  // Close popup when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        badgeRef.current &&
        !badgeRef.current.contains(e.target as Node)
      ) {
        setShowPopup(false);
      }
    }

    if (showPopup) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPopup]);

  const handleClick = () => {
    if (hasIssues) {
      setShowPopup(!showPopup);
    }
  };

  const recentIssues = logStore.recentErrors;

  return (
    <div className="status-badge-container">
      <button
        ref={badgeRef}
        className={`status-badge status-badge-${status}`}
        style={{
          borderColor: config.borderColor,
          color: config.borderColor,
        }}
        onClick={handleClick}
        title={hasIssues ? 'Click to see issues' : 'All systems operational'}
      >
        {config.label}
      </button>

      {showPopup && hasIssues && (
        <div ref={popupRef} className="status-popup">
          <div className="status-popup-header">
            <span>Recent Issues</span>
            <button
              className="status-popup-close"
              onClick={() => setShowPopup(false)}
            >
              &times;
            </button>
          </div>
          <div className="status-popup-content">
            {recentIssues.length === 0 ? (
              <div className="status-popup-empty">No recent issues</div>
            ) : (
              recentIssues.map((entry) => (
                <div
                  key={entry.id}
                  className={`status-popup-item status-popup-item-${entry.level}`}
                >
                  <span
                    className="status-popup-level"
                    style={{ color: LOG_LEVEL_CONFIG[entry.level].color }}
                  >
                    {LOG_LEVEL_CONFIG[entry.level].label}
                  </span>
                  <span className="status-popup-time">
                    {formatTime(entry.timestamp)}
                  </span>
                  <span className="status-popup-component">
                    {LOG_COMPONENT_CONFIG[entry.component].label}
                  </span>
                  <span className="status-popup-message">{entry.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
});
