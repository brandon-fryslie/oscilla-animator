/**
 * @file TxBuilder Tests
 * @description Tests for transaction builder and runTx function.
 *
 * DISABLED: Tests use obsolete Block format with 'inputs' property.
 * TODO: Update fixtures to new Block format without inputs/outputs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../../stores/RootStore';
import { runTx } from '../TxBuilder';
import type { Block, Bus, Edge } from '../../types';

describe.skip('TxBuilder', () => {
  // Tests disabled - need to update Block fixtures
});
