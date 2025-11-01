import { describe, expect, it } from 'vitest';
import { extractCatalogDefaults } from '../../src/renderer/utils/catalog-defaults.js';

describe('extractCatalogDefaults', () => {
  it('returns empty objects when source missing', () => {
    expect(extractCatalogDefaults(undefined)).toEqual({ params: {}, inputs: {} });
  });

  it('clones default params and converts null inputs', () => {
    const source = {
      defaultParams: { exposure: 0.25 },
      defaultInputs: { video: null, mask: 'n1:mask' }
    };
    const result = extractCatalogDefaults(source);

    expect(result.params).toEqual({ exposure: 0.25 });
    expect(result.inputs).toEqual({ video: null, mask: 'n1:mask' });
    expect(result.params).not.toBe(source.defaultParams);
  });
});
