// E3 — Kanban board + stand-up feed + blocked-streak detector.
// ES module. Persists per-session board + append-only standup log.

import { promises as fs } from 'node:fs';
import path from 'node:path';

export const KANBAN_COLUMNS = ['todo', 'doing', 'blocked', 'review', 'done'];
const DEFAULT_PRIORITY = 'P2';
const DEFAULT_COLUMN = 'todo';

function sessionDir(projectRoot, sessionId) {
  if (!sessionId) throw new Error('sessionId required');
  return path.join(projectRoot, '_byan-output', 'party-mode-sessions', String(sessionId));
}

function kanbanPath(projectRoot, sessionId) {
  return path.join(sessionDir(projectRoot, sessionId), 'kanban.json');
}

function standupPath(projectRoot, sessionId) {
  return path.join(sessionDir(projectRoot, sessionId), 'standup.jsonl');
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function readJSON(p) {
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function writeJSON(p, data) {
  await ensureDir(path.dirname(p));
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf8');
}

function nowIso(now) {
  if (now instanceof Date) return now.toISOString();
  if (typeof now === 'string') return now;
  if (typeof now === 'number') return new Date(now).toISOString();
  return new Date().toISOString();
}

function emptyBoard(sessionId, ts) {
  const columns = {};
  for (const c of KANBAN_COLUMNS) columns[c] = [];
  return {
    sessionId,
    createdAt: ts,
    updatedAt: ts,
    columns,
    cards: {},
  };
}

export async function createBoard({ sessionId, projectRoot, now } = {}) {
  if (!projectRoot) throw new Error('projectRoot required');
  const p = kanbanPath(projectRoot, sessionId);
  const existing = await readJSON(p);
  if (existing) return existing;
  const board = emptyBoard(sessionId, nowIso(now));
  await writeJSON(p, board);
  return board;
}

async function loadBoardOrThrow(projectRoot, sessionId) {
  const p = kanbanPath(projectRoot, sessionId);
  const board = await readJSON(p);
  if (!board) throw new Error(`no board for session ${sessionId}`);
  return board;
}

export async function addCard({ sessionId, card, projectRoot, now } = {}) {
  if (!card || !card.id || !card.title) throw new Error('card.id and card.title required');
  const p = kanbanPath(projectRoot, sessionId);
  const board = (await readJSON(p)) || emptyBoard(sessionId, nowIso(now));
  if (board.cards[card.id]) throw new Error(`duplicate card id: ${card.id}`);
  const column = card.column && KANBAN_COLUMNS.includes(card.column) ? card.column : DEFAULT_COLUMN;
  const ts = nowIso(now);
  const stored = {
    id: card.id,
    title: card.title,
    priority: card.priority || DEFAULT_PRIORITY,
    assignee: card.assignee || null,
    column,
    blocker_reason: null,
    createdAt: ts,
    updatedAt: ts,
  };
  board.cards[card.id] = stored;
  board.columns[column].push(card.id);
  board.updatedAt = ts;
  await writeJSON(p, board);
  return stored;
}

export async function moveCard({ sessionId, cardId, toColumn, blocker_reason, projectRoot, now } = {}) {
  if (!KANBAN_COLUMNS.includes(toColumn)) throw new Error(`invalid column: ${toColumn}`);
  const p = kanbanPath(projectRoot, sessionId);
  const board = await loadBoardOrThrow(projectRoot, sessionId);
  const card = board.cards[cardId];
  if (!card) throw new Error(`unknown card: ${cardId}`);
  const from = card.column;
  if (from !== toColumn) {
    board.columns[from] = board.columns[from].filter((id) => id !== cardId);
    board.columns[toColumn].push(cardId);
    card.column = toColumn;
  }
  card.blocker_reason = toColumn === 'blocked' ? (blocker_reason || null) : null;
  const ts = nowIso(now);
  card.updatedAt = ts;
  board.updatedAt = ts;
  await writeJSON(p, board);
  return card;
}

export async function assignCard({ sessionId, cardId, assignee, projectRoot, now } = {}) {
  const p = kanbanPath(projectRoot, sessionId);
  const board = await loadBoardOrThrow(projectRoot, sessionId);
  const card = board.cards[cardId];
  if (!card) throw new Error(`unknown card: ${cardId}`);
  card.assignee = assignee || null;
  const ts = nowIso(now);
  card.updatedAt = ts;
  board.updatedAt = ts;
  await writeJSON(p, board);
  return card;
}

export async function getBoard({ sessionId, projectRoot } = {}) {
  const p = kanbanPath(projectRoot, sessionId);
  return readJSON(p);
}

export async function postStandup({ sessionId, agent, did, blockers, next, projectRoot, now } = {}) {
  if (!agent) throw new Error('agent required');
  const p = standupPath(projectRoot, sessionId);
  await ensureDir(path.dirname(p));
  const entry = {
    agent,
    timestamp: nowIso(now),
    did: Array.isArray(did) ? did : (did ? [did] : []),
    blockers: Array.isArray(blockers) ? blockers : (blockers ? [blockers] : []),
    next: Array.isArray(next) ? next : (next ? [next] : []),
  };
  await fs.appendFile(p, JSON.stringify(entry) + '\n', 'utf8');
  return entry;
}

export async function readStandups({ sessionId, projectRoot, limit = 50 } = {}) {
  const p = standupPath(projectRoot, sessionId);
  let raw;
  try {
    raw = await fs.readFile(p, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const entries = [];
  for (const line of lines) {
    try { entries.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  if (limit && entries.length > limit) return entries.slice(entries.length - limit);
  return entries;
}

export async function detectBlockedStreaks({ sessionId, minStreak = 2, projectRoot } = {}) {
  const entries = await readStandups({ sessionId, projectRoot, limit: 10000 });
  // group by agent, keep chronological order (jsonl is append-only so already chronological)
  const byAgent = new Map();
  for (const e of entries) {
    if (!byAgent.has(e.agent)) byAgent.set(e.agent, []);
    byAgent.get(e.agent).push(e);
  }
  const result = [];
  for (const [agent, list] of byAgent.entries()) {
    let streak = 0;
    let lastAt = null;
    for (const e of list) {
      if (Array.isArray(e.blockers) && e.blockers.length > 0) {
        streak += 1;
        lastAt = e.timestamp;
      } else {
        streak = 0;
        lastAt = null;
      }
    }
    if (streak >= minStreak) result.push({ agent, streak, lastAt });
  }
  return result;
}
