import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire, Module as NodeModule } from 'node:module';

const electronMocks = {
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn()
};

let exposedApi: Record<string, any>;

function loadPreloadBridge(): void {
  const originalLoad = (NodeModule as any)._load;
  (NodeModule as any)._load = function patched(request: string, parent: unknown, isMain: boolean) {
    if (request === 'electron') {
      return {
        contextBridge: {
          exposeInMainWorld: electronMocks.exposeInMainWorld
        },
        ipcRenderer: {
          invoke: electronMocks.invoke
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const requireFromTest = createRequire(import.meta.url);
    const modulePath = requireFromTest.resolve('../../preload/index.cjs');
    delete requireFromTest.cache?.[modulePath];
    requireFromTest(modulePath);
  } finally {
    (NodeModule as any)._load = originalLoad;
  }

  const call = electronMocks.exposeInMainWorld.mock.calls.at(-1);
  if (!call) {
    throw new Error('preload bridge did not expose API');
  }
  exposedApi = call[1] as Record<string, any>;
}

describe('preload bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    electronMocks.exposeInMainWorld.mockClear();
    electronMocks.invoke.mockReset();
    electronMocks.invoke.mockResolvedValue(undefined);
    loadPreloadBridge();
  });

  it('exposes nodevision API namespace', () => {
    expect(electronMocks.exposeInMainWorld).toHaveBeenCalledWith('nodevision', expect.any(Object));
  });

  it('delegates pingとbackend系IPCをipcRenderer.invokeへ橋渡し', async () => {
    await exposedApi.ping();
    await exposedApi.backend.health();
    await exposedApi.backend.nodesCatalog();
    await exposedApi.backend.loadProject({ slot: 'autosave' });

    expect(electronMocks.invoke.mock.calls).toEqual([
      ['app:ping'],
      ['backend:health'],
      ['backend:nodesCatalog'],
      ['backend:loadProject', { slot: 'autosave' }]
    ]);
  });

  it('sends structured payload for project.saveToBackend', async () => {
    const payload = { id: 'demo' };
    await exposedApi.project.saveToBackend(payload, { slot: 'recent' });
    expect(electronMocks.invoke).toHaveBeenCalledWith('backend:saveProject', {
      project: payload,
      slot: 'recent'
    });
  });

  it('passes project and options when calling project.autoSave', async () => {
    const payload = { schemaVersion: '1.0.0' };
    await exposedApi.project.autoSave(payload, { intervalMs: 5000 });
    expect(electronMocks.invoke).toHaveBeenCalledWith('project:autoSave', {
      project: payload,
      options: { intervalMs: 5000 }
    });
  });

  it('routes project file management APIs to ipcRenderer.invoke', async () => {
    const project = { schemaVersion: '1.0.0', nodes: [] };

    await exposedApi.project.loadSample();
    await exposedApi.project.openFile();
    await exposedApi.project.validate(project);
    await exposedApi.project.saveToFile('/tmp/demo.nveproj', project, { overwrite: true });
    await exposedApi.project.saveAsFile(project, { defaultPath: '/tmp/new.nveproj' });
    await exposedApi.project.getAutoSave();
    await exposedApi.project.clearAutoSave();
    await exposedApi.project.generatePreview(project, { forceProxy: true });
    await exposedApi.project.loadFromBackend({ slot: 'recent' });

    expect(electronMocks.invoke.mock.calls).toEqual([
      ['project:loadSample'],
      ['project:openFile'],
      ['project:validate', project],
      [
        'project:saveFile',
        {
          path: '/tmp/demo.nveproj',
          project,
          options: { overwrite: true }
        }
      ],
      [
        'project:saveAsFile',
        {
          project,
          defaultPath: '/tmp/new.nveproj',
          options: { defaultPath: '/tmp/new.nveproj' }
        }
      ],
      ['project:getAutoSave'],
      ['project:clearAutoSave'],
      [
        'project:generatePreview',
        {
          project,
          forceProxy: true
        }
      ],
      ['backend:loadProject', { slot: 'recent' }]
    ]);
  });

  it('exposes metrics logger that forwards payload', async () => {
    await exposedApi.metrics.logPreview({ delayMs: 12 });
    expect(electronMocks.invoke).toHaveBeenCalledWith('metrics:previewLog', { delayMs: 12 });
  });
});
