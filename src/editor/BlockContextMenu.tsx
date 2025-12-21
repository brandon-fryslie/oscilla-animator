/**
 * BlockContextMenu Component
 *
 * Right-click context menu for blocks, showing replacement options.
 */

import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from './stores';
import { getBlockDefinitions } from './blocks/registry';
import { findCompatibleReplacements } from './replaceUtils';
import type { BlockDefinition } from './blocks/types';
import './BlockContextMenu.css';

/**
 * BlockContextMenu renders a right-click menu for block operations.
 * Shows "Replace with..." submenu with compatible block types.
 */
export const BlockContextMenu = observer(() => {
  const store = useStore();
  const { blockContextMenu } = store.uiStore.uiState;
  const [showReplacements, setShowReplacements] = useState(false);
  const [replacementResult, setReplacementResult] = useState<{ preserved: number; dropped: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!blockContextMenu.isOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        store.uiStore.closeBlockContextMenu();
        setShowReplacements(false);
        setReplacementResult(null);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        store.uiStore.closeBlockContextMenu();
        setShowReplacements(false);
        setReplacementResult(null);
      }
    };

    // Use timeout to avoid immediately closing from the same right-click
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [blockContextMenu.isOpen, store]);

  if (!blockContextMenu.isOpen || !blockContextMenu.blockId) {
    return null;
  }

  const { blockId } = blockContextMenu;
  const block = store.patchStore.blocks.find((b) => b.id === blockId);
  if (!block) {
    return null;
  }

  // Find compatible replacement blocks
  const allDefinitions = getBlockDefinitions(true);
  const compatibleBlocks = findCompatibleReplacements(
    block,
    store.patchStore.connections,
    allDefinitions
  );

  // Group by subcategory for better organization
  const blocksBySubcategory = compatibleBlocks.reduce((acc, def) => {
    const subcategory = def.subcategory ?? 'Other';
    if (!acc[subcategory]) {
      acc[subcategory] = [];
    }
    acc[subcategory].push(def);
    return acc;
  }, {} as Record<string, BlockDefinition[]>);

  const handleReplaceWith = (newBlockType: string) => {
    const result = store.patchStore.replaceBlock(blockId, newBlockType);

    if (result.success) {
      setReplacementResult({
        preserved: result.preservedConnections,
        dropped: result.droppedConnections.length,
      });

      // Show feedback briefly, then close
      setTimeout(() => {
        store.uiStore.closeBlockContextMenu();
        setShowReplacements(false);
        setReplacementResult(null);
      }, result.droppedConnections.length > 0 ? 2000 : 800);
    } else {
      console.error('Block replacement failed:', result.error);
      store.uiStore.closeBlockContextMenu();
      setShowReplacements(false);
      setReplacementResult(null);
    }
  };

  // Calculate position, keeping menu on screen
  const style: React.CSSProperties = {
    left: blockContextMenu.x,
    top: blockContextMenu.y,
  };

  return (
    <div className="context-menu-overlay">
      <div ref={menuRef} className="block-context-menu" style={style}>
        <div className="context-menu-header">
          <span className="context-menu-block-type">{block.type}</span>
          <span className="context-menu-block-label">{block.label}</span>
        </div>

        {replacementResult ? (
          <div className="replacement-feedback">
            <div className="feedback-success">
              Block replaced!
            </div>
            <div className="feedback-stats">
              {replacementResult.preserved} connection{replacementResult.preserved !== 1 ? 's' : ''} preserved
              {replacementResult.dropped > 0 && (
                <span className="feedback-warning">
                  , {replacementResult.dropped} dropped
                </span>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="context-menu-section">
              <button
                className="context-menu-action"
                onClick={() => {
                  store.uiStore.selectBlock(blockId);
                  store.uiStore.closeBlockContextMenu();
                }}
              >
                <span className="context-menu-icon">🔍</span>
                <span>View in Inspector</span>
              </button>
              <button
                className="context-menu-action"
                onClick={() => setShowReplacements(!showReplacements)}
              >
                <span className="context-menu-icon">⇄</span>
                <span>Replace with...</span>
                <span className="context-menu-arrow">{showReplacements ? '▼' : '▶'}</span>
              </button>
            </div>

            {showReplacements && (
              <div className="replacement-submenu">
                {compatibleBlocks.length === 0 ? (
                  <div className="context-menu-empty">
                    No compatible blocks found
                  </div>
                ) : (
                  Object.entries(blocksBySubcategory).map(([subcategory, blocks]) => (
                    <div key={subcategory} className="replacement-category">
                      <div className="replacement-category-label">{subcategory}</div>
                      {blocks.map((def) => (
                        <button
                          key={def.type}
                          className="replacement-option"
                          onClick={() => handleReplaceWith(def.type)}
                          style={{ borderLeftColor: def.color }}
                        >
                          <span className="replacement-label">{def.label}</span>
                          <span className="replacement-type">{def.type}</span>
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
