const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 新增：安全地暴露 invoke 方法，用于调用主进程处理程序
  invoke: (channel, ...args) => {
    // 只允许调用特定的 channel，增加安全性
    const allowedChannels = ['read-markdown-file', 'run-scenario', 'get-raw-markdown-file', 'save-markdown-file'];
    if (allowedChannels.includes(channel)) {
      console.log(`Preload: Invoking IPC channel '${channel}' with args:`, args);
      return ipcRenderer.invoke(channel, ...args);
    } else {
      console.error(`Preload: Blocked IPC invoke to channel '${channel}'.`);
      return Promise.reject(new Error(`Blocked IPC invoke to channel '${channel}'.`));
    }
  },
  // 渲染进程调用此函数来执行场景
  runScenario: (scenarioName) => ipcRenderer.invoke('run-scenario', scenarioName),
  // 主进程调用此函数来更新场景列表
  onUpdateScenarios: (callback) => ipcRenderer.on('update-scenarios', (_event, value) => callback(value))
});

console.log('Preload script loaded.');