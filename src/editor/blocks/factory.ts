import type { BlockDefinition, ParamSchema } from './types';

type BlockDefinitionInput = Omit<BlockDefinition, 'defaultParams'> & {
  paramSchema: ParamSchema[];
};

export function createBlock(
  definition: Partial<BlockDefinitionInput>,
): BlockDefinition {
  const { paramSchema = [] } = definition;

  if (!definition.type) {
    throw new Error('Block definition must have a type.');
  }
  if (!definition.label) {
    throw new Error(`Block definition '${definition.type}' must have a label.`);
  }

  const defaultParams = Object.fromEntries(
    paramSchema.map((p) => [p.key, p.defaultValue]),
  );

  return {
    // Provide sensible defaults for required fields
    form: 'primitive',
    category: 'Misc',
    description: '',
    inputs: [],
    outputs: [],
    color: '#CCCCCC',
    laneKind: 'any',
    ...definition,
    paramSchema,
    defaultParams,
  } as BlockDefinition;
}
