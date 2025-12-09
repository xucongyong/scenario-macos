
import fs from "fs";
import path from "path";
import { app } from "electron";
import { marked } from "marked";
import { runScenario } from "./scenario-runner.js";
import stopwatchManager from "../stopwatch/manager.js";

// Global state reference (passed from main.js if needed, or we can require scenarioList here if we fix the circular dependency)
// For now, we will pass necessary state (like scenarioList) as context arguments.

export async function handleUniversalAction(actionType, payload, context) {
    console.log(`Universal Action: ${actionType}`, payload);

    switch (actionType) {
        // --- Markdown Note Actions ---
        case 'read_markdown': {
            const filePath = payload.filePath;
            const absolutePath = path.resolve(app.getAppPath(), filePath);
            console.log(`Action: Reading markdown file: ${absolutePath}`);
            const markdownContent = await fs.promises.readFile(absolutePath, 'utf8');
            return marked(markdownContent);
        }

        case 'get_raw_markdown': {
            const filePath = payload.filePath;
            const absolutePath = path.resolve(app.getAppPath(), filePath);
            console.log(`Action: Reading raw markdown file: ${absolutePath}`);
            return await fs.promises.readFile(absolutePath, 'utf8');
        }

        case 'save_markdown': {
            const { filePath, content } = payload;
            const absolutePath = path.resolve(app.getAppPath(), filePath);
            console.log(`Action: Saving markdown file: ${absolutePath}`);
            await fs.promises.writeFile(absolutePath, content, 'utf8');
            return { success: true, message: 'File saved successfully.' };
        }

        // --- Scenario Runner ---
        case 'run_scenario': {
            const { scenarioName } = payload;
            const { scenarioList } = context; // passed from main.js
            if (!scenarioList) throw new Error("Scenario list unavailable");

            // runScenario needs to be awaited if it returns a promise, check runScenario signature
            // It seems runScenario is async (Step 29)
            await runScenario(scenarioName, scenarioList);
            return { success: true, message: `Stored scenario '${scenarioName}' executed.` };
        }

        // --- Stopwatch Actions ---
        case 'stopwatch_toggle': {
            const manager = context.stopwatchManager || stopwatchManager;
            return manager.toggle();
        }

        case 'stopwatch_reset': {
            const manager = context.stopwatchManager || stopwatchManager;
            return manager.reset();
        }

        case 'stopwatch_open_widget': {
            const manager = context.stopwatchManager || stopwatchManager;
            manager.openWidget();
            return { success: true };
        }

        // --- Flow Logger Action ---
        // --- Flow Logger Action ---
        case 'finish_flow_session': {
            const manager = context.stopwatchManager || stopwatchManager;
            const sessionData = manager.stopAndGetDuration();

            // Check if it was a valid session (duration > 0)
            if (sessionData.duration === 0) {
                return { success: false, message: 'Timer was 0, nothing logged.' };
            }

            const { duration, startTime, endTime } = sessionData;

            // Format Duration
            const minutes = Math.floor(duration / 60);
            const seconds = duration % 60;
            const durationStr = `${minutes}m ${seconds}s`;

            // Format Dates
            const formatDate = (date) => {
                if (!date) return '';
                // Use local time string, consistent format
                // e.g., 2023/12/9 19:45:00
                return date.toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
            };

            const startTimeStr = formatDate(startTime);
            const endTimeStr = formatDate(endTime);

            // Define Log Path
            const homeDir = app.getPath('home');
            const logPath = path.join(homeDir, 'mathematics', 'xucongyong.com', 'markdown', 'flow_log.csv');

            // Prepare CSV Content
            // Columns: Start Time, End Time, Duration (s), Formatted Duration
            const csvRow = `${startTimeStr},${endTimeStr},${duration},${durationStr}\n`;

            try {
                // Check if file exists to add header
                let fileExists = false;
                try {
                    await fs.promises.access(logPath);
                    fileExists = true;
                } catch (e) {
                    fileExists = false;
                }

                if (!fileExists) {
                    const header = "Start Time,End Time,Duration (s),Formatted Duration\n";
                    await fs.promises.writeFile(logPath, header + csvRow, 'utf8');
                } else {
                    await fs.promises.appendFile(logPath, csvRow, 'utf8');
                }

                console.log(`Logged csv session to ${logPath}`);
                return { success: true, formattedDuration: durationStr, message: `Logged: ${durationStr}` };
            } catch (err) {
                console.error(`Error logging flow session:`, err);
                throw new Error(`Failed to write log: ${err.message}`);
            }
        }

        default:
            throw new Error(`Unknown action type: ${actionType}`);
    }
}
