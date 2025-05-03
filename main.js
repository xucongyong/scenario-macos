const { app, BrowserWindow, ipcMain, shell, Menu, Tray, nativeImage } = require('electron'); // Import Menu, Tray, nativeImage
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

// let mainWindow; // 主窗口不再是必须的，可以注释掉或移除
let tray = null;
let scenarios = {};

// --- 读取场景配置 ---
function loadScenarios() {
  try {
    const scenariosPath = path.join(__dirname, 'scenarios.json');
    if (fs.existsSync(scenariosPath)) {
      scenarios = JSON.parse(fs.readFileSync(scenariosPath, 'utf-8'));
      console.log('Scenarios loaded successfully.');
    } else {
      console.warn('scenarios.json not found, using default.');
      scenarios = {
        "Demo Scene 1": [
          { "type": "app", "name": "TextEdit", "position": [50, 50], "size": [400, 300] },
          { "type": "url", "url": "https://www.electronjs.org" }
        ],
        "Demo Scene 2": [
          { "type": "app", "name": "Calculator", "position": [500, 50], "size": [250, 400] }
        ]
      };
      // Optionally write the default scenarios back to file
      // fs.writeFileSync(scenariosPath, JSON.stringify(scenarios, null, 2));
    }
  } catch (error) {
    console.error('Failed to load or parse scenarios.json:', error);
    scenarios = {}; // Reset scenarios on error
  }
}

// --- 创建菜单栏图标和菜单 ---
function createTray() {
  // 创建一个 Tray 图标
  // 注意：你需要提供一个图标文件，例如 icon.png。这里使用 Electron 默认图标作为占位符
  // const iconPath = path.join(__dirname, 'icon.png'); 
  // const image = nativeImage.createFromPath(iconPath);
  // tray = new Tray(image.resize({ width: 16, height: 16 }));
    // Construct the correct path to the icon file relative to the main script
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  console.log(`Attempting to load icon from: ${iconPath}`); // Log the path for debugging
  if (!fs.existsSync(iconPath)) {
    console.error(`Icon file not found at: ${iconPath}. Please ensure 'icon.png' exists in the 'assets' folder.`);
    // Use a default Electron icon or handle the error gracefully
    // For now, we'll let the Tray creation potentially fail or use a default
    // A better approach might be to create a default image programmatically
    tray = new Tray(nativeImage.createEmpty()); // Create an empty tray icon as fallback
  } else {
    try {
      const image = nativeImage.createFromPath(iconPath);
      tray = new Tray(image.resize({ width: 16, height: 16 }));
      console.log('Tray icon created successfully.');
    } catch (error) {
      console.error(`Error creating native image from path ${iconPath}:`, error);
      tray = new Tray(nativeImage.createEmpty()); // Fallback on error
    }
  }

  // 加载场景数据
  loadScenarios();

  // 创建菜单模板
  const contextMenuTemplate = [
    {
      label: 'Scenarios',
      submenu: Object.keys(scenarios).map(scenarioName => ({
        label: scenarioName,
        click: () => {
          console.log(`Menu clicked: Running scenario ${scenarioName}`);
          runScenario(scenarioName); // 直接调用 runScenario
        }
      }))
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ];

  const contextMenu = Menu.buildFromTemplate(contextMenuTemplate);

  tray.setToolTip('Scenario Runner');
  tray.setContextMenu(contextMenu);

  // (可选) 如果你仍然需要一个隐藏的窗口来处理某些逻辑或 IPC
  /*
  mainWindow = new BrowserWindow({
    width: 1, height: 1,
    show: false, // 保持窗口隐藏
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile('index.html'); // 仍然加载，以防 preload.js 或 renderer.js 有用
  */

  // 监听场景更新（如果需要动态更新菜单）
  // mainWindow.webContents.on('did-finish-load', () => {
  //   mainWindow.webContents.send('update-scenarios', Object.keys(scenarios));
  // });
}

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

// --- AppleScript 执行 ---
function runAppleScript(script, callback) {
  // 确保脚本中的双引号被正确转义以用于命令行
  const escapedScript = script.replace(/"/g, '\\"');
  const command = `osascript -e "${escapedScript}"`;
  console.log('Executing AppleScript:', command); // 打印将要执行的命令

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`AppleScript Error: ${error.message}`);
      console.error(`stderr: ${stderr}`);
      if (callback) callback(error, stderr);
      return;
    }
    if (stderr) {
        // 有些 AppleScript 错误或警告会输出到 stderr 但不设置 error 对象
        console.warn(`AppleScript stderr: ${stderr}`);
    }
    console.log(`AppleScript stdout: ${stdout}`);
    if (callback) callback(null, stdout);
  });
}

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
    runScenario(scenarioName);
  } else {
    console.error('Invalid URL command path:', commandPath);
  }
}


