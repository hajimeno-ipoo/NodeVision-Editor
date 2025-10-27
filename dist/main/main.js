import path, { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, dialog } from 'electron/main';
import { mkdir, access, unlink } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { ProjectValidationError, assertProject, loadProject, saveProject } from '../project-io.js';
const DIST_ROOT = fileURLToPath(new URL('..', import.meta.url));
const RENDERER_DIST = join(DIST_ROOT, 'renderer');
const RENDERER_ENTRY = join(RENDERER_DIST, 'index.html');
const PRELOAD_SCRIPT = fileURLToPath(new URL('../../preload/index.cjs', import.meta.url));
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://127.0.0.1:8000';
const SAMPLE_PROJECT_PATH = fileURLToPath(new URL('../../samples/basic_project.nveproj', import.meta.url));
const AUTOSAVE_SUBDIR = 'autosave';
const AUTOSAVE_FILENAME = 'autosave.nveproj';
function getAutosaveDir() {
    return join(app.getPath('userData'), AUTOSAVE_SUBDIR);
}
function getAutosavePath() {
    return join(getAutosaveDir(), AUTOSAVE_FILENAME);
}
async function ensureAutosaveDir() {
    await mkdir(getAutosaveDir(), { recursive: true });
}
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
    async function appendPreviewMetrics(payload) {
        const { profile, delayMs } = payload;
        if (typeof profile !== 'string' || profile.trim().length === 0) {
            throw new Error('メトリクスのプロファイル名が不正です。');
        }
        if (!Number.isFinite(delayMs)) {
            throw new Error('遅延値が不正です。');
        }
        const normalizedProfile = profile.trim();
        const logPath = process.env.BENCH_LOG ?? join(process.cwd(), 'tmp', 'preview_bench.log');
        await fs.mkdir(path.dirname(logPath), { recursive: true });
        const cpuCount = Math.max(os.cpus().length, 1);
        const loadAverage = os.loadavg()[0] ?? 0;
        const cpuPercent = Math.min(100, (loadAverage / cpuCount) * 100);
        const memoryUsage = typeof payload.memoryUsageMB === 'number' && Number.isFinite(payload.memoryUsageMB)
            ? payload.memoryUsageMB
            : process.memoryUsage().rss / (1024 * 1024);
        const lines = [
            `PREVIEW_DELAY,${normalizedProfile},${delayMs.toFixed(2)}`,
            `CPU_USAGE,${normalizedProfile},${cpuPercent.toFixed(2)}`,
            `MEM_USAGE,${normalizedProfile},${memoryUsage.toFixed(2)}`
        ];
        if (typeof payload.scale === 'number' && Number.isFinite(payload.scale)) {
            lines.push(`PROXY_SCALE,${normalizedProfile},${payload.scale.toFixed(2)}`);
        }
        if (typeof payload.proxy === 'boolean') {
            lines.push(`PROXY_ENABLED,${normalizedProfile},${payload.proxy ? '1' : '0'}`);
        }
        if (typeof payload.reason === 'string' && payload.reason.trim().length > 0) {
            lines.push(`PROXY_REASON,${normalizedProfile},${payload.reason.trim()}`);
        }
        if (typeof payload.targetDelayMs === 'number' && Number.isFinite(payload.targetDelayMs)) {
            lines.push(`DELAY_TARGET,${normalizedProfile},${payload.targetDelayMs.toFixed(2)}`);
        }
        if (typeof payload.averageDelayMs === 'number' && Number.isFinite(payload.averageDelayMs)) {
            lines.push(`DELAY_SNAPSHOT,${normalizedProfile},${payload.averageDelayMs.toFixed(2)}`);
        }
        await fs.appendFile(logPath, `${lines.join('\n')}\n`);
    }
    function prepareProjectForResolution(base, width, height) {
        const clone = JSON.parse(JSON.stringify(base));
        clone.projectResolution = { width, height };
        const metadata = { ...(clone.metadata ?? {}) };
        delete metadata.previewProxy;
        delete metadata.autosave;
        clone.metadata = metadata;
        return clone;
    }
    function parseScenarioSpec(spec) {
        const trimmed = spec.trim();
        if (!trimmed) {
            return null;
        }
        const [resolutionPart, labelOverride] = trimmed.split('=');
        const [widthStr, heightStr] = resolutionPart.split('x');
        const width = Number.parseInt(widthStr ?? '', 10);
        const height = Number.parseInt(heightStr ?? '', 10);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
            console.warn(`[bench] シナリオ指定を解釈できませんでした: ${spec}`);
            return null;
        }
        const label = (labelOverride && labelOverride.trim().length
            ? labelOverride.trim()
            : `${width}x${height}_auto`);
        return { label, width, height };
    }
    async function runPreviewBench() {
        console.log('[bench] Preview bench モードを開始します');
        const logPath = process.env.BENCH_LOG ?? join(process.cwd(), 'tmp', 'preview_bench.log');
        await fs.mkdir(path.dirname(logPath), { recursive: true });
        await fs.writeFile(logPath, '');
        const baseProject = await loadProject(SAMPLE_PROJECT_PATH);
        const iterationsRaw = Number.parseInt(process.env.BENCH_PREVIEW_RUNS ?? '', 10);
        const iterations = Number.isFinite(iterationsRaw) && iterationsRaw > 0 ? iterationsRaw : 3;
        const scenarioSpecs = process.env.BENCH_PREVIEW_SCENARIOS
            ? process.env.BENCH_PREVIEW_SCENARIOS.split(',')
            : ['1920x1080', '3840x2160'];
        const scenarios = scenarioSpecs
            .map(parseScenarioSpec)
            .filter((item) => item !== null)
            .map(({ label, width, height }) => ({
            label,
            project: prepareProjectForResolution(baseProject, width, height)
        }));
        if (scenarios.length === 0) {
            throw new Error('有効な計測シナリオが指定されていません。BENCH_PREVIEW_SCENARIOS を確認してください。');
        }
        console.log(`[bench] シナリオ一覧: ${scenarios.map((scenario) => scenario.label).join(', ')}`);
        for (const scenario of scenarios) {
            console.log(`[bench] シナリオ ${scenario.label} x${iterations}`);
            for (let i = 0; i < iterations; i += 1) {
                const start = performance.now();
                const response = await fetch(new URL('/preview/generate', BACKEND_URL), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ project: scenario.project })
                });
                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(`[bench] プレビュー生成に失敗しました (${response.status} ${text})`);
                }
                const data = (await response.json());
                const delayMs = performance.now() - start;
                await appendPreviewMetrics({
                    profile: scenario.label,
                    delayMs,
                    memoryUsageMB: process.memoryUsage().rss / (1024 * 1024),
                    proxy: data?.proxy?.enabled,
                    scale: typeof data?.proxy?.scale === 'number' ? data.proxy.scale : undefined,
                    reason: typeof data?.proxy?.reason === 'string' ? data.proxy.reason : undefined,
                    targetDelayMs: typeof data?.proxy?.targetDelayMs === 'number' ? data.proxy.targetDelayMs : undefined,
                    averageDelayMs: typeof data?.proxy?.averageDelayMs === 'number' ? data.proxy.averageDelayMs : undefined
                });
            }
        }
        console.log(`[bench] プレビュー計測が完了しました (${logPath})`);
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
        const defaultSlot = 'electron-preview';
        let slot = defaultSlot;
        let projectPayload = payload;
        if (typeof payload === 'object' && payload !== null && 'project' in payload) {
            const candidate = payload;
            projectPayload = candidate.project;
            if (typeof candidate.slot === 'string' && candidate.slot.trim().length > 0) {
                slot = candidate.slot.trim();
            }
        }
        const project = assertProject(projectPayload);
        const normalizedSlot = slot.trim() || defaultSlot;
        const response = await fetch(new URL('/projects/save', BACKEND_URL), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                project,
                slot: normalizedSlot
            })
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Backend save failed with status ${response.status}: ${text}`);
        }
        return response.json();
    });
    ipcMain.handle('backend:loadProject', async (_event, payload) => {
        const rawSlot = typeof payload === 'object' && payload !== null && 'slot' in payload
            ? String(payload.slot ?? 'electron-preview')
            : 'electron-preview';
        const slot = rawSlot.trim().length ? rawSlot.trim() : 'electron-preview';
        const response = await fetch(new URL('/projects/load', BACKEND_URL), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                slot
            })
        });
        let parsed = null;
        try {
            parsed = await response.json();
        }
        catch {
            // ignore JSON parse error here, handled below
        }
        if (!response.ok) {
            const detail = typeof parsed === 'object' && parsed !== null && 'detail' in parsed
                ? parsed.detail
                : null;
            const message = typeof detail === 'object' && detail !== null && 'message' in detail
                ? String(detail.message)
                : `Backend load failed with status ${response.status}`;
            const error = new Error(message);
            if (detail && typeof detail === 'object' && 'issues' in detail) {
                error.issues = detail.issues;
            }
            throw error;
        }
        return parsed;
    });
    ipcMain.handle('project:saveFile', async (_event, payload) => {
        if (!payload || typeof payload !== 'object') {
            throw new Error('保存リクエストが不正です。');
        }
        const { path, project, options } = payload;
        if (typeof path !== 'string' || path.trim().length === 0) {
            throw new Error('保存パスが指定されていません。');
        }
        const normalizedPath = path.trim();
        try {
            const projectData = assertProject(project);
            await saveProject(normalizedPath, projectData, {
                validate: options?.validate ?? true,
                spaces: options?.spaces
            });
            return { path: normalizedPath };
        }
        catch (error) {
            if (error instanceof ProjectValidationError) {
                return {
                    error: error.message,
                    issues: error.issues
                };
            }
            throw error;
        }
    });
    ipcMain.handle('project:saveAsFile', async (_event, payload) => {
        if (!payload || typeof payload !== 'object') {
            throw new Error('保存リクエストが不正です。');
        }
        const { project, defaultPath, options } = payload;
        const projectData = assertProject(project);
        const focusedWindow = BrowserWindow.getFocusedWindow();
        const dialogOptions = {
            title: 'プロジェクトを保存',
            defaultPath: typeof defaultPath === 'string' && defaultPath.trim().length ? defaultPath : undefined,
            filters: [{ name: 'NodeVision Project', extensions: ['nveproj', 'json'] }]
        };
        const { canceled, filePath } = focusedWindow
            ? await dialog.showSaveDialog(focusedWindow, dialogOptions)
            : await dialog.showSaveDialog(dialogOptions);
        if (canceled || !filePath) {
            return { canceled: true };
        }
        await saveProject(filePath, projectData, {
            validate: options?.validate ?? true,
            spaces: options?.spaces
        });
        return {
            canceled: false,
            path: filePath,
            summary: summarizeProject(projectData)
        };
    });
    ipcMain.handle('project:generatePreview', async (_event, payload) => {
        if (!payload || typeof payload !== 'object') {
            throw new Error('プレビューデータが不正です。');
        }
        const { project, forceProxy } = payload;
        const projectData = assertProject(project);
        const response = await fetch(new URL('/preview/generate', BACKEND_URL), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                project: projectData,
                forceProxy
            })
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Preview generation failed: ${response.status} ${text}`);
        }
        return response.json();
    });
    ipcMain.handle('project:autoSave', async (_event, payload) => {
        if (!payload || typeof payload !== 'object') {
            throw new Error('自動保存リクエストが不正です。');
        }
        const { project, options } = payload;
        const projectData = assertProject(project);
        await ensureAutosaveDir();
        const filePath = getAutosavePath();
        const savedAt = new Date().toISOString();
        const reason = typeof options?.reason === 'string' && options.reason.trim().length > 0
            ? options.reason.trim()
            : 'autosave';
        const sourcePath = typeof options?.path === 'string' && options.path.trim().length > 0
            ? options.path.trim()
            : undefined;
        const existingAutosave = projectData.metadata && typeof projectData.metadata === 'object'
            ? projectData.metadata.autosave
            : undefined;
        const autosaveMetadata = existingAutosave && typeof existingAutosave === 'object'
            ? { ...existingAutosave }
            : {};
        autosaveMetadata.savedAt = savedAt;
        autosaveMetadata.reason = reason;
        autosaveMetadata.appVersion = app.getVersion();
        if (sourcePath) {
            autosaveMetadata.sourcePath = sourcePath;
        }
        const metadata = {
            ...(projectData.metadata ?? {}),
            autosave: autosaveMetadata
        };
        const enrichedProject = {
            ...projectData,
            metadata
        };
        await saveProject(filePath, enrichedProject, { validate: true, spaces: 2 });
        return { path: filePath, savedAt };
    });
    ipcMain.handle('project:getAutoSave', async () => {
        const filePath = getAutosavePath();
        try {
            await access(filePath, fsConstants.F_OK);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return { exists: false, path: filePath };
            }
            throw error;
        }
        try {
            const project = await loadProject(filePath);
            const autosave = project.metadata && typeof project.metadata === 'object'
                ? project.metadata.autosave
                : undefined;
            const autosaveRecord = autosave && typeof autosave === 'object' ? autosave : undefined;
            return {
                exists: true,
                path: filePath,
                project,
                summary: summarizeProject(project),
                savedAt: typeof autosaveRecord?.savedAt === 'string' ? autosaveRecord.savedAt : undefined,
                reason: typeof autosaveRecord?.reason === 'string' ? autosaveRecord.reason : undefined,
                sourcePath: typeof autosaveRecord?.sourcePath === 'string' ? autosaveRecord.sourcePath : undefined
            };
        }
        catch (error) {
            return {
                exists: false,
                path: filePath,
                error: error.message
            };
        }
    });
    ipcMain.handle('project:clearAutoSave', async () => {
        const filePath = getAutosavePath();
        try {
            await unlink(filePath);
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
        return { cleared: true, path: filePath };
    });
    ipcMain.handle('metrics:previewLog', async (_event, payload) => {
        if (!payload || typeof payload !== 'object') {
            throw new Error('メトリクスデータが不正です。');
        }
        const { profile, delayMs, memoryUsageMB, proxy, scale, reason, targetDelayMs, averageDelayMs } = payload;
        if (typeof profile !== 'string' || typeof delayMs !== 'number') {
            throw new Error('メトリクスデータの形式が不正です。');
        }
        await appendPreviewMetrics({
            profile,
            delayMs,
            memoryUsageMB: typeof memoryUsageMB === 'number' ? memoryUsageMB : undefined,
            proxy: typeof proxy === 'boolean' ? proxy : undefined,
            scale: typeof scale === 'number' ? scale : undefined,
            reason: typeof reason === 'string' ? reason : undefined,
            targetDelayMs: typeof targetDelayMs === 'number' ? targetDelayMs : undefined,
            averageDelayMs: typeof averageDelayMs === 'number' ? averageDelayMs : undefined
        });
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
    if (process.env.NODEVISION_BENCH === 'preview') {
        try {
            await runPreviewBench();
        }
        finally {
            app.quit();
        }
        return;
    }
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
