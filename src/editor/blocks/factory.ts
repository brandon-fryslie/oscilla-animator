import type { BlockDefinition, ParamSchema } from './types';
import { isNonEmptyString } from '../types/helpers';

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

  return {
    // Provide sensible defaults for required fields
    // Note: form is derived from structure via getBlockForm(), not stored
    subcategory: 'Other',
    description: '',
    inputs: [],
    outputs: [],
    defaultParams: {},
    color: '#CCCCCC',
    laneKind: 'Program', // Default lane kind
    ...definition,
  } as BlockDefinition;
}
