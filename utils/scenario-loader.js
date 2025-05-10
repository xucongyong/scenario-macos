// utils/scenario-loader.js
const path = require('path');
const fs = require('fs');

/**
 * Loads scenarios from scenarios.json, supporting both old and new formats.
 * @param {string} scenariosFilePath - Absolute path to the scenarios.json file.
 * @returns {{ scenarioList: Array<object>, scenarios: object }} - An object containing the list of scenarios (new format) and the scenarios object (old format).
 */
function loadScenarios(scenariosFilePath) {
  let scenarioList = [];
  let scenarios = {};

  try {
    if (fs.existsSync(scenariosFilePath)) {
      const fileContent = fs.readFileSync(scenariosFilePath, 'utf-8');
      const parsedJson = JSON.parse(fileContent);
      if (parsedJson && Array.isArray(parsedJson.scenarios)) {
        scenarioList = parsedJson.scenarios;
        // Populate old format for compatibility
        scenarioList.forEach(scenario => {
          if (scenario.name && Array.isArray(scenario.actions)) {
            scenarios[scenario.name] = scenario.actions;
          }
        });
      } else if (typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
        // Assume old format { "Scenario Name": [...] }
        scenarios = parsedJson;
        // Populate new format list from old format
        scenarioList = Object.entries(scenarios).map(([name, actions]) => ({ name, actions }));
        console.log(`Loaded ${scenarioList.length} scenarios from old format.`);
      } else {
        console.warn('scenarios.json has unrecognized format.');
      }
    } else {
      console.warn('scenarios.json not found, using default demo scenarios.');
      // Default scenarios
      scenarios = {
        "Demo Scene 1": [
          { "type": "app", "name": "TextEdit", "position": [50, 50], "size": [400, 300] },
          { "type": "url", "url": "https://www.google.com" }
        ],
        "Demo Scene 2": [
          { "type": "app", "name": "Calculator", "position": [500, 50], "size": [250, 400] }
        ]
      };
      scenarioList = Object.entries(scenarios).map(([name, actions]) => ({ name, actions }));
      // Optionally write default back to file in new format
      // fs.writeFileSync(scenariosFilePath, JSON.stringify({ scenarios: scenarioList }, null, 2));
    }
  } catch (error) {
    console.error('Failed to load or parse scenarios.json:', error);
    scenarios = {}; // Reset on error
    scenarioList = [];
  }

  return { scenarioList, scenarios };
}

module.exports = { loadScenarios };