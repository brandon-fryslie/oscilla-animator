import { useState, useEffect, useRef } from 'react';

// P1/P2: Sidebar mode types
export type SidebarMode = 'hidden' | '1x' | '2x';

export function useEditorLayout() {
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [leftSplit, setLeftSplit] = useState(0.5); // library vs inspector
  const [centerSplit, setCenterSplit] = useState(0.4); // preview vs bay
  const [patchBayCollapsed, setPatchBayCollapsed] = useState(false);
  const [busBoardCollapsed, setBusBoardCollapsed] = useState(false);
  const [baySplit, setBaySplit] = useState(0.5); // patchbay vs busboard

  // P1: Bay collective collapse state
  const [bayCollective, setBayCollective] = useState(false);
  const [savedBaySplit, setSavedBaySplit] = useState(0.5);

  // P1/P2: Sidebar mode state
  const [leftSidebarMode, setLeftSidebarMode] = useState<SidebarMode>('1x');
  const [rightSidebarMode, setRightSidebarMode] = useState<SidebarMode>('1x');

  const [dragging, setDragging] = useState<null | 'left-split' | 'center-split' | 'bay-split'>(null);
  const leftColumnRef = useRef<HTMLDivElement | null>(null);
  const centerColumnRef = useRef<HTMLDivElement | null>(null);
  const bayRef = useRef<HTMLDivElement | null>(null);

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
  }, [dragging]);

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
