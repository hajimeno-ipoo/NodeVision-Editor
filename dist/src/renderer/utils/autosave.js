export function cloneProject(project) {
    return JSON.parse(JSON.stringify(project));
}
export function stripAutosaveMetadata(project) {
    const cloned = cloneProject(project);
    if (cloned.metadata && typeof cloned.metadata === 'object') {
        const metadata = { ...cloned.metadata };
        if ('autosave' in metadata) {
            delete metadata.autosave;
        }
        cloned.metadata = metadata;
    }
    return cloned;
}
