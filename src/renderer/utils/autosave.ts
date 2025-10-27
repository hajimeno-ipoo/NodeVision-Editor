import type { NodeVisionProject } from '../../shared/project-types';

export function cloneProject(project: NodeVisionProject): NodeVisionProject {
  return JSON.parse(JSON.stringify(project)) as NodeVisionProject;
}

export function stripAutosaveMetadata(project: NodeVisionProject): NodeVisionProject {
  const cloned = cloneProject(project);
  if (cloned.metadata && typeof cloned.metadata === 'object') {
    const metadata = { ...(cloned.metadata as Record<string, unknown>) };
    if ('autosave' in metadata) {
      delete metadata.autosave;
    }
    cloned.metadata = metadata as NodeVisionProject['metadata'];
  }
  return cloned;
}
