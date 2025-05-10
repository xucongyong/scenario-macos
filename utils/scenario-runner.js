const { screen, BrowserWindow, ipcMain } = require('electron'); // 添加 ipcMain
const { runAppleScript } = require('./applescript');
const path = require('path');

// 保持对markdown笔记窗口的跟踪
const markdownNoteWindows = new Map();

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
      try {
          window.setSize(firstItemWidth, firstItemHeight);
      } catch (sizeError) {
          // 如果设置大小失败，也应该继续，但记录错误
      }
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
      actionResult.success = true;
    });

    // 处理窗口关闭
    window.on('closed', () => {
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


async function runScenario(scenarioName, scenarioList) {
  // Define default window dimensions and position
  const defaultWidth = 800;
  const defaultHeight = 600;

  // 从scenarioList中查找对应的场景对象
  const scenario = scenarioList.find(s => s.name === scenarioName);

  if (!scenario || !Array.isArray(scenario.actions)) {
    console.error(`Scenario '${scenarioName}' not found or invalid in scenarioList.`);
    return;
  }

  const actions = scenario.actions;
  let results = [];

  for (const action of actions) {
    try {
      // --- 处理 menu 动作 --- 
      if (action.type === 'menu' && Array.isArray(action.items)) {
        // 仅在需要显示菜单时创建窗口
        let noteWindow = markdownNoteWindows.get(scenarioName); // 尝试获取现有窗口
        if (!noteWindow || noteWindow.isDestroyed()) {
           const firstItemAction = action.items[0]?.actions?.find(a => a.type === 'show_markdown_note');
           const width = firstItemAction?.width || defaultWidth;
           const height = firstItemAction?.height || defaultHeight;

           // --- Calculate position based on display and top-right corner --- 
           const displays = screen.getAllDisplays();
           let targetDisplay = screen.getPrimaryDisplay(); // Default to primary
           const specifiedDisplayIndex = firstItemAction?.display;

           if (specifiedDisplayIndex !== undefined) {
             const displayIndex = parseInt(specifiedDisplayIndex, 10);
             if (!isNaN(displayIndex) && displayIndex >= 0 && displayIndex < displays.length) {
               targetDisplay = displays[displayIndex];
               console.log(`Markdown Note: Targeting display ${displayIndex} for top-right placement.`);
             } else {
               console.warn(`Markdown Note: Invalid display index ${specifiedDisplayIndex}. Using primary display.`);
             }
           }

           const displayWorkArea = targetDisplay.workArea;
           // Calculate top-right position within the target display's work area
           const x = displayWorkArea.x + displayWorkArea.width - width;
           const y = displayWorkArea.y; // Top edge of the work area
           console.log(`Markdown Note: Calculated top-right position: x=${x}, y=${y} on display ${targetDisplay.id}`);
           // --- End position calculation ---

           noteWindow = new BrowserWindow({
            width: width,    // Use determined width
            height: height,   // Use determined height
            x: x,           // Use calculated x for top-right
            y: y,           // Use calculated y for top-right
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

      // --- 处理 show_markdown_note 动作 (如果仍然需要独立支持) --- 
      } else if (action.type === 'show_markdown_note' && action.file_path) {

         results.push({ action: JSON.stringify(action), success: false, message: 'Direct show_markdown_note is currently handled via menu actions.' });

      // --- 处理其他动作 (app, url, etc.) --- 
      } else if (action.type === 'app' && action.name) {
        // 1. 尝试激活应用 (确保它在前台)
        await runAppleScript(`tell application ${action.name} to activate`);
  } else if (action.type === 'url' && action.url) {
      runAppleScript(`open location "${action.url}"`)
    } else if (action.type === 'close_browsers') {
        await runAppleScript(`tell application "Google Chrome" to quit`)
        await new Promise(resolve => setTimeout(resolve, 500)); 
      }else if (action.type === 'close_app' && action.name) {
        const closeScript = `tell application ${action.name} to quit `;
        runAppleScript(closeScript)
      } else {
        // 保留原始的无效动作处理
        results.push({ action: JSON.stringify(action), success: false, message: 'Invalid or unsupported action format.' });
      }
    } catch (error) {
      results.push({ action: JSON.stringify(action), success: false, message: `Runtime error: ${error.message}` });
    }
    // 在每个动作之间添加短暂延迟
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('Scenario execution finished. Results:', results);
}


module.exports = {
  runScenario
};