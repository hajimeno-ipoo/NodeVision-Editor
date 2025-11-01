import type { NodeVisionProject } from '../../shared/project-types.js';
import { stripAutosaveMetadata } from './autosave.js';

type NormalizedValue = string | number | boolean | null | NormalizedValue[] | { [key: string]: NormalizedValue };

function normalizeValue(value: unknown): NormalizedValue {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, normalizeValue(entryValue)] as const)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));

    const normalizedObject: Record<string, NormalizedValue> = {};
    for (const [key, entryValue] of entries) {
      normalizedObject[key] = entryValue;
    }
    return normalizedObject;
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      return null;
    }
    return Number(value.toFixed(6));
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return null;
}

function normalizeNodes(project: NodeVisionProject): NormalizedValue[] {
  return [...project.nodes]
    .map((node) => ({
      id: node.id,
      type: node.type,
      displayName: node.displayName ?? null,
      params: normalizeValue(node.params ?? {}),
      inputs: normalizeValue(node.inputs ?? {}),
      outputs: (node.outputs ?? []).slice().sort(),
      cachePolicy: node.cachePolicy ?? null,
      position: node.position
        ? {
            x: node.position.x ?? null,
            y: node.position.y ?? null
          }
        : null
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((node) => normalizeValue(node));
}

function normalizeEdges(project: NodeVisionProject): NormalizedValue[] {
  return [...project.edges]
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      disabled: edge.disabled ?? false
    }))
    .sort((a, b) => {
      const byFrom = a.from.localeCompare(b.from);
      if (byFrom !== 0) {
        return byFrom;
      }
      return a.to.localeCompare(b.to);
    })
    .map((edge) => normalizeValue(edge));
}

function normalizeAssets(project: NodeVisionProject): NormalizedValue[] {
  return [...project.assets]
    .map((asset) => ({
      id: asset.id,
      path: asset.path,
      hash: asset.hash,
      proxyPath: asset.proxyPath ?? null,
      colorSpace: asset.colorSpace ?? null,
      bitDepth: asset.bitDepth ?? null
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((asset) => normalizeValue(asset));
}

function normalizeMetadata(project: NodeVisionProject): NormalizedValue {
  const metadata = project.metadata ?? {};
  return normalizeValue(metadata);
}

function normalizeResolution(project: NodeVisionProject): NormalizedValue {
  if (!project.projectResolution) {
    return null;
  }
  const { width, height } = project.projectResolution;
  return normalizeValue({
    width: width ?? null,
    height: height ?? null
  });
}

export function computeProjectPreviewHash(project: NodeVisionProject | null): string {
  if (!project) {
    return 'null';
  }

  const sanitized = stripAutosaveMetadata(project);

  const payload = {
    schemaVersion: sanitized.schemaVersion,
    mediaColorSpace: sanitized.mediaColorSpace,
    projectFps: sanitized.projectFps,
    projectResolution: normalizeResolution(sanitized),
    nodes: normalizeNodes(sanitized),
    edges: normalizeEdges(sanitized),
    assets: normalizeAssets(sanitized),
    metadata: normalizeMetadata(sanitized)
  };

  return JSON.stringify(normalizeValue(payload));
}
