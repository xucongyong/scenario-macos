// utils/tray-manager.js
const { Tray, Menu, nativeImage, screen, dialog, app } = require('electron');
const path = require('path');
const fs = require('fs');

let tray = null;

/**
 * Creates the application tray icon and context menu.
 * @param {Array<object>} scenarioList - The list of loaded scenarios.
 * @param {function(string): void} runScenarioCallback - Callback function to execute a scenario.
 */
function createTray(scenarioList, runScenarioCallback) {
  if (tray) {
    console.log('Tray already exists. Destroying and recreating.');
    tray.destroy();
    tray = null;
  }

  // Construct the correct path to the icon file relative to the main script's directory (__dirname)
  // Note: __dirname in this context might be utils/, so we go up one level.
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  console.log(`Attempting to load tray icon from: ${iconPath}`);

  let trayIcon;
  if (!fs.existsSync(iconPath)) {
    console.error(`Icon file not found at: ${iconPath}. Using empty icon.`);
    trayIcon = nativeImage.createEmpty();
  } else {
    try {
      const image = nativeImage.createFromPath(iconPath);
      trayIcon = image.resize({ width: 16, height: 16 });
      console.log('Tray icon created successfully.');
    } catch (error) {
      console.error(`Error creating native image from path ${iconPath}:`, error);
      trayIcon = nativeImage.createEmpty(); // Fallback on error
    }
  }

  tray = new Tray(trayIcon);

  // Create menu template using the provided scenarioList
  const scenarioMenuItems = scenarioList.map(scenario => ({
    label: scenario.name,
    click: () => {
      console.log(`Tray Menu clicked: Running scenario ${scenario.name}`);
      if (runScenarioCallback) {
        runScenarioCallback(scenario.name);
      } else {
        console.error('runScenarioCallback is not defined in createTray');
      }
    }
  }));

  const contextMenuTemplate = [
    ...scenarioMenuItems,
    { type: 'separator' },
    {
      label: 'Check Display Info',
      click: () => {
        const displays = screen.getAllDisplays();
        let displayInfo = 'Connected Displays (Use Index for \'display\' property in scenarios.json):\n\n';
        displays.forEach((display, index) => {
          displayInfo += `  Index: ${index}\n`;
          displayInfo += `  Bounds: ${display.bounds.width}x${display.bounds.height} at (${display.bounds.x}, ${display.bounds.y})\n`;
          displayInfo += `  Work Area: ${display.workArea.width}x${display.workArea.height} at (${display.workArea.x}, ${display.workArea.y})\n`;
          displayInfo += `  Scale Factor: ${display.scaleFactor}\n`;
          displayInfo += `  Primary: ${display.primary ? 'Yes' : 'No'}\n\n`;
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

  console.log('Tray setup complete.');
  return tray; // Return the tray instance
}

module.exports = { createTray };