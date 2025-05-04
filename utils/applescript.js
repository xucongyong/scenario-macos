// utils/applescript.js
const { exec } = require('child_process');

/**
 * Executes an AppleScript command.
 * @param {string} script - The AppleScript code to execute.
 * @param {function(Error | null, string | null): void} [callback] - Optional callback function (error, stdout).
 */
function runAppleScript(script, callback) {
  // Ensure script's double quotes are escaped for the command line
  const escapedScript = script.replace(/"/g, '\\"');
  const command = `osascript -e "${escapedScript}"`;
  console.log('Executing AppleScript:', command);

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`AppleScript Error: ${error.message}`);
      console.error(`stderr: ${stderr}`);
      if (callback) callback(error, stderr);
      return;
    }
    if (stderr) {
      // Some AppleScript errors/warnings go to stderr but don't set the error object
      console.warn(`AppleScript stderr: ${stderr}`);
    }
    console.log(`AppleScript stdout: ${stdout}`);
    if (callback) callback(null, stdout);
  });
}

module.exports = { runAppleScript };