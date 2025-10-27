import { describe, expect, it } from 'vitest';
import type { NodeVisionProject } from '../../src/shared/project-types.js';
import { stripAutosaveMetadata } from '../../src/renderer/utils/autosave.js';

describe('stripAutosaveMetadata', () => {
  const baseProject: NodeVisionProject = {
    schemaVersion: '1.0.0',
    mediaColorSpace: 'Rec.709',
    projectFps: 30,
    nodes: [],
    edges: [],
    assets: [],
    metadata: {
      createdAt: '2025-10-25T00:00:00Z'
    }
  };

  it('removes autosave block while preserving other metadata', () => {
    const project = {
      ...baseProject,
      metadata: {
        ...baseProject.metadata,
        autosave: {
          savedAt: '2025-10-26T12:00:00Z',
          reason: 'auto-timer',
          sourcePath: 'tmp/sample.nveproj'
        },
        customNote: 'hello'
      }
    } satisfies NodeVisionProject;

    const cleaned = stripAutosaveMetadata(project);

    expect(cleaned.metadata).toBeTruthy();
    const metadata = cleaned.metadata as Record<string, unknown>;
    expect(metadata.autosave).toBeUndefined();
    expect(metadata.customNote).toBe('hello');
  });

  it('returns project clone when no autosave metadata is present', () => {
    const project = { ...baseProject };
    const cleaned = stripAutosaveMetadata(project);
    expect(cleaned).not.toBe(project);
    expect(cleaned.metadata).toEqual(project.metadata);
  });
});
