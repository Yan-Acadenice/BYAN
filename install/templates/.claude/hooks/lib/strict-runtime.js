// Shared runtime helpers for the BYAN Strict Mode hooks.
//
// Reads two files :
//   - .claude/hooks/lib/strict-config.json : generated from strict-mode.yaml
//     by byan-sync-rules (static config : thresholds, keywords, banners).
//   - .byan-strict/state.json : the live session state written by the
//     byan_strict_* MCP tools (lib/strict-mode.js).
//
// Hooks only READ here. The authoritative writes live in the MCP tools.

const fs = require('fs');
const path = require('path');

function projectRoot() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function loadConfig() {
  const p = path.join(projectRoot(), '.claude', 'hooks', 'lib', 'strict-config.json');
  return readJson(p);
}

function loadState() {
  const p = path.join(projectRoot(), '.byan-strict', 'state.json');
  return readJson(p);
}

// A strict session is "engaged" when it is active, has a locked scope, and
// has not been completed yet. This is the window where enforcement applies.
function isEngaged(state) {
  return Boolean(state && state.active && state.scope_lock && !state.completed);
}

function passCount(state) {
  return state && Array.isArray(state.self_verify_passes)
    ? state.self_verify_passes.length
    : 0;
}

function lastVerdict(state) {
  const passes = state && state.self_verify_passes;
  if (!Array.isArray(passes) || passes.length === 0) return null;
  return passes[passes.length - 1].verdict;
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

function parseJson(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

module.exports = {
  projectRoot,
  loadConfig,
  loadState,
  isEngaged,
  passCount,
  lastVerdict,
  readStdin,
  parseJson,
};
