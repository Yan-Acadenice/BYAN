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

// Flatten an assistant message content (string or block array) to plain text.
function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c) => (c && typeof c.text === 'string' ? c.text : '')).join(' ');
  }
  return '';
}

// Walk a transcript JSONL file (the real Claude Code shape: one JSON object per
// line, an assistant turn is {type:'assistant', message:{role, content:[...]}})
// from the end and return the last assistant message's RAW content (block array
// or string), or null. Best-effort: an unreadable/short file yields null so the
// hook stays non-blocking rather than trapping a turn it cannot read.
function lastAssistantContentFromTranscriptFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const raw = lines[i];
      if (!raw || !raw.trim()) continue;
      let o;
      try {
        o = JSON.parse(raw);
      } catch {
        continue;
      }
      const m = o && o.message;
      const isAssistant = (o && o.type === 'assistant') || (m && m.role === 'assistant');
      if (isAssistant && m && m.content != null) return m.content;
    }
  } catch {
    // ignore — treat an unreadable transcript as no content
  }
  return null;
}

// Return the RAW content (string or block array) of the finished assistant turn,
// so artifact detection can inspect the tool_use blocks that the text view drops.
//
// The real Stop-hook payload does NOT carry the transcript inline: it hands a
// `transcript_path` to a JSONL file (and a `last_assistant_message` string).
// Resolution order: an inline array (test fixtures / legacy) first, then the
// transcript_path file. last_assistant_message is text-only, so it cannot feed
// artifact detection and is handled in extractLastAssistantText, not here.
function extractLastAssistantContent(payload) {
  if (!payload || typeof payload !== 'object') return null;

  // 1. Inline array — used by the unit/e2e fixtures and any legacy caller.
  const inline = payload.transcript || payload.messages;
  if (Array.isArray(inline)) {
    for (let i = inline.length - 1; i >= 0; i--) {
      const m = inline[i];
      if (m && m.role === 'assistant') return m.content;
    }
  }

  // 2. Production — read the JSONL transcript the runtime points us at.
  const tp = payload.transcript_path || payload.transcriptPath;
  if (typeof tp === 'string') {
    const content = lastAssistantContentFromTranscriptFile(tp);
    if (content != null) return content;
  }

  return null;
}

// Return the finished assistant turn as plain text (the choice-language signal).
// Prefer the runtime-provided last_assistant_message; else derive it from the
// content (inline array or transcript_path JSONL). Empty string when nothing is
// readable, so the hook degrades to "no fork" rather than throwing.
function extractLastAssistantText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.last_assistant_message === 'string') return payload.last_assistant_message;
  if (typeof payload.lastAssistantMessage === 'string') return payload.lastAssistantMessage;
  return contentToText(extractLastAssistantContent(payload));
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
  lastAssistantContentFromTranscriptFile,
  contentToText,
  hasChoiceArtifact,
  turnHash,
  readStdin,
  parseJson,
};
