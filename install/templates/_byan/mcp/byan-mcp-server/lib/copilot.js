import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const COPILOT_ROOT = process.env.BYAN_COPILOT_ROOT || path.join(os.homedir(), '.copilot', 'session-state');

function readJsonl(filePath, limit) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  const out = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line));
    } catch {
      // skip malformed
    }
    if (typeof limit === 'number' && out.length >= limit) break;
  }
  return out;
}

function summarizeSession(sessionId) {
  const eventsPath = path.join(COPILOT_ROOT, sessionId, 'events.jsonl');
  if (!fs.existsSync(eventsPath)) return null;

  const events = readJsonl(eventsPath);
  if (events.length === 0) return null;

  const start = events.find((e) => e.type === 'session.start');
  const shutdown = events.find((e) => e.type === 'session.shutdown');
  const agent = events.find((e) => e.type === 'subagent.selected');

  const counts = {};
  for (const e of events) {
    counts[e.type] = (counts[e.type] || 0) + 1;
  }

  const userMessages = events.filter((e) => e.type === 'user.message');
  const assistantMessages = events.filter((e) => e.type === 'assistant.message');

  return {
    sessionId,
    startTime: start?.data?.startTime || null,
    endTime: shutdown?.timestamp || null,
    cwd: start?.data?.context?.cwd || null,
    branch: start?.data?.context?.branch || null,
    agent: agent?.data?.agentName || null,
    event_count: events.length,
    user_messages: userMessages.length,
    assistant_messages: assistantMessages.length,
    tool_calls: counts['tool.execution_start'] || 0,
    event_type_counts: counts,
  };
}

export function listSessions({ limit = 20, sinceIso = null, cwdFilter = null } = {}) {
  if (!fs.existsSync(COPILOT_ROOT)) return { root: COPILOT_ROOT, sessions: [], total: 0, exists: false };

  const dirs = fs
    .readdirSync(COPILOT_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const summaries = [];
  for (const id of dirs) {
    const s = summarizeSession(id);
    if (!s) continue;
    if (sinceIso && s.startTime && Date.parse(s.startTime) < Date.parse(sinceIso)) continue;
    if (cwdFilter && s.cwd && !s.cwd.includes(cwdFilter)) continue;
    summaries.push(s);
  }

  summaries.sort((a, b) => {
    const at = Date.parse(a.startTime || 0);
    const bt = Date.parse(b.startTime || 0);
    return bt - at;
  });

  return {
    root: COPILOT_ROOT,
    total: summaries.length,
    exists: true,
    sessions: summaries.slice(0, limit),
  };
}

export function readSessionEvents({ sessionId, types = null, limit = 200 } = {}) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('sessionId is required');
  }
  const eventsPath = path.join(COPILOT_ROOT, sessionId, 'events.jsonl');
  if (!fs.existsSync(eventsPath)) {
    throw new Error(`events.jsonl not found for session ${sessionId}`);
  }

  const allEvents = readJsonl(eventsPath);
  const filtered = Array.isArray(types) && types.length > 0
    ? allEvents.filter((e) => types.includes(e.type))
    : allEvents;

  return {
    sessionId,
    total: allEvents.length,
    returned: Math.min(filtered.length, limit),
    filtered_by_type: Array.isArray(types) ? types : null,
    events: filtered.slice(0, limit),
  };
}

export function searchSessions({ query, types = ['user.message', 'assistant.message'], limit = 50 } = {}) {
  if (!query || typeof query !== 'string') {
    throw new Error('query is required');
  }
  if (!fs.existsSync(COPILOT_ROOT)) return { matches: [], total: 0 };

  const q = query.toLowerCase();
  const dirs = fs
    .readdirSync(COPILOT_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const matches = [];
  for (const sessionId of dirs) {
    const eventsPath = path.join(COPILOT_ROOT, sessionId, 'events.jsonl');
    if (!fs.existsSync(eventsPath)) continue;
    const events = readJsonl(eventsPath);
    for (const e of events) {
      if (!types.includes(e.type)) continue;
      const text = typeof e.data?.content === 'string'
        ? e.data.content
        : typeof e.data?.text === 'string'
          ? e.data.text
          : JSON.stringify(e.data || {});
      if (text.toLowerCase().includes(q)) {
        matches.push({
          sessionId,
          timestamp: e.timestamp,
          type: e.type,
          excerpt: text.slice(0, 300),
        });
        if (matches.length >= limit) break;
      }
    }
    if (matches.length >= limit) break;
  }

  return { query, total: matches.length, matches };
}
