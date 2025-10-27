import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, dialog } from 'electron/main';
import { ProjectValidationError, assertProject, loadProject } from '../project-io.js';
const DIST_ROOT = fileURLToPath(new URL('..', import.meta.url));
const RENDERER_DIST = join(DIST_ROOT, 'renderer');
const RENDERER_ENTRY = join(RENDERER_DIST, 'index.html');
const PRELOAD_SCRIPT = fileURLToPath(new URL('../../preload/index.cjs', import.meta.url));
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://127.0.0.1:8000';
const SAMPLE_PROJECT_PATH = fileURLToPath(new URL('../../samples/basic_project.nveproj', import.meta.url));
export async function initializeMainProcess() {
    async function createMainWindow() {
        const window = new BrowserWindow({
            width: 1280,
            height: 720,
            show: false,
            webPreferences: {
                preload: PRELOAD_SCRIPT,
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true
            }
        });
        window.on('ready-to-show', () => {
            window.show();
        });
        if (DEV_SERVER_URL) {
            await window.loadURL(DEV_SERVER_URL);
            window.webContents.openDevTools({ mode: 'detach' });
        }
        else {
            await window.loadFile(RENDERER_ENTRY);
        }
    }
    ipcMain.handle('app:ping', () => 'pong');
    ipcMain.handle('backend:health', async () => {
        const response = await fetch(new URL('/health', BACKEND_URL));
        if (!response.ok) {
            throw new Error(`Backend health check failed with status ${response.status}`);
        }
        return response.json();
    });
    ipcMain.handle('backend:nodesCatalog', async () => {
        const response = await fetch(new URL('/nodes/catalog', BACKEND_URL));
        if (!response.ok) {
            throw new Error(`Backend catalog request failed with status ${response.status}`);
        }
        return response.json();
    });
    ipcMain.handle('backend:saveProject', async (_event, payload) => {
        const project = assertProject(payload);
        const response = await fetch(new URL('/projects/save', BACKEND_URL), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                project,
                slot: 'electron-preview'
            })
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Backend save failed with status ${response.status}: ${text}`);
        }
        return response.json();
    });
    ipcMain.handle('project:loadSample', async () => {
        const filePath = SAMPLE_PROJECT_PATH;
        const project = await loadProject(filePath);
        return {
            path: filePath,
            summary: summarizeProject(project),
            project
        };
    });
    ipcMain.handle('project:openFile', async () => {
        const focusedWindow = BrowserWindow.getFocusedWindow();
        const dialogOptions = {
            properties: ['openFile'],
            filters: [{ name: 'NodeVision Project', extensions: ['nveproj', 'json'] }],
            defaultPath: app.getPath('documents')
        };
        const { canceled, filePaths } = focusedWindow
            ? await dialog.showOpenDialog(focusedWindow, dialogOptions)
            : await dialog.showOpenDialog(dialogOptions);
        if (canceled || filePaths.length === 0) {
            return { canceled: true };
        }
        const [filePath] = filePaths;
        const project = await loadProject(filePath);
        return {
            canceled: false,
            path: filePath,
            summary: summarizeProject(project),
            project
        };
    });
    ipcMain.handle('project:validate', async (_event, payload) => {
        try {
            const project = assertProject(payload);
            return {
                valid: true,
                summary: summarizeProject(project)
            };
        }
        catch (error) {
            if (error instanceof ProjectValidationError) {
                return {
                    valid: false,
                    issues: error.issues
                };
            }
            throw error;
        }
    });
    await app.whenReady();
    await createMainWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            void createMainWindow();
        }
    });
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
}
export default initializeMainProcess;
function summarizeProject(project) {
    return {
        nodes: project.nodes.length,
        edges: project.edges.length,
        assets: project.assets.length,
        fps: project.projectFps,
        colorSpace: project.mediaColorSpace,
        schemaVersion: project.schemaVersion
    };
}
