import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('nodevision', {
    ping: () => ipcRenderer.invoke('app:ping'),
    backend: {
        health: () => ipcRenderer.invoke('backend:health'),
        nodesCatalog: () => ipcRenderer.invoke('backend:nodesCatalog')
    },
    project: {
        loadSample: () => ipcRenderer.invoke('project:loadSample'),
        openFile: () => ipcRenderer.invoke('project:openFile'),
        validate: (payload) => ipcRenderer.invoke('project:validate', payload),
        saveToBackend: (payload) => ipcRenderer.invoke('backend:saveProject', payload)
    }
});
