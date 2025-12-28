import type { BlockDefinition, ParamSchema } from './types';
import { isNonEmptyString } from '../types/helpers';
import { isKernelPrimitive, getKernelCapability } from './kernel-primitives';
import type { KernelId } from '../types';

export function createBlock(
  definition: Partial<BlockDefinition> & {
    type: string;
    label: string;
    paramSchema?: ParamSchema[];
  },
): BlockDefinition {
  if (!isNonEmptyString(definition.type)) {
    throw new Error('Block definition must have a type.');
  }
  if (!isNonEmptyString(definition.label)) {
    throw new Error(`Block definition '${definition.type}' must have a label.`);
  }

  // Auto-infer capability from KERNEL_PRIMITIVES if not explicitly provided
  let capability: BlockDefinition['capability'];
  let kernelId: KernelId | undefined;
  let compileKind: 'operator' | 'composite' | 'spec' = 'operator';

  if ('capability' in definition && definition.capability !== undefined) {
    // Explicit capability provided - use it
    capability = definition.capability;
    if (capability !== 'pure') {
      kernelId = definition.type as KernelId;
    } else {
      // For pure blocks, use provided compileKind or default to 'operator'
      compileKind = ('compileKind' in definition && definition.compileKind)
        ? definition.compileKind as 'operator' | 'composite' | 'spec'
        : 'operator';
    }
  } else {
    // No explicit capability - infer from KERNEL_PRIMITIVES
    if (isKernelPrimitive(definition.type)) {
      // Block is in kernel primitives - set capability from allowlist
      capability = getKernelCapability(definition.type)!;
      kernelId = definition.type;
    } else {
      // Not in kernel primitives - mark as pure
      capability = 'pure';
      // Infer compileKind: composites have primitiveGraph, others are operators
      compileKind = ('primitiveGraph' in definition && definition.primitiveGraph)
        ? 'composite'
        : 'operator';
    }
  }

  // Build the block definition with proper capability structure
  const base = {
    // Provide sensible defaults for required fields
    // Note: form is derived from structure via getBlockForm(), not stored
    subcategory: 'Other' as const,
    description: '',
    inputs: [],
    outputs: [],
    defaultParams: {},
    color: '#CCCCCC',
    laneKind: 'Program' as const, // Default lane kind
    ...definition,
  };

  if (capability === 'pure') {
    return {
      ...base,
      capability: 'pure',
      compileKind,
    } as BlockDefinition;
  } else {
    return {
      ...base,
      capability,
      kernelId: kernelId!,
    } as BlockDefinition;
  }
}
