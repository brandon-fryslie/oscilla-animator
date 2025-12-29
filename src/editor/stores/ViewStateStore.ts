/**
 * @file View State Store
 * @description Manages the lane view projection and its ephemeral UI state.
 */

import { makeObservable, observable, action, computed } from 'mobx';
import type { BlockId } from '../types';
import type { RootStore } from './RootStore';
import type { LaneViewId, LaneViewLane } from '../lanes/types';
import { DEFAULT_LANE_TEMPLATES } from '../lanes/layout';
import { applyLaneOrderOverrides, buildLaneProjection } from '../lanes/ordering';

type LaneViewState = {
  collapsed: boolean;
  pinned: boolean;
};

export class ViewStateStore {
  root: RootStore;

  private laneOrderOverrides = observable.map<LaneViewId, BlockId[]>();
  private laneStateById = observable.map<LaneViewId, LaneViewState>();

  constructor(root: RootStore) {
    this.root = root;

    makeObservable(this, {
      lanes: computed,
      toggleLaneCollapsed: action,
      toggleLanePinned: action,
      reorderBlockInLane: action,
      insertBlockInLane: action,
      removeBlockFromOverrides: action,
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.root.events.on('BlockRemoved', (event) => {
      this.removeBlockFromOverrides(event.blockId);
    });
  }

  get lanes(): LaneViewLane[] {
    const projected = buildLaneProjection(this.root, DEFAULT_LANE_TEMPLATES);
    const ordered = applyLaneOrderOverrides(projected, this.laneOrderOverrides);
    return ordered.map((lane) => {
      const state = this.laneStateById.get(lane.id);
      return {
        ...lane,
        collapsed: state?.collapsed ?? lane.collapsed,
        pinned: state?.pinned ?? lane.pinned,
      };
    });
  }

  toggleLaneCollapsed(laneId: LaneViewId): void {
    const state = this.getOrCreateLaneState(laneId);
    state.collapsed = !state.collapsed;
    this.laneStateById.set(laneId, state);
  }

  toggleLanePinned(laneId: LaneViewId): void {
    const state = this.getOrCreateLaneState(laneId);
    state.pinned = !state.pinned;
    this.laneStateById.set(laneId, state);
  }

  reorderBlockInLane(laneId: LaneViewId, blockId: BlockId, newIndex: number): void {
    const lane = this.lanes.find((entry) => entry.id === laneId);
    if (lane === undefined) return;

    const current = [...lane.blockIds];
    const oldIndex = current.indexOf(blockId);
    if (oldIndex === -1) return;

    current.splice(oldIndex, 1);
    current.splice(newIndex, 0, blockId);
    this.laneOrderOverrides.set(laneId, current);
  }

  insertBlockInLane(laneId: LaneViewId, blockId: BlockId, index: number): void {
    const lane = this.lanes.find((entry) => entry.id === laneId);
    if (lane === undefined) return;

    const current = [...lane.blockIds];
    if (!current.includes(blockId)) {
      current.splice(index, 0, blockId);
      this.laneOrderOverrides.set(laneId, current);
    }
  }

  removeBlockFromOverrides(blockId: BlockId): void {
    for (const [laneId, list] of this.laneOrderOverrides.entries()) {
      if (list.includes(blockId)) {
        const next = list.filter((id) => id !== blockId);
        if (next.length === 0) {
          this.laneOrderOverrides.delete(laneId);
        } else {
          this.laneOrderOverrides.set(laneId, next);
        }
      }
    }
  }

  private getOrCreateLaneState(laneId: LaneViewId): LaneViewState {
    return this.laneStateById.get(laneId) ?? { collapsed: false, pinned: false };
  }
}
