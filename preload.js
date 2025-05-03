const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 渲染进程调用此函数来执行场景
  runScenario: (scenarioName) => ipcRenderer.invoke('run-scenario', scenarioName),
  // 主进程调用此函数来更新场景列表
  onUpdateScenarios: (callback) => ipcRenderer.on('update-scenarios', (_event, value) => callback(value))
});

console.log('Preload script loaded.');