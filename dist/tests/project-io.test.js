import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ProjectValidationError, assertProject, formatValidationIssues, getProjectSchemaPath, loadProject, saveProject, serializeProject, validateProject } from '../src/project-io.js';
function createValidProject(overrides = {}) {
    const base = {
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
let tempDir;
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
});
