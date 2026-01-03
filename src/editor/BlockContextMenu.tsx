/**
 * BlockContextMenu Component
 *
 * Right-click context menu for blocks, showing replacement options and composite creation.
 */

import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from './stores';
import { getBlockDefinitions, isBlockHidden } from './blocks/registry';
import { findCompatibleReplacements } from './replaceUtils';
import { SaveCompositeDialog } from './components/SaveCompositeDialog';
import { registerComposite as registerCompositeDefinition } from './composites';
import { registerComposite as registerCompositeCompiler } from './composite-bridge';
import type { BlockDefinition } from './blocks/types';
import type { CompositeDefinition, ExposedPort } from './composites';
import type { Composite, BlockSubcategory, ExposedParam } from './types';
import './BlockContextMenu.css';

/**
 * BlockContextMenu renders a right-click menu for block operations.
 * Shows "Replace with..." submenu with compatible block types.
 * Shows "Save as Composite" option when multiple blocks are selected.
 *
 * Hidden blocks (tagged with `hidden: true`) are filtered from replacement options.
 */
export const BlockContextMenu = observer(() => {
  const store = useStore();
  const { blockContextMenu } = store.uiStore.uiState;
  const [showReplacements, setShowReplacements] = useState(false);
  const [showSaveCompositeDialog, setShowSaveCompositeDialog] = useState(false);
  const [replacementResult, setReplacementResult] = useState<{ preserved: number; dropped: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Check if multi-select is active
  const hasMultiSelection = store.uiStore.hasMultiSelection;
  const selectedBlockIds = Array.from(store.uiStore.uiState.selectedBlockIds);
  const selectedBlocks = selectedBlockIds
    .map(id => store.patchStore.blocks.find(b => b.id === id))
    .filter((b): b is NonNullable<typeof b> => b !== null && b !== undefined);

  // Close menu when clicking outside
  useEffect(() => {
    if (blockContextMenu.isOpen === false) return;

    const handleClick = (e: MouseEvent) => {
      console.log("clicked menu")
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

  if (blockContextMenu.isOpen === false || blockContextMenu.blockId === undefined || blockContextMenu.blockId === null) {
    return null;
  }

  const { blockId } = blockContextMenu;
  const block = store.patchStore.blocks.find((b) => b.id === blockId);
  if (!block) {
    return null;
  }

  // Find compatible replacement blocks (excluding hidden blocks)
  const allDefinitions = getBlockDefinitions(true);
  const visibleDefinitions = allDefinitions.filter(def => !isBlockHidden(def));
  const compatibleBlocks = findCompatibleReplacements(
    block,
    store.patchStore.edges,
    visibleDefinitions
  );

  // Group by subcategory for better organization
  const blocksBySubcategory = compatibleBlocks.reduce((acc, def) => {
    const subcategory = def.subcategory ?? 'Other';
    if (acc[subcategory] === undefined) {
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

  const handleSaveAsComposite = () => {
    setShowSaveCompositeDialog(true);
    store.uiStore.closeBlockContextMenu();
  };

  const handleSaveComposite = (composite: Composite, exposedInputs: ExposedPort[], exposedOutputs: ExposedPort[]) => {
    try {
      // Save to CompositeStore (in-memory)
      store.compositeStore.saveComposite(composite);

      // Convert Composite to CompositeDefinition for registration
      // Build the composite graph
      const nodes: Record<string, { type: string; params?: Record<string, unknown> }> = {};
      for (const block of composite.blocks) {
        nodes[block.id] = {
          type: block.type,
          params: block.params,
        };
      }

      // Composite uses 'edges' not 'connections'
      const edges = composite.edges.map(edge => ({
        from: `${edge.from.blockId}:${edge.from.slotId}`,
        to: `${edge.to.blockId}:${edge.to.slotId}`,
      }));

      // Build input/output maps
      const inputMap: Record<string, string> = {};
      for (const input of exposedInputs) {
        inputMap[input.id] = `${input.nodeId}:${input.nodePort}`;
      }

      const outputMap: Record<string, string> = {};
      for (const output of exposedOutputs) {
        outputMap[output.id] = `${output.nodeId}:${output.nodePort}`;
      }

      // Convert exposedParams from Record to ExposedParam[]
      const exposedParamsArray: ExposedParam[] = composite.exposedParams
        ? Object.entries(composite.exposedParams).map(([name, binding]) => ({
            name,
            blockId: binding.blockId,
            paramName: binding.paramName,
          }))
        : [];

      const compositeDefinition: CompositeDefinition = {
        id: composite.id.replace('user:', ''), // Remove prefix for definition ID
        label: composite.name,
        description: '', // Composite doesn't have description field
        subcategory: 'Other' as BlockSubcategory, // Composite doesn't have subcategory field
        graph: {
          nodes,
          edges,
          inputMap,
          outputMap,
        },
        exposedInputs,
        exposedOutputs,
        exposedParams: exposedParamsArray,
      };

      // Register in the composite registry
      registerCompositeDefinition(compositeDefinition);

      // Register compiler
      registerCompositeCompiler(compositeDefinition);

      console.log('Composite saved and registered:', composite.name);
      setShowSaveCompositeDialog(false);
    } catch (error) {
      console.error('Failed to save composite:', error);
      alert(`Failed to save composite: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleCancelSaveComposite = () => {
    setShowSaveCompositeDialog(false);
  };

  // Calculate position, keeping menu on screen
  const style: React.CSSProperties = {
    left: blockContextMenu.x,
    top: blockContextMenu.y,
  };

  return (
    <>
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

                {hasMultiSelection && selectedBlocks.length > 1 && (
                  <button
                    className="context-menu-action"
                    onClick={handleSaveAsComposite}
                  >
                    <span className="context-menu-icon">📦</span>
                    <span>Save as Composite ({selectedBlocks.length} blocks)</span>
                  </button>
                )}

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

      {showSaveCompositeDialog && (
        <SaveCompositeDialog
          selectedBlocks={selectedBlocks}
          allEdges={store.patchStore.edges}
          existingComposites={store.compositeStore.composites}
          onSave={handleSaveComposite}
          onCancel={handleCancelSaveComposite}
        />
      )}
    </>
  );
});