// --- 应用准备就绪 --- 
app.whenReady().then(() => {
  console.log('App is ready, creating tray...');
  createTray(); // 创建菜单栏图标和菜单

  // 注意：对于菜单栏应用，通常不需要在 app.whenReady 中设置 'activate' 监听器
  // 因为主要的 'activate' 逻辑（如下面的独立监听器）处理了点击 Dock 图标的行为
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
    createTray();
  } else if (!hasVisibleWindows && tray) {
    // 如果没有可见窗口但托盘图标存在，则不执行任何操作
    console.log('Activate event: No visible windows, but tray exists. Doing nothing.');
  }
});
// Removed the misplaced 'if' and extra '});'

// --- 场景执行逻辑 (重构) ---

// 重构 runScenario 为一个独立的异步函数
async function runScenario(scenarioName) {
  console.log(`Received request to run scenario: ${scenarioName}`);
  const actions = scenarios[scenarioName];

  if (!actions || !Array.isArray(actions)) {
    console.error(`Scenario '${scenarioName}' not found or invalid.`);
    // 可以考虑使用系统通知来显示错误
    // new Notification({ title: 'Scenario Error', body: `Scenario '${scenarioName}' not found.` }).show();
    return; // 直接返回或抛出错误
  }

  let results = [];
  for (const action of actions) {
    try {
      if (action.type === 'app' && action.name) {
        console.log(`Processing app action: ${action.name}`);
        // 1. 尝试激活应用 (确保它在前台)
        await new Promise((resolve, reject) => {
          runAppleScript(`tell application \"${action.name}\" to activate`, (err) => {
            if (err) {
              console.warn(`Failed to activate ${action.name}, might not be running or accessible. Error: ${err}`);
              // 即使激活失败，也尝试继续设置窗口，因为它可能已经在运行但不在前台
            }
            // 等待一小段时间让应用响应
            setTimeout(resolve, 500); // 增加延迟确保应用有时间响应
          });
        });

        // 2. 尝试设置窗口位置和大小 (如果提供了)
        if (action.position && action.size) {
          const script = `
tell application "System Events"
  try
    tell process "${action.name}"
      set frontmost to true
      delay 0.5 -- 等待应用变为最前
      if exists (window 1) then
        tell window 1
          set position to {${action.position[0]}, ${action.position[1]}}
          set size to {${action.size[0]}, ${action.size[1]}}
        end tell
        log "Successfully set window for ${action.name}"
      else
        log "Window 1 not found for ${action.name}"
      end if
    end tell
  on error errMsg number errNum
    log "Error setting window for ${action.name}: " & errMsg & " (" & errNum & ")"
  end try
end tell
`;
          // 2. 尝试设置窗口位置和大小 (如果提供了)
          await new Promise((resolve) => { // Changed reject to resolve to allow scenario continuation
            runAppleScript(script, (err, output) => {
              if (err) {
                // 记录错误，但继续执行场景中的其他动作
                console.warn(`Error setting window for ${action.name}: ${err.message || output}`);
                results.push({ action: action.name, success: false, message: `Error setting window: ${err.message || output}` });
              } else {
                console.log(`Window set successfully for ${action.name}. Output: ${output}`);
                results.push({ action: action.name, success: true, message: output || 'Window set successfully.' });
              }
              resolve(); // Always resolve to continue the scenario loop
            });
          });
        } else {
           results.push({ action: action.name, success: true, message: 'App activated (no position/size specified).' });
        }

      } else if (action.type === 'close_browsers') {
        console.log('Processing close browsers action');
        const browsers = ['Safari', 'Google Chrome', 'Firefox', 'Microsoft Edge']; // Add other browsers if needed
        let closePromises = browsers.map(browser => 
          new Promise((resolve) => {
            runAppleScript(`try\nquit app "${browser}"\nend try`, (err) => {
              if (err) console.warn(`Could not quit ${browser}, might not be running or error occurred: ${err}`);
              resolve(); // Resolve even if error occurs, maybe browser wasn't running
            });
          })
        );
        await Promise.all(closePromises);
        results.push({ action: 'close_browsers', success: true, message: 'Attempted to close browsers.' });
      } else if (action.type === 'mute_volume') {
        console.log('Processing mute volume action');
        await new Promise((resolve, reject) => {
          runAppleScript('set volume output muted true', (err, output) => {
            if (err) {
              results.push({ action: 'mute_volume', success: false, message: `Error muting volume: ${err.message || output}` });
              reject(err);
            } else {
              results.push({ action: 'mute_volume', success: true, message: 'Volume muted.' });
              resolve();
            }
          });
        });
      } else if (action.type === 'open_file_in_app' && action.appName && action.filePath) {
        console.log(`Processing open file action: ${action.filePath} in ${action.appName}`);
        // IMPORTANT: Ensure the filePath is correctly escaped for AppleScript if it contains special characters.
        // Basic escaping for spaces, might need more robust escaping depending on possible file paths.
        const escapedFilePath = action.filePath.replace(/ /g, '\\ '); 
        const script = `
          set theFile to POSIX file "${escapedFilePath}"
          tell application "${action.appName}"
            activate
            open theFile
          end tell
        `;
        await new Promise((resolve, reject) => {
          runAppleScript(script, (err, output) => {
            if (err) {
              results.push({ action: `open ${action.filePath} in ${action.appName}`, success: false, message: `Error opening file: ${err.message || output}` });
              // Decide if rejection is needed or just log and continue
              resolve(); // Resolve even on error to continue scenario
            } else {
              results.push({ action: `open ${action.filePath} in ${action.appName}`, success: true, message: 'File open command sent.' });
              resolve();
            }
          });
        });
      } else if (action.type === 'url' && action.url) {
        console.log(`Processing url action: ${action.url}`);
        await shell.openExternal(action.url);
        results.push({ action: action.url, success: true, message: 'URL opened in default browser.' });
      } else {
        console.warn('Skipping invalid action:', action);
        results.push({ action: JSON.stringify(action), success: false, message: 'Invalid action format.' });
      }
    } catch (error) {
      console.error(`Error processing action ${JSON.stringify(action)}:`, error);
      results.push({ action: JSON.stringify(action), success: false, message: `Runtime error: ${error.message}` });
    }
    // 在每个动作之间添加短暂延迟，避免系统过于繁忙
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('Scenario execution finished. Results:', results);
  // 返回一个包含所有操作结果的摘要
  const overallSuccess = results.every(r => r.success);
  const summaryMessage = results.map(r => `${r.action}: ${r.success ? 'OK' : 'Failed'} (${r.message})`).join('\n');
  // 可以考虑使用系统通知来显示结果
  // const summaryTitle = overallSuccess ? 'Scenario Complete' : 'Scenario Finished with Errors';
  // new Notification({ title: summaryTitle, body: summaryMessage }).show();
}

// 如果你仍然需要 IPC 通信（例如，如果保留了一个隐藏窗口）
// ipcMain.handle('run-scenario', async (event, scenarioName) => {
//   await runScenario(scenarioName);
//   // 可能需要调整返回值或通知方式
//   return { success: true, message: 'Scenario triggered.' }; 
// });