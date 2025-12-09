# codebase_overview.md

## 1. Project Overview
**Name**: scenario-X
**Purpose**: An Electron-based automation tool for macOS (and potentially other OSs) that allows users to define "Scenarios". A Scenario is a collection of actions—such as opening apps, arranging windows, opening URLs, or displaying markdown notes—that can be triggered via a system tray menu or custom URL protocol.

## 2. File Structure

### Core Files
- **`main.js`**: The entry point. Handles the app lifecycle, IPC (Inter-Process Communication), tray creation, and URL protocol handling (`myapp-scenario://`).
- **`preload.js`**: (Assumed standard) Preload script to securely expose Node.js APIs to the renderer process.
- **`renderer.js`**: (Assumed standard) Frontend logic for any windows created (e.g., the markdown viewer).
- **`scenarios.json`**: The configuration file defining the menus and actions.
- **`package.json`**: Dependencies and build scripts (`electron`, `electron-builder`).

### Key Directories
- **`utils/`**: Contains helper logic.
    - `scenario-loader.js`: Logic to read and parse `scenarios.json`.
    - `tray-manager.js`: Logic to build the system tray menu from the scenario list.
    - `scenario-runner.js`: Logic to execute the actions defined in a scenario.
- **`stopwatch/`**: Contains the stopwatch feature logic (`manager.js`).
- **`assets/`**: Images and icons (e.g., `x-logo.jpeg`).
- **`countdown/`**: (Likely) Logic for a countdown timer feature.

## 3. Data Structure (`scenarios.json`)
The application is data-driven. The `scenarios.json` file contains a root `scenarios` array.

### Scenario Object
```json
{
  "name": "Scenario Name",
  "actions": [ ... ]
}
```

### Action Types
- **`menu`**: Creates a submenu in the system tray.
- **`app`**: Opens an application.
    - `name`: Application name (e.g., "Trae").
    - `display`: Monitor ID.
    - `fullscreen`: Boolean.
    - `layout`: "left-half", "right-half", etc.
- **`url`**: Opens a URL in the default browser.
    - `url`: The link to open.
    - `display`: Monitor ID.
    - `layout`: Window positioning.
- **`close_browsers`**: specialised action to close browsers.
- **`show_markdown_note`**: Opens a window displaying a markdown file.
    - `file_path`: Absolute path to `.md` file.
    - `width`, `height`.

## 4. Key Workflows

### Startup (`main.js`)
1.  **`loadScenarios()`**: Checks `~/mathematics/xucongyong.com/markdown/scenarios.json`. If missing, copies from the app bundle.
2.  **`createTrayInstance()`**: Builds the tray menu based on the loaded scenarios.
3.  **`stopwatchManager.initialize()`**: Starts the stopwatch feature.
4.  **Protocol Registration**: Registers `myapp-scenario://` to allow external triggers.

### Execution
- **Via Tray**: deeply nested menus trigger `runScenario`.
- **Via URL**: `myapp-scenario://run/ScenarioName` triggers `handleUrl` -> `runScenario`.

## 5. How to Add New Features (Guide)
To add functionality, you typically touch three areas:

1.  **Define the Action (`scenarios.json`)**: Add a new `type` to your JSON schema (e.g., `"type": "run_script"`).
2.  **Handle the Action (`utils/scenario-runner.js`)**: Add a case handler for your new type.
    ```javascript
    // Example in scenario-runner.js
    if (action.type === 'run_script') {
        executeMyScript(action.path);
    }
    ```
3.  **Backend Logic (`main.js` or `utils/`)**: If it requires system access (Node.js APIs), write the logic here.
4.  **Frontend (`renderer.js`)**: If it needs a UI (like the markdown viewer), create a new BrowserWindow and listen for IPC messages.

## 6. Recommendations for Documentation
- **Keep it close to code**: The `scenarios.json` structure is the "API" for the user. Document the allowed fields clearly.
- **Use Examples**: Show "Before" and "After" JSON snippets.
- **Visuals**: Since this is a UI tool (Tray/Windows), screenshots of the menu structure help.
