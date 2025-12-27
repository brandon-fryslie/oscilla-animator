/**
 * Editor Component
 *
 * Main editor container with multi-panel layout:
 * - Top: SettingsToolbar (with Save/Load/Export + StatusBadge)
 * - Left: BlockLibrary
 * - Center: PatchBay
 * - Right: Flexible right panel (Preview, Inspector, Control Surface)
 */

import { observer } from 'mobx-react-lite';
import { useMemo, useState, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  useDroppable,
  useSensor,
  useSensors,
  PointerSensor,
  type DragStartEvent,
  type DragEndEvent,
  pointerWithin,
} from '@dnd-kit/core';
import { useStore } from './stores';
import { BlockLibrary } from './BlockLibrary';
import { PatchBay } from './PatchBay';
import { BusBoard } from './BusBoard';
import { ModulationTable, ModulationTableStore, RecipeView } from './modulation-table';
import { Inspector } from './Inspector';
import { LogWindow } from './LogWindow';
import { PreviewPanel } from './PreviewPanel';
import { SettingsToolbar, getStartupMacro } from './SettingsToolbar';
import { ContextMenu } from './ContextMenu';
import { BlockContextMenu } from './BlockContextMenu';
import { PathManagerModal } from './PathManagerModal';
import { createCompilerService, setupAutoCompile } from './compiler';
import { ControlSurfaceStore, ControlSurfacePanel, generateSurfaceForMacro } from './controlSurface';
import { useEditorLayout, PATCH_VIEW_MODES } from './useEditorLayout';
import type { BlockDefinition } from './blocks';
import {
  isLibraryBlockDragData,
  isPatchBlockDragData,
  isLaneDropData,
  isPatchBlockDropData,
  isInsertionPointDropData,
  isTrashDropData,
  getLaneIdFromDropData,
} from './types/dnd';
import { isNonEmptyString } from './types/helpers';
import './Editor.css';
import './mobile.css';
import { HelpCenterModal, HelpPanel, type HelpCenterTopicId } from './HelpCenter';
import {DebugReplPanel} from "./components/DebugReplPanel.tsx";
import { TutorialOverlay } from './TutorialOverlay';

type HelpTopic = 'intro' | 'library' | 'inspector' | 'preview' | 'patch' | 'controlSurface';
const TOUR_COMPLETE_KEY = 'loom-editor-tour-complete';

interface HelpModalProps {
  topic: HelpTopic;
  onClose: () => void;
}

