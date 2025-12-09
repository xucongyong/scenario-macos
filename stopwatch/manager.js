import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM 模式下手动构建 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class StopwatchManager {
  constructor() {
    this.interval = null;
    this.seconds = 0;
    this.isRunning = false;
    this.window = null; // 悬浮窗实例
    this.tray = null;   // 引用主进程的 Tray
    this.startTime = null; // 记录开始时间
  }

  // 初始化：传入 Tray 实例
  initialize(trayInstance) {
    this.tray = trayInstance;
    // this.registerIpcHandlers(); // Removed in favor of Universal IPC
  }

  // 格式化时间 MM:SS
  formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // 更新 UI (Tray 和 悬浮窗)
  updateUI() {
    const timeStr = this.formatTime(this.seconds);

    // 1. 更新 macOS 菜单栏 Tray (低调的成就感)
    if (this.tray && !this.tray.isDestroyed()) {
      this.tray.setTitle(timeStr);
    }

    // 2. 更新悬浮窗 (如果打开的话)
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('stopwatch-update', {
        time: timeStr,
        isRunning: this.isRunning
      });
    }
  }

  // --- Public Methods for Universal Handler ---

  toggle() {
    console.log('StopwatchManager: Toggle called. Current state:', this.isRunning);
    if (this.isRunning) {
      clearInterval(this.interval);
      this.isRunning = false;
    } else {
      // 如果是第一次启动（或重置后第一次），记录开始时间
      if (!this.startTime) {
        this.startTime = new Date();
      }
      this.isRunning = true;
      this.interval = setInterval(() => {
        this.seconds++;
        this.updateUI();
      }, 1000);
    }
    this.updateUI(); // Immediate update
    return { isRunning: this.isRunning };
  }

  // Stop and return the session details, then reset
  stopAndGetDuration() {
    clearInterval(this.interval);
    const duration = this.seconds;
    const sessionData = {
      duration: duration,
      startTime: this.startTime || new Date(), // 如果还没开始就点了finish，兜底
      endTime: new Date()
    };

    // Reset state
    this.seconds = 0;
    this.isRunning = false;
    this.startTime = null;

    this.updateUI();
    if (this.tray && !this.tray.isDestroyed()) {
      this.tray.setTitle('');
    }
    return sessionData;
  }

  reset() {
    clearInterval(this.interval);
    this.seconds = 0;
    this.isRunning = false;
    this.startTime = null; // Clear start time
    this.updateUI();
    // Reset tray text
    if (this.tray && !this.tray.isDestroyed()) {
      this.tray.setTitle('');
    }
    return { isRunning: this.isRunning };
  }

  openWidget() {
    this.createWidgetWindow();
  }

  // 创建悬浮窗口
  createWidgetWindow() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.focus();
      return;
    }

    const preloadPath = path.resolve(__dirname, '../preload.js');
    console.log('[StopwatchManager] Preload Path Resolved:', preloadPath);

    this.window = new BrowserWindow({
      width: 200,
      height: 90,
      type: 'toolbar',    // macOS 风格
      frame: false,       // 无边框
      transparent: true,  // 透明背景
      alwaysOnTop: true,  // 置顶
      resizable: false,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false
      }
    });

    this.window.loadFile(path.join(__dirname, 'widget.html'));

    // 加载完成后同步当前状态
    this.window.webContents.on('did-finish-load', () => {
      this.updateUI();
    });
  }
  closeWidget() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
      this.window = null;
    }
  }
}

// 导出单例
export default new StopwatchManager();