/**
 * Validation for default source attachments.
 *
 * NOTE (2026-01-04): This module is DEPRECATED. Default source attachments have been
 * removed in favor of GraphNormalizer, which creates structural blocks deterministically.
 * This file remains for backward compatibility but validation is disabled.
 *
 * Sprint: Graph Normalization Layer (2026-01-03)
 * - Default source attachments removed
 * - Structural blocks created by GraphNormalizer
 * - Validation no longer needed
 */

import type { RootStore } from '../stores/RootStore';
import type { Diagnostic } from '../diagnostics/types';

/**
 * Validate all default source attachments in the patch.
 *
 * NOTE: This function is deprecated and returns an empty array.
 * Default source attachments have been removed. GraphNormalizer now handles
 * all structural block creation deterministically.
 *
 * @param rootStore - Root store containing patch state (unused)
 * @returns Empty array (validation disabled)
 */
export function validateDefaultSourceAttachments(
  rootStore: RootStore
): Diagnostic[] {
  // Default source attachments removed - no validation needed
  void rootStore;
  return [];
}
