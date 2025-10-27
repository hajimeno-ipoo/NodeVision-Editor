const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nodevision', {
  ping: () => ipcRenderer.invoke('app:ping'),
  backend: {
    health: () => ipcRenderer.invoke('backend:health'),
    nodesCatalog: () => ipcRenderer.invoke('backend:nodesCatalog'),
    loadProject: (options) => ipcRenderer.invoke('backend:loadProject', options)
  },
  project: {
    loadSample: () => ipcRenderer.invoke('project:loadSample'),
    openFile: () => ipcRenderer.invoke('project:openFile'),
    validate: (payload) => ipcRenderer.invoke('project:validate', payload),
    saveToBackend: (payload, options) =>
      ipcRenderer.invoke('backend:saveProject', { project: payload, slot: options?.slot }),
    saveToFile: (path, project, options) =>
      ipcRenderer.invoke('project:saveFile', { path, project, options }),
    saveAsFile: (project, options) =>
      ipcRenderer.invoke('project:saveAsFile', { project, defaultPath: options?.defaultPath, options }),
    autoSave: (project, options) =>
      ipcRenderer.invoke('project:autoSave', { project, options }),
    getAutoSave: () => ipcRenderer.invoke('project:getAutoSave'),
    clearAutoSave: () => ipcRenderer.invoke('project:clearAutoSave'),
    generatePreview: (project, options) =>
      ipcRenderer.invoke('project:generatePreview', { project, forceProxy: options?.forceProxy }),
    loadFromBackend: (options) => ipcRenderer.invoke('backend:loadProject', options)
  },
  metrics: {
    logPreview: (payload) => ipcRenderer.invoke('metrics:previewLog', payload)
  }
});
