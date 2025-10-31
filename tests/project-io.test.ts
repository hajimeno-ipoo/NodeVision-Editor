import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NodeVisionProject } from '../src/shared/project-types.js';
import {
  ProjectValidationError,
  assertProject,
  formatValidationIssues,
  getProjectSchemaPath,
  getValidator,
  loadProject,
  parseProject,
  resolveAddFormats,
  resolveAjvConstructor,
  saveProject,
  serializeProject,
  validateProject
} from '../src/project-io.js';

function createValidProject(overrides: Partial<NodeVisionProject> = {}): NodeVisionProject {
  const base: NodeVisionProject = {
    schemaVersion: '1.0.0',
    mediaColorSpace: 'sRGB',
    projectFps: 30,
    projectResolution: { width: 1920, height: 1080 },
    nodes: [
      {
        id: 'n1',
        type: 'ImageInput',
        params: { path: 'Assets/image.png' },
        inputs: {},
        outputs: ['image'],
        position: { x: 0, y: 0 }
      },
      {
        id: 'n2',
        type: 'ExposureAdjust',
        params: { exposure: 0.5 },
        inputs: { image: 'n1:image' },
        outputs: ['image'],
        cachePolicy: 'auto',
        position: { x: 320, y: 0 }
      }
    ],
    edges: [
      { from: 'n1:image', to: 'n2:image' }
    ],
    assets: [
      { id: 'asset-1', path: 'Assets/image.png', hash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
    ],
    metadata: {
      createdWith: 'NodeVision Editor',
      createdAt: '2025-10-25T00:00:00Z',
      previewProxy: { enabled: true, scale: 0.5 }
    }
  };

  return { ...base, ...overrides };
}

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'nodevision-tests-'));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await mkdir(tempDir, { recursive: true });
});

describe('project-io', () => {
  it('validateProject returns true for valid project', () => {
    const project = createValidProject();
    expect(validateProject(project)).toBe(true);
  });

  it('assertProject throws ProjectValidationError when invalid', () => {
    const project = createValidProject({ nodes: [] });
    expect(() => assertProject(project)).toThrow(ProjectValidationError);
  });

  it('formatValidationIssues produces readable entries', () => {
    const issues = formatValidationIssues([
      {
        instancePath: '/nodes',
        schemaPath: '#/properties/nodes/minItems',
        keyword: 'minItems',
        params: { limit: 1 },
        message: 'must NOT have fewer than 1 items'
      }
    ]);

    expect(issues[0]).toMatchObject({
      path: '/nodes',
      keyword: 'minItems'
    });
  });

  it('formatValidationIssues returns empty array when errors list missing', () => {
    expect(formatValidationIssues(null)).toEqual([]);
    expect(formatValidationIssues(undefined)).toEqual([]);
  });

  it('formatValidationIssues falls back to schemaPath when instancePath absent', () => {
    const issues = formatValidationIssues([
      {
        instancePath: '',
        schemaPath: '#/properties/assets/minItems',
        keyword: 'minItems',
        params: { limit: 1 },
        message: 'must NOT have fewer than 1 items'
      }
    ]);

    expect(issues[0]).toMatchObject({ path: '#/properties/assets/minItems' });
  });

  it('formatValidationIssues defaults path and message when missing', () => {
    const issues = formatValidationIssues([
      {
        instancePath: '',
        schemaPath: '',
        keyword: 'type',
        params: {},
        message: undefined
      }
    ]);

    expect(issues[0]).toMatchObject({ path: '(root)', message: 'validation error' });
  });

  it('serialize and save project to disk, then load successfully', async () => {
    const project = createValidProject();
    const filePath = join(tempDir, 'sample.nveproj');

    await saveProject(filePath, project);
    const savedContent = await readFile(filePath, 'utf-8');
    expect(savedContent).toContain('"schemaVersion": "1.0.0"');

    const loaded = await loadProject(filePath);
    expect(loaded.nodes.length).toBe(2);
    expect(loaded.assets[0].hash).toMatch(/^sha256:/);
  });

  it('saveProject rejects invalid project when validation enabled', async () => {
    const project = createValidProject({ schemaVersion: '1.0' });
    await expect(saveProject(join(tempDir, 'invalid.nveproj'), project)).rejects.toBeInstanceOf(ProjectValidationError);
  });

  it('saveProject can skip validation when explicitly disabled', async () => {
    const project = createValidProject({ schemaVersion: '1.0' });
    const filePath = join(tempDir, 'skip-validate.nveproj');

    await expect(saveProject(filePath, project, { validate: false, spaces: 4 })).resolves.toBeUndefined();

    const saved = await readFile(filePath, 'utf-8');
    expect(saved.trim().startsWith('{')).toBe(true);
    expect(saved).toContain('"schemaVersion": "1.0"');
    expect(saved.endsWith('\n')).toBe(true);
  });

  it('serializeProject respects spacing option', () => {
    const project = createValidProject();
    const compact = serializeProject(project, 0);
    expect(compact).not.toContain('\n ');
  });

  it('getProjectSchemaPath points to existing file', async () => {
    const schemaPath = getProjectSchemaPath();
    const stats = await readFile(schemaPath, 'utf-8');
    expect(stats.length).toBeGreaterThan(0);
  });

  it('parseProject throws ProjectValidationError on invalid JSON', () => {
    expect(() => parseProject('not-json')).toThrow(ProjectValidationError);
  });

  it('getValidator returns a reusable validation function', () => {
    const validator = getValidator();
    expect(typeof validator).toBe('function');
    expect(validator(createValidProject())).toBe(true);
  });

  it('resolveAjvConstructor uses default export when available', () => {
    class DefaultAjv {
      compile = vi.fn();
      addMetaSchema = vi.fn();
    }

    const ctor = resolveAjvConstructor({ default: DefaultAjv });
    const instance = new ctor();
    expect(instance).toBeInstanceOf(DefaultAjv);
  });

  it('resolveAjvConstructor falls back to module when default missing', () => {
    class FallbackAjv {
      compile = vi.fn();
      addMetaSchema = vi.fn();
    }

    const ctor = resolveAjvConstructor(FallbackAjv);
    const instance = new ctor();
    expect(instance).toBeInstanceOf(FallbackAjv);
  });

  it('resolveAddFormats prefers default export', () => {
    const handler = vi.fn();
    const resolved = resolveAddFormats({ default: handler } as Record<string, unknown>);
    resolved('ajv');
    expect(handler).toHaveBeenCalledWith('ajv');
  });

  it('resolveAddFormats falls back to module function when default missing', () => {
    const handler = vi.fn();
    const resolved = resolveAddFormats(handler);
    resolved('ajv', { option: true });
    expect(handler).toHaveBeenCalledWith('ajv', { option: true });
  });
});
