import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NodeVisionProject } from '../shared/project-types';
import { NodeGraphCanvas } from './components/NodeGraphCanvas';
import { PreviewPanel, type PreviewData } from './components/PreviewPanel';
import { cloneProject, stripAutosaveMetadata } from './utils/autosave';

const HISTORY_LIMIT = 50;
const AUTOSAVE_DELAY_MS = 5000;

const AUTOSAVE_REASON_LABELS: Record<string, string> = {
  autosave: '自動保存',
  'auto-timer': '自動保存',
  'manual-retry': '手動で再保存',
  restore: '復旧処理',
  imported: '外部取り込み',
  'backend-slot': 'バックエンド復旧'
};

const DEFAULT_BACKEND_SLOT = 'electron-preview';
const MAX_BACKEND_RECOVERY_RETRIES = 3;

function sanitizeBackendSlot(value: string | null | undefined, fallback: string = DEFAULT_BACKEND_SLOT): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  const base = trimmed.length > 0 ? trimmed : fallback;
  let sanitized = base.replace(/[\\/]/g, '_');
  while (sanitized.includes('..')) {
    sanitized = sanitized.replace('..', '_');
  }
  sanitized = sanitized.replace(/[^A-Za-z0-9_.-]/g, '');
  return sanitized.length > 0 ? sanitized : fallback;
}

function formatTimestamp(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('ja-JP');
}



interface NodeEditorState {
  nodeId: string | null;
  displayName: string;
  paramsText: string;
  error: string | null;
  dirty: boolean;
}

type ToastTone = 'success' | 'error' | 'info';

interface AppToast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ProjectChangeMeta {
  pushHistory?: boolean;
}

interface AutoSaveRecovery {
  kind: 'local' | 'backend';
  path: string;
  slot?: string | null;
  summary: NodeVisionProjectSummary;
  project: NodeVisionProject;
  savedAt?: string | null;
  reason?: string | null;
  sourcePath?: string | null;
}

type PreviewState = PreviewData;

