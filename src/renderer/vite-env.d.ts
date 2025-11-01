/// <reference types="vite/client" />

import type { NodeVisionProject } from '../shared/project-types';

export {};

declare global {
  interface NodeVisionBackendAPI {
    health(): Promise<{ status: string; service: string; version: string }>;
    nodesCatalog(): Promise<NodeCatalogItem[]>;
    loadProject(options?: { slot?: string }): Promise<BackendLoadResponse>;
  }

  interface NodeVisionProjectSummary {
    nodes: number;
    edges: number;
    assets: number;
    fps: number;
    colorSpace: string;
    schemaVersion: string;
  }

  interface NodeCatalogItem {
    nodeId: string;
    displayName: string;
    description: string;
    category: string;
    inputs: string[];
    outputs: string[];
    defaultParams: Record<string, unknown>;
    defaultInputs: Record<string, string | null>;
    defaultOutputs: string[];
  }

  interface BackendSaveResponse {
    slot: string;
    path: string;
    summary: NodeVisionProjectSummary;
  }

  interface BackendSaveOptions {
    slot?: string;
  }

  interface FileSaveResponse {
    path: string;
  }

  interface FileSaveAsResponse {
    canceled: boolean;
    path?: string;
    summary?: NodeVisionProjectSummary;
  }

  interface AutoSaveResponse {
    path: string;
    savedAt?: string;
  }

  interface AutoSaveInfo {
    exists: boolean;
    path?: string;
    project?: NodeVisionProject;
    summary?: NodeVisionProjectSummary;
    error?: string;
    savedAt?: string;
    reason?: string;
    sourcePath?: string;
  }

  interface BackendLoadResponse {
    slot: string;
    path: string;
    project: NodeVisionProject;
    summary: NodeVisionProjectSummary;
  }

  interface BackendValidationIssue {
    path: string;
    message: string;
    type?: string;
  }

  interface NodeVisionProjectAPI {
    loadSample(): Promise<{ path: string; summary: NodeVisionProjectSummary; project: NodeVisionProject }>;
    openFile(): Promise<
      | { canceled: true }
      | { canceled: false; path: string; summary: NodeVisionProjectSummary; project: NodeVisionProject }
    >;
    validate(
      payload: unknown
    ): Promise<
      | { valid: true; summary: NodeVisionProjectSummary }
      | { valid: false; issues: Array<{ path: string; message: string; keyword: string }> }
    >;
    saveToBackend(project: NodeVisionProject, options?: BackendSaveOptions): Promise<BackendSaveResponse>;
    saveToFile(path: string, project: NodeVisionProject, options?: { validate?: boolean; spaces?: number }): Promise<FileSaveResponse | { error: string; issues?: Array<{ path: string; message: string; keyword: string }> }>;
    saveAsFile(
      project: NodeVisionProject,
      options?: { defaultPath?: string; validate?: boolean; spaces?: number }
    ): Promise<FileSaveAsResponse>;
    autoSave(
      project: NodeVisionProject,
      options?: { path?: string | null; reason?: string }
    ): Promise<AutoSaveResponse>;
    getAutoSave(): Promise<AutoSaveInfo | undefined>;
    clearAutoSave(): Promise<{ cleared: boolean; path: string }>;
    generatePreview(
      project: NodeVisionProject,
      options?: { forceProxy?: boolean }
    ): Promise<{
      imageBase64: string;
      width: number;
      height: number;
      source: { width: number; height: number };
      proxy: {
        enabled: boolean;
        width: number;
        height: number;
        scale: number;
        reason: string;
        averageDelayMs?: number | null;
        targetDelayMs?: number | null;
      };
      generatedAt: string;
    }>;
    loadFromBackend(options?: { slot?: string }): Promise<BackendLoadResponse>;
  }

  interface NodeVisionMetricsAPI {
    logPreview(payload: {
      profile: string;
      delayMs: number;
      memoryUsageMB?: number;
      proxy?: boolean;
      scale?: number;
      reason?: string;
      targetDelayMs?: number;
      averageDelayMs?: number;
      timestamp?: string;
    }): Promise<void>;
  }

  interface NodeVisionBridge {
    ping(): Promise<string>;
    backend: NodeVisionBackendAPI;
    project: NodeVisionProjectAPI;
    metrics: NodeVisionMetricsAPI;
  }

  interface Window {
    nodevision?: NodeVisionBridge;
  }
}
