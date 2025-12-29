import type { BlockId } from '../types';

export type LaneViewKind =
  | 'Scene'
  | 'Phase'
  | 'Fields'
  | 'Scalars'
  | 'Spec'
  | 'Program'
  | 'Output';

export type LaneViewId = string;

export type LaneViewFlowStyle = 'chain' | 'patchbay';

export interface LaneViewTemplate {
  readonly id: LaneViewId;
  readonly kind: LaneViewKind;
  readonly label: string;
  readonly description: string;
  readonly flowStyle: LaneViewFlowStyle;
}

export interface LaneViewLane {
  readonly id: LaneViewId;
  readonly kind: LaneViewKind;
  label: string;
  description: string;
  flowStyle: LaneViewFlowStyle;
  blockIds: BlockId[];
  collapsed: boolean;
  pinned: boolean;
}
