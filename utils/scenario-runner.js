import electron from "electron";
import { runAppleScript } from "./applescript.js";
import path from "path";
const { screen, BrowserWindow, ipcMain } = electron; // 添加 ipcMain
// 保持对markdown笔记窗口的跟踪
const markdownNoteWindows = new Map();
import { createTray as createTrayInstance } from "./tray-manager.js"; // Not used but good to have if needed
import stopwatchManager from "../stopwatch/manager.js"; // Import manager
async function handleMenuAction(menuItems, window, scenarioName) {
  const defaultWidth = 950; // Define default width locally
  const defaultHeight = 750; // Define default height locally
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
                firstItemWidth = (mdAction.width || defaultWidth) * 2;
                firstItemHeight = mdAction.height || defaultHeight;
                isFirstSubmenuItem = false; // 只记录一次
              }
            }
          }
        }
        navigationHtml += `</div>`; // end nav-level-2
        navigationHtml += `</div>`; // end submenu-container
      }
      else {
        console.warn('Skipping invalid top-level item structure in handleMenuAction:', topLevelItem);
      }
    }
    navigationHtml += '</div>'; // end nav-level-1
    navigationHtml += '</div>'; // end navigation (保持原样，包裹整个导航区)
    // --- 加载初始内容 --- 
    if (firstItemPath) {
      try {
        window.setSize(firstItemWidth, firstItemHeight);
      }
      catch (sizeError) {
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
        <style>
          body { font-family: sans-serif; margin: 0; display: flex; flex-direction: column; height: 100vh; }
          .top-bar { display: flex; justify-content: space-between; align-items: center; padding: 5px; background-color: #f0f0f0; border-bottom: 1px solid #ccc; }
          .mode-controls button { margin-left: 5px; }
          .main-container { display: flex; flex-grow: 1; overflow: hidden; }
          .navigation { width: 200px; /* Initial width */ border-right: 1px solid #ccc; padding: 10px; overflow-y: auto; position: relative; /* For resizer */ }
          .nav-level-1 .submenu-title { font-weight: bold; margin-top: 10px; }
          .nav-level-2 .nav-button { display: block; width: 100%; text-align: left; margin-bottom: 5px; padding: 5px; border: 1px solid transparent; background-color: #fff; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; /* Prevent text overflow */ }
          .nav-level-2 .nav-button.active { border-color: #007bff; background-color: #e7f3ff; }
          .content-area { flex-grow: 1; padding: 10px; overflow-y: auto; display: flex; flex-direction: column;}
          #markdown-view { flex-grow: 1; }
          #markdown-editor-container { display: none; flex-grow: 1; flex-direction: column; }
          #markdown-textarea { flex-grow: 1; width: 100%; box-sizing: border-box; font-family: monospace; font-size: 14px; padding: 8px; border: 1px solid #ccc; resize: none; }
          .close-button { text-decoration: none; color: #333; font-size: 20px; padding: 0 5px; }
          .resizer { width: 5px; background: #ccc; cursor: col-resize; position: absolute; top: 0; right: -2px; /* Position slightly over the border */ bottom: 0; z-index: 100; }
        </style>
      </head>
      <body>
        <div class="top-bar">
          <div class="mode-controls">
            <button id="view-mode-btn" class="active">查看模式</button>
            <button id="edit-mode-btn">编辑模式</button>
            <button id="save-btn" style="display:none;">保存</button>
          </div>
          <a href="#" class="close-button" title="Close" onclick="window.close(); return false;">×</a>
        </div>
        <div class="main-container">
          ${navigationHtml}
          <div class="resizer" id="resizer"></div>
          <div class="content-area">
            <div id="markdown-view">
              ${initialContentHtml}
            </div>
            <div id="markdown-editor-container">
              <textarea id="markdown-textarea"></textarea>
            </div>
          </div>
        </div>
        
        <script>
          let currentFilePath = null;
          let rawMarkdownContent = '';
          const viewDiv = document.getElementById('markdown-view');
          const editorContainer = document.getElementById('markdown-editor-container');
          const textarea = document.getElementById('markdown-textarea');
          const viewModeBtn = document.getElementById('view-mode-btn');
          const editModeBtn = document.getElementById('edit-mode-btn');
          const saveBtn = document.getElementById('save-btn');

          // 函数：加载 Markdown 内容
          async function loadMarkdown(filePath) {
            currentFilePath = filePath;
            viewDiv.innerHTML = '<p>加载中...</p>';
            textarea.value = ''; // Clear textarea
            const navButtons = document.querySelectorAll('.nav-button');
            navButtons.forEach(btn => btn.classList.remove('active'));
            const currentNavButton = document.querySelector(\`.nav-button[data-filepath="\${filePath}"]\`);
            if (currentNavButton) currentNavButton.classList.add('active');

            try {
              // Request main process to read and render the file via preload script
              // We'll need two calls: one for HTML, one for raw markdown
              const htmlContent = await window.electronAPI.action('read_markdown', { filePath });
              viewDiv.innerHTML = htmlContent;
              
              // TODO: Replace with actual IPC call for raw markdown
              // For now, let's assume 'read-markdown-file' could be adapted or a new one created
              // This is a placeholder, main process needs to provide raw content
              rawMarkdownContent = await window.electronAPI.action('get_raw_markdown', { filePath }); 
              textarea.value = rawMarkdownContent;

              switchToViewMode(); // Default to view mode after loading
            } catch (error) {
              console.error('Error loading markdown:', error);
              const errorMessage = \`无法加载文件 \${filePath}. \${error.message || ''}\`;
              viewDiv.innerHTML = \`<p style="color: red;">错误：\${errorMessage}</p>\`;
              textarea.value = \`# 错误\n\n\${errorMessage}\`;
            }
          }

          function switchToViewMode() {
            viewDiv.style.display = 'block';
            editorContainer.style.display = 'none';
            saveBtn.style.display = 'none';
            viewModeBtn.classList.add('active');
            editModeBtn.classList.remove('active');
          }

          function switchToEditMode() {
            viewDiv.style.display = 'none';
            editorContainer.style.display = 'flex'; // Use flex for textarea to grow
            saveBtn.style.display = 'inline-block';
            viewModeBtn.classList.remove('active');
            editModeBtn.classList.add('active');
            textarea.focus();
          }

          async function saveMarkdown() {
            if (!currentFilePath) {
              alert('没有文件被选中，无法保存。');
              return;
            }
            const newContent = textarea.value;
            try {
              // TODO: Implement actual IPC call to save the file
              console.log('Attempting to save:', currentFilePath, 'with content:', newContent);
              await window.electronAPI.action('save_markdown', { filePath: currentFilePath, content: newContent });
              rawMarkdownContent = newContent; // Update local raw content
              // Optionally, re-render the view
              const htmlContent = await window.electronAPI.action('read_markdown', { filePath: currentFilePath }); // This assumes save also updates the source for read-markdown-file
              viewDiv.innerHTML = htmlContent;
              alert('文件已保存！');
              switchToViewMode();
            } catch (error) {
              console.error('Error saving markdown:', error);
              alert(\`保存文件失败: \${error.message}\`);
            }
          }

          viewModeBtn.addEventListener('click', switchToViewMode);
          editModeBtn.addEventListener('click', switchToEditMode);
          saveBtn.addEventListener('click', saveMarkdown);

          // Add event listeners to navigation buttons
          document.querySelectorAll('.nav-button').forEach(button => {
            button.addEventListener('click', (event) => {
              const filePath = event.currentTarget.dataset.filepath;
              if (filePath) {
                loadMarkdown(filePath);
              }
            });
          });

          // Resizer logic
          const resizer = document.getElementById('resizer');
          const navigationPanel = document.querySelector('.navigation');
          let isResizing = false;

          if (resizer && navigationPanel) {
            resizer.addEventListener('mousedown', (e) => {
              isResizing = true;
              document.body.style.cursor = 'col-resize'; // Change cursor for the whole body
              document.body.style.userSelect = 'none'; // Prevent text selection during resize

              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', stopResize);
            });

            function handleMouseMove(e) {
              if (!isResizing) return;
              // Calculate new width, considering the main container's position
              const mainContainerRect = document.querySelector('.main-container').getBoundingClientRect();
              let newWidth = e.clientX - mainContainerRect.left;
              const minWidth = 100; // Minimum width for navigation
              const maxWidth = mainContainerRect.width - 100; // Ensure content area has at least 100px
              newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
              navigationPanel.style.width = \`\${newWidth}px\`;
            }

            function stopResize() {
              isResizing = false;
              document.body.style.cursor = '';
              document.body.style.userSelect = '';
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', stopResize);
            }
          } else {
            console.warn('Resizer or navigation panel not found.');
          }

          // Load initial content after DOM is ready
          document.addEventListener('DOMContentLoaded', () => {
             const firstLevel2Button = document.querySelector('.nav-button.level-2');
             if (firstLevel2Button) {
                const firstFilePath = firstLevel2Button.dataset.filepath;
                if(firstFilePath) {
                   loadMarkdown(firstFilePath);
                } else {
                   document.getElementById('markdown-view').innerHTML = '<p>无法找到初始文件路径。</p>';
                }
             } else {
                 document.getElementById('markdown-view').innerHTML = '<p>没有可导航的 Markdown 文件。</p>';
             }
          });
        </script>
      </body>
      </html>
    `;
    // 加载生成的 HTML
    window.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(finalHtml)}`);
    window.once('ready-to-show', () => {
      window.show(); // 默认显示窗口
      const toggleWindowState = () => {
        if (window.isVisible()) {
          window.hide();
        }
        else {
          window.show();
        }
      };
      ipcMain.on('toggle-always-on-top', toggleWindowState);
    });
    // 处理窗口关闭
    window.on('closed', () => {
      // 移除IPC监听器
      ipcMain.removeAllListeners('toggle-always-on-top');
    });
  }
  catch (error) {
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
            }
            else {
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
            alwaysOnTop: true, // Make the window always on top
            width: width, // Use determined width
            height: height, // Use determined height
            x: x, // Use calculated x for top-right
            y: y, // Use calculated y for top-right
            frame: false,
            show: false, // Initially hide the window
            focusable: true, // Ensure the window can be focused, useful for alwaysOnTop
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
      }
      else if (action.type === 'show_markdown_note' && action.file_path) {
        results.push({ action: JSON.stringify(action), success: false, message: 'Direct show_markdown_note is currently handled via menu actions.' });
        // --- 处理其他动作 (app, url, etc.) --- 
      }
      else if (action.type === 'app' && action.name) {
        // 1. 尝试激活应用 (确保它在前台)
        await runAppleScript(`tell application ${action.name} to activate`);
      }
      else if (action.type === 'url' && action.url) {
        runAppleScript(`open location "${action.url}"`);
      }
      else if (action.type === 'close_browsers') {
        await runAppleScript(`tell application "Google Chrome" to quit`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      else if (action.type === 'close_app' && action.name) {
        const closeScript = `tell application ${action.name} to quit `;
        runAppleScript(closeScript);
      }
      else if (action.type === 'open_stopwatch') {
        stopwatchManager.openWidget();
      }
      else {
        // 保留原始的无效动作处理
        results.push({ action: JSON.stringify(action), success: false, message: 'Invalid or unsupported action format.' });
      }
    }
    catch (error) {
      results.push({ action: JSON.stringify(action), success: false, message: `Runtime error: ${error.message}` });
    }
    // 在每个动作之间添加短暂延迟
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  console.log('Scenario execution finished. Results:', results);
}
export { runScenario };
export default {
  runScenario
};
