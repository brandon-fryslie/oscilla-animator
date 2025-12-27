import type { BlockDefinition, ParamSchema } from './types';
import { isNonEmptyString } from '../types/helpers';

export function createBlock(
  definition: Partial<BlockDefinition> & {
    type: string;
    label: string;
    paramSchema?: ParamSchema[];
  },
): BlockDefinition {
  const { paramSchema = [] } = definition;

  if (!isNonEmptyString(definition.type)) {
    throw new Error('Block definition must have a type.');
  }
  if (!isNonEmptyString(definition.label)) {
    throw new Error(`Block definition '${definition.type}' must have a label.`);
  }

  const defaultParams = Object.fromEntries(
    paramSchema.map((p) => [p.key, p.defaultValue]),
  );

  return {
    // Provide sensible defaults for required fields
    // Note: form is derived from structure via getBlockForm(), not stored
    subcategory: 'Other',
    description: '',
    inputs: [],
    outputs: [],
    color: '#CCCCCC',
    laneKind: 'Program', // Default lane kind
    ...definition,
    paramSchema,
    defaultParams,
  } as BlockDefinition;
}
