/**
 * BYAN staging core — extract / filter / dedup / queue / flush conversation
 * knowledge from any supported CLI (claude-code, copilot-cli, codex) to a
 * byan_web instance via POST /api/memory.
 *
 * Usage from a Claude Code Stop hook :
 *   const { processTurn } = require('./staging');
 *   await processTurn({ turn, cliSource: 'claude-code', config, projectRoot });
 *
 * Usage from a Copilot CLI extension.mjs :
 *   import { processTurn } from '<repo>/src/staging/staging.js';
 *   await processTurn({ turn, cliSource: 'copilot-cli', config, projectRoot });
 *
 * Contract :
 *   - processTurn() is idempotent (dedup by content hash)
 *   - never throws — errors go to the retry queue
 *   - if enabled=false, it's a pure no-op (zero bytes sent)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const QUEUE_FILENAME = 'staging-queue.jsonl';
const SEEN_FILENAME = 'staging-seen.json';
const STAGING_DIR = path.join('_byan-output', 'staging');

// Patterns considered "chit-chat" — skipped by the triage filter.
const CHITCHAT_PATTERNS = [
  /^(hi|hello|ok|thanks|merci|salut|bye|lol|yep|nope)[!. ]*$/i,
  /^(y|yes|n|no|go|stop)$/i,
];

const MIN_CONTENT_CHARS = 50;

function resolveRoot(projectRoot) {
  return projectRoot || process.env.CLAUDE_PROJECT_DIR || process.env.BYAN_PROJECT_ROOT || process.cwd();
}

function stagingDir(projectRoot) {
  return path.join(resolveRoot(projectRoot), STAGING_DIR);
}

function queuePath(projectRoot) {
  return path.join(stagingDir(projectRoot), QUEUE_FILENAME);
}

function seenPath(projectRoot) {
  return path.join(stagingDir(projectRoot), SEEN_FILENAME);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

// ---------------------------------------------------------------------------
// Enablement + config
// ---------------------------------------------------------------------------

function isEnabled(config) {
  if (!config || typeof config !== 'object') return false;
  const ms = config.memory_sync || config.memorySync;
  if (!ms) return false;
  return ms.enabled === true;
}

function apiUrl(config) {
  if (!config) return null;
  return config.byan_api_url || config.BYAN_API_URL || process.env.BYAN_API_URL || null;
}

function apiToken(config) {
  if (!config) return process.env.BYAN_API_TOKEN || null;
  return config.byan_api_token || config.BYAN_API_TOKEN || process.env.BYAN_API_TOKEN || null;
}

// ---------------------------------------------------------------------------
// Extract — normalize a turn payload into a memory entry draft
// ---------------------------------------------------------------------------

function extractUserText(turn) {
  if (!turn) return '';
  if (typeof turn.userMessage === 'string') return turn.userMessage;
  if (typeof turn.prompt === 'string') return turn.prompt;
  if (Array.isArray(turn.messages)) {
    const u = [...turn.messages].reverse().find((m) => m && m.role === 'user');
    if (u && typeof u.content === 'string') return u.content;
  }
  return '';
}

function extractAssistantText(turn) {
  if (!turn) return '';
  if (typeof turn.assistantMessage === 'string') return turn.assistantMessage;
  if (Array.isArray(turn.messages)) {
    const a = [...turn.messages].reverse().find((m) => m && m.role === 'assistant');
    if (a) {
      if (typeof a.content === 'string') return a.content;
      if (Array.isArray(a.content)) {
        return a.content
          .map((c) => (c && typeof c === 'object' && c.text ? c.text : ''))
          .join(' ')
          .trim();
      }
    }
  }
  return '';
}

function extractFilesTouched(turn) {
  if (!turn) return [];
  if (Array.isArray(turn.filesTouched)) return turn.filesTouched.filter(Boolean);
  if (Array.isArray(turn.toolCalls)) {
    const files = [];
    for (const tc of turn.toolCalls) {
      const p = tc?.input?.file_path || tc?.args?.file_path || tc?.input?.path;
      if (p && typeof p === 'string') files.push(p);
    }
    return files;
  }
  return [];
}

function classify(content, turn) {
  const c = String(content || '').toLowerCase();
  if (/\b(decid(e|ed|ing)|choix|trade-?off|architecture)\b/i.test(c)) return 'decision';
  if (/\b(bug|error|fail|broken|bloque|blocked|can't|impossible)\b/i.test(c)) return 'blocker';
  const files = extractFilesTouched(turn);
  if (files.length > 0) return 'artifact';
  return 'fact';
}

function extract({ turn, cliSource }) {
  const user = extractUserText(turn);
  const assistant = extractAssistantText(turn);
  const filesTouched = extractFilesTouched(turn);
  const content = [user, assistant].filter(Boolean).join('\n\n').trim();

  return {
    cliSource: cliSource || 'unknown',
    sessionId: turn?.sessionId || null,
    category: classify(content, turn),
    content,
    metadata: {
      userMessageLen: user.length,
      assistantMessageLen: assistant.length,
      filesTouched,
      timestamp: new Date().toISOString(),
    },
    pinned: false,
  };
}

// ---------------------------------------------------------------------------
// Filter — triage chit-chat
// ---------------------------------------------------------------------------

function shouldKeep(entry) {
  if (!entry || typeof entry.content !== 'string') return false;
  if (entry.content.length < MIN_CONTENT_CHARS) return false;

  const trimmed = entry.content.trim();
  for (const re of CHITCHAT_PATTERNS) {
    if (re.test(trimmed)) return false;
  }

  // Must have at least one of : files touched, substantive content, or decision keywords
  if (entry.metadata && Array.isArray(entry.metadata.filesTouched) && entry.metadata.filesTouched.length > 0) {
    return true;
  }
  // Otherwise require reasonable content length
  return trimmed.length >= MIN_CONTENT_CHARS * 2;
}

// ---------------------------------------------------------------------------
// Dedup — hash-based, persisted
// ---------------------------------------------------------------------------

function readSeen(projectRoot) {
  const p = seenPath(projectRoot);
  if (!fs.existsSync(p)) return { hashes: [] };
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { hashes: [] };
  }
}

function writeSeen(projectRoot, seen) {
  ensureDir(stagingDir(projectRoot));
  // Keep only last 500 hashes to cap disk use
  const trimmed = { hashes: seen.hashes.slice(-500) };
  fs.writeFileSync(seenPath(projectRoot), JSON.stringify(trimmed));
}

function isDuplicate(entry, projectRoot) {
  const h = sha256(entry.content);
  const seen = readSeen(projectRoot);
  return seen.hashes.includes(h);
}

function markSeen(entry, projectRoot) {
  const h = sha256(entry.content);
  const seen = readSeen(projectRoot);
  if (!seen.hashes.includes(h)) {
    seen.hashes.push(h);
    writeSeen(projectRoot, seen);
  }
}

// ---------------------------------------------------------------------------
// Queue — local append-only, flushed by flush()
// ---------------------------------------------------------------------------

function enqueue(entry, projectRoot) {
  ensureDir(stagingDir(projectRoot));
  const p = queuePath(projectRoot);
  const line = JSON.stringify({
    ...entry,
    enqueued_at: new Date().toISOString(),
    attempts: 0,
  });
  fs.appendFileSync(p, line + '\n');
}

function readQueue(projectRoot) {
  const p = queuePath(projectRoot);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function writeQueue(projectRoot, entries) {
  const p = queuePath(projectRoot);
  if (entries.length === 0) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return;
  }
  fs.writeFileSync(
    p,
    entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
  );
}

// ---------------------------------------------------------------------------
// Project ID — derived from git remote or cwd
// ---------------------------------------------------------------------------

function detectProjectId(projectRoot) {
  const root = resolveRoot(projectRoot);
  try {
    const url = execSync('git remote get-url origin', {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
    if (url) return sha256(url).slice(0, 16);
  } catch {
    // no git remote, fall through
  }
  return sha256(root).slice(0, 16);
}

// ---------------------------------------------------------------------------
// Flush — POST queued entries to /api/memory with retry
// ---------------------------------------------------------------------------

async function postEntry({ entry, url, token, projectId }) {
  const body = {
    projectId,
    sessionId: entry.sessionId,
    cliSource: entry.cliSource,
    category: entry.category,
    content: entry.content,
    metadata: entry.metadata,
    pinned: entry.pinned === true,
  };
  const res = await fetch(`${url.replace(/\/$/, '')}/api/memory`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json().catch(() => ({}));
}

async function flush({ config, projectRoot, maxAttempts = 5 } = {}) {
  const url = apiUrl(config);
  const token = apiToken(config);
  if (!url || !token) {
    return { flushed: 0, requeued: 0, dropped: 0, reason: 'missing url or token' };
  }

  const projectId = detectProjectId(projectRoot);
  const queue = readQueue(projectRoot);
  if (queue.length === 0) return { flushed: 0, requeued: 0, dropped: 0 };

  let flushed = 0;
  const remaining = [];
  let dropped = 0;

  for (const entry of queue) {
    try {
      await postEntry({ entry, url, token, projectId });
      flushed += 1;
    } catch (err) {
      const attempts = (entry.attempts || 0) + 1;
      if (attempts >= maxAttempts) {
        dropped += 1;
        continue;
      }
      remaining.push({ ...entry, attempts, last_error: err.message });
    }
  }

  writeQueue(projectRoot, remaining);

  return { flushed, requeued: remaining.length, dropped };
}

// ---------------------------------------------------------------------------
// Orchestration — the single entry point used by both hooks/extensions
// ---------------------------------------------------------------------------

async function processTurn({ turn, cliSource, config, projectRoot, flushNow = true } = {}) {
  if (!isEnabled(config)) {
    return { skipped: 'disabled' };
  }

  const entry = extract({ turn, cliSource });

  if (!shouldKeep(entry)) {
    return { skipped: 'filtered', category: entry.category };
  }

  if (isDuplicate(entry, projectRoot)) {
    return { skipped: 'duplicate', category: entry.category };
  }

  enqueue(entry, projectRoot);
  markSeen(entry, projectRoot);

  if (!flushNow) {
    return { queued: true, flushed: 0, category: entry.category };
  }

  const result = await flush({ config, projectRoot });
  return { queued: true, ...result, category: entry.category };
}

module.exports = {
  processTurn,
  extract,
  shouldKeep,
  isEnabled,
  isDuplicate,
  markSeen,
  enqueue,
  readQueue,
  writeQueue,
  flush,
  detectProjectId,
  sha256,
  classify,
  queuePath,
  seenPath,
  STAGING_DIR,
  QUEUE_FILENAME,
  SEEN_FILENAME,
  MIN_CONTENT_CHARS,
};
