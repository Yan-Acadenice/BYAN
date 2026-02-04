/**
 * Platforms Index
 * 
 * Exports all platform modules.
 * 
 * @module platforms
 */

module.exports = {
  'copilot-cli': require('./copilot-cli'),
  'vscode': require('./vscode'),
  'claude': require('./claude-code'),
  'codex': require('./codex')
};
