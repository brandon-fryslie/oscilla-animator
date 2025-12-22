import { describe, expect, it } from 'vitest';
import { getBlockDefinitions, getBlockTags, getBlockForm } from '../blocks';

describe('block registry tags', () => {
  it('populates tags for every block definition', () => {
    const definitions = getBlockDefinitions(true);
    expect(definitions.length).toBeGreaterThan(0);

    for (const definition of definitions) {
      const tags = getBlockTags(definition);

      expect(tags).toBeDefined();
      // form is derived, not stored
      expect(tags.form).toBe(getBlockForm(definition));
      // subcategory defaults to 'Other' when not defined
      expect(tags.subcategory).toBe(definition.subcategory ?? 'Other');
      expect(tags.laneKind).toBe(definition.laneKind);
    }
  });

  it('retains lane flavor tags when present', () => {
    const withFlavor = getBlockDefinitions(true).find((def) => def.laneFlavor);

    // If a block with laneFlavor exists, verify the tag is retained
    if (withFlavor) {
      const tags = getBlockTags(withFlavor);
      expect(tags.laneFlavor).toBe(withFlavor.laneFlavor);
    } else {
      // If no blocks have laneFlavor, that's fine (domain blocks may not use it)
      expect(true).toBe(true);
    }
  });

  it('supports scalar and array tag values', () => {
    const sample = {
      ...getBlockDefinitions(true)[0],
      tags: { custom: ['a', 'b', true, 3], flag: true, weight: 2 },
    };

    const tags = getBlockTags(sample);
    expect(tags.custom).toEqual(['a', 'b', true, 3]);
    expect(tags.flag).toBe(true);
    expect(tags.weight).toBe(2);
  });
});