function HelpModal({ topic, onClose }: HelpModalProps) {
  const steps: { title: string; body: React.ReactNode }[] =
    topic === 'intro'
      ? [
          {
            title: 'Welcome to the Loom Editor',
            body: (
              <>
                <p>
                  This editor is a visual playground for procedural SVG animations. Instead of keyframes on a timeline,
                  you connect blocks that describe <strong>where</strong> elements come from, <strong>how</strong> they move,
                  and <strong>how</strong> they look.
                </p>
                <p>
                  You are always looking at a live program: change a block, and the preview updates within a moment.
                </p>
              </>
            ),
          },
          {
            title: 'Library: your block palette',
            body: (
              <ul>
                <li>On the left, the Library holds Sources, Fields, Time, Compose, Render, and ✨ Macros.</li>
                <li>Drag blocks into lanes in the Patch to start building an animation.</li>
                <li>Start with a macro, then tweak or replace its pieces as you learn.</li>
              </ul>
            ),
          },
          {
            title: 'Patch: the animation graph',
            body: (
              <ul>
                <li>The center lanes show how data flows: Scene → Phase → Fields → Spec → Program.</li>
                <li>Connect outputs to inputs to move scenes, fields, and signals through the graph.</li>
                <li>Think of it as a visual program where wires show the "why" behind the motion.</li>
              </ul>
            ),
          },
          {
            title: 'Preview & Control Surface',
            body: (
              <ul>
                <li>The right side shows the live animation and key controls.</li>
                <li>Use Play, Scrub, Seed, and Speed to explore time and variation.</li>
                <li>The Control Surface groups important knobs so you can play without diving into every block.</li>
              </ul>
            ),
          },
          {
            title: 'Try this right now',
            body: (
              <ul>
                <li>Open the <strong>Demos</strong> menu (top center) and load <em>Full Pipeline</em> or <em>Particles</em>.</li>
                <li>Watch how blocks land in lanes, then tweak parameters in the Inspector.</li>
                <li>Change the <strong>seed</strong> and <strong>speed</strong> in the Preview to explore variations.</li>
              </ul>
            ),
          },
        ]
      : topic === 'library'
        ? [
            {
              title: 'Library: building blocks',
              body: (
                <>
                  <p>
                    The Library is your palette of building blocks. Each block does one thing well: load a Scene, generate per-element Fields,
                    define timing, compose motion, or render output.
                  </p>
                  <ul>
                    <li>Drag blocks from the Library into lanes in the Patch.</li>
                    <li>Use the lane filter and categories to find Sources, Fields, Time, Compose, Render, and Macros.</li>
                    <li>Try dropping a ✨ macro first, then tweak or replace its pieces.</li>
                  </ul>
                </>
              ),
            },
          ]
        : topic === 'inspector'
          ? [
              {
                title: 'Inspector: tune every block',
                body: (
                  <>
                    <p>
                      The Inspector shows the details for the selected block: its label, description, and parameters. This is where you fine-tune
                      numbers, toggles, colors, and dropdowns.
                    </p>
                    <ul>
                      <li>Click a block in the Patch to inspect it.</li>
                      <li>Adjust parameters and watch the Preview update.</li>
                      <li>Rename blocks to keep complex patches readable.</li>
                    </ul>
                  </>
                ),
              },
            ]
          : topic === 'preview'
            ? [
                {
                  title: 'Preview: see time come alive',
                  body: (
                    <>
                      <p>
                        The Preview runs your compiled program. It&apos;s the live result of your patch, updated as you edit.
                      </p>
                      <ul>
                        <li>Use play / pause and the scrubber to explore time.</li>
                        <li>Change <strong>seed</strong> to get new random variations of the same rules.</li>
                        <li>Watch the ⏱ / ∞ indicator to see whether your program is finite or ambient.</li>
                      </ul>
                    </>
                  ),
                },
              ]
            : topic === 'patch'
              ? [
                  {
                    title: 'Patch: the graph of your animation',
                    body: (
                      <>
                        <p>
                          The Patch is where you connect blocks into a graph. Lanes organize blocks by role: Scene, Phase, Fields, Spec, Program, Output.
                        </p>
                        <ul>
                          <li>Drag from the Library into lanes; wires flow left-to-right.</li>
                          <li>Connect outputs to inputs to move data between blocks.</li>
                          <li>Use lane descriptions and type hints to keep structure clear.</li>
                        </ul>
                      </>
                    ),
                  },
                ]
              : [
                  {
                    title: 'Control Surface: macro-level controls',
                    body: (
                      <>
                        <p>
                          The Control Surface groups important parameters from multiple blocks into a single panel. It&apos;s designed for live tweaking
                          and sharing patches with less technical users.
                        </p>
                        <ul>
                          <li>When you load a macro, its key controls appear here as knobs, sliders, and toggles.</li>
                          <li>Use it to explore a patch without diving into every individual block.</li>
                          <li>You can still refine details via the Inspector when you need to.</li>
                        </ul>
                      </>
                    ),
                  },
                ];

  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  const pointers:
    | { id: 'library' | 'inspector' | 'preview' | 'patch' | 'control'; label: string }[]
    = (() => {
      if (topic === 'intro') {
        if (stepIndex === 1) {
          return [{ id: 'library', label: 'Library' }];
        }
        if (stepIndex === 2) {
          return [{ id: 'patch', label: 'Patch' }];
        }
        if (stepIndex === 3) {
          return [
            { id: 'preview', label: 'Preview' },
            { id: 'control', label: 'Control Surface' },
          ];
        }
        if (stepIndex === 4) {
          return [
            { id: 'patch', label: 'Follow the wiring here' },
            { id: 'preview', label: 'Watch changes here' },
          ];
        }
        return [];
      }
      if (topic === 'library') return [{ id: 'library', label: 'Library' }];
      if (topic === 'inspector') return [{ id: 'inspector', label: 'Inspector' }];
      if (topic === 'preview') return [{ id: 'preview', label: 'Preview' }];
      if (topic === 'patch') return [{ id: 'patch', label: 'Patch' }];
      if (topic === 'controlSurface') return [{ id: 'control', label: 'Control Surface' }];
      return [];
    })();

  const [pointerStyles, setPointerStyles] = useState<Record<string, React.CSSProperties>>({});

  useEffect(() => {
    if (pointers.length === 0) {
      setPointerStyles({});
      return;
    }

    const nextStyles: Record<string, React.CSSProperties> = {};
    const selectorMap: Record<string, string> = {
      library: '.library-panel',
      inspector: '.inspector-panel',
      preview: '.editor-preview',
      patch: '.editor-patch',
      control: '.editor-control-surface',
    };

    pointers.forEach((ptr) => {
      const selector = selectorMap[ptr.id];
      if (!selector || typeof document === 'undefined') return;
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const top = Math.max(8, rect.top + window.scrollY - 28);
      const left = rect.left + window.scrollX + rect.width / 2;

      nextStyles[ptr.id] = {
        top,
        left,
        transform: 'translateX(-50%)',
      };
    });

    setPointerStyles(nextStyles);
  }, [topic, stepIndex, pointers]);

  return (
    <div className="editor-help-overlay" onClick={onClose}>
      {pointers.map((ptr) => (
        <div
          key={ptr.id}
          className={`editor-help-pointer ${ptr.id}`}
          style={pointerStyles[ptr.id]}
        >
          {ptr.label}
        </div>
      ))}
      <div
        className="editor-help-modal"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="editor-help-header">
          <span className="editor-help-title">{step.title}</span>
          <button className="editor-help-close" onClick={onClose} aria-label="Close help">
            ×
          </button>
        </div>
        <div className="editor-help-body">
          {step.body}
        </div>
        <div className="editor-help-footer">
          <div className="editor-help-steps">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`editor-help-dot ${i === stepIndex ? 'active' : ''}`}
              />
            ))}
          </div>
          <div className="editor-help-buttons">
            {!isFirst && (
              <button
                className="editor-help-btn secondary"
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              >
                Back
              </button>
            )}
            {!isLast && (
              <button
                className="editor-help-btn primary"
                onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
              >
                Next
              </button>
            )}
            {isLast && (
              <button className="editor-help-btn primary" onClick={onClose}>
                Got it, let&apos;s animate
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Trash zone that appears when dragging placed blocks.
 */
function TrashZone({ isVisible }: { isVisible: boolean }) {
  const { isOver, setNodeRef } = useDroppable({
    id: 'trash-zone',
    data: { type: 'trash' },
  });

  if (!isVisible) return null;

  return (
    <div
      ref={setNodeRef}
      className={`trash-zone ${isOver ? 'trash-zone-active' : ''}`}
    >
      <span className="trash-icon">🗑️</span>
      <span className="trash-label">{isOver ? 'Release to delete' : 'Drop to delete'}</span>
    </div>
  );
}

/**
 * Drag overlay that shows the block being dragged.
 */
function DragOverlayContent({
  definition,
  placedBlockLabel,
  placedBlockColor,
}: {
  definition: BlockDefinition | null;
  placedBlockLabel: string | null;
  placedBlockColor: string | null;
}) {
  const label = definition?.label ?? placedBlockLabel;
  const color = definition?.color ?? placedBlockColor ?? '#666';

  if (!isNonEmptyString(label)) return null;

  return (
    <div
      className="drag-overlay-block"
      style={{
        backgroundColor: color,
        padding: '8px 12px',
        borderRadius: '6px',
        color: '#fff',
        fontWeight: 500,
        fontSize: '13px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </div>
  );
}

/**
 * Editor is the root component for the animation editor.
 */
export const Editor = observer(() => {
  // Create store once (memo to avoid recreating on re-renders)
  const store = useStore();

  // Create control surface store
  const controlSurfaceStore = useMemo(() => new ControlSurfaceStore(store), [store]);

  // Create modulation table store
  const modulationTableStore = useMemo(() => new ModulationTableStore(store), [store]);

  // Create compiler service
  const compilerService = useMemo(() => createCompilerService(store), [store]);

  // Layout state - persisted in localStorage via useEditorLayout hook
  const {
    libraryCollapsed,
    setLibraryCollapsed,
    inspectorCollapsed,
    setInspectorCollapsed,
    leftSplit,
    centerSplit,
    patchBayCollapsed,
    setPatchBayCollapsed,
    busBoardCollapsed,
    setBusBoardCollapsed,
    baySplit,
    bayCollective,
    toggleBayCollective,
    leftSidebarMode,
    setLeftSidebarMode,
    rightSidebarMode,
    setRightSidebarMode,
    controlsCollapsed,
    setControlsCollapsed,
    helpPanelCollapsed,
    setHelpPanelCollapsed,
    debugPanelCollapsed,
    setDebugPanelCollapsed,
    patchViewMode,
    setPatchViewMode,
    dragging,
    setDragging,
    leftColumnRef,
    centerColumnRef,
    bayRef,
    getLeftSidebarWidth,
    getRightSidebarWidth,
    applyDesignerView,
    applyPerformanceView,
  } = useEditorLayout();

  const [helpTopic, setHelpTopic] = useState<HelpTopic | null>(null);
  const [hasCompletedTour, setHasCompletedTour] = useState(false);
  const [showHelpNudge, setShowHelpNudge] = useState(false);
  const [helpCenterOpen, setHelpCenterOpen] = useState(false);
  const [isPathsModalOpen, setIsPathsModalOpen] = useState(false);

  // Help panel topic state
  const [helpPanelTopicId, setHelpPanelTopicId] = useState<HelpCenterTopicId>('overview');

  // Configure dnd-kit sensors with distance activation constraint
  // This allows clicks to work (no movement = click, movement = drag)
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: {
      distance: 5, // Require 5px of movement before starting drag
    },
  });
  const sensors = useSensors(pointerSensor);

  // Set up auto-compile on patch changes
  useEffect(() => {
    const dispose = setupAutoCompile(store, compilerService, {
      debounce: 30,
    });
    return dispose;
  }, [store, compilerService]);

  // Allow the editor layout to take the full viewport width/height
  useEffect(() => {
    document.body.classList.add('editor-mode');
    return () => {
      document.body.classList.remove('editor-mode');
    };
  }, []);

  // Help nudge on first visit
  useEffect(() => {
    try {
      const complete = typeof window !== 'undefined' && window.localStorage?.getItem(TOUR_COMPLETE_KEY) === '1';
      setHasCompletedTour(complete);
      if (!complete) {
        setShowHelpNudge(true);
        const timeoutId = window.setTimeout(() => {
          setShowHelpNudge(false);
        }, 3000);
        return () => window.clearTimeout(timeoutId);
      }
    } catch {
      // Ignore storage errors
    }
    return;
  }, []);

  const openTour = (topic: HelpTopic) => {
    setHelpCenterOpen(false);
    setHelpTopic(topic);
    setShowHelpNudge(false);
  };

  // Open help panel to specific topic
  const openHelpPanel = (topicId: HelpCenterTopicId) => {
    setHelpPanelTopicId(topicId);
    setHelpPanelCollapsed(false);
  };

  // Keyboard shortcut for Path Manager
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsPathsModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load the selected startup macro and generate its control surface
  useEffect(() => {
    const startupMacro = getStartupMacro();
    if (startupMacro) {
      store.patchStore.addBlock(startupMacro);
      // Generate a default surface for the macro
      // Use setTimeout to ensure blocks are fully populated after macro expansion
      setTimeout(() => {
        const blockIds = new Map<string, string>();
        store.patchStore.blocks.forEach((block) => {
          blockIds.set(block.type, block.id);
        });
        // Extract macro name from key (e.g., 'macro:simpleGrid' -> 'simpleGrid')
        const macroName = startupMacro.replace(/^macro:/, '');
        const surface = generateSurfaceForMacro(macroName, blockIds);
        if (surface) {
          controlSurfaceStore.setSurface(surface);
        }

      store.patchStore.addBlock('macro:rainbowGrid');
      }, 0);
    }
  }, [store, controlSurfaceStore]);

  // Track active drag state
  const [activeDefinition, setActiveDefinition] = useState<BlockDefinition | null>(null);
  const [activePlacedBlock, setActivePlacedBlock] = useState<{
    label: string;
    color: string;
    blockId: string;
  } | null>(null);

  const isDraggingPlacedBlock = activePlacedBlock !== null;

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const data = active.data.current;

    if (isLibraryBlockDragData(data)) {
      setActiveDefinition(data.definition);
      // Set dragging lane kind for highlighting suggested lanes
      store.uiStore.setDraggingLaneKind(data.definition.laneKind ?? null);
    } else if (isPatchBlockDragData(data)) {
      // Dragging a placed block
      const block = store.patchStore.blocks.find((b) => b.id === data.blockId);
      if (block) {
        setActivePlacedBlock({
          label: block.label,
          color: getBlockColor(block.type),
          blockId: block.id,
        });
      }
    }
  }

  function getBlockColor(blockType: string): string {
    // Import would create circular dep, so inline the lookup
    const colors: Record<string, string> = {
      Sources: '#4a9eff',
      Fields: '#a855f7',
      Time: '#22c55e',
      Math: '#f59e0b',
      Compose: '#ec4899',
      Render: '#ef4444',
    };
    const block = store.patchStore.blocks.find((b) => b.type === blockType);
    return colors[block?.category ?? 'Compose'] ?? '#666';
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDefinition(null);
    setActivePlacedBlock(null);
    store.uiStore.setDraggingLaneKind(null);

    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Dropping placed block onto another block (reorder/move)
    if (isPatchBlockDragData(activeData) && isPatchBlockDropData(overData)) {
      const { blockId, sourceLaneId, sourceIndex } = activeData;
      const { laneId: targetLaneId, index: targetIndex } = overData;

      if (sourceLaneId === targetLaneId) {
        if (sourceIndex !== targetIndex) {
          store.viewStore.reorderBlockInLane(sourceLaneId, blockId, targetIndex);
        }
      } else {
        store.viewStore.moveBlockToLane(blockId, targetLaneId);
      }
      return;
    }

    // Dropping library block onto a lane
    if (isLibraryBlockDragData(activeData) && isLaneDropData(overData)) {
      const { blockType } = activeData;
      const laneId = getLaneIdFromDropData(overData);
      const blockId = store.patchStore.addBlock(blockType);

      // Explicitly move to target lane
      store.viewStore.moveBlockToLane(blockId, laneId);
    }

    // Dropping library block onto an insertion point
    if (isLibraryBlockDragData(activeData) && isInsertionPointDropData(overData)) {
      const { blockType } = activeData;
      const { laneId, index } = overData;
      const blockId = store.patchStore.addBlock(blockType);

      // Explicitly move and reorder in target lane
      store.viewStore.moveBlockToLaneAtIndex(blockId, laneId, index);
    }

    // Dropping placed block onto an insertion point (reorder)
    if (isPatchBlockDragData(activeData) && isInsertionPointDropData(overData)) {
      const { blockId, sourceLaneId, sourceIndex } = activeData;
      const { laneId: targetLaneId, index: targetIndex } = overData;

      if (sourceLaneId === targetLaneId) {
        // Reorder within same lane
        // Adjust target index if moving forward (since we remove first)
        const adjustedIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
        if (sourceIndex !== adjustedIndex) {
          store.viewStore.reorderBlockInLane(sourceLaneId, blockId, adjustedIndex);
        }
      } else {
        // Move to different lane at specific position
        store.viewStore.moveBlockToLaneAtIndex(blockId, targetLaneId, targetIndex);
      }
    }

    // Dropping placed block onto trash
    if (isPatchBlockDragData(activeData) && isTrashDropData(overData)) {
      store.patchStore.removeBlock(activeData.blockId);
    }

    // Dropping placed block onto a lane (move/reorder)
    if (isPatchBlockDragData(activeData) && isLaneDropData(overData)) {
      const { blockId, sourceLaneId } = activeData;
      const targetLaneId = getLaneIdFromDropData(overData);

      if (sourceLaneId !== targetLaneId) {
        // Move to different lane
        store.viewStore.moveBlockToLane(blockId, targetLaneId);
      }
      // Note: reordering within same lane would need drop position info
      // For now, moving to same lane just keeps it in place
    }
  }

  // Compute dynamic grid template columns based on sidebar modes
  const gridTemplateColumns = `${getLeftSidebarWidth()} minmax(0, 1fr) ${getRightSidebarWidth()}`;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      collisionDetection={pointerWithin}
    >
      <div className={`editor ${dragging ? 'dragging' : ''}`}>
        <SettingsToolbar
          onShowHelp={() => {
            if (hasCompletedTour) {
              openHelpPanel('overview');
            } else {
              openTour('intro');
            }
          }}
          onOpenPaths={() => setIsPathsModalOpen(true)}
          isPathsModalOpen={isPathsModalOpen}
          showHelpNudge={showHelpNudge}
          onDesignerView={applyDesignerView}
          onPerformanceView={applyPerformanceView}
        />

        <div className="editor-main" style={{ gridTemplateColumns }}>
          {/* Left Sidebar */}
          {leftSidebarMode !== 'hidden' && (
            <div className={`editor-left ${leftSidebarMode === '2x' ? 'editor-left-2x' : ''}`} ref={leftColumnRef}>
              <div
                className={`left-panel library-panel ${libraryCollapsed ? 'collapsed' : ''}`}
                style={{
                  flex: libraryCollapsed
                    ? '0 0 auto'
                    : inspectorCollapsed
                      ? '1 1 0'
                      : `${leftSplit} 1 0`,
                }}
              >
                <div className="panel-header">
                  <span className="panel-title">Library</span>
                  <div className="panel-header-actions">
                    <button
                      className={`panel-collapse-icon ${leftSidebarMode === '2x' ? 'active' : ''}`}
                      onClick={() => {
                        // Cycle: 1x → 2x → hidden → 1x
                        if (leftSidebarMode === '1x') setLeftSidebarMode('2x');
                        else if (leftSidebarMode === '2x') setLeftSidebarMode('hidden');
                        else setLeftSidebarMode('1x');
                      }}
                      title={`Sidebar: ${leftSidebarMode} (click to cycle)`}
                    >
                      {leftSidebarMode === '2x' ? '⇔' : leftSidebarMode === '1x' ? '▶' : '◀'}
                    </button>
                    <button
                      className="panel-collapse-icon"
                      onClick={() => openHelpPanel('library')}
                      title="Help"
                    >
                      ?
                    </button>
                    <button
                      className="panel-collapse-icon"
                      onClick={() => setLibraryCollapsed((v) => !v)}
                      title={libraryCollapsed ? 'Show library' : 'Hide library'}
                    >
                      {libraryCollapsed ? '▾' : '▴'}
                    </button>
                  </div>
                </div>
                {!libraryCollapsed && <BlockLibrary />}
              </div>

              {!libraryCollapsed && !inspectorCollapsed && (
                <div
                  className={leftSidebarMode === '2x' ? 'horizontal-resizer-2x' : 'vertical-resizer'}
                  onMouseDown={() => setDragging('left-split')}
                  title="Drag to resize Library / Inspector"
                />
              )}

              <div
                className={`left-panel inspector-panel ${inspectorCollapsed ? 'collapsed' : ''}`}
                style={{
                  flex: inspectorCollapsed
                    ? '0 0 auto'
                    : libraryCollapsed
                      ? '1 1 0'
                      : `${1 - leftSplit} 1 0`,
                }}
              >
                <div className="panel-header">
                  <span className="panel-title">Inspector</span>
                  <div className="panel-header-actions">
                    <button
                      className="panel-collapse-icon"
                      onClick={() => openHelpPanel('inspector')}
                      title="Help"
                    >
                      ?
                    </button>
                    <button
                      className="panel-collapse-icon"
                      onClick={() => setInspectorCollapsed((v) => !v)}
                      title={inspectorCollapsed ? 'Show inspector' : 'Hide inspector'}
                    >
                      {inspectorCollapsed ? '▾' : '▴'}
                    </button>
                  </div>
                </div>
                {!inspectorCollapsed && (
                  <div className="inspector-wrapper">
                    <Inspector />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Left sidebar collapsed state - show expand tab */}
          {leftSidebarMode === 'hidden' && (
            <div
              className="sidebar-collapsed-tab"
              onClick={() => setLeftSidebarMode('1x')}
              title="Show left sidebar"
            >
              Library
            </div>
          )}

          {/* Center Column */}
          <div className="editor-center" ref={centerColumnRef}>
            <div className="editor-preview" style={{ flex: centerSplit }}>
              <PreviewPanel
                compilerService={compilerService}
                isPlaying={store.uiStore.uiState.isPlaying}
                onShowHelp={() => openHelpPanel('preview')}
              />
            </div>

            <div
              className="horizontal-resizer"
              onMouseDown={() => setDragging('center-split')}
              title="Drag to resize Preview / Bay"
            />

            <div className="editor-bay" ref={bayRef} style={{ flex: 1 - centerSplit, position: 'relative' }}>
              {/* Tiny bay collapse toggle in corner */}
              <button
                className="bay-collapse-toggle"
                onClick={toggleBayCollective}
                title={bayCollective ? 'Expand Bay' : 'Collapse Bay'}
              >
                {bayCollective ? '▸' : '▾'}
              </button>

              {/* PatchBay Panel - takes full width in table view mode */}
              <div
                className={`bay-panel patch-panel ${patchBayCollapsed ? 'collapsed' : ''}`}
                style={{
                  flex: patchBayCollapsed
                    ? '0 0 auto'
                    : (busBoardCollapsed || patchViewMode === 'table')
                      ? '1 1 0'
                      : `${baySplit} 1 0`,
                }}
              >
                <div className="panel-header patch-header">
                  <span className="panel-title">Patch</span>
                  <div className="panel-header-actions">
                    {/* View Mode Switcher */}
                    <div className="view-mode-switcher">
                      {PATCH_VIEW_MODES.map((mode) => (
                        <button
                          key={mode.id}
                          className={`view-mode-btn ${patchViewMode === mode.id ? 'active' : ''}`}
                          onClick={() => setPatchViewMode(mode.id)}
                          title={mode.description}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                    <button
                      className="panel-collapse-icon"
                      onClick={() => openHelpPanel('patch')}
                      title="Help"
                    >
                      ?
                    </button>
                    <button
                      className="panel-collapse-icon"
                      onClick={() => setPatchBayCollapsed((v) => !v)}
                      title={patchBayCollapsed ? 'Show patch' : 'Hide patch'}
                    >
                      {patchBayCollapsed ? '◂' : '▸'}
                    </button>
                  </div>
                </div>
                {!patchBayCollapsed && (
                  <div className="patch-body">
                    {patchViewMode === 'lanes' && <PatchBay />}
                    {patchViewMode === 'table' && <ModulationTable store={modulationTableStore} />}
                    {patchViewMode === 'recipe' && (
                      <RecipeView
                        store={modulationTableStore}
                        onJumpToCell={(rowKey, busId) => {
                          setPatchViewMode('table');
                          modulationTableStore.setFocusedCell(rowKey, busId);
                        }}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Bay Resizer - hidden in table view mode */}
              {!patchBayCollapsed && !busBoardCollapsed && patchViewMode !== 'table' && (
                <div
                  className="bay-resizer"
                  onMouseDown={() => setDragging('bay-split')}
                  title="Drag to resize Patch / Bus Board"
                />
              )}

              {/* BusBoard Panel - hidden in table view mode (table has integrated bus columns) */}
              {patchViewMode !== 'table' && (
                busBoardCollapsed ? (
                  /* Collapsed state: thin vertical tab with rotated text */
                  <div
                    className="busboard-collapsed-tab"
                    onClick={() => setBusBoardCollapsed(false)}
                    title="Click to expand Bus Board"
                  >
                    <span className="busboard-collapsed-text">Bus Board</span>
                  </div>
                ) : (
                  /* Expanded state: full panel */
                  <div
                    className="bay-panel busboard-panel"
                    style={{
                      flex: patchBayCollapsed
                        ? '1 1 0'
                        : `${1 - baySplit} 1 0`,
                    }}
                  >
                    <div
                      className="panel-header busboard-header"
                      onClick={() => setBusBoardCollapsed(true)}
                      style={{ cursor: 'pointer' }}
                      title="Click to collapse Bus Board"
                    >
                      <span className="panel-title">Bus Board</span>
                      <div className="panel-header-actions">
                        <button
                          className="panel-collapse-icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            openHelpPanel('patch');
                          }}
                          title="Help"
                        >
                          ?
                        </button>
                      </div>
                    </div>
                    <div className="busboard-body">
                      <BusBoard />
                    </div>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Right Sidebar */}
          {rightSidebarMode !== 'hidden' && (
            <div className="editor-right-panel">
              <div className={`editor-control-surface ${controlsCollapsed ? 'collapsed' : ''}`}>
                <div
                  className="panel-header"
                  onClick={() => setControlsCollapsed((v) => !v)}
                  style={{ cursor: 'pointer' }}
                >
                  <span className="panel-title">Controls</span>
                  <div className="panel-header-actions">
                    <button
                      className={`panel-collapse-icon ${rightSidebarMode === '2x' ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Cycle: 1x → 2x → hidden → 1x
                        if (rightSidebarMode === '1x') setRightSidebarMode('2x');
                        else if (rightSidebarMode === '2x') setRightSidebarMode('hidden');
                        else setRightSidebarMode('1x');
                      }}
                      title={`Sidebar: ${rightSidebarMode} (click to cycle)`}
                    >
                      {rightSidebarMode === '2x' ? '⇔' : rightSidebarMode === '1x' ? '◀' : '▶'}
                    </button>
                    <button
                      className="panel-collapse-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        openHelpPanel('controlSurface');
                      }}
                      title="Help"
                    >
                      ?
                    </button>
                    <button
                      className="panel-collapse-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setControlsCollapsed((v) => !v);
                      }}
                      title={controlsCollapsed ? 'Show controls' : 'Hide controls'}
                    >
                      {controlsCollapsed ? '▾' : '▴'}
                    </button>
                  </div>
                </div>
                {!controlsCollapsed && (
                  <div className="control-surface-body">
                    <ControlSurfacePanel store={controlSurfaceStore} />
                  </div>
                )}
              </div>

              {/* Debug REPL Panel */}
              <DebugReplPanel
                collapsed={debugPanelCollapsed}
                onToggleCollapse={() => setDebugPanelCollapsed((v) => !v)}
              />

              {/* Embedded Help Panel */}
              <HelpPanel
                topicId={helpPanelTopicId}
                collapsed={helpPanelCollapsed}
                onToggleCollapse={() => setHelpPanelCollapsed((v) => !v)}
                onNavigate={setHelpPanelTopicId}
                onRetakeTour={() => openTour('intro')}
                onPopOut={() => {
                  setHelpCenterOpen(true);
                }}
              />
            </div>
          )}

          {/* Right sidebar collapsed state - show expand tab */}
          {rightSidebarMode === 'hidden' && (
            <div
              className="sidebar-collapsed-tab right"
              onClick={() => setRightSidebarMode('1x')}
              title="Show control surface"
            >
              Controls
            </div>
          )}
        </div>

        <LogWindow />

        {/* Trash zone appears when dragging placed blocks */}
        <TrashZone isVisible={isDraggingPlacedBlock} />

        {/* Context menu for right-click actions */}
        <ContextMenu />
        <BlockContextMenu />

        {/* Interactive Tutorial */}
        <TutorialOverlay />
      </div>

      <PathManagerModal
        isOpen={isPathsModalOpen}
        onClose={() => setIsPathsModalOpen(false)}
      />

      {helpTopic && (
        <HelpModal
          topic={helpTopic}
          onClose={() => {
            setHelpTopic(null);
            // Mark tour complete if we just finished the intro tour
            if (!hasCompletedTour && helpTopic === 'intro') {
              setHasCompletedTour(true);
              try {
                if (typeof window !== 'undefined') {
                  window.localStorage?.setItem(TOUR_COMPLETE_KEY, '1');
                }
              } catch {
                // ignore
              }
            }
          }}
        />
      )}

      <HelpCenterModal
        isOpen={helpCenterOpen}
        initialTopicId={helpPanelTopicId}
        onClose={() => setHelpCenterOpen(false)}
        onRetakeTour={() => {
          setHelpCenterOpen(false);
          openTour('intro');
        }}
      />

      <DragOverlay dropAnimation={null}>
        <DragOverlayContent
          definition={activeDefinition}
          placedBlockLabel={activePlacedBlock?.label ?? null}
          placedBlockColor={activePlacedBlock?.color ?? null}
        />
      </DragOverlay>
    </DndContext>
  );
});
