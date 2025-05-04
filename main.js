const { app, BrowserWindow, ipcMain, shell, Menu, Tray, nativeImage, screen, dialog } = require('electron'); // Import screen module
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

// let mainWindow; // 主窗口不再是必须的，可以注释掉或移除
let tray = null;
let scenarios = {}; // 旧格式，保留用于兼容或默认
let scenarioList = []; // 新格式，存储场景对象列表

// --- 读取场景配置 ---
// --- 读取场景配置 (适配新旧格式) ---
function loadScenarios() {
  scenarioList = []; // Reset list
  scenarios = {}; // Reset old format object
  try {
    const scenariosPath = path.join(__dirname, 'scenarios.json');
    if (fs.existsSync(scenariosPath)) {
      const fileContent = fs.readFileSync(scenariosPath, 'utf-8');
      const parsedJson = JSON.parse(fileContent);

      // 检查是否为新格式 { "scenarios": [...] }
      if (parsedJson && Array.isArray(parsedJson.scenarios)) {
        scenarioList = parsedJson.scenarios;
        console.log(`Loaded ${scenarioList.length} scenarios from new format.`);
        // (可选) 为了向后兼容或简化 runScenario，可以填充旧的 scenarios 对象
        scenarioList.forEach(scenario => {
          if (scenario.name && Array.isArray(scenario.actions)) {
            scenarios[scenario.name] = scenario.actions;
          }
        });
      } else if (typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
        // 假设是旧格式 { "Scenario Name": [...] }
        scenarios = parsedJson;
        // 从旧格式填充 scenarioList
        scenarioList = Object.entries(scenarios).map(([name, actions]) => ({ name, actions }));
        console.log(`Loaded ${scenarioList.length} scenarios from old format.`);
      } else {
        console.warn('scenarios.json has unrecognized format.');
      }
    } else {
      console.warn('scenarios.json not found, using default demo scenarios.');
      // 使用默认场景填充两种格式
      scenarios = {
        "Demo Scene 1": [
          { "type": "app", "name": "TextEdit", "position": [50, 50], "size": [400, 300] },
          { "type": "url", "url": "https://www.electronjs.org" }
        ],
        "Demo Scene 2": [
          { "type": "app", "name": "Calculator", "position": [500, 50], "size": [250, 400] }
        ]
      };
      scenarioList = Object.entries(scenarios).map(([name, actions]) => ({ name, actions }));
      // Optionally write the default scenarios back to file in the new format
      // fs.writeFileSync(scenariosPath, JSON.stringify({ scenarios: scenarioList }, null, 2));
    }
  } catch (error) {
    console.error('Failed to load or parse scenarios.json:', error);
    scenarios = {}; // Reset on error
    scenarioList = [];
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

  // 创建菜单模板 (使用 scenarioList)
  const scenarioMenuItems = scenarioList.map(scenario => ({
    label: scenario.name,
    click: () => {
      console.log(`Menu clicked: Running scenario ${scenario.name}`);
      runScenario(scenario.name); // 传递场景名称给 runScenario
    }
  }));

  const contextMenuTemplate = [
    ...scenarioMenuItems, // 直接展开场景菜单项
    { type: 'separator' },
    {
      label: 'Check Display',
      click: () => {
        const displays = screen.getAllDisplays();
        let displayInfo = 'Connected Displays (Use Index for \'display\' property in scenarios.json):\n\n';
        displays.forEach((display, index) => {
          displayInfo += `  Index: ${index}\n`;
          displayInfo += `  Bounds: ${display.bounds.width}x${display.bounds.height} at (${display.bounds.x}, ${display.bounds.y})\n`;
          displayInfo += `  Work Area: ${display.workArea.width}x${display.workArea.height} at (${display.workArea.x}, ${display.workArea.y})\n`;
          displayInfo += `  Scale Factor: ${display.scaleFactor}\n`;
          displayInfo += `  Primary: ${display.primary ? 'Yes' : 'No'}\n`;
          // Note: Electron's screen module does not typically provide a human-readable display name.
        });
        dialog.showMessageBox({
          type: 'info',
          title: 'Display Information',
          message: displayInfo,
          buttons: ['OK']
        });
      }
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

  // Hide the Dock icon on macOS
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

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
  // 从 scenarioList 中查找对应的场景对象
  const scenario = scenarioList.find(s => s.name === scenarioName);

  if (!scenario || !Array.isArray(scenario.actions)) {
    console.error(`Scenario '${scenarioName}' not found or invalid in scenarioList.`);
    // 可以考虑使用系统通知来显示错误
    // new Notification({ title: 'Scenario Error', body: `Scenario '${scenarioName}' not found.` }).show();
    return; // 直接返回或抛出错误
  }

  const actions = scenario.actions; // 获取动作列表

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

        // --- 窗口管理逻辑 ---
        const displays = screen.getAllDisplays();
        let targetDisplay = screen.getPrimaryDisplay(); // 默认主屏幕

        // 检查是否指定了显示器
        if (action.display !== undefined) {
          const displayIndex = parseInt(action.display, 10);
          if (!isNaN(displayIndex) && displayIndex >= 0 && displayIndex < displays.length) {
            targetDisplay = displays[displayIndex];
            console.log(`Targeting display ${displayIndex}: ID ${targetDisplay.id}, Bounds: ${JSON.stringify(targetDisplay.workArea)}`);
          } else {
            console.warn(`Invalid display index ${action.display}. Using primary display.`);
          }
        }

        const displayWorkArea = targetDisplay.workArea; // 使用工作区以避免 Dock/Menu
        const targetX = displayWorkArea.x;
        const targetY = displayWorkArea.y;

        let skipPreMove = false; // Flag to skip pre-move and potentially fullscreen action

        // --- Check Obsidian Fullscreen Status *Before* Pre-Move ---
        if (action.fullscreen === true && action.name === 'Obsidian') {
          console.log(`Checking Obsidian fullscreen status before pre-move for display ${targetDisplay.id}`);
          const checkObsidianFullscreenScript = `
            tell application "System Events"
              try
                tell process "Obsidian"
                  if not (exists window 1) then
                    return "not_found"
                  end if
                  try
                    set isFullScreen to value of attribute "AXFullScreen" of window 1
                    return isFullScreen as string -- Return "true" or "false"
                  on error errMsgAttr
                    log "Error checking AXFullScreen for Obsidian: " & errMsgAttr
                    return "error" -- Indicate error checking attribute
                  end try
                end tell
              on error errMsgProc
                log "Error interacting with Obsidian process: " & errMsgProc
                return "error" -- Indicate error interacting with process
              end try
            end tell
          `;

          try {
            const fullscreenStatus = await new Promise((resolve, reject) => {
              runAppleScript(checkObsidianFullscreenScript, (err, result) => {
                if (err) {
                  console.error(`Error running Obsidian fullscreen check script: ${err}`);
                  resolve("error"); // Treat script error as inability to determine state
                } else {
                  resolve(result ? result.trim() : "error"); // Handle potential null/empty result
                }
              });
            });

            console.log(`Obsidian fullscreen check result: '${fullscreenStatus}'`);

            if (fullscreenStatus === "true") {
              console.log("Obsidian is already fullscreen. Skipping pre-move and fullscreen keystroke.");
              skipPreMove = true;
            } else if (fullscreenStatus === "false") {
              console.log("Obsidian is not fullscreen. Proceeding with pre-move and keystroke.");
            } else {
              console.warn(`Could not reliably determine Obsidian fullscreen status ('${fullscreenStatus}'). Proceeding with pre-move and keystroke as fallback.`);
            }
          } catch (e) {
             console.error(`Exception during Obsidian fullscreen check: ${e}. Proceeding with fallback.`);
          }
        }

        // --- Execute Pre-Move Script (Conditional) ---
        if (!skipPreMove) {
          // --- 新增：强制移动到目标屏幕左上角 --- 
          // 无论后续是全屏、布局还是定位，都先尝试移动窗口
          const preMoveScript = `
            tell application "System Events"
              try
                tell process "${action.name}"
                  set frontmost to true
                  delay 0.3 -- 等待应用响应
                  if exists (window 1) then
                    log "Attempting pre-move/bound of ${action.name} window 1 to target coordinates {${targetX}, ${targetY}} on display ${targetDisplay.id}"
                    -- Try setting bounds instead of just position for potentially more reliability
                    set bounds of window 1 to {${targetX}, ${targetY}, ${targetX} + 400, ${targetY} + 300} -- Set small bounds at top-left
                    log "Pre-move bounds set for ${action.name}"
                    delay 0.5 -- Increased delay after setting bounds
                  else
                    log "Window 1 not found for ${action.name} during pre-move."
                  end if
                end tell
              on error errMsg number errNum
                log "Error during pre-move for ${action.name}: " & errMsg & " (" & errNum & ")"
              end try
            end tell
          `;
          console.log(`Executing pre-move script for ${action.name}`);
          await new Promise((resolve, reject) => {
            runAppleScript(preMoveScript, (err, result) => {
              if (err) {
                console.error(`Error executing pre-move AppleScript for ${action.name}: ${err}`);
                // 即使预移动失败，也继续尝试后续操作
              } else {
                console.log(`Pre-move script result for ${action.name}: ${result || 'Success (no output)'}`);
              }
              resolve(); // 继续执行
            });
          });
          // Add extra delay after pre-move/bound attempt before potentially sending fullscreen
          console.log(`Adding extra delay after pre-move for ${action.name}...`);
          await new Promise(resolve => setTimeout(resolve, 500)); 
          // --- 强制移动结束 ---
        } else {
           console.log(`Skipping pre-move for ${action.name} because skipPreMove is true.`);
        }

        let windowScript = '';
        let actionDescription = `activate ${action.name}`; // Default description

        // --- Generate Window Script (Position, Size, Layout, Fullscreen) ---
        // 优先处理全屏
        if (action.fullscreen === true) {
          actionDescription = `fullscreen ${action.name} on display ${targetDisplay.id}`;
          if (action.name === 'Obsidian') {
            // Obsidian 特殊处理: 仅在需要时（即 skipPreMove 为 false）发送快捷键
            if (!skipPreMove) {
              windowScript = `
                tell application "System Events"
                  try
                    tell process "Obsidian"
                      set frontmost to true -- Ensure it's frontmost again just before keystroke
                      delay 0.5 -- Increased delay before sending keystroke
                      log "Obsidian was not fullscreen, sending keystroke." 
                      keystroke "f" using {control down, command down}
                      log "Sent fullscreen keystroke (Cmd+Ctrl+F) to enter fullscreen for Obsidian"
                    end tell
                  on error errMsg number errNum
                    log "Error sending fullscreen keystroke to Obsidian: " & errMsg & " (" & errNum & ")"
                  end try
                end tell
              `;
            } else {
              // Already fullscreen, do nothing script-wise here
              console.log("Obsidian already fullscreen, windowScript for fullscreen remains empty.");
              windowScript = ''; // Explicitly empty
            }
          } else {
            // 其他应用: 仅在 skipPreMove 为 false 时尝试设置全屏
            if (!skipPreMove) {
              // 尝试使用 AXFullScreen 属性 (更可靠)
              windowScript = `
                tell application "System Events"
                  try
                    tell process "${action.name}"
                      set frontmost to true
                      delay 0.5
                      if exists (window 1) then
                         try
                           set value of attribute "AXFullScreen" of window 1 to true
                           log "Set AXFullScreen for ${action.name}"
                         on error errMsgAttr
                           log "Error setting AXFullScreen for ${action.name}, trying fallback: " & errMsgAttr
                           -- Fallback: Keystroke
                           try
                             tell application "${action.name}" to activate
                             delay 0.2
                             tell application "System Events" to keystroke "f" using {control down, command down}
                             log "Sent fallback fullscreen keystroke (Cmd+Ctrl+F) to ${action.name}"
                           on error errMsg2
                              log "Fallback keystroke failed for ${action.name}: " & errMsg2
                           end try
                         end try
                      else
                         log "Window 1 not found for ${action.name} to set AXFullScreen"
                      end if
                    end tell
                  on error errMsgProc
                    log "Error interacting with process ${action.name} for fullscreen: " & errMsgProc
                    -- Might add another fallback layer here if needed
                  end try
                end tell
              `;
            } else {
              console.log(`Skipping fullscreen for ${action.name} because skipPreMove is true.`);
              windowScript = ''; // Skip if skipPreMove is true
            }
          }
        } else if (action.layout) {
          // 处理布局: 仅在 skipPreMove 为 false 时应用
          if (!skipPreMove) {
            let targetBounds = { ...displayWorkArea }; // 基于工作区计算
            const halfWidth = Math.floor(displayWorkArea.width / 2);
            const halfHeight = Math.floor(displayWorkArea.height / 2);
            let layoutApplied = false;
            let boundsStr = '';

            switch (action.layout) {
              case 'left-half':
                targetBounds.width = halfWidth;
                boundsStr = `{${targetBounds.x}, ${targetBounds.y}, ${targetBounds.x + targetBounds.width}, ${targetBounds.y + targetBounds.height}}`;
                actionDescription = `layout ${action.name} to left half on display ${targetDisplay.id}`;
                layoutApplied = true;
                break;
              case 'right-half':
                targetBounds.x = displayWorkArea.x + halfWidth;
                targetBounds.width = halfWidth;
                boundsStr = `{${targetBounds.x}, ${targetBounds.y}, ${targetBounds.x + targetBounds.width}, ${targetBounds.y + targetBounds.height}}`;
                actionDescription = `layout ${action.name} to right half on display ${targetDisplay.id}`;
                layoutApplied = true;
                break;
              case 'top-half':
                targetBounds.height = halfHeight;
                boundsStr = `{${targetBounds.x}, ${targetBounds.y}, ${targetBounds.x + targetBounds.width}, ${targetBounds.y + targetBounds.height}}`;
                actionDescription = `layout ${action.name} to top half on display ${targetDisplay.id}`;
                layoutApplied = true;
                break;
              case 'bottom-half':
                targetBounds.y = displayWorkArea.y + halfHeight;
                targetBounds.height = halfHeight;
                boundsStr = `{${targetBounds.x}, ${targetBounds.y}, ${targetBounds.x + targetBounds.width}, ${targetBounds.y + targetBounds.height}}`;
                actionDescription = `layout ${action.name} to bottom half on display ${targetDisplay.id}`;
                layoutApplied = true;
                break;
              default:
                console.warn(`Unsupported layout value: ${action.layout}`);
            }

            if (layoutApplied) {
              windowScript = `
                tell application "System Events"
                  try
                    tell process "${action.name}"
                      set frontmost to true
                      delay 0.2
                      if exists (window 1) then
                        log "Applying layout '${action.layout}' to ${action.name} window 1: bounds ${boundsStr}"
                        set bounds of window 1 to ${boundsStr}
                        log "Layout applied for ${action.name}"
                      else
                        log "Window 1 not found for ${action.name} to apply layout."
                      end if
                    end tell
                  on error errMsg number errNum
                    log "Error applying layout '${action.layout}' for ${action.name}: " & errMsg & " (" & errNum & ")"
                  end try
                end tell
              `;
            }
          } else {
            console.log(`Skipping layout for ${action.name} because skipPreMove is true.`);
            windowScript = '';
          }
        } else if (action.position || action.size) {
          // 处理位置和大小: 仅在 skipPreMove 为 false 时应用
          if (!skipPreMove) {
            let positionScript = '';
            let sizeScript = '';
            actionDescription = `set window for ${action.name}`;

            if (action.position && Array.isArray(action.position) && action.position.length === 2) {
              const posX = displayWorkArea.x + action.position[0];
              const posY = displayWorkArea.y + action.position[1];
              positionScript = `set position of window 1 to {${posX}, ${posY}}`;
              actionDescription += ` position to (${posX}, ${posY})`;
            }
            if (action.size && Array.isArray(action.size) && action.size.length === 2) {
              const sizeW = action.size[0];
              const sizeH = action.size[1];
              sizeScript = `set size of window 1 to {${sizeW}, ${sizeH}}`;
              actionDescription += ` size to ${sizeW}x${sizeH}`;
            }

            if (positionScript || sizeScript) {
              windowScript = `
                tell application "System Events"
                  try
                    tell process "${action.name}"
                      set frontmost to true
                      delay 0.2
                      if exists (window 1) then
                        log "Setting window state for ${action.name}: ${actionDescription}"
                        ${positionScript}
                        ${sizeScript ? (positionScript ? '\ndelay 0.1\n' : '') + sizeScript : ''} -- Add delay if both are set
                        log "Window state set for ${action.name}"
                      else
                        log "Window 1 not found for ${action.name} to set position/size."
                      end if
                    end tell
                  on error errMsg number errNum
                    log "Error setting position/size for ${action.name}: " & errMsg & " (" & errNum & ")"
                  end try
                end tell
              `;
            }
          } else {
            console.log(`Skipping position/size for ${action.name} because skipPreMove is true.`);
            windowScript = '';
          }
        }

        // --- Execute Window Script (Conditional) ---
        if (windowScript) {
          console.log(`Executing window script for ${action.name}: ${actionDescription}`);
          results.push(new Promise((resolve, reject) => {
            runAppleScript(windowScript, (err, result) => {
              if (err) {
                console.error(`Error executing window script for ${action.name}: ${err}`);
                reject(new Error(`Failed to ${actionDescription}: ${err}`));
              } else {
                console.log(`Window script result for ${action.name}: ${result || 'Success (no output)'}`);
                resolve(`Successfully executed: ${actionDescription}`);
              }
            });
          }));
        } else {
           console.log(`No window script to execute for ${action.name} (action: ${actionDescription}, skipPreMove: ${skipPreMove})`);
           // Resolve immediately if no script needed, or handle as appropriate
           results.push(Promise.resolve(`Skipped window action for ${action.name} (already fullscreen or no action defined)`));
        }

      } else if (action.type === 'url' && action.url) {
        console.log(`Processing url action: ${action.url}`);
        await shell.openExternal(action.url);
        let urlActionResult = { action: `open ${action.url}`, success: true, message: 'URL opened.' };

        // 尝试为浏览器窗口设置布局/全屏 (实验性，非常不可靠)
        if (action.layout || action.display !== undefined || action.fullscreen) {
          console.warn('Attempting to manage browser window layout/fullscreen. This is experimental and may fail.');
          // 需要延迟以等待浏览器打开窗口并可能成为前台应用
          await new Promise(resolve => setTimeout(resolve, 2000)); // 增加延迟

          const displays = screen.getAllDisplays();
          let targetDisplay = screen.getPrimaryDisplay();
          if (action.display !== undefined) {
             const displayIndex = parseInt(action.display, 10);
             if (!isNaN(displayIndex) && displayIndex >= 0 && displayIndex < displays.length) {
               targetDisplay = displays[displayIndex];
             }
          }
          const displayWorkArea = targetDisplay.workArea;
          let browserScript = '';
          let browserActionDescription = '';

          // 尝试猜测哪个浏览器打开了 URL (非常脆弱)
          const findBrowserScript = `
            global browserAppName
            set browserAppName to ""
            try
              tell application "System Events"
                set frontApp to name of first application process whose frontmost is true
                -- 常见的浏览器列表
                set knownBrowsers to {"Safari", "Google Chrome", "Firefox", "Microsoft Edge", "Arc"}
                if frontApp is in knownBrowsers then
                  set browserAppName to frontApp
                else
                  -- 如果不是，尝试获取默认浏览器 (更复杂，这里简化)
                  log "Frontmost app (" & frontApp & ") is not a known browser. Cannot reliably target window."
                  return "error: cannot find browser"
                end if
              end tell
            on error
              log "Error getting frontmost application."
              return "error: cannot get frontmost app"
            end try
            if browserAppName is "" then return "error: browser app name empty"
            
            -- 尝试找到包含该 URL 的窗口或最新窗口 (更脆弱)
            -- 简化：假设是第一个窗口
            try 
              tell application browserAppName
                 activate
                 delay 0.2
                 if not (exists window 1) then return "error: browser window 1 not found"
                 set targetWindow to window 1
              end tell
            on error errMsg
               log "Error activating or finding window 1 of " & browserAppName & ": " & errMsg
               return "error: cannot find browser window 1"
            end try
            return "success"
          `;

          if (action.fullscreen === true) {
            browserActionDescription = `fullscreen browser for ${action.url}`;
            browserScript = `
              ${findBrowserScript}
              if result is not "success" then return result
              try
                tell application "System Events" to tell process browserAppName
                  set value of attribute "AXFullScreen" of window 1 to true
                end tell
                return "AXFullScreen set for " & browserAppName
              on error errMsg
                log "Error setting AXFullScreen for " & browserAppName & ": " & errMsg
                return "error: AXFullScreen failed"
              end try
            `;
          } else if (action.layout) {
            let targetBounds = { ...displayWorkArea };
            const halfWidth = Math.floor(displayWorkArea.width / 2);
            const halfHeight = Math.floor(displayWorkArea.height / 2);
            let layoutApplied = false;
            switch (action.layout) {
              case 'left-half': targetBounds.width = halfWidth; layoutApplied = true; break;
              case 'right-half': targetBounds.x = displayWorkArea.x + halfWidth; targetBounds.width = halfWidth; layoutApplied = true; break;
              case 'top-half': targetBounds.height = halfHeight; layoutApplied = true; break;
              case 'bottom-half': targetBounds.y = displayWorkArea.y + halfHeight; targetBounds.height = halfHeight; layoutApplied = true; break;
              default: console.warn(`Invalid layout for URL: ${action.layout}`);
            }
            if (layoutApplied) {
              browserActionDescription = `set layout '${action.layout}' for browser (${action.url})`;
              const { x, y, width, height } = targetBounds;
              browserScript = `
                ${findBrowserScript}
                if result is not "success" then return result
                try
                  tell application browserAppName to set bounds of window 1 to {${x}, ${y}, ${x + width}, ${y + height}}
                  return "Layout '${action.layout}' set for " & browserAppName
                on error errMsg
                  log "Error setting layout for " & browserAppName & ": " & errMsg
                  return "error: setting layout failed"
                end try
              `;
            }
          } else if (action.position && action.size) {
             // 如果 URL 也有 position/size
             browserActionDescription = `set position/size for browser (${action.url})`;
             const [relX, relY] = action.position;
             const [width, height] = action.size;
             const absX = Math.max(displayWorkArea.x, displayWorkArea.x + relX);
             const absY = Math.max(displayWorkArea.y, displayWorkArea.y + relY);
             const clampedWidth = Math.min(width, displayWorkArea.x + displayWorkArea.width - absX);
             const clampedHeight = Math.min(height, displayWorkArea.y + displayWorkArea.height - absY);
             browserScript = `
                ${findBrowserScript}
                if result is not "success" then return result
                try
                  tell application browserAppName to set bounds of window 1 to {${absX}, ${absY}, ${absX + clampedWidth}, ${absY + clampedHeight}}
                  return "Position/size set for " & browserAppName
                on error errMsg
                  log "Error setting position/size for " & browserAppName & ": " & errMsg
                  return "error: setting position/size failed"
                end try
              `;
          }

          if (browserScript) {
            await new Promise((resolve) => {
              runAppleScript(browserScript, (err, output) => {
                const success = !err && !(output && output.startsWith('error:'));
                const message = err ? err.message : output;
                console.log(`Browser window management attempt result: ${message}`);
                // 更新原始 URL 操作的结果或添加新结果
                urlActionResult.success = urlActionResult.success && success; // Mark overall success based on both open and layout
                urlActionResult.message += ` | Layout/Fullscreen attempt: ${success ? 'OK' : 'Failed'} (${message})`;
                resolve();
              });
            });
          }
        }
        results.push(urlActionResult);

      } else if (action.type === 'close_app' && action.name) {
        console.log(`Processing close_app action for: ${action.name}`);
        const closeScript = `
          try
            tell application "${action.name}" to quit
            log "Sent quit command to ${action.name}"
            return "success"
          on error errMsg number errNum
            log "Error sending quit command to ${action.name}: " & errMsg & " (" & errNum & ")"
            -- If the app wasn't running, it's not really an error for this action
            if errNum is -600 then -- Application not running error
              log "Application ${action.name} was not running."
              return "not_running"
            else
              return "error: " & errMsg
            end if
          end try
        `;

        results.push(new Promise((resolve) => {
          runAppleScript(closeScript, (err, result) => {
            let actionResult = { action: `close ${action.name}`, success: false, message: '' };
            if (err) {
              console.error(`Error executing close AppleScript for ${action.name}: ${err}`);
              actionResult.message = `Error: ${err}`;
            } else if (result && result.startsWith('error:')) {
              console.error(`AppleScript error closing ${action.name}: ${result}`);
              actionResult.message = result;
            } else if (result === 'not_running') {
              console.log(`Application ${action.name} was not running.`);
              actionResult.success = true; // Consider it success if it wasn't running
              actionResult.message = 'Application not running.';
            } else {
              console.log(`Successfully sent quit command to ${action.name}. Result: ${result || '(no output)'}`);
              actionResult.success = true;
              actionResult.message = 'Quit command sent successfully.';
            }
            resolve(actionResult);
          });
        }));
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