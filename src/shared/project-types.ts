export type MediaColorSpace = 'sRGB' | 'Rec.709' | 'Rec.2020' | 'DCI-P3' | 'ACEScg';

export interface ProjectResolution {
  width: number;
  height: number;
}

export type NodeInputValue =
  | string
  | number
  | boolean
  | null
  | Record<string, unknown>
  | unknown[];

export interface NodeDefinition {
  id: string;
  type: string;
  displayName?: string;
  params: Record<string, unknown>;
  inputs: Record<string, NodeInputValue>;
  outputs: string[];
  cachePolicy?: 'auto' | 'always' | 'never';
  position?: {
    x?: number;
    y?: number;
  };
}

export interface EdgeDefinition {
  from: string;
  to: string;
  disabled?: boolean;
}

export interface AssetDefinition {
  id: string;
  path: string;
  hash: string;
  proxyPath?: string;
  colorSpace?: string;
  bitDepth?: 8 | 10 | 12 | 16;
}

export interface PreviewProxyConfig {
  enabled?: boolean;
  scale?: number;
  [key: string]: unknown;
}

export interface ProjectMetadata {
  createdWith?: string;
  createdAt?: string;
  lastSavedAt?: string;
  notes?: string;
  previewProxy?: PreviewProxyConfig;
  [key: string]: unknown;
}

export interface NodeVisionProject {
  schemaVersion: string;
  mediaColorSpace: MediaColorSpace;
  projectFps: number;
  projectResolution?: ProjectResolution;
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
  assets: AssetDefinition[];
  metadata: ProjectMetadata;
  [key: string]: unknown;
}
