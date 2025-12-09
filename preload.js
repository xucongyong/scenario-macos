console.log('Preload script starting...');
import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld('electronAPI', {
  // 新增：安全地暴露 invoke 方法，用于调用主进程处理程序
  // Universal Action API
  action: (actionType, payload) => {
    console.log(`Preload: Invoking Universal Action '${actionType}'`, payload);
    return ipcRenderer.invoke('universal-action', { actionType, payload });
  },

  // Legacy Support (Optional, can remove if we update all renderers instantly)
  // For this refactor, we are removing the old 'invoke' to force a clean break.
  // invoke: ... (REMOVED)

  // 监听秒表更新
  onStopwatchUpdate: (callback) => ipcRenderer.on('stopwatch-update', (_event, value) => callback(value)),

  // 渲染进程调用此函数来执行场景
  runScenario: (scenarioName) => ipcRenderer.invoke('universal-action', { actionType: 'run_scenario', payload: { scenarioName } }),
  // 主进程调用此函数来更新场景列表
  onUpdateScenarios: (callback) => ipcRenderer.on('update-scenarios', (_event, value) => callback(value))
});
console.log('Preload script loaded.');
