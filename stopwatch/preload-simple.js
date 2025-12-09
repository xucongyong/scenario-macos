console.log('--- SIMPLE PRELOAD LOADED ---');
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    action: (type, payload) => ipcRenderer.invoke('universal-action', { actionType: type, payload }),
    onStopwatchUpdate: (cb) => ipcRenderer.on('stopwatch-update', (_, v) => cb(v))
});
