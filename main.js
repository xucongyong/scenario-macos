const { app, BrowserWindow, ipcMain, shell, Menu, Tray, nativeImage, screen, dialog } = require('electron'); // Import screen module
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const { marked } = require('marked'); // <-- Import marked

// Keep track of markdown note windows
const markdownNoteWindows = new Map(); // Use a Map to store windows by a unique ID or file path
let noteIdCounter = 0;

// let mainWindow; // 主窗口不再是必须的，可以注释掉或移除
let tray = null;
let scenarioList = []; // 新格式，存储场景对象列表
let scenarios = {}; // 旧格式，保留用于兼容或默认

// --- Import Scenario Loader ---
const { loadScenarios: loadScenariosFromFile } = require('./utils/scenario-loader');
// --- Import Tray Manager ---
const { createTray: createTrayInstance } = require('./utils/tray-manager');
// --- Import Scenario Runner ---
const { runScenario } = require('./utils/scenario-runner');

// --- (旧的 createWindow 函数内容，大部分可以移除或注释) ---
/*
function createWindow_old() {
  // mainWindow = new BrowserWindow({
  //   width: 800,
  //   height: 600,
  //   webPreferences: {
  //     preload: path.join(__dirname, 'preload.js'),
  //     contextIsolation: true,
  //     nodeIntegration: false
  //   }
  // });

  // mainWindow.loadFile('index.html');

  // // 加载场景后发送给渲染进程
  // loadScenarios();
  // mainWindow.webContents.on('did-finish-load', () => {
  //   mainWindow.webContents.send('update-scenarios', Object.keys(scenarios));
  // });

  // // mainWindow.webContents.openDevTools(); // 取消注释以打开开发者工具
}
*/

// --- 获取所有显示器信息 (辅助函数) ---
function getAllDisplaysInfo() {
  return screen.getAllDisplays().map(display => ({
    id: display.id,
    bounds: display.bounds, // { x, y, width, height }
    workArea: display.workArea, // Usable area excluding taskbars/docks
    scaleFactor: display.scaleFactor,
    primary: display.primary
  }));
}

// --- AppleScript 执行 (Imported) ---
const { runAppleScript } = require('./utils/applescript');

// --- Electron 应用生命周期 ---
// --- 自定义 URL Scheme 处理 ---
const PROTOCOL = 'myapp-scenario'; // 定义你的 scheme

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

// 处理 macOS 的 open-url 事件
app.on('open-url', (event, url) => {
  event.preventDefault(); // 阻止默认行为
  console.log(`Received URL: ${url}`);
  handleUrl(url);
});

// 处理 Windows/Linux 的第二个实例启动
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // 当尝试启动第二个实例时，聚焦我们的窗口（如果存在）并处理 URL
    // if (mainWindow) {
    //   if (mainWindow.isMinimized()) mainWindow.restore();
    //   mainWindow.focus();
    // }
    
    // 从命令行参数中查找 URL
    const url = commandLine.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (url) {
      console.log(`Received URL from second instance: ${url}`);
      handleUrl(url);
    }
  });
}

function handleUrl(url) {
  // 解析 URL, 例如: myapp-scenario://run/Work
  const urlParts = url.split('://');
  if (urlParts.length < 2 || urlParts[0] !== PROTOCOL) {
    console.error('Invalid URL scheme:', url);
    return;
  }

  const commandPath = urlParts[1];
  const pathParts = commandPath.split('/');
  
  if (pathParts.length >= 2 && pathParts[0] === 'run') {
    const scenarioName = decodeURIComponent(pathParts[1]); // 解码场景名称
    console.log(`Parsed scenario name from URL: ${scenarioName}`);
    runScenario(scenarioName, scenarioList);
  } else {
    console.error('Invalid URL command path:', commandPath);
  }
}


// --- 应用准备就绪 --- 
app.whenReady().then(() => {
  console.log('App is ready, loading scenarios and creating tray...');
  // Load scenarios first
  const scenariosPath = path.join(__dirname, 'scenarios.json');
  const loadedData = loadScenariosFromFile(scenariosPath);
  scenarioList = loadedData.scenarioList;
  scenarios = loadedData.scenarios; // Keep old format populated if needed

  // Create tray, passing the scenario list and the runScenario function
  tray = createTrayInstance(scenarioList, (scenarioName) => runScenario(scenarioName, scenarioList));

  // Hide the Dock icon on macOS
  if (process.platform === 'darwin') {
    app.dock.hide();
  }
});

// 当所有窗口关闭时，应用通常会退出，但菜单栏应用不应如此
app.on('window-all-closed', function () {
  // 在 macOS 上，即使没有窗口，应用也通常会保持活动状态
  // 对于菜单栏应用，我们不希望在窗口关闭时退出
  // 因此，只有在非 macOS 平台才退出
  if (process.platform !== 'darwin') {
      app.quit();
  }
});

// 阻止应用在没有窗口时退出 (macOS)
app.on('activate', (event, hasVisibleWindows) => {
  // 在 macOS 上，当点击 Dock 图标并且没有其他窗口打开时，
  // 通常会重新创建一个窗口。对于菜单栏应用，我们检查托盘图标是否存在。
  if (!hasVisibleWindows && !tray) {
    // 如果没有可见窗口且托盘图标不存在（例如意外关闭），则重新创建
    console.log('Activate event: No visible windows and no tray, recreating tray.');
    // Reload scenarios before recreating tray
    const scenariosPath = path.join(__dirname, 'scenarios.json');
    const loadedData = loadScenariosFromFile(scenariosPath);
    scenarioList = loadedData.scenarioList;
    scenarios = loadedData.scenarios;
    tray = createTrayInstance(scenarioList, runScenario);
  } else if (!hasVisibleWindows && tray) {
    // 如果没有可见窗口但托盘图标存在，则不执行任何操作
    console.log('Activate event: No visible windows, but tray exists. Doing nothing.');
  }
});
// Removed the misplaced 'if' and extra '});'

// --- 场景执行逻辑 (重构) ---

// 重构 runScenario 为一个独立的异步函数
// 导入场景运行器模块

