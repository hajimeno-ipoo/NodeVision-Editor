type CatalogDefaultsSource = {
  defaultParams?: Record<string, unknown>;
  defaultInputs?: Record<string, string | null>;
};

export interface CatalogDefaultsResult {
  params: Record<string, unknown>;
  inputs: Record<string, unknown>;
}

export function extractCatalogDefaults(source: CatalogDefaultsSource | undefined): CatalogDefaultsResult {
  if (!source) {
    return { params: {}, inputs: {} };
  }

  const params =
    source.defaultParams && Object.keys(source.defaultParams).length > 0
      ? { ...source.defaultParams }
      : {};

  const inputs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source.defaultInputs ?? {})) {
    inputs[key] = value ?? null;
  }

  return { params, inputs };
}
