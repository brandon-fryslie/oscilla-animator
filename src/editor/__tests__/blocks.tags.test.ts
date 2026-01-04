import { describe, expect, it } from 'vitest';
import { getBlockDefinitions, getBlockTags, getBlockForm } from '../blocks';

describe('block registry tags', () => {
  it('populates tags for every block definition', () => {
    const definitions = getBlockDefinitions();
    expect(definitions.length).toBeGreaterThan(0);

    for (const definition of definitions) {
      const tags = getBlockTags(definition);

      expect(tags).toBeDefined();
      // form is derived, not stored
      expect(tags.form).toBe(getBlockForm(definition));
      // subcategory defaults to 'Other' when not defined
      expect(tags.subcategory).toBe(definition.subcategory ?? 'Other');
    }
  });

  it('supports scalar and array tag values', () => {
    const sample = {
      ...getBlockDefinitions()[0],
      tags: { custom: ['a', 'b', true, 3], flag: true, weight: 2 },
    };

    const tags = getBlockTags(sample);
    expect(tags.custom).toEqual(['a', 'b', true, 3]);
    expect(tags.flag).toBe(true);
    expect(tags.weight).toBe(2);
  });
});
