import { useState, useEffect, useRef, useCallback } from 'react';

// P1/P2: Sidebar mode types
export type SidebarMode = 'hidden' | '1x' | '2x';

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

export function useEditorLayout() {
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
