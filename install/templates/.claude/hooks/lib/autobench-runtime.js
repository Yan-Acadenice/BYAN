// Shared runtime helpers for the BYAN Auto-Benchmark Stop hook.
//
// Reads one static file :
//   - .claude/hooks/lib/autobench-config.json : the runtime subset generated
//     from _byan/_config/autobench.yaml by byan-sync-rules (never_list regexes,
//     choice_language regexes, marker patterns, escape-hatch paths, banners,
//     ledger path).
//
// Owns the ephemeral session artifacts the Stop hook needs :
//   - .byan-autobench/off : session escape-hatch flag (touch to disable).
//   - .byan-autobench/blocked-<turnHash> : the block-once token, written when a
//     turn is blocked so the regenerated turn is never blocked a second time.
//   - _byan-output/benchmark-ledger.jsonl : the append-only fire/miss audit.
//
// This module is deliberately SEPARATE from strict-runtime.js : the two hook
// families have different state shapes and lifecycles, and coupling them would
// make a change to one risk the other.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

function configPath() {
  return path.join(projectRoot(), '.claude', 'hooks', 'lib', 'autobench-config.json');
}

function loadAutobenchConfig() {
  return readJson(configPath());
}

// Session-scoped flag file. Its mere presence disables blocking for the
// session. The cross-session opt-out lives in the config (escape_hatch.disabled)
// so it survives across sessions and is regenerated from the YAML.
function sessionFlagPath() {
  return path.join(projectRoot(), '.byan-autobench', 'off');
}

function escapeHatchActive(config) {
  // Session flag : touch .byan-autobench/off to disable for this session.
  try {
    if (fs.existsSync(sessionFlagPath())) return true;
  } catch {
    // ignore — fall through to the cross-session check
  }
  // Cross-session opt-out, carried in the generated config.
  const eh = config && config.escape_hatch;
  if (eh && eh.disabled === true) return true;
  return false;
}

// Arming. The Stop hook ships DISARMED (approach C) : it observes and ledgers
// but never blocks until explicitly armed, so day one is zero noise / latency.
// Two opt-IN paths, mirroring the escape-hatch's dual layer : a persistent
// config flag (enforcement.armed === true, carried from the YAML) OR a local
// flag file (.byan-autobench/armed, touch to arm this machine). Default : OFF.
function armFlagPath(config) {
  const rel =
    (config && config.enforcement && config.enforcement.arm_flag) ||
    path.join('.byan-autobench', 'armed');
  return path.isAbsolute(rel) ? rel : path.join(projectRoot(), rel);
}

function isArmed(config) {
  const en = config && config.enforcement;
  if (en && en.armed === true) return true;
  try {
    if (fs.existsSync(armFlagPath(config))) return true;
  } catch {
    // ignore — treat an unreadable flag as disarmed (fail safe: no block)
  }
  return false;
}

function blockDir() {
  return path.join(projectRoot(), '.byan-autobench');
}

function blockTokenPath(turnHash) {
  return path.join(blockDir(), `blocked-${turnHash}`);
}

function readBlockToken(turnHash) {
  try {
    return fs.existsSync(blockTokenPath(turnHash));
  } catch {
    return false;
  }
}

function writeBlockToken(turnHash) {
  try {
    fs.mkdirSync(blockDir(), { recursive: true });
    // Content is irrelevant — presence is the signal. We still stamp the hash so
    // a human inspecting .byan-autobench/ can tell which turn was blocked.
    fs.writeFileSync(blockTokenPath(turnHash), turnHash + '\n');
    return true;
  } catch {
    return false;
  }
}

function ledgerPath(config) {
  const rel =
    (config && config.ledger && config.ledger.path) ||
    path.join('_byan-output', 'benchmark-ledger.jsonl');
  return path.isAbsolute(rel) ? rel : path.join(projectRoot(), rel);
}

// Append ONE JSONL line. Best-effort : a failed append never traps the turn.
// The caller supplies any timestamp/session via the entry so this stays
// deterministic and unit-testable (no clock read here).
function appendLedger(entry, config) {
  try {
    const p = ledgerPath(config);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(entry) + '\n');
    return true;
  } catch {
    return false;
  }
}

function extractLastAssistantText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const tx = payload.transcript || payload.messages || [];
  if (!Array.isArray(tx)) return '';
  for (let i = tx.length - 1; i >= 0; i--) {
    const m = tx[i];
    if (m && m.role === 'assistant') {
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) {
        return m.content.map((c) => (c && c.text ? c.text : '')).join(' ');
      }
    }
  }
  return '';
}

// Return the RAW content of the last assistant message (string or block array),
// so artifact detection can inspect the tool_use blocks that
// extractLastAssistantText deliberately drops.
function extractLastAssistantContent(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const tx = payload.transcript || payload.messages || [];
  if (!Array.isArray(tx)) return null;
  for (let i = tx.length - 1; i >= 0; i--) {
    const m = tx[i];
    if (m && m.role === 'assistant') return m.content;
  }
  return null;
}

// ARTIFACT-primary fork signal : a real choice surfaced through the
// AskUserQuestion tool (the multiple-choice UI) is unambiguous, unlike prose
// that merely contains 'or' / 'option'. Keys on the structural tool_use block in
// the finished turn, NOT on choice-WORDS. The lexical regex stays a last-resort
// fallback for inline-prose forks that never call the tool. Post-hoc by
// construction (GH #28273) : the tool_use is read from the finished transcript.
function hasChoiceArtifact(content) {
  if (!Array.isArray(content)) return false;
  return content.some(
    (b) =>
      b &&
      b.type === 'tool_use' &&
      typeof b.name === 'string' &&
      /askuserquestion/i.test(b.name)
  );
}

// Content-only hash : NO clock, NO RNG. Block-once must be stable across the
// original turn and its regeneration would only differ if the text differs.
function turnHash(text) {
  return crypto.createHash('sha1').update(String(text || '')).digest('hex').slice(0, 16);
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
  configPath,
  loadAutobenchConfig,
  sessionFlagPath,
  escapeHatchActive,
  armFlagPath,
  isArmed,
  blockDir,
  blockTokenPath,
  readBlockToken,
  writeBlockToken,
  ledgerPath,
  appendLedger,
  extractLastAssistantText,
  extractLastAssistantContent,
  hasChoiceArtifact,
  turnHash,
  readStdin,
  parseJson,
};
