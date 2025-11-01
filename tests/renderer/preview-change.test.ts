import { describe, expect, it } from 'vitest';
import type { NodeVisionProject } from '../../src/shared/project-types.js';
import { detectPreviewChange } from '../../src/renderer/utils/preview-change.js';

const BASE_PROJECT: NodeVisionProject = {
  schemaVersion: '1.0.0',
  mediaColorSpace: 'Rec.709',
  projectFps: 30,
  nodes: [
    {
      id: 'n1',
      type: 'MediaInput',
      params: { path: 'Assets/input.mp4' },
      inputs: {},
      outputs: ['video'],
      cachePolicy: 'auto',
      position: { x: 0, y: 0 }
    },
    {
      id: 'n2',
      type: 'ExposureAdjust',
      params: { exposure: 0.5 },
      inputs: { video: 'n1:video' },
      outputs: ['video'],
      cachePolicy: 'auto',
      position: { x: 320, y: 0 }
    }
  ],
  edges: [{ from: 'n1:video', to: 'n2:video' }],
  assets: [
    {
      id: 'asset-clip',
      path: 'Assets/input.mp4',
      hash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    }
  ],
  metadata: { previewProxy: { enabled: true, scale: 0.5 } }
};

function cloneProject(): NodeVisionProject {
  return structuredClone(BASE_PROJECT);
}

describe('detectPreviewChange', () => {
  it('reports change when hash differs', () => {
    const previous = detectPreviewChange(null, cloneProject());
    expect(previous.changed).toBe(true);

    const nextProject = cloneProject();
    nextProject.nodes[1]!.params = { exposure: 1.25 };
    const next = detectPreviewChange(previous.hash, nextProject);
    expect(next.changed).toBe(true);
  });

  it('reports unchanged when autosave metadata only differs', () => {
    const base = cloneProject();
    const first = detectPreviewChange(null, base);
    const mutated = cloneProject();
    mutated.metadata = {
      ...mutated.metadata,
      autosave: { savedAt: '2025-10-31T10:00:00Z', reason: 'auto-timer' }
    } as typeof mutated.metadata;
    const second = detectPreviewChange(first.hash, mutated);
    expect(second.changed).toBe(false);
  });

  it('handles null project comparisons', () => {
    const initial = detectPreviewChange(null, null);
    expect(initial.changed).toBe(false);
    const later = detectPreviewChange(initial.hash, cloneProject());
    expect(later.changed).toBe(true);
  });
});
