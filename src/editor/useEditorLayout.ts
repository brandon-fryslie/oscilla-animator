import { useState, useEffect, useRef, useCallback } from 'react';

// P1/P2: Sidebar mode types
export type SidebarMode = 'hidden' | '1x' | '2x';

// Patch visualization modes
export type PatchViewMode = 'lanes' | 'table' | 'recipe';

export const PATCH_VIEW_MODES: { id: PatchViewMode; label: string; description: string }[] = [
  { id: 'lanes', label: 'Lanes', description: 'Traditional lane-based patch bay' },
  { id: 'table', label: 'Table', description: 'Modulation table (buses × ports)' },
  { id: 'recipe', label: 'Recipe', description: 'Quick recipe overview' },
];

const LAYOUT_STORAGE_KEY = 'loom-editor-layout';

interface LayoutState {
  libraryCollapsed: boolean;
  inspectorCollapsed: boolean;
  leftSplit: number;
  centerSplit: number;
  patchBayCollapsed: boolean;
  busBoardCollapsed: boolean;
  baySplit: number;
  leftSidebarMode: SidebarMode;
  rightSidebarMode: SidebarMode;
  controlsCollapsed: boolean;
  helpPanelCollapsed: boolean;
  debugPanelCollapsed: boolean;
  historyPanelCollapsed: boolean;
  patchViewMode: PatchViewMode;
}

const DEFAULT_LAYOUT: LayoutState = {
  libraryCollapsed: false,
  inspectorCollapsed: false,
  leftSplit: 0.5,
  centerSplit: 0.4,
  patchBayCollapsed: false,
  busBoardCollapsed: false,
  baySplit: 0.5,
  leftSidebarMode: '1x',
  rightSidebarMode: 'hidden', // Right sidebar collapsed by default
  controlsCollapsed: true,
  helpPanelCollapsed: true,
  debugPanelCollapsed: true,
  historyPanelCollapsed: true,
  patchViewMode: 'lanes', // Default to traditional lane view
};

function loadLayoutState(): LayoutState {
  try {
    const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<LayoutState>;
      // Merge with defaults to handle missing keys from older versions
      return { ...DEFAULT_LAYOUT, ...parsed };
    }
  } catch (err) {
    console.warn('Failed to load layout state from localStorage:', err);
  }
  return DEFAULT_LAYOUT;
}

function saveLayoutState(state: LayoutState): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Failed to save layout state to localStorage:', err);
  }
}

