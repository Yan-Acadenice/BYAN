/**
 * usage-estimator — estimate Claude's rolling-5h token consumption from Claude
 * Code's LOCAL usage accounting, so BYAN can decide when to auto-delegate to a
 * secondary pool (Codex) BEFORE the 5h wall.
 *
 * The honest ceiling (stated plainly, not hidden): no provider exposes a
 * machine-readable 5h quota, and Claude Code fetches the authoritative
 * "/usage" figure live from Anthropic — it is NOT persisted locally. What IS
 * local is per-session token accounting under
 * `~/.claude/usage-data/session-meta/*.json` (real input/output token totals +
 * start_time + duration). This module sums those over the rolling window and
 * returns an ESTIMATE with an explicit confidence, never a false-precision
 * figure. `pct` is only produced when a budget (the plan's rough token ceiling)
 * is supplied — otherwise it is null (we do not invent the ceiling).
 *
 * Portable-core posture (PORTABLE-3): `~/.claude` is a per-machine native
 * accelerator, NOT a BYAN source of truth. When it is absent the estimator
 * degrades to a null/none result rather than throwing — the nature-based
 * delegation path stays functional without any gauge.
 *
 * Purity: normalizeSession / sumWindowTokens / estimatePct are pure. All I/O is
 * behind an injected `fs`, so the unit tests never touch the real home dir.
 */

const realFs = require('fs');
const realPath = require('path');
const os = require('os');

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;

// Parse one session-meta object into { startMs, endMs, tokens }, or null when it
// carries no usable start time. Token fields default to 0 (never NaN) so the
// downstream sum is always safe.
function normalizeSession(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const startMs = Date.parse(meta.start_time);
  if (!Number.isFinite(startMs)) return null;
  const durationMin = Number(meta.duration_minutes) || 0;
  const endMs = startMs + Math.max(0, durationMin) * 60 * 1000;
  const input = Number(meta.input_tokens) || 0;
  const output = Number(meta.output_tokens) || 0;
  return { startMs, endMs, tokens: input + output };
}

// Sum tokens attributable to the rolling window [now-windowMs, now], pro-rating
// a session by the fraction of its own span that overlaps the window. A
// zero-duration session is an instant: counted fully if inside, else zero. This
// pro-rata is the honest approximation available from per-session totals (the
// meta has no per-message breakdown).
function sumWindowTokens(sessions, now, windowMs = FIVE_HOURS_MS) {
  const windowStart = now - windowMs;
  let total = 0;
  for (const s of sessions) {
    if (!s) continue;
    const span = s.endMs - s.startMs;
    if (span <= 0) {
      if (s.startMs >= windowStart && s.startMs <= now) total += s.tokens;
      continue;
    }
    const overlap = Math.min(s.endMs, now) - Math.max(s.startMs, windowStart);
    if (overlap <= 0) continue;
    total += s.tokens * (overlap / span);
  }
  return Math.round(total);
}

// Turn an estimated token count into a percentage of a supplied budget. Without
// a budget we return { pct: null, confidence: 'none' } — we do not fabricate the
// ceiling. With a budget the percentage is a LOW-confidence estimate (the token
// units are not the exact rate-limit units Anthropic meters), clamped to [0,100].
function estimatePct(estimatedTokens, budget) {
  if (!budget || budget <= 0) return { pct: null, confidence: 'none' };
  const pct = Math.max(0, Math.min(100, Math.round((estimatedTokens / budget) * 100)));
  return { pct, confidence: 'low' };
}

// Weighted token cost of one assistant message's usage block. Fresh tokens
// (input + output + cache creation) count at full weight; cache READS are
// weighted down (CACHE_READ_WEIGHT) because the same context is re-read from
// cache every turn and Anthropic bills a cache hit at roughly a tenth of a fresh
// input token — counting it at full weight would inflate a long conversation to
// hundreds of millions of tokens (the same context re-counted each turn). This
// yields a proportional pressure estimate, not an exact bill. Pure.
const CACHE_READ_WEIGHT = 0.1;

function sumTokensFromUsage(usage) {
  if (!usage || typeof usage !== 'object') return 0;
  const fresh = (Number(usage.input_tokens) || 0)
    + (Number(usage.output_tokens) || 0)
    + (Number(usage.cache_creation_input_tokens) || 0);
  const cacheRead = (Number(usage.cache_read_input_tokens) || 0) * CACHE_READ_WEIGHT;
  return Math.round(fresh + cacheRead);
}

// Sum tokens across transcript events whose timestamp lands in the rolling
// window. Only `assistant` events carry a usage block. Pure — takes already
// parsed events. Returns { tokens, messagesCounted }.
function sumTranscriptWindow(events, now, windowMs = FIVE_HOURS_MS) {
  const windowStart = now - windowMs;
  let tokens = 0;
  let messagesCounted = 0;
  for (const ev of events) {
    if (!ev || ev.type !== 'assistant' || !ev.message) continue;
    const ts = Date.parse(ev.timestamp);
    if (!Number.isFinite(ts) || ts < windowStart || ts > now) continue;
    tokens += sumTokensFromUsage(ev.message.usage);
    messagesCounted += 1;
  }
  return { tokens, messagesCounted };
}

