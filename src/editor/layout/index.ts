/**
 * Layout Engine Public API
 *
 * Exports the main layout computation function and types.
 *
 * @see design-docs/8-UI-Redesign/5-NewUIRules-2of3.md
 */

// Main entry point
export { computeLayout } from './computeLayout';

// Types
export type {
  BlockPlacement,
  BusBinding,
  BusSignature,
  BusSignatureItem,
  ColumnIndex,
  ColumnLayoutMeta,
  ConnectorStyle,
  DensityMode,
  DirectBinding,
  GraphData,
  LayoutBlockData,
  LayoutConnector,
  LayoutDebugInfo,
  LayoutNodeView,
  LayoutResult,
  MetaNode,
  OverflowLink,
  OverflowReason,
  Point,
  PortAnchor,
  PortInfo,
  Rect,
  Role,
  SCC,
  UILayoutState,
} from './types';

// Constants (for external use in visualization/debug)
export {
  BLOCK_SIZES,
  clusterGap,
  colGap,
  Lmax,
  portRailOffset,
  portRowHeight,
  ROLE_PRIORITY,
  topPadding,
  vGap,
  Ysnap,
} from './constants';

// Utilities that might be useful externally
export { roleToColumn, columnToRoles } from './columns';
export { measureBlock } from './sizing';
export type { BlockSize } from './sizing';
