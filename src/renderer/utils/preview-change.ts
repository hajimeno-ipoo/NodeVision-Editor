import type { NodeVisionProject } from '../../shared/project-types.js';
import { computeProjectPreviewHash } from './preview-hash.js';

export interface PreviewChangeResult {
  changed: boolean;
  hash: string;
}

export function detectPreviewChange(
  previousHash: string | null,
  project: NodeVisionProject | null
): PreviewChangeResult {
  const nextHash = computeProjectPreviewHash(project);
  return {
    changed: (previousHash ?? 'null') !== nextHash,
    hash: nextHash
  };
}
