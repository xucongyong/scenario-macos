import electron from "electron";
import path from "path";
import fs from "fs";
import { marked } from "marked";
import { loadScenarios as loadScenariosFromFile } from "./utils/scenario-loader.js";
import { createTray as createTrayInstance } from "./utils/tray-manager.js";
import { runScenario } from "./utils/scenario-runner.js";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const { app, ipcMain, nativeImage, globalShortcut, BrowserWindow } = electron; // Import screen module, nativeImage for icon handling

// 1. 导入秒表管理器 (注意 .js 后缀)
import stopwatchManager from './stopwatch/manager.js';
import { handleUniversalAction } from './utils/action-handlers.js';
let tray = null;
let scenarioList = []; // 新格式，存储场景对象列表
const PROTOCOL = 'myapp-scenario'; // 定义你的 scheme
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    }
    else {
        app.setAsDefaultProtocolClient(PROTOCOL);
    }
}
else {
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
}
else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
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
    }
    else {
        console.error('Invalid URL command path:', commandPath);
    }
}
// Function to ensure scenarios.json exists in userData and load it
function loadScenarios() {
    const userDataPath = app.getPath('home');
    const scenariosFileName = 'scenarios.json';
    const userScenarioDir = path.join(userDataPath, 'mathematics', 'xucongyong.com', 'markdown');
    const userScenariosPath = path.join(userScenarioDir, scenariosFileName);
    const appScenariosPath = path.join(__dirname, scenariosFileName);
    // Check if scenarios.json exists in userData path
    if (!fs.existsSync(userScenariosPath)) {
        try {
            // If not, copy it from the app directory
            // Ensure the target directory for userScenariosPath exists
            fs.mkdirSync(userScenarioDir, { recursive: true });
            fs.copyFileSync(appScenariosPath, userScenariosPath);
        }
        catch (err) {
            console.error(`Error copying ${scenariosFileName} to userData:`, err);
            // Fallback to app directory if copy fails
            return loadScenariosFromFile(appScenariosPath);
        }
    }
    console.log(`Loading ${scenariosFileName} from ${userScenariosPath}`);
    return loadScenariosFromFile(userScenariosPath);
}
// --- 应用准备就绪 --- 
app.whenReady().then(() => {
    // Load scenarios first using the new function
    const loadedData = loadScenarios();
    scenarioList = loadedData.scenarioList;
    tray = createTrayInstance(scenarioList, (scenarioName) => runScenario(scenarioName, scenarioList), () => stopwatchManager.openWidget());

    // ✨【核心添加】初始化秒表，把 tray 传给它
    stopwatchManager.initialize(tray);


    globalShortcut.register('Shift+Command+x', () => {
        ipcMain.emit(`toggle-always-on-top`);
    });



    // Set and hide the Dock icon on macOS
    if (process.platform === 'darwin') {
        const appIconPath = path.join(__dirname, 'assets', 'x-logo.jpeg');
        if (fs.existsSync(appIconPath)) {
            try {
                const image = nativeImage.createFromPath(appIconPath);
                app.dock.setIcon(image);
                console.log('Application dock icon set successfully.');
            }
            catch (error) {
                console.error(`Error setting application dock icon from ${appIconPath}:`, error);
            }
        }
        else {
            console.error(`Application dock icon file not found at: ${appIconPath}`);
        }
        app.dock.hide();
    }
});
app.on('window-all-closed', function () {
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
        // Reload scenarios before recreating tray using the new function
        const loadedData = loadScenarios();
        scenarioList = loadedData.scenarioList;
        var scenarios = loadedData.scenarios;
        tray = createTrayInstance(scenarioList, (scenarioName) => runScenario(scenarioName, scenarioList), () => stopwatchManager.openWidget());
    }
    else if (!hasVisibleWindows && tray) {
        // 如果没有可见窗口但托盘图标存在，则不执行任何操作
    }
});
// --- Universal IPC Handler ---
ipcMain.handle('universal-action', async (event, arg) => {
    const { actionType, payload } = arg;
    console.log(`[IPC MAIN] Received action: ${actionType}`, payload);
    try {
        // Pass necessary context (like scenarioList and stopwatchManager)
        const context = { scenarioList, stopwatchManager };
        const result = await handleUniversalAction(actionType, payload, context);
        return result;
    } catch (error) {
        console.error(`Universal Action Error [${actionType}]:`, error);
        throw error; // Propagate error to renderer
    }
});
