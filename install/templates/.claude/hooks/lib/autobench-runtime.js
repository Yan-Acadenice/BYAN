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
// Arming is config-only : set enforcement.armed === true in
// _byan/_config/autobench.yaml and run byan-sync-rules to regenerate the
// config. There is NO loose flag file — a stray file on disk must not silently
// arm a machine (the incoherent state the integration audit found). Default : OFF.
function isArmed(config) {
  const en = config && config.enforcement;
  return !!(en && en.armed === true);
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

// Transcript extraction (text + raw content) is shared with the other Stop hooks
// through transcript-read.js — one canonical reader for the real Stop payload
// (last_assistant_message + transcript_path JSONL) instead of divergent per-hook
// copies. extractLastAssistantContent feeds hasChoiceArtifact below.
const {
  extractLastAssistantText,
  extractLastAssistantContent,
  lastAssistantContentFromTranscriptFile,
  contentToText,
} = require('./transcript-read');

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
  isArmed,
  blockDir,
  blockTokenPath,
  readBlockToken,
  writeBlockToken,
  ledgerPath,
  appendLedger,
  extractLastAssistantText,
  extractLastAssistantContent,
  lastAssistantContentFromTranscriptFile,
  contentToText,
  hasChoiceArtifact,
  turnHash,
  readStdin,
  parseJson,
};
