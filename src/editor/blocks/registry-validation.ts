/**
 * Registry Validation - Enforce Primitive Closure
 *
 * This module validates that block definitions comply with the primitive closure:
 * - Only blocks in KERNEL_PRIMITIVES may claim non-pure capabilities
 * - Capability claims must match KERNEL_PRIMITIVES entries
 * - Composites and macros must always be pure
 *
 * @see design-docs/7-Primitives/3-Registry-Gating.md
 */

import type { BlockDefinition, KernelCapability } from './types';
import { getBlockForm } from './types';
import { isKernelPrimitive, getKernelCapability, getKernelPrimitivesForCapability, KERNEL_PRIMITIVES } from './kernel-primitives';

/**
 * Validation error thrown when a block definition violates primitive closure.
 */
export class BlockDefinitionValidationError extends Error {
  readonly blockType: string;

  constructor(blockType: string, message: string) {
    super(`Block "${blockType}": ${message}`);
    this.name = 'BlockDefinitionValidationError';
    this.blockType = blockType;
  }
}

/**
 * Validate that a block definition complies with primitive closure rules.
 *
 * Throws BlockDefinitionValidationError if validation fails.
 *
 * @param def - The block definition to validate
 * @throws {BlockDefinitionValidationError} If the block violates closure rules
 */
export function validateBlockDefinition(def: BlockDefinition): void {
  const { type, capability } = def;
  const form = getBlockForm(def);

  // Rule 1: Composites and macros must always be pure
  if (form === 'macro') {
    if (capability !== 'pure') {
      throw new BlockDefinitionValidationError(
        type,
        `${form} blocks must have capability: 'pure', but found capability: '${capability}'. ` +
        `Only primitives may claim non-pure capabilities.`
      );
    }
    // Composites and macros are valid if they're pure
    return;
  }

  // Rule 2: Pure primitives are always valid
  if (capability === 'pure') {
    // Pure blocks don't need further validation
    return;
  }

  // Rule 3: Non-pure capability must be in KERNEL_PRIMITIVES
  // At this point we know capability is a KernelCapability (not 'pure')
  const kernelCapability = capability;

  if (!isKernelPrimitive(type)) {
    const validPrimitives = getKernelPrimitivesForCapability(kernelCapability);
    throw new BlockDefinitionValidationError(
      type,
      `Block claims capability '${kernelCapability}' but is not in KERNEL_PRIMITIVES. ` +
      `Only the following blocks may have '${kernelCapability}' capability: ${validPrimitives.join(', ')}. ` +
      `To add a new kernel primitive, update KERNEL_PRIMITIVES in src/editor/blocks/kernel-primitives.ts`
    );
  }

  // Rule 4: Capability must match KERNEL_PRIMITIVES entry
  const expectedCapability = getKernelCapability(type);
  if (expectedCapability !== kernelCapability) {
    throw new BlockDefinitionValidationError(
      type,
      `Capability mismatch. Block is listed in KERNEL_PRIMITIVES with capability '${expectedCapability}', ` +
      `but BlockDefinition claims capability '${kernelCapability}'. ` +
      `These must match exactly.`
    );
  }

  // Rule 5: KernelId must match type (enforced by type system, but we double-check at runtime)
  // Since we checked capability !== 'pure', TypeScript knows this is a KernelBlockDefinition
  const kernelDef = def as { kernelId?: string };
  if (kernelDef.kernelId !== type) {
    throw new BlockDefinitionValidationError(
      type,
      `kernelId mismatch. For kernel primitives, kernelId must equal type. ` +
      `Expected kernelId: '${type}', but found: '${kernelDef.kernelId}'`
    );
  }
}

/**
 * Validate a collection of block definitions.
 * Accumulates all errors and throws a combined error if any validations fail.
 *
 * @param definitions - Array of block definitions to validate
 * @throws {Error} If any block definitions are invalid (includes all errors)
 */
export function validateBlockDefinitions(definitions: readonly BlockDefinition[]): void {
  const errors: BlockDefinitionValidationError[] = [];

  for (const def of definitions) {
    try {
      validateBlockDefinition(def);
    } catch (error) {
      if (error instanceof BlockDefinitionValidationError) {
        errors.push(error);
      } else {
        // Re-throw unexpected errors
        throw error;
      }
    }
  }

  if (errors.length > 0) {
    const errorMessages = errors.map(e => `  - ${e.message}`).join('\n');
    throw new Error(
      `Block definition validation failed with ${errors.length} error(s):\n${errorMessages}\n\n` +
      `See KERNEL_PRIMITIVES in src/editor/blocks/kernel-primitives.ts for the authoritative list of allowed kernel primitives.`
    );
  }
}

/**
 * Get a summary of kernel primitives by capability.
 * Useful for debugging and documentation.
 */
export function getKernelPrimitivesSummary(): Record<KernelCapability, string[]> {
  const summary: Record<KernelCapability, string[]> = {
    time: [],
    identity: [],
    state: [],
    render: [],
    io: [],
  };

  for (const [id, capability] of Object.entries(KERNEL_PRIMITIVES)) {
    summary[capability].push(id);
  }

  return summary;
}