export function useEditorLayout(): {
  libraryCollapsed: boolean;
  setLibraryCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
  inspectorCollapsed: boolean;
  setInspectorCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
  leftSplit: number;
  setLeftSplit: (value: number | ((prev: number) => number)) => void;
  centerSplit: number;
  setCenterSplit: (value: number | ((prev: number) => number)) => void;
  patchBayCollapsed: boolean;
  setPatchBayCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
  busBoardCollapsed: boolean;
  setBusBoardCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
  baySplit: number;
  setBaySplit: (value: number | ((prev: number) => number)) => void;
  bayCollective: boolean;
  toggleBayCollective: () => void;
  leftSidebarMode: SidebarMode;
  setLeftSidebarMode: (value: SidebarMode | ((prev: SidebarMode) => SidebarMode)) => void;
  rightSidebarMode: SidebarMode;
  setRightSidebarMode: (value: SidebarMode | ((prev: SidebarMode) => SidebarMode)) => void;
  controlsCollapsed: boolean;
  setControlsCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
  helpPanelCollapsed: boolean;
  setHelpPanelCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
  debugPanelCollapsed: boolean;
  setDebugPanelCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
  historyPanelCollapsed: boolean;
  setHistoryPanelCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
  patchViewMode: PatchViewMode;
  setPatchViewMode: (value: PatchViewMode | ((prev: PatchViewMode) => PatchViewMode)) => void;
  dragging: null | 'left-split' | 'center-split' | 'bay-split';
  setDragging: (value: null | 'left-split' | 'center-split' | 'bay-split') => void;
  leftColumnRef: React.RefObject<HTMLDivElement | null>;
  centerColumnRef: React.RefObject<HTMLDivElement | null>;
  bayRef: React.RefObject<HTMLDivElement | null>;
  getLeftSidebarWidth: () => string;
  getRightSidebarWidth: () => string;
  applyDesignerView: () => void;
  applyPerformanceView: () => void;
} {
  // Load initial state from localStorage
  const [layoutState] = useState<LayoutState>(loadLayoutState);

  // Individual state values
  const [libraryCollapsed, setLibraryCollapsedRaw] = useState(layoutState.libraryCollapsed);
  const [inspectorCollapsed, setInspectorCollapsedRaw] = useState(layoutState.inspectorCollapsed);
  const [leftSplit, setLeftSplitRaw] = useState(layoutState.leftSplit);
  const [centerSplit, setCenterSplitRaw] = useState(layoutState.centerSplit);
  const [patchBayCollapsed, setPatchBayCollapsedRaw] = useState(layoutState.patchBayCollapsed);
  const [busBoardCollapsed, setBusBoardCollapsedRaw] = useState(layoutState.busBoardCollapsed);
  const [baySplit, setBaySplitRaw] = useState(layoutState.baySplit);
  const [leftSidebarMode, setLeftSidebarModeRaw] = useState<SidebarMode>(layoutState.leftSidebarMode);
  const [rightSidebarMode, setRightSidebarModeRaw] = useState<SidebarMode>(layoutState.rightSidebarMode);
  const [controlsCollapsed, setControlsCollapsedRaw] = useState(layoutState.controlsCollapsed);
  const [helpPanelCollapsed, setHelpPanelCollapsedRaw] = useState(layoutState.helpPanelCollapsed);
  const [debugPanelCollapsed, setDebugPanelCollapsedRaw] = useState(layoutState.debugPanelCollapsed);
  const [historyPanelCollapsed, setHistoryPanelCollapsedRaw] = useState(layoutState.historyPanelCollapsed);
  const [patchViewMode, setPatchViewModeRaw] = useState<PatchViewMode>(layoutState.patchViewMode);

  // P1: Bay collective collapse state (not persisted - ephemeral)
  const [bayCollective, setBayCollective] = useState(false);
  const [savedBaySplit, setSavedBaySplit] = useState(0.5);

  const [dragging, setDragging] = useState<null | 'left-split' | 'center-split' | 'bay-split'>(null);
  const leftColumnRef = useRef<HTMLDivElement | null>(null);
  const centerColumnRef = useRef<HTMLDivElement | null>(null);
  const bayRef = useRef<HTMLDivElement | null>(null);

  // Wrapped setters that also persist
  const setLibraryCollapsed = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setLibraryCollapsedRaw(value);
  }, []);

  const setInspectorCollapsed = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setInspectorCollapsedRaw(value);
  }, []);

  const setLeftSplit = useCallback((value: number | ((prev: number) => number)) => {
    setLeftSplitRaw(value);
  }, []);

  const setCenterSplit = useCallback((value: number | ((prev: number) => number)) => {
    setCenterSplitRaw(value);
  }, []);

  const setPatchBayCollapsed = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setPatchBayCollapsedRaw(value);
  }, []);

  const setBusBoardCollapsed = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setBusBoardCollapsedRaw(value);
  }, []);

  const setBaySplit = useCallback((value: number | ((prev: number) => number)) => {
    setBaySplitRaw(value);
  }, []);

  const setLeftSidebarMode = useCallback((value: SidebarMode | ((prev: SidebarMode) => SidebarMode)) => {
    setLeftSidebarModeRaw(value);
  }, []);

  const setRightSidebarMode = useCallback((value: SidebarMode | ((prev: SidebarMode) => SidebarMode)) => {
    setRightSidebarModeRaw(value);
  }, []);

  const setControlsCollapsed = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setControlsCollapsedRaw(value);
  }, []);

  const setHelpPanelCollapsed = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setHelpPanelCollapsedRaw(value);
  }, []);

  const setDebugPanelCollapsed = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setDebugPanelCollapsedRaw(value);
  }, []);

  const setHistoryPanelCollapsed = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setHistoryPanelCollapsedRaw(value);
  }, []);

  const setPatchViewMode = useCallback((value: PatchViewMode | ((prev: PatchViewMode) => PatchViewMode)) => {
    setPatchViewModeRaw(value);
  }, []);

  // Persist state whenever relevant values change
  useEffect(() => {
    const newState: LayoutState = {
      libraryCollapsed,
      inspectorCollapsed,
      leftSplit,
      centerSplit,
      patchBayCollapsed,
      busBoardCollapsed,
      baySplit,
      leftSidebarMode,
      rightSidebarMode,
      controlsCollapsed,
      helpPanelCollapsed,
      debugPanelCollapsed,
      historyPanelCollapsed,
      patchViewMode,
    };
    saveLayoutState(newState);
  }, [
    libraryCollapsed,
    inspectorCollapsed,
    leftSplit,
    centerSplit,
    patchBayCollapsed,
    busBoardCollapsed,
    baySplit,
    leftSidebarMode,
    rightSidebarMode,
    controlsCollapsed,
    helpPanelCollapsed,
    debugPanelCollapsed,
    historyPanelCollapsed,
    patchViewMode,
  ]);

  // P1: Bay collective collapse logic
  const toggleBayCollective = () => {
    if (bayCollective) {
      // Expand both panels to saved split
      setPatchBayCollapsed(false);
      setBusBoardCollapsed(false);
      setBaySplit(savedBaySplit);
      setBayCollective(false);
    } else {
      // Save current split and collapse both
      setSavedBaySplit(baySplit);
      setPatchBayCollapsed(true);
      setBusBoardCollapsed(true);
      setBayCollective(true);
    }
  };

  // P1: Clear bay collective state when manually expanding individual panels
  useEffect(() => {
    if (bayCollective && (!patchBayCollapsed || !busBoardCollapsed)) {
      setBayCollective(false);
    }
  }, [patchBayCollapsed, busBoardCollapsed, bayCollective]);

  // P1/P2: Sidebar mode helpers
  const getLeftSidebarWidth = (): string => {
    if (leftSidebarMode === 'hidden') return '24px'; // collapsed tab width
    if (leftSidebarMode === '2x') return '640px';
    return '320px'; // 1x
  };

  const getRightSidebarWidth = (): string => {
    if (rightSidebarMode === 'hidden') return '24px'; // collapsed tab width
    if (rightSidebarMode === '2x') return '840px';
    return '420px'; // 1x
  };

  // P2: View preset functions
  const applyDesignerView = () => {
    setLeftSidebarMode('1x');
    setLibraryCollapsed(false);
    setInspectorCollapsed(false);
    setPatchBayCollapsed(false);
    setBusBoardCollapsed(false);
    setBayCollective(false);
    setCenterSplit(0.4);
    setRightSidebarMode('1x');
  };

  const applyPerformanceView = () => {
    setLeftSidebarMode('hidden');
    setPatchBayCollapsed(true);
    setBusBoardCollapsed(true);
    setBayCollective(true);
    setCenterSplit(0.7);
    setRightSidebarMode('2x');
  };

  // Drag handles for resizers
  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (dragging === 'left-split' && leftColumnRef.current) {
        const rect = leftColumnRef.current.getBoundingClientRect();
        const ratio = (e.clientY - rect.top) / rect.height;
        setLeftSplit(Math.max(0.2, Math.min(0.8, ratio)));
      }
      if (dragging === 'center-split' && centerColumnRef.current) {
        const rect = centerColumnRef.current.getBoundingClientRect();
        const ratio = (e.clientY - rect.top) / rect.height;
        setCenterSplit(Math.max(0.2, Math.min(0.8, ratio)));
      }
      if (dragging === 'bay-split' && bayRef.current) {
        const rect = bayRef.current.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        setBaySplit(Math.max(0.2, Math.min(0.8, ratio)));
      }
    };

    const handleMouseUp = () => setDragging(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, setLeftSplit, setCenterSplit, setBaySplit]);

  return {
    libraryCollapsed,
    setLibraryCollapsed,
    inspectorCollapsed,
    setInspectorCollapsed,
    leftSplit,
    setLeftSplit,
    centerSplit,
    setCenterSplit,
    patchBayCollapsed,
    setPatchBayCollapsed,
    busBoardCollapsed,
    setBusBoardCollapsed,
    baySplit,
    setBaySplit,
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
    historyPanelCollapsed,
    setHistoryPanelCollapsed,
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
  };
}
