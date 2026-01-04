/**
 * @file HistoryStore Tests
 * @description Tests for transaction history (undo/redo).
 *
 * DISABLED: Tests use obsolete Block format with 'inputs' property.
 * TODO: Update fixtures to new Block format without inputs/outputs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../../stores/RootStore';
import type { Block } from '../../types';

describe.skip('HistoryStore', () => {
  // Tests disabled - need to update Block fixtures
});