export default function App() {
  const [pingResult, setPingResult] = useState<string>('pending');
  const [error, setError] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<string>('pending');
  const [backendError, setBackendError] = useState<string | null>(null);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [projectSummary, setProjectSummary] = useState<NodeVisionProjectSummary | null>(null);
  const [projectIssues, setProjectIssues] = useState<Array<{ path: string; message: string; type?: string }>>([]);
  const [projectData, setProjectData] = useState<NodeVisionProject | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [nodeCatalog, setNodeCatalog] = useState<NodeCatalogItem[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [savePath, setSavePath] = useState<string | null>(null);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid' | 'error'>('idle');
  const [validationTimestamp, setValidationTimestamp] = useState<string | null>(null);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [validationErrorMessage, setValidationErrorMessage] = useState<string | null>(null);
  const [fileSaveStatus, setFileSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [fileSaveError, setFileSaveError] = useState<string | null>(null);
  const [backendSlot, setBackendSlot] = useState<string>(DEFAULT_BACKEND_SLOT);
  const [lastSavedSlot, setLastSavedSlot] = useState<string | null>(null);
  const backendSlotRef = useRef<string>(DEFAULT_BACKEND_SLOT);
  const [localAutoSaveChecked, setLocalAutoSaveChecked] = useState(false);
  const [backendRecoveryStatus, setBackendRecoveryStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [backendRecoveryError, setBackendRecoveryError] = useState<string | null>(null);
  const [backendRecoveryTrigger, setBackendRecoveryTrigger] = useState(0);
  const [backendRecoveryAttemptCount, setBackendRecoveryAttemptCount] = useState(0);
  const [backendRecoveryLastAttemptAt, setBackendRecoveryLastAttemptAt] = useState<string | null>(null);
  const backendRecoveryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const backendRecoverySlotRef = useRef<string | null>(null);
  const [nodeEditorState, setNodeEditorState] = useState<NodeEditorState>({
    nodeId: null,
    displayName: '',
    paramsText: '{}',
    error: null,
    dirty: false
  });
  const [pastProjects, setPastProjects] = useState<NodeVisionProject[]>([]);
  const [futureProjects, setFutureProjects] = useState<NodeVisionProject[]>([]);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const [lastAutoSavePath, setLastAutoSavePath] = useState<string | null>(null);
  const [lastAutoSaveAt, setLastAutoSaveAt] = useState<string | null>(null);
  const [autoSaveRecovery, setAutoSaveRecovery] = useState<AutoSaveRecovery | null>(null);
  const [autoSaveLoadError, setAutoSaveLoadError] = useState<string | null>(null);
  const [autoSavePromptOpen, setAutoSavePromptOpen] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
  const [previewStatus, setPreviewStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewProxyMode, setPreviewProxyMode] = useState<'auto' | 'on' | 'off'>('auto');
  const [toast, setToast] = useState<AppToast | null>(null);
  const hasPendingChangesRef = useRef(false);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clearAutoSaveTimer = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);
  const previewRequestRef = useRef(0);
  const previewMetricsRef = useRef<{ start: number; profile: string } | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingPreviewProjectRef = useRef<NodeVisionProject | null>(null);
  const isPreviewInFlightRef = useRef(false);
  const clearToastTimer = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);
  const sanitizedBackendSlot = useMemo(
    () => sanitizeBackendSlot(backendSlot, DEFAULT_BACKEND_SLOT),
    [backendSlot]
  );
  const backendSlotInputNormalized = useMemo(
    () => (backendSlot.trim().length > 0 ? backendSlot.trim() : DEFAULT_BACKEND_SLOT),
    [backendSlot]
  );
  const backendSlotWasSanitized = useMemo(
    () => sanitizedBackendSlot !== backendSlotInputNormalized,
    [backendSlotInputNormalized, sanitizedBackendSlot]
  );
  const backendRecoveryAttemptAtLabel = useMemo(
    () => formatTimestamp(backendRecoveryLastAttemptAt),
    [backendRecoveryLastAttemptAt]
  );
  const scheduleBackendRecovery = useCallback(
    (options?: { resetAttempts?: boolean; delayMs?: number }) => {
      if (backendRecoveryTimerRef.current) {
        clearTimeout(backendRecoveryTimerRef.current);
        backendRecoveryTimerRef.current = null;
      }
      if (options?.resetAttempts) {
        setBackendRecoveryAttemptCount(0);
      }
      const delay = options?.delayMs ?? 0;
      if (delay > 0) {
        backendRecoveryTimerRef.current = setTimeout(() => {
          setBackendRecoveryTrigger((value) => value + 1);
          backendRecoveryTimerRef.current = null;
        }, delay);
      } else {
        setBackendRecoveryTrigger((value) => value + 1);
      }
    },
    []
  );
  useEffect(() => {
    return () => {
      if (backendRecoveryTimerRef.current) {
        clearTimeout(backendRecoveryTimerRef.current);
        backendRecoveryTimerRef.current = null;
      }
    };
  }, []);
  const showToast = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      clearToastTimer();
      setToast({ id: Date.now(), message, tone });
      toastTimerRef.current = setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, 4000);
    },
    [clearToastTimer]
  );
  const handleDismissToast = useCallback(() => {
    clearToastTimer();
    setToast(null);
  }, [clearToastTimer]);

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      try {
        const result = await window.nodevision?.ping?.();
        if (!cancelled) {
          setPingResult(result ?? 'unavailable');
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setPingResult('error');
        }
      }
    }

    void ping();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkBackend() {
      try {
        const health = await window.nodevision?.backend?.health?.();
        if (!cancelled) {
          setBackendStatus(health ? `${health.status} (${health.version})` : 'unavailable');
        }
      } catch (err) {
        if (!cancelled) {
          setBackendError((err as Error).message);
          setBackendStatus('error');
        }
      }
    }

    void checkBackend();

    return () => {
      cancelled = true;
    };
  }, []);

  const createSummaryFromProject = useCallback((project: NodeVisionProject): NodeVisionProjectSummary => {
    return {
      nodes: project.nodes.length,
      edges: project.edges.length,
      assets: project.assets.length,
      fps: project.projectFps,
      colorSpace: project.mediaColorSpace,
      schemaVersion: project.schemaVersion
    };
  }, []);

  const applyProjectState = useCallback(
    (
      project: NodeVisionProject,
      summary?: NodeVisionProjectSummary,
      nextPath?: string | null,
      options?: { preserveSelection?: boolean; pushHistory?: boolean; resetHistory?: boolean }
    ) => {
      const derivedSummary = summary ?? createSummaryFromProject(project);

      clearAutoSaveTimer();

      if (options?.resetHistory) {
        setPastProjects([]);
        setFutureProjects([]);
        hasPendingChangesRef.current = false;
        setLastAutoSavePath(null);
        setLastAutoSaveAt(null);
      } else if (options?.pushHistory && projectData) {
        setPastProjects((prevPast) => {
          const snapshot = cloneProject(projectData);
          const nextPast = [...prevPast, snapshot];
          if (nextPast.length > HISTORY_LIMIT) {
            nextPast.shift();
          }
          return nextPast;
        });
        setFutureProjects([]);
        hasPendingChangesRef.current = true;
      }

      setProjectData(cloneProject(project));
      setProjectSummary(derivedSummary);
      setProjectIssues([]);
      setValidationStatus('idle');
      setValidationTimestamp(null);
      setSaveStatus(null);
      setSavePath(null);
      setProjectError(null);
      if (!options?.preserveSelection) {
        setSelectedNodes([]);
        setSelectedEdges([]);
      }
      if (options?.resetHistory) {
        setLastSavedSlot(null);
      }
      setSaveErrorMessage(null);
      setValidationErrorMessage(null);
      setFileSaveStatus('idle');
      setFileSaveError(null);
      setAutoSaveStatus('idle');
      setAutoSaveError(null);
      if (typeof nextPath === 'string') {
        setProjectPath(nextPath);
      } else if (nextPath === null) {
        setProjectPath(null);
      }
    },
    [clearAutoSaveTimer, createSummaryFromProject, projectData]
  );

  const handleLoadSampleProject = useCallback(async () => {
    setProjectError(null);
    try {
      const response = await window.nodevision?.project?.loadSample?.();
      if (response) {
        applyProjectState(response.project, response.summary, response.path, { resetHistory: true });
      }
    } catch (err) {
      setProjectError((err as Error).message);
    }
  }, [applyProjectState]);

  const fetchBackendProject = useCallback(async (slot: string) => {
    const response = await window.nodevision?.project?.loadFromBackend?.({ slot });
    if (!response) {
      throw new Error('バックエンドからのレスポンスが空でした。');
    }
    return response;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let shouldScheduleBackend = false;

    const loadRecoveryInfo = async () => {
      try {
        const info = await window.nodevision?.project?.getAutoSave?.();
        if (cancelled) {
          return;
        }
        if (info && info.exists && info.path && info.project && info.summary) {
          const recovery: AutoSaveRecovery = {
            kind: 'local',
            path: info.path,
            project: info.project,
            summary: info.summary,
            savedAt: info.savedAt ?? null,
            reason: info.reason ?? null,
            sourcePath: info.sourcePath ?? null
          };
          setAutoSaveRecovery(recovery);
          setAutoSavePromptOpen(true);
          setAutoSaveLoadError(null);
          setLastAutoSavePath(info.path ?? null);
          setLastAutoSaveAt(info.savedAt ?? null);
        } else {
          if (info && 'error' in info && typeof info.error === 'string') {
            setAutoSaveLoadError(info.error);
          } else {
            setAutoSaveLoadError(null);
          }
          if (info && 'exists' in info && !info.exists) {
            setLastAutoSavePath(null);
            setLastAutoSaveAt(null);
          }
          shouldScheduleBackend = true;
        }
      } catch (err) {
        if (!cancelled) {
          setAutoSaveLoadError((err as Error).message);
        }
        shouldScheduleBackend = true;
      } finally {
        if (!cancelled) {
          setLocalAutoSaveChecked(true);
          if (shouldScheduleBackend) {
            setBackendRecoveryStatus('idle');
            setBackendRecoveryError(null);
            setBackendRecoveryAttemptCount(0);
            setBackendRecoveryLastAttemptAt(null);
            scheduleBackendRecovery({ resetAttempts: true });
          }
        }
      }
    };

    void loadRecoveryInfo();

    return () => {
      cancelled = true;
    };
  }, [scheduleBackendRecovery]);

  useEffect(() => {
    if (!localAutoSaveChecked) {
      return;
    }
    if (autoSaveRecovery && autoSaveRecovery.kind === 'local') {
      return;
    }
    if (backendRecoveryTrigger === 0) {
      return;
    }
    if (backendRecoveryStatus === 'pending') {
      if (backendRecoverySlotRef.current && backendRecoverySlotRef.current !== sanitizedBackendSlot) {
        scheduleBackendRecovery({ delayMs: 250 });
      }
      return;
    }

    const targetSlot = sanitizedBackendSlot;
    const hasBackendRecovery =
      autoSaveRecovery &&
      autoSaveRecovery.kind === 'backend' &&
      sanitizeBackendSlot(autoSaveRecovery.slot ?? targetSlot, DEFAULT_BACKEND_SLOT) === targetSlot;
    if (hasBackendRecovery) {
      return;
    }

    let cancelled = false;
    setBackendRecoveryStatus('pending');
    setBackendRecoveryError(null);
    setAutoSaveLoadError(null);
    backendRecoverySlotRef.current = targetSlot;
    const attemptTimestamp = new Date().toISOString();
    setBackendRecoveryLastAttemptAt(attemptTimestamp);

    const run = async () => {
      try {
        const response = await fetchBackendProject(targetSlot);
        if (cancelled) {
          return;
        }
        const metadata = (response.project.metadata ?? {}) as Record<string, unknown>;
        const autosaveEntry =
          metadata && typeof metadata === 'object' && 'autosave' in metadata && metadata.autosave && typeof metadata.autosave === 'object'
            ? (metadata.autosave as Record<string, unknown>)
            : null;
        const savedAt =
          autosaveEntry && typeof autosaveEntry.savedAt === 'string' ? autosaveEntry.savedAt : null;
        const reason =
          autosaveEntry && typeof autosaveEntry.reason === 'string' ? autosaveEntry.reason : 'backend-slot';
        const sourcePath =
          autosaveEntry && typeof autosaveEntry.sourcePath === 'string' ? autosaveEntry.sourcePath : null;

        const recovery: AutoSaveRecovery = {
          kind: 'backend',
          slot: response.slot ?? targetSlot,
          path: response.path,
          project: response.project,
          summary: response.summary,
          savedAt,
          reason,
          sourcePath
        };
        setAutoSaveRecovery(recovery);
        setAutoSavePromptOpen(true);
        setAutoSaveLoadError(null);
        setLastAutoSavePath(response.path ?? null);
        setLastAutoSaveAt(savedAt);
        setBackendRecoveryStatus('success');
        setBackendRecoveryError(null);
        setBackendRecoveryAttemptCount(0);
        backendSlotRef.current = response.slot ?? targetSlot;
        setBackendSlot(response.slot ?? targetSlot);
        backendRecoverySlotRef.current = response.slot ?? targetSlot;
      } catch (err) {
        if (cancelled) {
          return;
        }
        const message = (err as Error).message ?? 'バックエンド復旧に失敗しました。';
        setBackendRecoveryStatus('error');
        setBackendRecoveryError(message);
        setAutoSaveLoadError(`バックエンド復旧に失敗しました: ${message}`);
        setBackendRecoveryAttemptCount((prev) => {
          const next = prev + 1;
          if (next < MAX_BACKEND_RECOVERY_RETRIES) {
            const backoffMs = Math.min(30000, 5000 * next);
            scheduleBackendRecovery({ delayMs: backoffMs });
          }
          return next;
        });
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    autoSaveRecovery,
    backendRecoveryStatus,
    fetchBackendProject,
    localAutoSaveChecked,
    sanitizedBackendSlot,
    backendRecoveryTrigger,
    scheduleBackendRecovery
  ]);

  const handleOpenProject = useCallback(async () => {
    setProjectError(null);
    try {
      const result = await window.nodevision?.project?.openFile?.();
      if (!result) {
        return;
      }
      if ('canceled' in result && result.canceled) {
        return;
      }
      applyProjectState(result.project, result.summary, result.path, { resetHistory: true });
    } catch (err) {
      setProjectError((err as Error).message);
    }
  }, [applyProjectState]);

  const handleLoadFromBackend = useCallback(async () => {
    setProjectError(null);
    try {
      const normalizedSlot = sanitizedBackendSlot;
      const response = await fetchBackendProject(normalizedSlot);
      applyProjectState(response.project, response.summary, response.path, { resetHistory: true });
      const resolvedSlot = response.slot ?? normalizedSlot;
      if (resolvedSlot !== backendSlot) {
        backendSlotRef.current = resolvedSlot;
        setBackendSlot(resolvedSlot);
      }
      const metadata = (response.project.metadata ?? {}) as Record<string, unknown>;
      const autosaveEntry =
        metadata && typeof metadata === 'object' && 'autosave' in metadata && metadata.autosave && typeof metadata.autosave === 'object'
          ? (metadata.autosave as Record<string, unknown>)
          : null;
      const savedAt =
        autosaveEntry && typeof autosaveEntry.savedAt === 'string' ? autosaveEntry.savedAt : null;
      setAutoSaveRecovery(null);
      setAutoSavePromptOpen(false);
      setAutoSaveLoadError(null);
      setLastAutoSavePath(response.path ?? null);
      setLastAutoSaveAt(savedAt);
      setLastSavedSlot(resolvedSlot);
      setBackendRecoveryStatus('success');
      setBackendRecoveryError(null);
      setBackendRecoveryAttemptCount(0);
      setBackendRecoveryLastAttemptAt(new Date().toISOString());
      backendRecoverySlotRef.current = resolvedSlot;
    } catch (err) {
      const error = err as Error & { issues?: Array<{ path?: string; message?: string; type?: string }> };
      setProjectError(error.message);
      setBackendRecoveryStatus('error');
      setBackendRecoveryError(error.message);
      setBackendRecoveryLastAttemptAt(new Date().toISOString());
      if (Array.isArray(error.issues)) {
        setProjectIssues(
          error.issues.map((issue) => ({
            path: typeof issue?.path === 'string' ? issue.path : '(root)',
            message: typeof issue?.message === 'string' ? issue.message : '検証エラーが発生しました。',
            type: typeof issue?.type === 'string' ? issue.type : undefined
          }))
        );
        setValidationStatus('invalid');
        setValidationTimestamp(new Date().toISOString());
      }
    }
  }, [applyProjectState, backendSlot, fetchBackendProject, sanitizedBackendSlot]);

  const handleValidateCurrent = useCallback(async () => {
    if (!projectData) {
      setProjectError('読み込まれたプロジェクトがありません。');
      return;
    }

    setProjectError(null);
    setValidationStatus('validating');
    setValidationErrorMessage(null);
    try {
      const result = await window.nodevision?.project?.validate?.(projectData);
      if (!result) {
        setValidationStatus('error');
        setValidationErrorMessage('検証結果を取得できませんでした。');
        return;
      }
      if (result.valid) {
        applyProjectState(projectData, result.summary, projectPath, { preserveSelection: true });
        setValidationStatus('valid');
        setValidationTimestamp(new Date().toISOString());
      } else {
        setProjectIssues(
          (result.issues ?? []).map((issue) => ({
            path: issue.path,
            message: issue.message,
            type: issue.keyword
          }))
        );
        setValidationStatus('invalid');
        setValidationTimestamp(new Date().toISOString());
      }
    } catch (err) {
      setValidationStatus('error');
      setProjectError((err as Error).message);
      setValidationErrorMessage((err as Error).message);
    }
  }, [applyProjectState, projectData, projectPath]);

  const handleFetchCatalog = useCallback(async () => {
    setCatalogError(null);
    try {
      const catalog = await window.nodevision?.backend?.nodesCatalog?.();
      if (catalog) {
        setNodeCatalog(catalog);
      }
    } catch (err) {
      setCatalogError((err as Error).message);
    }
  }, []);

  const handleBackendSlotInputChange = useCallback(
    (value: string) => {
      backendSlotRef.current = value;
      setBackendSlot(value);
      setBackendRecoveryStatus('idle');
      setBackendRecoveryError(null);
      setBackendRecoveryLastAttemptAt(null);
      setAutoSaveLoadError(null);
      if (localAutoSaveChecked && (!autoSaveRecovery || autoSaveRecovery.kind !== 'local')) {
        scheduleBackendRecovery({ resetAttempts: true, delayMs: 300 });
      }
    },
    [autoSaveRecovery, localAutoSaveChecked, scheduleBackendRecovery]
  );
  const handleRetryBackendRecovery = useCallback(() => {
    if (!localAutoSaveChecked) {
      return;
    }
    setBackendRecoveryStatus('idle');
    setBackendRecoveryError(null);
    setBackendRecoveryLastAttemptAt(null);
    setAutoSaveLoadError(null);
    scheduleBackendRecovery({ resetAttempts: true });
  }, [localAutoSaveChecked, scheduleBackendRecovery]);

  const requestPreview = useCallback(
    async (project: NodeVisionProject | null, requestId: number) => {
      isPreviewInFlightRef.current = true;
      if (!project) {
        setPreviewState(null);
        setPreviewStatus('idle');
        setPreviewError(null);
        previewMetricsRef.current = null;
        isPreviewInFlightRef.current = false;
        const nextProject = pendingPreviewProjectRef.current;
        if (nextProject) {
          pendingPreviewProjectRef.current = null;
          const nextId = previewRequestRef.current + 1;
          previewRequestRef.current = nextId;
          void requestPreview(nextProject, nextId);
        }
        return;
      }

      const start = performance.now();
      console.debug('[preview] request:start', {
        requestId,
        currentRef: previewRequestRef.current,
        inFlight: isPreviewInFlightRef.current,
        projectHash: project ? JSON.stringify({ nodes: project.nodes.length, edges: project.edges.length }) : 'null'
      });
      setPreviewStatus('loading');
      setPreviewError(null);

      try {
        const response = await window.nodevision?.project?.generatePreview?.(project, {
          forceProxy:
            previewProxyMode === 'auto' ? undefined : previewProxyMode === 'on'
        });
        if (!response || requestId !== previewRequestRef.current) {
          console.debug('[preview] request:stale', {
            requestId,
            currentRef: previewRequestRef.current
          });
          return;
        }
        const proxyScale = typeof response.proxy.scale === 'number' ? response.proxy.scale : 1;
        const profileSuffix = response.proxy.enabled
          ? `_proxy_${proxyScale.toFixed(2)}`
          : '';
        const profile = `${response.source.width}x${response.source.height}${profileSuffix}`;
        previewMetricsRef.current = { start, profile };
        setPreviewState({
          imageSrc: `data:image/png;base64,${response.imageBase64}`,
          width: response.width,
          height: response.height,
          sourceWidth: response.source.width,
          sourceHeight: response.source.height,
          proxyEnabled: response.proxy.enabled,
          proxyScale,
          proxyReason: response.proxy.reason,
          averageDelayMs: response.proxy.averageDelayMs ?? undefined,
          targetDelayMs: response.proxy.targetDelayMs ?? undefined,
          generatedAt: response.generatedAt,
          profile
        });
        setPreviewStatus('ready');
        console.debug('[preview] request:success', {
          requestId,
          durationMs: performance.now() - start,
          width: response.width,
          height: response.height
        });
      } catch (err) {
        if (requestId === previewRequestRef.current) {
          setPreviewStatus('error');
          setPreviewError((err as Error).message);
          previewMetricsRef.current = null;
          console.warn('[preview] request:error', {
            requestId,
            message: (err as Error).message
          });
        }
      } finally {
        isPreviewInFlightRef.current = false;
        const hasPending = pendingPreviewProjectRef.current !== null;
        console.debug('[preview] request:complete', {
          requestId,
          hasPending
        });
        if (pendingPreviewProjectRef.current !== null) {
          dispatchPendingPreview();
        }
      }
    },
    [previewProxyMode]
  );

  const hashProject = useCallback((project: NodeVisionProject | null) => {
    if (!project) {
      return 'null';
    }
    return JSON.stringify({
      nodes: project.nodes?.map((node) => ({ id: node.id, type: node.type })) ?? [],
      edges: project.edges?.map((edge) => ({ from: edge.from, to: edge.to })) ?? [],
      fps: project.projectFps,
      assets: project.assets?.map((asset) => asset.id) ?? []
    });
  }, []);

  const lastRequestedProjectHashRef = useRef<string | null>(null);
  const pendingProjectHashRef = useRef<string | null>(null);

  const dispatchPendingPreview = useCallback(() => {
    if (isPreviewInFlightRef.current) {
      return;
    }
    if (pendingPreviewProjectRef.current === null) {
      return;
    }
    const project = pendingPreviewProjectRef.current;
    const hash = pendingProjectHashRef.current ?? hashProject(project);
    pendingPreviewProjectRef.current = null;
    pendingProjectHashRef.current = null;
    lastRequestedProjectHashRef.current = hash;
    const nextId = previewRequestRef.current + 1;
    previewRequestRef.current = nextId;
    void requestPreview(project, nextId);
  }, [hashProject, requestPreview]);

  const schedulePreview = useCallback(
    (project: NodeVisionProject | null) => {
      const hash = hashProject(project);
      if (hash === lastRequestedProjectHashRef.current) {
        return;
      }
      pendingPreviewProjectRef.current = project;
      pendingProjectHashRef.current = hash;
      if (isPreviewInFlightRef.current) {
        return;
      }
      dispatchPendingPreview();
    },
    [dispatchPendingPreview, hashProject]
  );

  useEffect(() => {
    schedulePreview(projectData);
  }, [projectData, schedulePreview]);

  const handleRefreshPreview = useCallback(() => {
    schedulePreview(projectData);
  }, [projectData, schedulePreview]);

  const handleSaveToBackend = useCallback(async () => {
    if (!projectData) {
      setProjectError('保存するプロジェクトが読み込まれていません。');
      return;
    }

    const projectForSave = stripAutosaveMetadata(projectData);
    setProjectError(null);
    setSaveStatus('saving');
    setSaveErrorMessage(null);
    try {
      const normalizedSlot = sanitizedBackendSlot;
      const response = await window.nodevision?.project?.saveToBackend?.(projectForSave, { slot: normalizedSlot });
      if (response) {
        setSaveStatus('saved');
        setSavePath(response.path);
        setProjectSummary(response.summary);
        setProjectPath(response.path);
        if (normalizedSlot !== backendSlot) {
          backendSlotRef.current = normalizedSlot;
          setBackendSlot(normalizedSlot);
        }
        setLastSavedSlot(normalizedSlot);
        setBackendRecoveryStatus('success');
        setBackendRecoveryError(null);
        setBackendRecoveryAttemptCount(0);
        setBackendRecoveryLastAttemptAt(new Date().toISOString());
        backendRecoverySlotRef.current = normalizedSlot;
        hasPendingChangesRef.current = false;
        setAutoSaveStatus('idle');
        setAutoSaveError(null);
        clearAutoSaveTimer();
        setProjectData(cloneProject(projectForSave));
        setAutoSaveRecovery(null);
        setAutoSavePromptOpen(false);
        setLastAutoSavePath(null);
        setLastAutoSaveAt(null);
        try {
          await window.nodevision?.project?.clearAutoSave?.();
        } catch (clearError) {
          console.warn('[App] 自動保存ファイルの削除に失敗しました:', clearError);
        }
        showToast('バックエンドへ保存しました。', 'success');
      } else {
        setSaveStatus(null);
      }
    } catch (err) {
      setSaveStatus('error');
      setProjectError((err as Error).message);
      setSaveErrorMessage((err as Error).message);
      showToast(`バックエンド保存に失敗しました: ${(err as Error).message}`, 'error');
    }
  }, [backendSlot, clearAutoSaveTimer, projectData, sanitizedBackendSlot, showToast]);

  const handleSaveToFileAs = useCallback(async () => {
    if (!projectData) {
      setProjectError('保存するプロジェクトが読み込まれていません。');
      return;
    }

    const projectForSave = stripAutosaveMetadata(projectData);
    setProjectError(null);
    setFileSaveError(null);
    setFileSaveStatus('saving');
    try {
      const response = await window.nodevision?.project?.saveAsFile?.(projectForSave, {
        defaultPath: projectPath ?? undefined,
        validate: true,
        spaces: 2
      });
      if (!response) {
        setFileSaveStatus('error');
        setFileSaveError('保存処理が不明な状態で終了しました。');
        return;
      }
      if (response.canceled) {
        setFileSaveStatus('idle');
        return;
      }
      if (response.path) {
        setProjectPath(response.path);
      }
      if (response.summary) {
        setProjectSummary(response.summary);
      }
      setFileSaveStatus('saved');
      hasPendingChangesRef.current = false;
      setAutoSaveStatus('idle');
      setAutoSaveError(null);
      clearAutoSaveTimer();
      setProjectData(cloneProject(projectForSave));
      setAutoSaveRecovery(null);
      setAutoSavePromptOpen(false);
      setLastAutoSavePath(null);
      setLastAutoSaveAt(null);
      try {
        await window.nodevision?.project?.clearAutoSave?.();
      } catch (clearError) {
        console.warn('[App] 自動保存ファイルの削除に失敗しました:', clearError);
      }
      showToast('別名で保存しました。', 'success');
    } catch (err) {
      setFileSaveStatus('error');
      setFileSaveError((err as Error).message);
      showToast(`別名保存に失敗しました: ${(err as Error).message}`, 'error');
    }
  }, [clearAutoSaveTimer, projectData, projectPath, showToast]);

  const handleSaveToFile = useCallback(async () => {
    if (!projectData) {
      setProjectError('保存するプロジェクトが読み込まれていません。');
      return;
    }

    const targetPath = projectPath?.trim();
    if (!targetPath) {
      await handleSaveToFileAs();
      return;
    }

    const projectForSave = stripAutosaveMetadata(projectData);
    setProjectError(null);
    setFileSaveError(null);
    setFileSaveStatus('saving');
    try {
      const response = await window.nodevision?.project?.saveToFile?.(targetPath, projectForSave, {
        validate: true,
        spaces: 2
      });
      if (!response) {
        setFileSaveStatus('error');
        setFileSaveError('保存処理が不明な状態で終了しました。');
        return;
      }

      if ('error' in response) {
        setFileSaveStatus('error');
        setFileSaveError(response.error);
        if (Array.isArray(response.issues)) {
          setProjectIssues(
            response.issues.map((issue) => ({
              path: issue.path,
              message: issue.message,
              type: issue.keyword
            }))
          );
          setValidationStatus('invalid');
          setValidationTimestamp(new Date().toISOString());
        }
        return;
      }

      setProjectPath(response.path);
      setFileSaveStatus('saved');
      hasPendingChangesRef.current = false;
      setAutoSaveStatus('idle');
      setAutoSaveError(null);
      clearAutoSaveTimer();
      setProjectData(cloneProject(projectForSave));
      setProjectSummary(createSummaryFromProject(projectForSave));
      setAutoSaveRecovery(null);
      setAutoSavePromptOpen(false);
      setLastAutoSavePath(null);
      setLastAutoSaveAt(null);
      try {
        await window.nodevision?.project?.clearAutoSave?.();
      } catch (clearError) {
        console.warn('[App] 自動保存ファイルの削除に失敗しました:', clearError);
      }
      showToast('ローカルに保存しました。', 'success');
    } catch (err) {
      setFileSaveStatus('error');
      setFileSaveError((err as Error).message);
      showToast(`ローカル保存に失敗しました: ${(err as Error).message}`, 'error');
    }
  }, [clearAutoSaveTimer, createSummaryFromProject, handleSaveToFileAs, projectData, projectPath, showToast]);

  const handleRestoreAutoSave = useCallback(async () => {
    if (!autoSaveRecovery) {
      return;
    }
    setAutoSavePromptOpen(false);
    applyProjectState(autoSaveRecovery.project, autoSaveRecovery.summary, autoSaveRecovery.path, { resetHistory: true });
    hasPendingChangesRef.current = true;
    setAutoSaveStatus('idle');
    setAutoSaveError(null);
    setAutoSaveRecovery(null);
    setAutoSaveLoadError(null);
    clearAutoSaveTimer();
    if (autoSaveRecovery.kind === 'local') {
      try {
        await window.nodevision?.project?.clearAutoSave?.();
        setLastAutoSavePath(null);
        setLastAutoSaveAt(null);
      } catch (err) {
        setAutoSaveLoadError((err as Error).message);
      }
    } else {
      if (autoSaveRecovery.slot && autoSaveRecovery.slot !== backendSlot) {
        backendSlotRef.current = autoSaveRecovery.slot;
        setBackendSlot(autoSaveRecovery.slot);
      }
      setLastAutoSavePath(autoSaveRecovery.path ?? null);
      setLastAutoSaveAt(autoSaveRecovery.savedAt ?? null);
      setLastSavedSlot(autoSaveRecovery.slot ?? lastSavedSlot);
    }
  }, [applyProjectState, autoSaveRecovery, backendSlot, clearAutoSaveTimer, lastSavedSlot]);

  const handleDiscardAutoSave = useCallback(async () => {
    if (autoSaveRecovery?.kind === 'local') {
      try {
        await window.nodevision?.project?.clearAutoSave?.();
      } catch (err) {
        setAutoSaveLoadError((err as Error).message);
      }
      if (localAutoSaveChecked) {
        scheduleBackendRecovery({ resetAttempts: true });
      }
    } else if (autoSaveRecovery?.kind === 'backend') {
      setBackendRecoveryStatus('success');
      setBackendRecoveryError(null);
      setBackendRecoveryAttemptCount(0);
      backendRecoverySlotRef.current = autoSaveRecovery.slot ?? sanitizedBackendSlot;
      if (backendRecoveryTimerRef.current) {
        clearTimeout(backendRecoveryTimerRef.current);
        backendRecoveryTimerRef.current = null;
      }
    }
    setAutoSaveRecovery(null);
    setAutoSaveLoadError(null);
    setLastAutoSavePath(null);
    setLastAutoSaveAt(null);
    setAutoSavePromptOpen(false);
    clearAutoSaveTimer();
  }, [autoSaveRecovery, clearAutoSaveTimer, localAutoSaveChecked, sanitizedBackendSlot, scheduleBackendRecovery]);

  const handleDismissAutoSavePrompt = useCallback(() => {
    setAutoSavePromptOpen(false);
  }, []);

  const handleRetryAutoSave = useCallback(async () => {
    if (!projectData) {
      return;
    }
    clearAutoSaveTimer();
    setAutoSaveStatus('saving');
    setAutoSaveError(null);
    try {
      const response = await window.nodevision?.project?.autoSave?.(projectData, {
        path: projectPath,
        reason: 'manual-retry'
      });
      setLastAutoSavePath(response?.path ?? null);
      setLastAutoSaveAt(response?.savedAt ?? null);
      setAutoSaveStatus('saved');
      hasPendingChangesRef.current = false;
    } catch (err) {
      setAutoSaveStatus('error');
      setAutoSaveError((err as Error).message);
    }
  }, [clearAutoSaveTimer, projectData, projectPath]);

  const graphProject = useMemo(() => projectData ?? undefined, [projectData]);
  const canUndo = pastProjects.length > 0;
  const canRedo = futureProjects.length > 0;

  const handlePreviewImageRendered = useCallback(
    (preview: PreviewState) => {
      const metrics = previewMetricsRef.current;
      if (!metrics) {
        return;
      }
      previewMetricsRef.current = null;
      const delayMs = performance.now() - metrics.start;
      let memoryUsageMb: number | undefined;
      const perfMemory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      if (perfMemory && typeof perfMemory.usedJSHeapSize === 'number') {
        memoryUsageMb = perfMemory.usedJSHeapSize / (1024 * 1024);
      }
      void window.nodevision?.metrics?.logPreview?.({
        profile: preview.profile,
        delayMs,
        memoryUsageMB: memoryUsageMb,
        proxy: preview.proxyEnabled,
        scale: preview.proxyScale,
        reason: preview.proxyReason,
        targetDelayMs: preview.targetDelayMs ?? undefined,
        averageDelayMs: preview.averageDelayMs ?? undefined,
        timestamp: preview.generatedAt
      });
    },
    []
  );

  const handleUndo = useCallback(() => {
    if (pastProjects.length === 0 || !projectData) {
      return;
    }
    const previous = pastProjects[pastProjects.length - 1];
    setPastProjects((prev) => prev.slice(0, -1));
    setFutureProjects((prev) => {
      const snapshot = cloneProject(projectData);
      const next = [snapshot, ...prev];
      if (next.length > HISTORY_LIMIT) {
        return next.slice(0, HISTORY_LIMIT);
      }
      return next;
    });
    hasPendingChangesRef.current = true;
    setAutoSaveStatus('idle');
    setAutoSaveError(null);
    clearAutoSaveTimer();
    applyProjectState(previous, undefined, projectPath, { preserveSelection: true });
  }, [applyProjectState, clearAutoSaveTimer, pastProjects, projectData, projectPath]);

  const handleRedo = useCallback(() => {
    if (futureProjects.length === 0 || !projectData) {
      return;
    }
    const nextProject = futureProjects[0];
    setFutureProjects((prev) => prev.slice(1));
    setPastProjects((prev) => {
      const snapshot = cloneProject(projectData);
      const next = [...prev, snapshot];
      if (next.length > HISTORY_LIMIT) {
        next.shift();
      }
      return next;
    });
    hasPendingChangesRef.current = true;
    setAutoSaveStatus('idle');
    setAutoSaveError(null);
    clearAutoSaveTimer();
    applyProjectState(nextProject, undefined, projectPath, { preserveSelection: true });
  }, [applyProjectState, clearAutoSaveTimer, futureProjects, projectData, projectPath]);
  const activeNode = useMemo(() => {
    if (!projectData || !nodeEditorState.nodeId) {
      return null;
    }
    return projectData.nodes.find((node) => node.id === nodeEditorState.nodeId) ?? null;
  }, [nodeEditorState.nodeId, projectData]);
  const handleProjectGraphChange = useCallback(
    (nextProject: NodeVisionProject, meta?: ProjectChangeMeta) => {
      applyProjectState(nextProject, undefined, projectPath, {
        preserveSelection: true,
        pushHistory: meta?.pushHistory
      });
    },
    [applyProjectState, projectPath]
  );

  const handleGraphSelectionChange = useCallback((selection: { nodes: string[]; edges: string[] }) => {
    setSelectedNodes(selection.nodes);
    setSelectedEdges(selection.edges);
  }, []);

  const handleAddNodeFromCatalog = useCallback(
    (item: NodeCatalogItem) => {
      if (!projectData) {
        setProjectError('プロジェクトが読み込まれていません。');
        return;
      }

      const newIdBase = item.nodeId ?? item.displayName ?? 'Node';
      let counter = 1;
      let newId = `${newIdBase}-${counter}`;
      const existingIds = new Set(projectData.nodes.map((node) => node.id));
      while (existingIds.has(newId) || projectData.nodes.some((node) => node.id === newId)) {
        counter += 1;
        newId = `${newIdBase}-${counter}`;
      }

      const nextNode = {
        id: newId,
        type: item.nodeId,
        displayName: item.displayName,
        params: {},
        inputs: {},
        outputs: item.outputs,
        cachePolicy: 'auto' as const,
        position: {
          x: 120 * (projectData.nodes.length % 5),
          y: 140 * Math.floor(projectData.nodes.length / 5)
        }
      };

      const nextProject: NodeVisionProject = {
        ...projectData,
        nodes: [...projectData.nodes, nextNode]
      };

      applyProjectState(nextProject, undefined, projectPath, { pushHistory: true });
      setSelectedNodes([newId]);
      setSelectedEdges([]);
      setNodeEditorState({
        nodeId: newId,
        displayName: item.displayName ?? '',
        paramsText: JSON.stringify({}, null, 2),
        error: null,
        dirty: false
      });
    },
    [applyProjectState, projectData, projectPath]
  );

  const handleDeleteSelection = useCallback(() => {
    if (!projectData) {
      return;
    }

    if (!selectedNodes.length && !selectedEdges.length) {
      return;
    }

    const nodesToKeep = projectData.nodes.filter((node) => !selectedNodes.includes(node.id));
    const edgesToKeep = projectData.edges.filter((edge) => {
      if (selectedEdges.includes(`${edge.from}->${edge.to}`)) {
        return false;
      }
      const [toNode] = edge.to.split(':');
      const [fromNode] = edge.from.split(':');
      return !selectedNodes.includes(toNode) && !selectedNodes.includes(fromNode);
    });

    const sanitizedNodes = nodesToKeep.map((node) => {
      const inputs = { ...node.inputs };
      for (const key of Object.keys(inputs)) {
        const [sourceNode] = inputs[key]?.split(':') ?? [];
        if (selectedNodes.includes(sourceNode ?? '')) {
          delete inputs[key];
        }
      }
      return {
        ...node,
        inputs
      };
    });

    const nextProject: NodeVisionProject = {
      ...projectData,
      nodes: sanitizedNodes,
      edges: edgesToKeep
    };

    applyProjectState(nextProject, undefined, projectPath, { pushHistory: true });
    setSelectedNodes([]);
    setSelectedEdges([]);
  }, [applyProjectState, projectData, projectPath, selectedEdges, selectedNodes]);

  useEffect(() => {
    if (!projectData) {
      setNodeEditorState({
        nodeId: null,
        displayName: '',
        paramsText: '{}',
        error: null,
        dirty: false
      });
      return;
    }

    const currentNodeId = selectedNodes[0] ?? null;
    if (!currentNodeId) {
      setNodeEditorState({
        nodeId: null,
        displayName: '',
        paramsText: '{}',
        error: null,
        dirty: false
      });
      return;
    }

    const node = projectData.nodes.find((item) => item.id === currentNodeId);
    if (!node) {
      setNodeEditorState({
        nodeId: null,
        displayName: '',
        paramsText: '{}',
        error: null,
        dirty: false
      });
      return;
    }

    setNodeEditorState((prev) => {
      if (prev.nodeId === currentNodeId && prev.dirty) {
        return prev;
      }

      return {
        nodeId: currentNodeId,
        displayName: node.displayName ?? '',
        paramsText: JSON.stringify(node.params ?? {}, null, 2),
        error: null,
        dirty: false
      };
    });
  }, [projectData, selectedNodes]);

  const handleNodeDisplayNameChange = useCallback((value: string) => {
    setNodeEditorState((prev) => ({
      ...prev,
      displayName: value,
      dirty: true,
      error: null
    }));
  }, []);

  const handleNodeParamsChange = useCallback((value: string) => {
    setNodeEditorState((prev) => ({
      ...prev,
      paramsText: value,
      dirty: true,
      error: null
    }));
  }, []);

  const handleApplyNodeEdits = useCallback(() => {
    if (!projectData || !nodeEditorState.nodeId) {
      return;
    }

    let parsedParams: unknown;
    const trimmed = nodeEditorState.paramsText.trim();
    try {
      parsedParams = trimmed.length ? JSON.parse(trimmed) : {};
    } catch (parseError) {
      setNodeEditorState((prev) => ({
        ...prev,
        error: `パラメータ JSON の解析に失敗しました: ${(parseError as Error).message}`
      }));
      return;
    }

    if (typeof parsedParams !== 'object' || parsedParams === null || Array.isArray(parsedParams)) {
      setNodeEditorState((prev) => ({
        ...prev,
        error: 'パラメータはオブジェクト形式である必要があります。'
      }));
      return;
    }

    const nextProject: NodeVisionProject = {
      ...projectData,
      nodes: projectData.nodes.map((node) =>
        node.id === nodeEditorState.nodeId
          ? {
              ...node,
              displayName: nodeEditorState.displayName || undefined,
              params: parsedParams as Record<string, unknown>
            }
          : node
      )
    };

    applyProjectState(nextProject, undefined, projectPath, { preserveSelection: true, pushHistory: true });
    setNodeEditorState((prev) => ({
      ...prev,
      error: null,
      dirty: false
    }));
  }, [applyProjectState, nodeEditorState, projectData, projectPath]);

  const handleResetNodeEdits = useCallback(() => {
    if (!projectData || !nodeEditorState.nodeId) {
      setNodeEditorState({
        nodeId: null,
        displayName: '',
        paramsText: '{}',
        error: null,
        dirty: false
      });
      return;
    }

    const node = projectData.nodes.find((item) => item.id === nodeEditorState.nodeId);
    if (!node) {
      setNodeEditorState({
        nodeId: null,
        displayName: '',
        paramsText: '{}',
        error: null,
        dirty: false
      });
      return;
    }

    setNodeEditorState({
      nodeId: node.id,
      displayName: node.displayName ?? '',
      paramsText: JSON.stringify(node.params ?? {}, null, 2),
      error: null,
      dirty: false
    });
  }, [nodeEditorState.nodeId, projectData]);

  useEffect(() => {
    if (!projectData) {
      clearAutoSaveTimer();
      return;
    }
    if (!hasPendingChangesRef.current) {
      clearAutoSaveTimer();
      return;
    }
    clearAutoSaveTimer();
    autoSaveTimerRef.current = setTimeout(() => {
      void (async () => {
        setAutoSaveStatus('saving');
        setAutoSaveError(null);
        try {
          const response = await window.nodevision?.project?.autoSave?.(projectData, {
            path: projectPath,
            reason: 'auto-timer'
          });
          setLastAutoSavePath(response?.path ?? null);
          setLastAutoSaveAt(response?.savedAt ?? null);
          setAutoSaveStatus('saved');
          hasPendingChangesRef.current = false;
        } catch (err) {
          setAutoSaveStatus('error');
          setAutoSaveError((err as Error).message);
        } finally {
          clearAutoSaveTimer();
        }
      })();
    }, AUTOSAVE_DELAY_MS);

    return () => {
      clearAutoSaveTimer();
    };
  }, [clearAutoSaveTimer, projectData, projectPath]);

  useEffect(() => {
    return () => {
      clearAutoSaveTimer();
      clearToastTimer();
    };
  }, [clearAutoSaveTimer, clearToastTimer]);

  const handleDownloadValidationIssues = useCallback(() => {
    if (!projectIssues.length) {
      return;
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      slot: sanitizedBackendSlot,
      issues: projectIssues
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `nodevision-validation-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [projectIssues, sanitizedBackendSlot]);

  const validationTimeLabel = useMemo(() => {
    if (!validationTimestamp) return null;
    const date = new Date(validationTimestamp);
    return date.toLocaleString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }, [validationTimestamp]);

  const lastAutoSaveAtLabel = useMemo(() => formatTimestamp(lastAutoSaveAt), [lastAutoSaveAt]);
  const autoSaveRecoverySavedAtLabel = useMemo(
    () => formatTimestamp(autoSaveRecovery?.savedAt ?? null),
    [autoSaveRecovery?.savedAt]
  );
  const autoSaveRecoveryReasonLabel = useMemo(() => {
    if (!autoSaveRecovery?.reason) {
      return '自動保存';
    }
    return AUTOSAVE_REASON_LABELS[autoSaveRecovery.reason] ?? autoSaveRecovery.reason;
  }, [autoSaveRecovery?.reason]);

  return (
    <>
      {autoSavePromptOpen && autoSaveRecovery ? (
        <AutoSavePromptModal
          recovery={autoSaveRecovery}
          currentProjectPath={projectPath ?? '未読み込み'}
          savedAtLabel={autoSaveRecoverySavedAtLabel}
          reasonLabel={autoSaveRecoveryReasonLabel}
          onRestore={handleRestoreAutoSave}
          onDiscard={handleDiscardAutoSave}
          onDismiss={handleDismissAutoSavePrompt}
        />
      ) : null}
      {toast ? (
        <div className={`app-toast app-toast--${toast.tone}`} role="status" aria-live="polite">
          <span>{toast.message}</span>
          <button type="button" aria-label="閉じる" onClick={handleDismissToast}>
            ×
          </button>
        </div>
      ) : null}
      <main className="app-shell">
      <header className="app-shell__header">
        <h1>NodeVision Editor</h1>
        <p className="app-shell__subtitle">ComfyUI 風ノードベース編集の MVP シェル</p>
      </header>

      <section className="app-shell__section">
        <h2>接続確認</h2>
        <p>Electron ↔ Renderer IPC: <strong>{pingResult}</strong></p>
        {error ? <p className="app-shell__error">IPC エラー: {error}</p> : null}
        <p>FastAPI Backend: <strong>{backendStatus}</strong></p>
        {backendError ? <p className="app-shell__error">バックエンド エラー: {backendError}</p> : null}
      </section>

      <section className="app-shell__section app-shell__section--graph">
        <h2>ノードグラフ プレビュー</h2>
        <p className="app-shell__helper">
          読み込んだプロジェクトのノード配置をリアルタイムで表示します。未読み込み時はプレースホルダーを表示します。
        </p>
        <NodeGraphCanvas
          project={graphProject}
          onProjectChange={handleProjectGraphChange}
          onSelectionChange={handleGraphSelectionChange}
        />
        <div className="graph-toolbar">
          <div className="graph-toolbar__group">
            <button type="button" onClick={handleUndo} disabled={!canUndo}>
              元に戻す
            </button>
            <button type="button" onClick={handleRedo} disabled={!canRedo}>
              やり直す
            </button>
          </div>
          <button type="button" onClick={handleDeleteSelection} disabled={!selectedNodes.length && !selectedEdges.length}>
            選択ノード／エッジを削除
          </button>
        </div>
      </section>

      <PreviewPanel
        preview={previewState}
        loading={previewStatus === 'loading'}
        error={previewError}
        onRefresh={handleRefreshPreview}
        onImageRendered={handlePreviewImageRendered}
        proxyMode={previewProxyMode}
        onProxyModeChange={setPreviewProxyMode}
      />

      <section className="app-shell__section node-editor">
        <h2>ノードプロパティ</h2>
        {activeNode && nodeEditorState.nodeId ? (
          <div className="node-editor__content">
            <div className="node-editor__meta">
              <p>
                <strong>ID:</strong> <code>{activeNode.id}</code>
              </p>
              <p>
                <strong>タイプ:</strong> {activeNode.type}
              </p>
            </div>
            <label className="node-editor__field">
              <span>表示名</span>
              <input
                type="text"
                value={nodeEditorState.displayName}
                placeholder="ラベル（任意）"
                onChange={(event) => handleNodeDisplayNameChange(event.target.value)}
              />
            </label>
            <label className="node-editor__field node-editor__field--textarea">
              <span>パラメータ（JSON）</span>
              <textarea
                value={nodeEditorState.paramsText}
                onChange={(event) => handleNodeParamsChange(event.target.value)}
                spellCheck={false}
              />
              <small>JSON オブジェクトとして編集してください。空欄の場合は空オブジェクト `{}` として扱います。</small>
            </label>
            {nodeEditorState.error ? <p className="node-editor__error">{nodeEditorState.error}</p> : null}
            <div className="node-editor__actions">
              <button type="button" onClick={handleApplyNodeEdits} disabled={!nodeEditorState.dirty}>
                変更を適用
              </button>
              <button type="button" onClick={handleResetNodeEdits} disabled={!nodeEditorState.dirty}>
                リセット
              </button>
            </div>
          </div>
        ) : (
          <p className="node-editor__placeholder">編集するノードを選択すると、ここでプロパティを調整できます。</p>
        )}
      </section>

      <section className="app-shell__section app-shell__section--project">
        <h2>プロジェクト I/O ブリッジ</h2>
        {autoSaveRecovery ? (
          <div className="autosave-recovery">
            <p>前回の自動保存ファイルが見つかりました。復旧しますか？</p>
            <div className="autosave-recovery__summary">
              <span>保存先: {autoSaveRecovery.path}</span>
              <span>
                復旧元:{' '}
                {autoSaveRecovery.kind === 'backend'
                  ? `バックエンド${autoSaveRecovery.slot ? ` (スロット: ${autoSaveRecovery.slot})` : ''}`
                  : 'ローカル自動保存'}
              </span>
              {autoSaveRecoverySavedAtLabel ? <span>保存時刻: {autoSaveRecoverySavedAtLabel}</span> : null}
              <span>保存理由: {autoSaveRecoveryReasonLabel}</span>
              {autoSaveRecovery.sourcePath ? <span>元プロジェクト: {autoSaveRecovery.sourcePath}</span> : null}
              <span>
                ノード: {autoSaveRecovery.summary.nodes} / エッジ: {autoSaveRecovery.summary.edges} / アセット:
                {autoSaveRecovery.summary.assets}
              </span>
            </div>
            <div className="autosave-recovery__actions">
              <button type="button" onClick={() => { void handleRestoreAutoSave(); }}>
                復旧する
              </button>
              <button type="button" onClick={() => { void handleDiscardAutoSave(); }}>
                破棄する
              </button>
            </div>
          </div>
        ) : autoSaveLoadError ? (
          <p className="project-autosave-warning">自動保存ファイルの確認に失敗しました: {autoSaveLoadError}</p>
        ) : null}
        <div className="project-slot">
          <label>
            <span>保存スロット</span>
            <input
              type="text"
              value={backendSlot}
              onChange={(event) => handleBackendSlotInputChange(event.target.value)}
              placeholder="例: electron-preview"
            />
          </label>
          <small>未入力の場合は `electron-preview` が使用されます。</small>
          <small>
            実際のスロット: <code>{sanitizedBackendSlot}</code>
            {backendSlotWasSanitized ? '（入力値をサニタイズ済み）' : null}
          </small>
          {localAutoSaveChecked ? (
            <div className="project-slot__status">
              {backendRecoveryStatus === 'pending' ? (
                <small>バックエンド復旧を確認しています…</small>
              ) : backendRecoveryStatus === 'error' ? (
                <small className="project-autosave-warning">
                  バックエンド復旧に失敗しました: {backendRecoveryError ?? '原因不明'}
                  {backendRecoveryAttemptCount >= MAX_BACKEND_RECOVERY_RETRIES ? '（自動再試行を停止しました）' : ''}
                  <button
                    type="button"
                    onClick={handleRetryBackendRecovery}
                    disabled={backendRecoveryStatus === 'pending'}
                  >
                    再試行
                  </button>
                </small>
              ) : backendRecoveryStatus === 'success' ? (
                <small>バックエンド復旧候補を取得済みです。</small>
              ) : null}
              {backendRecoveryAttemptAtLabel ? (
                <small>最終試行: {backendRecoveryAttemptAtLabel}</small>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="project-actions">
          <button type="button" onClick={handleLoadSampleProject}>
            サンプルプロジェクトを読み込む
          </button>
          <button type="button" onClick={handleOpenProject}>
            ファイルから読み込む…
          </button>
          <button type="button" onClick={handleSaveToFile}>
            ローカルに保存
          </button>
          <button type="button" onClick={handleSaveToFileAs}>
            別名で保存…
          </button>
          <button type="button" onClick={handleValidateCurrent}>
            現在のデータを検証
          </button>
          <button type="button" onClick={handleSaveToBackend}>
            バックエンドへ保存
          </button>
          <button type="button" onClick={handleLoadFromBackend}>
            バックエンドから読み込む
          </button>
          <button type="button" onClick={handleFetchCatalog}>
            ノードカタログを取得
          </button>
        </div>
        <div className="project-status">
          <p>パス: {projectPath ?? '未読み込み'}</p>
          {projectSummary ? (
            <ul>
              <li>ノード: {projectSummary.nodes}</li>
              <li>エッジ: {projectSummary.edges}</li>
              <li>アセット: {projectSummary.assets}</li>
              <li>FPS: {projectSummary.fps}</li>
              <li>色空間: {projectSummary.colorSpace}</li>
              <li>スキーマ: {projectSummary.schemaVersion}</li>
              <li>保存スロット: {sanitizedBackendSlot}</li>
            </ul>
          ) : (
            <p>プロジェクト要約はまだありません。</p>
          )}
          {validationStatus !== 'idle' ? (
            <p className={`project-validate-status project-validate-status--${validationStatus}`}>
              {validationStatus === 'validating'
                ? '検証中…'
                : validationStatus === 'valid'
                  ? `検証成功 (${validationTimeLabel ?? '時刻不明'})`
                  : validationStatus === 'invalid'
                    ? '検証エラーが見つかりました。'
                    : '検証で問題が発生しました。'}
            </p>
          ) : null}
          {fileSaveStatus !== 'idle' ? (
            <p className={`project-file-save-status project-file-save-status--${fileSaveStatus}`}>
              {fileSaveStatus === 'saving'
                ? 'ローカル保存中…'
                : fileSaveStatus === 'saved'
                  ? `ローカル保存済み (${projectPath ?? 'パス未設定'})`
                  : 'ローカル保存でエラーが発生しました。'}
            </p>
          ) : null}
          {autoSaveStatus !== 'idle' ? (
            <p className={`project-autosave-status project-autosave-status--${autoSaveStatus}`}>
              {autoSaveStatus === 'saving'
                ? '自動保存中…'
                : autoSaveStatus === 'saved'
                  ? `自動保存済み (${lastAutoSavePath ?? 'パス未設定'})${lastAutoSaveAtLabel ? ` / ${lastAutoSaveAtLabel}` : ''}`
                  : '自動保存でエラーが発生しました。'}
            </p>
          ) : null}
          {lastAutoSavePath ? (
            <p className="project-autosave-path">
              自動保存ファイル: {lastAutoSavePath}
              {lastAutoSaveAtLabel ? `（${lastAutoSaveAtLabel}）` : ''}
            </p>
          ) : null}
          {projectIssues.length ? (
            <div className="project-issues">
              <div className="project-issues__header">
                <h3>検証エラー</h3>
                <span>{projectIssues.length} 件</span>
              </div>
              <div className="project-issues__table-wrapper">
                <table className="project-issues__table">
                  <thead>
                    <tr>
                      <th>パス</th>
                      <th>メッセージ</th>
                      <th>タイプ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectIssues.map((issue) => (
                      <tr key={`${issue.path}:${issue.message}`}>
                        <td>
                          <code>{issue.path}</code>
                        </td>
                        <td>{issue.message}</td>
                        <td>{issue.type ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="project-issues__actions">
                <button type="button" onClick={handleDownloadValidationIssues}>
                  JSON をダウンロード
                </button>
              </div>
            </div>
          ) : null}
          {saveStatus ? (
            <p className="project-save-status">
              保存状態:{' '}
              {saveStatus === 'saving'
              ? '保存中…'
              : saveStatus === 'saved'
                  ? `保存済み (${savePath}) [slot: ${lastSavedSlot ?? sanitizedBackendSlot}]`
                  : 'エラー'}
            </p>
          ) : null}
          {lastSavedSlot ? <p className="project-save-slot">最終保存スロット: {lastSavedSlot}</p> : null}
          {saveStatus === 'error' && saveErrorMessage ? (
            <div className="project-error-banner">
              <span>保存に失敗しました: {saveErrorMessage}</span>
              <button type="button" onClick={handleSaveToBackend}>
                再試行
              </button>
            </div>
          ) : null}
          {fileSaveStatus === 'error' && fileSaveError ? (
            <div className="project-error-banner">
              <span>ローカル保存に失敗しました: {fileSaveError}</span>
              <button type="button" onClick={handleSaveToFileAs}>
                別名で保存…
              </button>
            </div>
          ) : null}
          {autoSaveStatus === 'error' && autoSaveError ? (
            <div className="project-error-banner">
              <span>自動保存に失敗しました: {autoSaveError}</span>
              <button type="button" onClick={handleRetryAutoSave}>
                再試行
              </button>
            </div>
          ) : null}
          {validationStatus === 'error' && validationErrorMessage ? (
            <div className="project-error-banner">
              <span>検証でエラーが発生しました: {validationErrorMessage}</span>
              <button type="button" onClick={handleValidateCurrent}>
                検証を再実行
              </button>
            </div>
          ) : null}
          {projectError ? <p className="app-shell__error">I/O エラー: {projectError}</p> : null}
        </div>
        {nodeCatalog.length ? (
          <div className="project-catalog">
            <h3>バックエンド ノードカタログ</h3>
            <ul>
              {nodeCatalog.map((item) => (
                <li key={item.nodeId}>
                  <strong>{item.displayName}</strong> <span>({item.category})</span> — 入力:
                  {item.inputs.length ? item.inputs.join(', ') : 'なし'} / 出力:
                  {item.outputs.length ? item.outputs.join(', ') : 'なし'}{' '}
                  <button type="button" onClick={() => handleAddNodeFromCatalog(item)}>
                    追加
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {catalogError ? <p className="app-shell__error">カタログ取得エラー: {catalogError}</p> : null}
      </section>

      <section className="app-shell__section">
        <h2>次のステップ</h2>
        <ul>
          <li>FastAPI バックエンドとの API トンネル整備</li>
          <li>ノードグラフ UI / ReactFlow の統合</li>
          <li>プロジェクトファイル入出力（`project-io`）の接続</li>
        </ul>
      </section>
    </main>
    </>
  );
}

interface AutoSavePromptModalProps {
  recovery: AutoSaveRecovery;
  savedAtLabel: string | null;
  reasonLabel: string;
  currentProjectPath: string;
  onRestore: () => void | Promise<void>;
  onDiscard: () => void | Promise<void>;
  onDismiss: () => void;
}

function AutoSavePromptModal({
  recovery,
  savedAtLabel,
  reasonLabel,
  currentProjectPath,
  onRestore,
  onDiscard,
  onDismiss
}: AutoSavePromptModalProps) {
  return (
    <div className="autosave-modal" role="dialog" aria-modal="true">
      <div className="autosave-modal__backdrop" />
      <div className="autosave-modal__content">
        <h2>前回の自動保存を検出しました</h2>
        <p className="autosave-modal__lead">クラッシュや予期しない終了が発生した可能性があります。復旧方法を選択してください。</p>
        <ul className="autosave-modal__summary">
          <li>
            保存先: <code>{recovery.path}</code>
          </li>
          <li>
            復旧元:{' '}
            {recovery.kind === 'backend'
              ? `バックエンド${recovery.slot ? ` (スロット: ${recovery.slot})` : ''}`
              : 'ローカル自動保存'}
          </li>
          {savedAtLabel ? <li>保存時刻: {savedAtLabel}</li> : null}
          <li>保存理由: {reasonLabel}</li>
          {recovery.sourcePath ? (
            <li>
              元プロジェクト: <code>{recovery.sourcePath}</code>
            </li>
          ) : null}
          <li>
            現在のプロジェクト: <code>{currentProjectPath}</code>
          </li>
          <li>
            ノード: {recovery.summary.nodes} / エッジ: {recovery.summary.edges} / アセット: {recovery.summary.assets}
          </li>
        </ul>
        <div className="autosave-modal__actions">
          <button type="button" className="autosave-modal__primary" onClick={() => { void onRestore(); }}>
            復旧する
          </button>
          <button type="button" onClick={() => { void onDiscard(); }}>
            破棄する
          </button>
          <button type="button" onClick={onDismiss}>
            あとで確認
          </button>
        </div>
      </div>
    </div>
  );
}
