import { describe, expect, it } from 'vitest';
import type { NodeVisionProject } from '../../src/shared/project-types.js';
import { computeProjectPreviewHash } from '../../src/renderer/utils/preview-hash.js';

const BASE_PROJECT: NodeVisionProject = {
  schemaVersion: '1.0.0',
  mediaColorSpace: 'Rec.709',
  projectFps: 30,
  projectResolution: {
    width: 1920,
    height: 1080
  },
  nodes: [
    {
      id: 'n1',
      type: 'MediaInput',
      params: {
        path: 'Assets/input.mp4'
      },
      inputs: {},
      outputs: ['video'],
      cachePolicy: 'auto',
      position: { x: 0, y: 0 }
    },
    {
      id: 'n2',
      type: 'ExposureAdjust',
      params: {
        exposure: 0.5
      },
      inputs: {
        video: 'n1:video'
      },
      outputs: ['video'],
      cachePolicy: 'auto',
      position: { x: 300, y: 0 }
    }
  ],
  edges: [
    {
      from: 'n1:video',
      to: 'n2:video',
      disabled: false
    }
  ],
  assets: [
    {
      id: 'asset-1',
      path: 'Assets/input.mp4',
      hash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      proxyPath: 'Proxies/asset-1/input_proxy.mp4',
      colorSpace: 'Rec.709',
      bitDepth: 10
    }
  ],
  metadata: {
    previewProxy: {
      enabled: true,
      scale: 0.5
    }
  }
};

function createProject(): NodeVisionProject {
  return JSON.parse(JSON.stringify(BASE_PROJECT)) as NodeVisionProject;
}

describe('computeProjectPreviewHash', () => {
  it('returns constant for null projects', () => {
    expect(computeProjectPreviewHash(null)).toBe('null');
  });

  it('detects node parameter changes', () => {
    const project = createProject();
    const baseline = computeProjectPreviewHash(project);
    project.nodes[1]!.params = {
      ...project.nodes[1]!.params,
      exposure: 0.75
    };
    const mutated = computeProjectPreviewHash(project);
    expect(mutated).not.toBe(baseline);
  });

  it('detects metadata preview proxy changes', () => {
    const project = createProject();
    const baseline = computeProjectPreviewHash(project);
    project.metadata = {
      ...project.metadata,
      previewProxy: {
        ...project.metadata.previewProxy,
        scale: 0.75
      }
    };
    const mutated = computeProjectPreviewHash(project);
    expect(mutated).not.toBe(baseline);
  });

  it('ignores autosave metadata differences', () => {
    const project = createProject();
    const baseline = computeProjectPreviewHash(project);
    project.metadata = {
      ...project.metadata,
      autosave: {
        savedAt: '2025-10-26T12:00:00Z',
        reason: 'auto-timer',
        sourcePath: '/tmp/sample.nveproj'
      }
    } as typeof project.metadata;
    const withAutosave = computeProjectPreviewHash(project);
    expect(withAutosave).toBe(baseline);
  });

  it('normalizes node ordering for stable hashes', () => {
    const projectA = createProject();
    const projectB = createProject();
    projectB.nodes = [...projectB.nodes].reverse();
    const hashA = computeProjectPreviewHash(projectA);
    const hashB = computeProjectPreviewHash(projectB);
    expect(hashB).toBe(hashA);
  });

  it('detects asset changes', () => {
    const project = createProject();
    const baseline = computeProjectPreviewHash(project);
    project.assets[0]!.hash = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const mutated = computeProjectPreviewHash(project);
    expect(mutated).not.toBe(baseline);
  });
});
