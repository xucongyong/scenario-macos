import { exec } from "child_process";
/**
 * Executes an AppleScript command.
 * @param {string} script - The AppleScript code to execute.
 * @param {function(Error | null, string | null): void} [callback] - Optional callback function (error, stdout).
 */
function runAppleScript(script, callback) {
    // Trim the script to check if it's empty or only whitespace
    const trimmedScript = script.trim();
    if (!trimmedScript) {
        console.warn('Skipping execution of empty AppleScript.');
        if (callback)
            callback(null, ''); // Call callback with no error and empty stdout
        return;
    }
    // Ensure script's double quotes are escaped for the command line
    const escapedScript = trimmedScript.replace(/"/g, '\\"'); // Correctly escape for shell
    const command = `osascript -e "${escapedScript}"`;
    console.log('Executing AppleScript:', command);
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`AppleScript Error: ${error.message}`);
            console.error(`stderr: ${stderr}`);
            if (callback)
                callback(error, stderr);
            return;
        }
        if (stderr) {
            // Some AppleScript errors/warnings go to stderr but don't set the error object
            console.warn(`AppleScript stderr: ${stderr}`);
        }
        console.log(`AppleScript stdout: ${stdout}`);
        if (callback)
            callback(null, stdout);
    });
}
/**
 * Escapes a string for safe embedding within an AppleScript string literal.
 * Handles backslashes and double quotes, which are common sources of syntax errors.
 * @param {string} str - The string to escape.
 * @returns {string} The escaped string.
 */
function escapeStringForAppleScript(str) {
    if (typeof str !== 'string') {
        console.warn('escapeStringForAppleScript received non-string input:', str);
        return ''; // Return empty string for non-string inputs to prevent further errors
    }
    // Escape backslashes (replace  with \\ for AppleScript)
    // Escape double quotes (replace " with \" for AppleScript)
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
export { runAppleScript };
export { escapeStringForAppleScript };
export default {
    runAppleScript,
    escapeStringForAppleScript
};
