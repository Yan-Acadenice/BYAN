const fs = require('fs');
const path = require('path');

const DEFAULT_LOG = path.join('_byan-output', '.tool-failures.jsonl');
const MAX_LOG_ENTRIES = 200;

const ERROR_PATTERNS = [
  /tool result missing/i,
  /internal error/i,
  /tool_use_error/i,
];

// Tools whose response echoes user-authored or file content (Write/Edit
// return file paths + content fragments, Read echoes file content
// verbatim). Pattern match on their response fires false positives when
// the file content itself contains the literal phrase "internal error"
// (e.g. a doc about errors, a test fixture, a hook that detects errors).
// For these, only trust the explicit is_error flag.
const ECHO_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit', 'Read']);

function detectFailure(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const resp = payload.tool_response ?? payload.toolResponse ?? payload.response;
  const toolName = payload.tool_name || payload.toolName || '';

  if (resp && typeof resp === 'object') {
    if (resp.is_error === true || resp.isError === true) {
      return { kind: 'is_error', detail: textOf(resp) };
    }
  }

  // Do not pattern-match on echo-heavy tools — only trust is_error flag.
  if (ECHO_TOOLS.has(toolName)) {
    return null;
  }

  const combined = [
    JSON.stringify(resp ?? ''),
    JSON.stringify(payload.error ?? ''),
  ].join('\n');

  for (const re of ERROR_PATTERNS) {
    const m = combined.match(re);
    if (m) return { kind: 'pattern', detail: m[0] };
  }

  return null;
}

function textOf(resp) {
  if (typeof resp === 'string') return resp;
  if (resp?.content) {
    if (typeof resp.content === 'string') return resp.content;
    if (Array.isArray(resp.content)) {
      return resp.content
        .map((c) => (c && typeof c === 'object' ? c.text || JSON.stringify(c) : String(c)))
        .join(' ');
    }
  }
  return JSON.stringify(resp).slice(0, 500);
}

function appendFailure(event, options = {}) {
  const logPath = resolveLogPath(options.logPath, options.projectRoot);
  ensureDir(path.dirname(logPath));

  const entry = {
    timestamp: (event.timestamp || new Date()).toISOString?.() || String(event.timestamp),
    tool_name: event.tool_name || 'unknown',
    kind: event.kind,
    detail: (event.detail || '').toString().slice(0, 200),
  };

  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  rotate(logPath);
  return entry;
}

function readRecent(options = {}) {
  const logPath = resolveLogPath(options.logPath, options.projectRoot);
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  return lines
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function evaluate({ now = new Date(), entries, toolName }) {
  const windows = [
    { pattern: /tool result missing/i, seconds: 300, threshold: 1, label: 'tool result missing (blocking on 1st occurrence)' },
    { pattern: /internal error/i, seconds: 300, threshold: 1, label: 'internal error (blocking on 1st occurrence)' },
    { pattern: null, toolName, seconds: 120, threshold: 2, label: `2 ${toolName} failures in 2 min` },
  ];

  for (const w of windows) {
    const cutoff = now.getTime() - w.seconds * 1000;
    const matching = entries.filter((e) => {
      const ts = Date.parse(e.timestamp);
      if (!Number.isFinite(ts) || ts < cutoff) return false;
      if (w.toolName && e.tool_name !== w.toolName) return false;
      if (w.pattern && !w.pattern.test(e.detail || '')) return false;
      return true;
    });
    if (matching.length >= w.threshold) {
      return {
        blocked: true,
        reason: w.label,
        count: matching.length,
        recent: matching.slice(-w.threshold),
      };
    }
  }

  return { blocked: false };
}

function resolveLogPath(explicit, projectRoot) {
  if (explicit) return explicit;
  const root = projectRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return path.join(root, DEFAULT_LOG);
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
}

function rotate(logPath) {
  try {
    const raw = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    if (raw.length > MAX_LOG_ENTRIES) {
      const trimmed = raw.slice(-MAX_LOG_ENTRIES).join('\n') + '\n';
      fs.writeFileSync(logPath, trimmed);
    }
  } catch {
    // ignore
  }
}

module.exports = {
  DEFAULT_LOG,
  ERROR_PATTERNS,
  detectFailure,
  appendFailure,
  readRecent,
  evaluate,
};