// Read the LIVE per-message usage from the session transcripts under
// ~/.claude/projects/<hash>/*.jsonl. Unlike session-meta (written at session
// END), transcripts are appended live, so they capture the IN-PROGRESS session
// — exactly the signal needed to react before the wall. Files untouched within
// the window are skipped by mtime when statSync is available (perf). Corrupt
// lines are skipped, not fatal. Returns { tokens, messagesCounted, filesRead }.
function readTranscriptUsage({ home, now = Date.now(), windowMs = FIVE_HOURS_MS, fs = realFs, path = realPath } = {}) {
  const root = path.join(home, '.claude', 'projects');
  const empty = { tokens: 0, messagesCounted: 0, filesRead: 0 };
  let projectDirs;
  try {
    if (!fs.existsSync(root)) return empty;
    projectDirs = fs.readdirSync(root);
  } catch {
    return empty;
  }
  const windowStart = now - windowMs;
  let tokens = 0;
  let messagesCounted = 0;
  let filesRead = 0;
  for (const pd of projectDirs) {
    const dir = path.join(root, pd);
    let files;
    try {
      files = fs.readdirSync(dir).filter((n) => String(n).endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const name of files) {
      const fp = path.join(dir, name);
      try {
        if (typeof fs.statSync === 'function') {
          const st = fs.statSync(fp);
          if (Number.isFinite(st.mtimeMs) && st.mtimeMs < windowStart) continue;
        }
      } catch {
        /* stat failed — fall through and try to read */
      }
      let content;
      try {
        content = fs.readFileSync(fp, 'utf8');
      } catch {
        continue;
      }
      filesRead += 1;
      const events = [];
      for (const line of String(content).split('\n')) {
        const t = line.trim();
        if (!t) continue;
        try {
          events.push(JSON.parse(t));
        } catch {
          /* skip corrupt line */
        }
      }
      const r = sumTranscriptWindow(events, now, windowMs);
      tokens += r.tokens;
      messagesCounted += r.messagesCounted;
    }
  }
  return { tokens, messagesCounted, filesRead };
}

// Read the raw session-meta JSON objects from ~/.claude/usage-data/session-meta.
// Returns [] when the directory is absent (degraded path). A corrupt file is
// skipped, not fatal.
function readSessionMetas({ home, fs = realFs, path = realPath } = {}) {
  const dir = path.join(home, '.claude', 'usage-data', 'session-meta');
  let names;
  try {
    if (!fs.existsSync(dir)) return [];
    names = fs.readdirSync(dir).filter((n) => String(n).endsWith('.json'));
  } catch {
    return [];
  }
  const metas = [];
  for (const name of names) {
    try {
      metas.push(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
    } catch {
      /* skip corrupt file */
    }
  }
  return metas;
}

// Top-level: estimate Claude's rolling-window usage. Returns a stable shape in
// every path (including degraded), so callers never branch on undefined:
//   { estimatedTokens, pct, confidence, source, sessionsCounted, messagesCounted, windowMs }
// Source precedence, most-live first:
//   'transcript'   — per-message usage, captures the in-progress session (best)
//   'session-meta' — coarse per-session totals, blind to the live session
//   'none'         — no local data (home absent) -> honest null pct
function estimateClaudeUsage({
  home = os.homedir(),
  now = Date.now(),
  budget = null,
  windowMs = FIVE_HOURS_MS,
  fs = realFs,
  path = realPath,
} = {}) {
  // 1. Live transcript signal — preferred (sees the session you are burning NOW).
  const tr = readTranscriptUsage({ home, now, windowMs, fs, path });
  if (tr.messagesCounted > 0) {
    const { pct, confidence } = estimatePct(tr.tokens, budget);
    return {
      estimatedTokens: tr.tokens,
      pct,
      confidence,
      source: 'transcript',
      sessionsCounted: 0,
      messagesCounted: tr.messagesCounted,
      windowMs,
    };
  }

  // 2. Fallback: coarse per-session totals (post-hoc; blind to the live session).
  const metas = readSessionMetas({ home, fs, path });
  if (metas.length === 0) {
    return { estimatedTokens: 0, pct: null, confidence: 'none', source: 'none', sessionsCounted: 0, messagesCounted: 0, windowMs };
  }
  const sessions = metas.map(normalizeSession).filter(Boolean);
  const inWindow = sessions.filter((s) => {
    const span = s.endMs - s.startMs;
    if (span <= 0) return s.startMs >= now - windowMs && s.startMs <= now;
    return Math.min(s.endMs, now) - Math.max(s.startMs, now - windowMs) > 0;
  });
  const estimatedTokens = sumWindowTokens(sessions, now, windowMs);
  const { pct, confidence } = estimatePct(estimatedTokens, budget);
  return {
    estimatedTokens,
    pct,
    confidence,
    source: 'session-meta',
    sessionsCounted: inWindow.length,
    messagesCounted: 0,
    windowMs,
  };
}

module.exports = {
  FIVE_HOURS_MS,
  normalizeSession,
  sumWindowTokens,
  estimatePct,
  sumTokensFromUsage,
  sumTranscriptWindow,
  readTranscriptUsage,
  readSessionMetas,
  estimateClaudeUsage,
};
