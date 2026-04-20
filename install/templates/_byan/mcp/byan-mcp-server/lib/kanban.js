/**
 * Kanban + stand-up registry for BYAN party-mode sessions.
 *
 * Kanban : _byan-output/party-mode-sessions/<session_id>/kanban.json
 *   columns : todo | doing | blocked | review | done
 *   cards   : { id, title, assignee, priority, created_at, moved_at,
 *               column, blocker_reason? }
 *
 * Stand-up : _byan-output/party-mode-sessions/<session_id>/standup.jsonl
 *   entries : { agent, timestamp, did, blockers, next }
 *
 * Hermes watches stand-ups : an agent with 2+ consecutive "blocked"
 * reports in the stand-up stream is flagged and their card is moved to
 * `blocked` column in the kanban.
 */

import fs from 'node:fs';
import path from 'node:path';

const COLUMNS = ['todo', 'doing', 'blocked', 'review', 'done'];

function resolveRoot(projectRoot) {
  return projectRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function sessionDir(projectRoot, sessionId) {
  return path.join(
    resolveRoot(projectRoot),
    '_byan-output',
    'party-mode-sessions',
    sanitize(sessionId)
  );
}

function sanitize(id) {
  return String(id || 'default').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80);
}

function kanbanPath(projectRoot, sessionId) {
  return path.join(sessionDir(projectRoot, sessionId), 'kanban.json');
}

function standupPath(projectRoot, sessionId) {
  return path.join(sessionDir(projectRoot, sessionId), 'standup.jsonl');
}

function readKanban(projectRoot, sessionId) {
  const p = kanbanPath(projectRoot, sessionId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function writeKanban(projectRoot, sessionId, board) {
  const p = kanbanPath(projectRoot, sessionId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(board, null, 2));
}

function emptyBoard(sessionId, now) {
  return {
    session_id: sessionId,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    columns: COLUMNS.slice(),
    cards: {},
  };
}

export function createBoard({ sessionId, projectRoot, now = new Date() } = {}) {
  if (!sessionId) throw new Error('sessionId is required');
  const existing = readKanban(projectRoot, sessionId);
  if (existing) return existing;
  const board = emptyBoard(sessionId, now);
  writeKanban(projectRoot, sessionId, board);
  return board;
}

export function addCard({
  sessionId,
  card,
  projectRoot,
  now = new Date(),
} = {}) {
  if (!sessionId) throw new Error('sessionId is required');
  if (!card || !card.id || !card.title) throw new Error('card.id and card.title required');

  const board = readKanban(projectRoot, sessionId) || emptyBoard(sessionId, now);
  if (board.cards[card.id]) throw new Error(`card ${card.id} already exists`);

  board.cards[card.id] = {
    id: card.id,
    title: card.title,
    assignee: card.assignee || null,
    priority: card.priority || 'P2',
    column: card.column || 'todo',
    created_at: now.toISOString(),
    moved_at: now.toISOString(),
    blocker_reason: null,
  };
  board.updated_at = now.toISOString();

  writeKanban(projectRoot, sessionId, board);
  return board.cards[card.id];
}

export function moveCard({
  sessionId,
  cardId,
  toColumn,
  blocker_reason,
  projectRoot,
  now = new Date(),
} = {}) {
  if (!COLUMNS.includes(toColumn)) {
    throw new Error(`toColumn must be one of ${COLUMNS.join(', ')}, got ${toColumn}`);
  }
  const board = readKanban(projectRoot, sessionId);
  if (!board) throw new Error(`no kanban for session ${sessionId}`);
  if (!board.cards[cardId]) throw new Error(`card ${cardId} not found`);

  const card = board.cards[cardId];
  card.column = toColumn;
  card.moved_at = now.toISOString();
  card.blocker_reason = toColumn === 'blocked' ? blocker_reason || 'unspecified' : null;
  board.updated_at = now.toISOString();

  writeKanban(projectRoot, sessionId, board);
  return card;
}

export function assignCard({
  sessionId,
  cardId,
  assignee,
  projectRoot,
  now = new Date(),
} = {}) {
  if (!assignee) throw new Error('assignee is required');
  const board = readKanban(projectRoot, sessionId);
  if (!board || !board.cards[cardId]) throw new Error(`card ${cardId} not found`);
  board.cards[cardId].assignee = assignee;
  board.cards[cardId].moved_at = now.toISOString();
  board.updated_at = now.toISOString();
  writeKanban(projectRoot, sessionId, board);
  return board.cards[cardId];
}

export function getBoard({ sessionId, projectRoot } = {}) {
  if (!sessionId) throw new Error('sessionId is required');
  return readKanban(projectRoot, sessionId);
}

export function postStandup({
  sessionId,
  agent,
  did,
  blockers = [],
  next,
  projectRoot,
  now = new Date(),
} = {}) {
  if (!sessionId) throw new Error('sessionId is required');
  if (!agent) throw new Error('agent is required');

  const entry = {
    agent,
    timestamp: now.toISOString(),
    did: did || '',
    blockers: Array.isArray(blockers) ? blockers : [],
    next: next || '',
  };

  const p = standupPath(projectRoot, sessionId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(entry) + '\n');
  return entry;
}

export function readStandups({ sessionId, projectRoot, limit = 50 } = {}) {
  const p = standupPath(projectRoot, sessionId);
  if (!fs.existsSync(p)) return [];
  const lines = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean);
  const out = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line));
    } catch {
      // skip malformed
    }
  }
  return out.slice(-limit);
}

/**
 * Detect agents with >= minStreak consecutive blocked stand-ups.
 * Returns array of { agent, streak, lastAt }.
 */
export function detectBlockedStreaks({ sessionId, minStreak = 2, projectRoot } = {}) {
  const standups = readStandups({ sessionId, projectRoot, limit: 500 });
  const streaks = {};
  const agentLast = {};

  for (const entry of standups) {
    const isBlocked = Array.isArray(entry.blockers) && entry.blockers.length > 0;
    if (isBlocked) {
      streaks[entry.agent] = (streaks[entry.agent] || 0) + 1;
    } else {
      streaks[entry.agent] = 0;
    }
    agentLast[entry.agent] = entry.timestamp;
  }

  const flagged = [];
  for (const [agent, n] of Object.entries(streaks)) {
    if (n >= minStreak) {
      flagged.push({ agent, streak: n, lastAt: agentLast[agent] });
    }
  }
  return flagged;
}

export const KANBAN_COLUMNS = COLUMNS;
