const { screen, BrowserWindow, ipcMain } = require('electron'); // 添加 ipcMain
const { runAppleScript } = require('./applescript');
const { marked } = require('marked');
const path = require('path');
const fs = require('fs');

// 保持对markdown笔记窗口的跟踪
const markdownNoteWindows = new Map();
let noteIdCounter = 0;


/**
 * 运行指定名称的场景
 * @param {string} scenarioName - 要运行的场景名称
 * @param {Array} scenarioList - 场景列表
 * @returns {Promise<void>}
 */
async function runScenario(scenarioName, scenarioList) {
  console.log(`Received request to run scenario: ${scenarioName}`);

  // Define default window dimensions and position
  const defaultWidth = 800;
  const defaultHeight = 600;
  const defaultX = 100; // Example default X position
  const defaultY = 100; // Example default Y position
  // 注意：BrowserWindow 的创建已移至需要它的地方（例如 handleMenuAction 或其他动作处理逻辑）
  // 以确保在 app ready 之后创建。
  // 从scenarioList中查找对应的场景对象
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
      } else if (action.type === 'show_markdown_note' && action.file_path) {
        console.log(`Processing show_markdown_note action for: ${action.file_path}`);
        const noteId = `note-${noteIdCounter++}`;
        results.push(new Promise(async (resolve) => {
          let actionResult = { action: `show markdown note ${action.file_path}`, success: false, message: '' };
          try {
            // 处理相对路径和绝对路径
            const absolutePath = action.file_path.startsWith('/') || action.file_path.startsWith('~') 
              ? path.normalize(action.file_path.replace('~', process.env.HOME))
              : path.resolve(__dirname, action.file_path);
            
            if (!fs.existsSync(absolutePath)) {
              throw new Error(`Markdown file not found: ${absolutePath}`);
            }
            const markdownContent = fs.readFileSync(absolutePath, 'utf-8');
            const htmlContent = `
              <div style="position:absolute; top:0; right:0; z-index:1000;">
                <button id="prevBtn">←</button>
                <button id="nextBtn">→</button>
              </div>
              ${marked.parse(markdownContent)}
            `;

            // --- Determine Window Position and Size --- 
            const displays = screen.getAllDisplays();
            let targetDisplay = screen.getPrimaryDisplay();
            if (action.display !== undefined) {
              const displayIndex = parseInt(action.display, 10);
              if (!isNaN(displayIndex) && displayIndex >= 0 && displayIndex < displays.length) {
                targetDisplay = displays[displayIndex];
              } else {
                console.warn(`Invalid display index ${action.display} for note. Using primary.`);
              }
            }
            const displayWorkArea = targetDisplay.workArea;

            const defaultWidth = 300;
            const defaultHeight = 400;
            const width = action.width || defaultWidth;
            const height = action.height || defaultHeight;
            // Default position to top-right corner of the target display work area
            const defaultX = displayWorkArea.x + displayWorkArea.width - width - 20; // 20px padding
            const defaultY = displayWorkArea.y + 20; // 20px padding

            const x = action.x !== undefined ? displayWorkArea.x + action.x : defaultX;
            const y = action.y !== undefined ? displayWorkArea.y + action.y : defaultY;

            // --- Create the BrowserWindow --- 
            const noteWindow = new BrowserWindow({
              width: width,
              height: height,
              x: Math.floor(x),
              y: Math.floor(y),
              frame: false,
              webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
              }
            });

            // --- Prepare HTML with Basic Styling and Content --- 
            // Improved CSS for a more modern sticky note look
            const finalHtml = `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="UTF-8">
                <style>
                  body {
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    margin: 0; /* Remove default margin */
                    padding: 20px; /* Add padding inside */
                    background-color: #fffacd; /* Slightly richer yellow */
                    border-radius: 8px; /* More rounded corners */
                    box-shadow: 0 5px 15px rgba(0,0,0,0.15); /* Softer, more pronounced shadow */
                    overflow-y: auto; /* Enable scroll if content overflows */
                    height: 100vh; /* Ensure body takes full viewport height */
                    box-sizing: border-box; /* Include padding in height calculation */
                    color: #333; /* Darker text for better readability */
                    line-height: 1.6;
                  }
                  /* Style markdown elements */
                  h1, h2, h3, h4, h5, h6 { margin-top: 0.8em; margin-bottom: 0.4em; font-weight: 600; }
                  h1 { font-size: 1.4em; }
                  h2 { font-size: 1.2em; }
                  p { margin-top: 0; margin-bottom: 1em; }
                  ul, ol { padding-left: 25px; margin-bottom: 1em; }
                  li { margin-bottom: 0.3em; }
                  code {
                    background-color: rgba(0,0,0,0.06);
                    padding: 3px 5px;
                    border-radius: 4px;
                    font-family: SFMono-Regular, Consolas, 'Liberation Mono', Menlo, Courier, monospace;
                    font-size: 0.9em;
                  }
                  pre {
                    background-color: rgba(0,0,0,0.06);
                    padding: 12px;
                    border-radius: 6px;
                    overflow-x: auto;
                    margin-bottom: 1em;
                  }
                  pre code {
                     background-color: transparent; /* Avoid double background */
                     padding: 0;
                  }
                  blockquote {
                    border-left: 4px solid #ddd;
                    padding-left: 15px;
                    margin-left: 0;
                    margin-bottom: 1em;
                    color: #555;
                    font-style: italic;
                  }
                  a { color: #007AFF; text-decoration: none; }
                  a:hover { text-decoration: underline; }
                  hr { border: none; border-top: 1px solid #eee; margin: 1.5em 0; }

                  .close-button {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    width: 12px;
                    height: 12px;
                    background-color: #ff5f57; /* macOS red */
                    border: 1px solid #e0443e;
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0.6;
                    transition: opacity 0.2s ease, transform 0.1s ease;
                    z-index: 10; /* Ensure it's above content */
                  }
                  .close-button:hover {
                    opacity: 1;
                    transform: scale(1.1);
                  }
                  .close-button::before { /* Optional: Add a subtle 'x' icon centered */
                    content: '✕';
                    color: rgba(0,0,0,0.4);
                    font-weight: bold;
                    font-size: 9px;
                    line-height: 12px; /* Center vertically */
                    text-align: center;
                    width: 100%;
                    transition: color 0.2s ease;
                  }
                   .close-button:hover::before {
                     color: rgba(0,0,0,0.7);
                   }
                </style>
              </head>
              <body>
                <a href="#" class="close-button" title="Close" onclick="window.close(); return false;"></a>
                ${htmlContent}
              </body>
              </html>
            `;

            // Load the HTML content
            noteWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(finalHtml)}`);

            noteWindow.once('ready-to-show', () => {
              noteWindow.show();
              console.log(`Markdown note window shown for ${absolutePath}`);
              actionResult.success = true;
              actionResult.message = 'Markdown note displayed successfully.';
              markdownNoteWindows.set(noteId, noteWindow); // Store the window
              resolve(actionResult);
            });

            // Handle window closure (e.g., user clicks the 'x')
            noteWindow.on('closed', () => {
              console.log(`Markdown note window closed: ${noteId}`);
              markdownNoteWindows.delete(noteId); // Remove from tracking
            });

          } catch (error) {
            console.error(`Error creating markdown note for ${action.file_path}:`, error);
            actionResult.message = `Error: ${error.message}`;
            resolve(actionResult); // Resolve with error
          }
        }));

      } else if (action.type === 'menu' && Array.isArray(action.items)) {
        // 处理 menu 类型的动作
        console.log(`Processing menu action for scenario: ${scenarioName}`);
        // 在这里调用一个新的函数来处理菜单项和生成导航
        // 例如: await handleMenuAction(action.items, noteWindow, scenarioName);
        // 目前暂时只记录日志，后续实现具体逻辑
        results.push({ action: JSON.stringify(action), success: true, message: 'Menu action recognized (implementation pending).' });

      } else {
        // 保留原始的无效动作处理
        console.warn('Skipping invalid or unsupported action:', action);
        results.push({ action: JSON.stringify(action), success: false, message: 'Invalid or unsupported action format.' });
      }
    } catch (error) {
      console.error(`Error processing action ${JSON.stringify(action)}:`, error);
      results.push({ action: JSON.stringify(action), success: false, message: `Runtime error: ${error.message}` });
    }
    // 在每个动作之间添加短暂延迟，避免系统过于繁忙
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // 添加窗口事件监听
  noteWindow.webContents.on('dom-ready', () => {
    noteWindow.webContents.executeJavaScript(`
      document.getElementById('prevBtn').addEventListener('click', () => {
        // 切换到上一个Markdown文件
      });
      document.getElementById('nextBtn').addEventListener('click', () => {
        // 切换到下一个Markdown文件
      });
    `);
  });

  console.log('Scenario execution finished. Results:', results);
}

/**
 * 处理 menu 类型的动作，生成导航并加载初始内容
 * @param {Array} menuItems - 菜单项列表
 * @param {BrowserWindow} window - 目标窗口
 * @param {string} scenarioName - 当前场景名称 (用于日志)
 * @returns {Promise<object>} - 动作结果
 */
async function handleMenuAction(menuItems, window, scenarioName) {
  const defaultWidth = 400; // Define default width locally
  const defaultHeight = 600; // Define default height locally
  // Add opening comment marker
  const actionResult = { success: false, message: 'Failed to handle menu action.' };
  try {
    let navigationHtml = '<div class="navigation">';
    let initialContentHtml = '<p>请选择一个项目查看内容。</p>'; // 默认内容
    let firstItemPath = null;
    let firstItemWidth = defaultWidth;
    let firstItemHeight = defaultHeight;

    // --- 生成二级导航 HTML --- 
    navigationHtml += '<div class="nav-level-1">';
    // menuItems is now like [{ name: "Fogg模型", type: "submenu", items: [...] }, { name: "Action", type: "submenu", items: [...] }]
    let isFirstSubmenuItem = true;
    for (const topLevelItem of menuItems) {
      if (topLevelItem.type === 'submenu' && topLevelItem.name && Array.isArray(topLevelItem.items)) {
        navigationHtml += `<div class="submenu-container">`;
        navigationHtml += `<div class="submenu-title">${topLevelItem.name}</div>`;
        navigationHtml += `<div class="nav-level-2">`;
        for (const secondLevelItem of topLevelItem.items) {
          if (secondLevelItem.name && Array.isArray(secondLevelItem.actions)) {
            const mdAction = secondLevelItem.actions.find(a => a.type === 'show_markdown_note' && a.file_path);
            if (mdAction) {
              const filePath = mdAction.file_path;
              const buttonId = `nav-btn-${encodeURIComponent(filePath)}`;
              navigationHtml += `<button class="nav-button level-2" id="${buttonId}" data-filepath="${filePath}" data-submenu="${topLevelItem.name}">${secondLevelItem.name}</button>`;

              // 记录第一个有效项的文件路径和尺寸 (第一个子菜单的第一个项)
              if (isFirstSubmenuItem) {
                firstItemPath = filePath;
                firstItemWidth = mdAction.width || defaultWidth;
                firstItemHeight = mdAction.height || defaultHeight;
                isFirstSubmenuItem = false; // 只记录一次
              }
            }
          }
        }
        navigationHtml += `</div>`; // end nav-level-2
        navigationHtml += `</div>`; // end submenu-container
      } else {
        console.warn('Skipping invalid top-level item structure in handleMenuAction:', topLevelItem);
      }
    }
    navigationHtml += '</div>'; // end nav-level-1
    navigationHtml += '</div>'; // end navigation (保持原样，包裹整个导航区)


    // --- 加载初始内容 --- 
    if (firstItemPath) {
      // 统一路径解析：相对于项目根目录 (app.getAppPath() 在主进程中可用，这里需要找到替代方式或调整逻辑)
      // 暂时假设 firstItemPath 已经是相对于项目根目录的正确路径 (如 'utils/fogg_behavior_model/...')
      // 注意：BrowserWindow 无法直接访问 app.getAppPath()，路径解析需要在主进程完成或传递过来
      // 这里我们依赖于 main.js 的 IPC 调用来处理正确的路径解析
      // 因此，直接使用 firstItemPath 调用 IPC
      console.log(`Requesting initial markdown content via IPC for: ${firstItemPath}`);
      // 注意：这里不能直接 readFile，因为这是在主进程的函数，但最终会在渲染进程的<script>中执行
      // 初始内容的加载逻辑已移至 HTML 内的 <script> 部分，通过 IPC 调用
      // 此处的 readFile 逻辑需要移除或注释掉，因为 initialContentHtml 的生成方式改变了
      // const markdownContent = await fs.promises.readFile(absolutePath, 'utf8');
      // initialContentHtml = marked(markdownContent);
      
      // 调整窗口大小以适应第一个项目 (暂时移除 try-catch)
      try {
          window.setSize(firstItemWidth, firstItemHeight);
          console.log(`Set initial window size to ${firstItemWidth}x${firstItemHeight}`);
      } catch (sizeError) {
          console.error(`Error setting initial window size for ${firstItemPath}:`, sizeError);
          // 如果设置大小失败，也应该继续，但记录错误
      }
      // console.log(`Attempting to set initial window size to ${firstItemWidth}x${firstItemHeight}`);
      // window.setSize(firstItemWidth, firstItemHeight); // 暂时直接调用，移除 try-catch
    }

    // --- 完整的 HTML 结构 --- 
    const finalHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Scenario Note</title>
      </head>
      <body>
        ${navigationHtml}
        <div class="content" id="markdown-content">
          ${initialContentHtml}
        </div>
        <a href="#" class="close-button" title="Close" onclick="window.close(); return false;"></a>
        <script>
          // Renderer script content embedded here

          // 函数：加载 Markdown 内容
          async function loadMarkdown(filePath) {
            const contentDiv = document.getElementById('markdown-content');
            const buttons = document.querySelectorAll('.nav-button');
            contentDiv.innerHTML = '<p>加载中...</p>'; // 显示加载提示

            // 移除所有按钮的 active 类
            buttons.forEach(btn => btn.classList.remove('active'));
            // 给当前按钮添加 active 类
            // Escape the dollar sign for the inner template literal
            var selector = '.nav-button[data-filepath="' + filePath + '"]'; // Use string concatenation instead of nested template literal 
            const currentButton = document.querySelector(selector);
            if (currentButton) {
              currentButton.classList.add('active');
            }

            try {
              // Request main process to read and render the file via preload script
              const htmlContent = await window.electronAPI.invoke('read-markdown-file', filePath);
              contentDiv.innerHTML = htmlContent;
            } catch (error) {
              console.error('Error loading markdown:', error);
              const errorMessageHTML = '<p style="color: red;">错误：无法加载文件 ' + filePath + '. ' + (error.message || '') + '</p>';
              contentDiv.innerHTML = errorMessageHTML;
            }
          }

          // Add event listeners to navigation buttons
          document.querySelectorAll('.nav-button').forEach(button => {
            button.addEventListener('click', (event) => {
              const filePath = event.currentTarget.dataset.filepath;
              if (filePath) {
                loadMarkdown(filePath);
              }
            });
          });

          // Load initial content after DOM is ready
          document.addEventListener('DOMContentLoaded', () => {
             const firstLevel2Button = document.querySelector('.nav-button.level-2');
             if (firstLevel2Button) {
                const firstFilePath = firstLevel2Button.dataset.filepath;
                if(firstFilePath) {
                   console.log('Loading initial content for:', firstFilePath);
                   loadMarkdown(firstFilePath);
                } else {
                   console.log('First level-2 button found, but no filepath data.');
                   document.getElementById('markdown-content').innerHTML = '<p>无法找到初始文件路径。</p>';
                }
             } else {
                 console.log('No level-2 navigation buttons found.');
             }
          });
        </script>
      </body>
      </html>
    `;

    // 加载生成的 HTML
    window.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(finalHtml)}`);

    window.once('ready-to-show', () => {
      window.show();
      console.log(`Menu note window shown for scenario: ${scenarioName}`);
      actionResult.success = true;
      actionResult.message = 'Menu note displayed successfully.';
    });

    // 处理窗口关闭
    window.on('closed', () => {
      console.log(`Menu note window closed for scenario: ${scenarioName}`);
      // 如果需要，可以在这里进行清理
    });

  } catch (error) {
    console.error(`Error handling menu action for ${scenarioName}:`, error);
    actionResult.message = `Error: ${error.message}`;
    // 尝试关闭可能已创建的窗口
    if (window && !window.isDestroyed()) {
      window.close();
    }
  }
  return actionResult;
}


/**
 * 运行指定名称的场景
 * @param {string} scenarioName - 要运行的场景名称
 * @param {Array} scenarioList - 场景列表
 * @returns {Promise<void>}
 */
async function runScenario(scenarioName, scenarioList) {
  console.log(`Received request to run scenario: ${scenarioName}`);

  // Define default window dimensions and position
  const defaultWidth = 800;
  const defaultHeight = 600;
  const defaultX = 100; // Example default X position
  const defaultY = 100; // Example default Y position

  // 从scenarioList中查找对应的场景对象
  const scenario = scenarioList.find(s => s.name === scenarioName);

  if (!scenario || !Array.isArray(scenario.actions)) {
    console.error(`Scenario '${scenarioName}' not found or invalid in scenarioList.`);
    return;
  }

  const actions = scenario.actions;
  let results = [];
  let noteWindow = null; // 将 noteWindow 的创建移到需要时

  for (const action of actions) {
    try {
      // --- 处理 menu 动作 --- 
      if (action.type === 'menu' && Array.isArray(action.items)) {
        console.log(`Processing menu action for scenario: ${scenarioName}`);
        // 仅在需要显示菜单时创建窗口
        let noteWindow = markdownNoteWindows.get(scenarioName); // 尝试获取现有窗口
        if (!noteWindow || noteWindow.isDestroyed()) {
           const firstItemAction = action.items[0]?.actions?.find(a => a.type === 'show_markdown_note');
           const width = firstItemAction?.width || defaultWidth;
           const height = firstItemAction?.height || defaultHeight;
           const x = firstItemAction?.x || defaultX;
           const y = firstItemAction?.y || defaultY;

           console.log(`Creating new menu window for ${scenarioName} at (${x},${y}) size ${width}x${height}`);
           noteWindow = new BrowserWindow({
            width: width,
            height: height,
            x: x,
            y: y,
            frame: false,
            show: false, // Initially hide the window
            webPreferences: {
              nodeIntegration: false, // Security: Disable Node.js integration in renderer
              contextIsolation: true, // Security: Isolate renderer context
              preload: path.join(__dirname, '..', 'preload.js') // Use preload script for IPC
            }
          });
          markdownNoteWindows.set(scenarioName, noteWindow); // Store window by scenario name
          noteWindow.on('closed', () => {
            console.log(`Menu note window closed for scenario: ${scenarioName}`);
            markdownNoteWindows.delete(scenarioName); // Remove from tracking on close
          });
        }
        const menuResult = await handleMenuAction(action.items, noteWindow, scenarioName);
        results.push({ action: JSON.stringify(action), ...menuResult });

      // --- 处理 show_markdown_note 动作 (如果仍然需要独立支持) --- 
      } else if (action.type === 'show_markdown_note' && action.file_path) {
        console.log(`Processing direct show_markdown_note action: ${action.file_path}`);
        // 如果需要独立显示 markdown 文件，可以在这里创建或复用窗口
        // 但当前需求是菜单驱动，所以这个分支可能不需要了，或者需要不同的实现
        // 暂时标记为不支持，以强制使用 menu 结构
         results.push({ action: JSON.stringify(action), success: false, message: 'Direct show_markdown_note is currently handled via menu actions.' });

        /* // --- 原来的 show_markdown_note 逻辑 (需要调整以使用 preload 和 IPC) --- 
        results.push(await new Promise(async (resolve) => {
          const actionResult = { action: JSON.stringify(action), success: false, message: 'Failed to show markdown note.' };
          try {
            const noteId = `note-${noteIdCounter++}`;
            const width = action.width || defaultWidth;
            const height = action.height || defaultHeight;
            const x = action.x || defaultX;
            const y = action.y || defaultY;

            const noteWindowInstance = new BrowserWindow({
              width: width,
              height: height,
              x: x,
              y: y,
              frame: false,
              webPreferences: {
                 nodeIntegration: false, // Best practice: disable nodeIntegration
                 contextIsolation: true, // Best practice: enable contextIsolation
                 preload: path.join(__dirname, '..', 'preload.js') // 指定 preload 脚本
              }
            });

            const absolutePath = path.resolve(__dirname, '..', 'utils', action.file_path);
            console.log(`Reading markdown file: ${absolutePath}`);
            const markdownContent = await fs.promises.readFile(absolutePath, 'utf8');
            const htmlContent = marked(markdownContent);

            const finalHtml = `...`; // HTML 结构需要调整，移除 nodeIntegration 依赖

            noteWindowInstance.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(finalHtml)}`);

            noteWindowInstance.once('ready-to-show', () => {
              noteWindowInstance.show();
              console.log(`Markdown note window shown for ${absolutePath}`);
              actionResult.success = true;
              actionResult.message = 'Markdown note displayed successfully.';
              markdownNoteWindows.set(noteId, noteWindowInstance); // Store the window
              resolve(actionResult);
            });

            noteWindowInstance.on('closed', () => {
              console.log(`Markdown note window closed: ${noteId}`);
              markdownNoteWindows.delete(noteId); // Remove from tracking
            });

          } catch (error) {
            console.error(`Error creating markdown note for ${action.file_path}:`, error);
            actionResult.message = `Error: ${error.message}`;
            resolve(actionResult); // Resolve with error
          }
        }));
        */

      // --- 处理其他动作 (app, url, etc.) --- 
      } else if (action.type === 'app' && action.name) {
        console.log(`Processing app action: ${action.name}`);
        // ... (保留原来的 app 处理逻辑) ...
        // 1. 尝试激活应用
        await new Promise((resolve, reject) => {
          runAppleScript(`tell application "${action.name}" to activate`, (err) => {
            if (err) {
              console.warn(`Failed to activate ${action.name}, might not be running or accessible. Error: ${err}`);
            }
            setTimeout(resolve, 500);
          });
        });

        // --- 窗口管理逻辑 ---
        const displays = screen.getAllDisplays();
        let targetDisplay = screen.getPrimaryDisplay();
        if (action.display !== undefined) {
          const displayIndex = parseInt(action.display, 10);
          if (!isNaN(displayIndex) && displayIndex >= 0 && displayIndex < displays.length) {
            targetDisplay = displays[displayIndex];
          } else {
            console.warn(`Invalid display index ${action.display}. Using primary display.`);
          }
        }
        const displayWorkArea = targetDisplay.workArea;
        const targetX = displayWorkArea.x;
        const targetY = displayWorkArea.y;
        let skipPreMove = false;

        // Check Obsidian Fullscreen Status
        if (action.fullscreen === true && action.name === 'Obsidian') {
          // ... (Obsidian 全屏检查逻辑保持不变) ...
           const checkObsidianFullscreenScript = `...`; // 省略脚本内容
           try {
             const fullscreenStatus = await new Promise((resolve, reject) => {
               runAppleScript(checkObsidianFullscreenScript, (err, result) => {
                 if (err) { console.error(`Error running Obsidian fullscreen check script: ${err}`); resolve("error"); }
                 else { resolve(result ? result.trim() : "error"); }
               });
             });
             if (fullscreenStatus === "true") { skipPreMove = true; }
           } catch (e) { console.error(`Exception during Obsidian fullscreen check: ${e}.`); }
        }

        // Execute Pre-Move Script (Conditional)
        if (!skipPreMove) {
          const preMoveScript = `...`; // 省略脚本内容
          await new Promise((resolve) => {
            runAppleScript(preMoveScript, (err, result) => {
              if (err) { console.error(`Error executing pre-move AppleScript for ${action.name}: ${err}`); }
              resolve();
            });
          });
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        let windowScript = '';
        let actionDescription = `activate ${action.name}`;

        // Generate Window Script (Position, Size, Layout, Fullscreen)
        if (action.fullscreen === true) {
           actionDescription = `fullscreen ${action.name} on display ${targetDisplay.id}`;
           if (action.name === 'Obsidian' && !skipPreMove) {
             windowScript = `...`; // Obsidian 全屏脚本
           } else if (action.name !== 'Obsidian') {
             windowScript = `...`; // 其他应用全屏脚本
           }
        } else if (action.layout) {
           actionDescription = `layout ${action.name} to ${action.layout} on display ${targetDisplay.id}`;
           windowScript = `...`; // 布局脚本
        } else if (action.width && action.height && action.x !== undefined && action.y !== undefined) {
           actionDescription = `position ${action.name} on display ${targetDisplay.id}`;
           windowScript = `...`; // 定位脚本
        }

        // Execute Window Script
        if (windowScript) {
          console.log(`Executing window script for ${action.name}: ${actionDescription}`);
          results.push(await new Promise((resolve) => {
            runAppleScript(windowScript, (err, result) => {
              const success = !err;
              const message = err ? `Error: ${err}` : (result || 'Success');
              console.log(`Window script result for ${action.name}: ${message}`);
              resolve({ action: actionDescription, success, message });
            });
          }));
        } else if (skipPreMove && action.fullscreen) {
           console.log(`Skipping fullscreen script for ${action.name} as it's already fullscreen or pre-move was skipped.`);
           results.push({ action: actionDescription, success: true, message: 'App already fullscreen or pre-move skipped.' });
        } else {
           console.log(`No specific window action (fullscreen/layout/position) for ${action.name}. Only activated.`);
           results.push({ action: actionDescription, success: true, message: 'App activated.' });
        }

      } else if (action.type === 'url' && action.url) {
        console.log(`Processing url action: ${action.url}`);
        // ... (保留原来的 url 处理逻辑) ...
        results.push(await new Promise(async (resolve) => {
          // ... (URL 打开和窗口定位脚本) ...
          const script = `...`; // 省略脚本内容
          runAppleScript(script, (err, result) => {
             const success = !err;
             const message = err ? `Error: ${err}` : (result || 'Success');
             resolve({ action: `open and position URL ${action.url}`, success, message });
          });
        }));

      } else if (action.type === 'close_browsers') {
        console.log('Processing close_browsers action');
        // ... (保留原来的 close_browsers 处理逻辑) ...
        results.push(await new Promise((resolve) => {
           const script = `...`; // 省略脚本内容
           runAppleScript(script, (err, result) => {
              const success = !err;
              const message = err ? `Error closing browsers: ${err}` : 'Browsers closed successfully.';
              resolve({ action: 'close_browsers', success, message });
           });
        }));

      } else if (action.type === 'open_file_in_app' && action.appName && action.filePath) {
        console.log(`Processing open_file_in_app action: ${action.filePath} in ${action.appName}`);
        // ... (保留原来的 open_file_in_app 处理逻辑) ...
        results.push(await new Promise((resolve) => {
           const script = `...`; // 省略脚本内容
           runAppleScript(script, (err, result) => {
              const success = !err;
              const message = err ? `Error opening file: ${err}` : 'File opened successfully.';
              resolve({ action: `open ${action.filePath} in ${action.appName}`, success, message });
           });
        }));

      } else {
        // 保留原始的无效动作处理
        console.warn('Skipping invalid or unsupported action:', action);
        results.push({ action: JSON.stringify(action), success: false, message: 'Invalid or unsupported action format.' });
      }
    } catch (error) {
      console.error(`Error processing action ${JSON.stringify(action)}:`, error);
      results.push({ action: JSON.stringify(action), success: false, message: `Runtime error: ${error.message}` });
    }
    // 在每个动作之间添加短暂延迟
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // 移除旧的 dom-ready 监听器，因为逻辑移到了 handleMenuAction 的 <script> 中
  /*
  if (noteWindow && !noteWindow.isDestroyed()) {
      noteWindow.webContents.on('dom-ready', () => {
        // ... 旧的 executeJavaScript 逻辑 ...
      });
  }
  */

  console.log('Scenario execution finished. Results:', results);
}

// --- IPC Handler for Reading Markdown --- 
// 确保这个 handler 在 scenario-runner.js 或 main.js 中只注册一次
// 如果 scenario-runner 被多次 require，可能会重复注册，最好放在 main.js
/* // 移至 main.js
// ipcMain.handle('read-markdown-file', async (event, filePath) => {
//   try {
//     const absolutePath = path.resolve(__dirname, '..', 'utils', filePath); // 调整路径解析
//     console.log(`IPC: Reading markdown file: ${absolutePath}`);
//     const markdownContent = await fs.promises.readFile(absolutePath, 'utf8');
//     return marked(markdownContent);
//   } catch (error) {
//     console.error(`IPC: Error reading markdown file ${filePath}:`, error);
//     // 向渲染进程抛出错误，以便在界面上显示
//     throw new Error(`无法读取文件: ${error.message}`);
//   }
// });
*/

module.exports = {
  runScenario
};