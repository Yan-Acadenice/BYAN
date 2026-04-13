'use strict';

const crypto = require('crypto');
const { getDb } = require('../db');

const STITCH_WINDOW_MS = 30 * 60 * 1000;

function startSession(data) {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  let parentSessionId = null;
  if (data.userId && data.projectId) {
    const cutoff = new Date(Date.now() - STITCH_WINDOW_MS).toISOString();
    const conditions = ['user_id = ?', 'project_id = ?', 'started_at > ?'];
    const params = [data.userId, data.projectId, cutoff];

    if (data.nodeId) {
      conditions.push('node_id = ?');
      params.push(data.nodeId);
    }

    const recent = db.prepare(`
      SELECT id FROM sessions
      WHERE ${conditions.join(' AND ')}
      ORDER BY started_at DESC LIMIT 1
    `).get(...params);

    if (recent) parentSessionId = recent.id;
  }

  db.prepare(`
    INSERT INTO sessions (id, user_id, project_id, node_id, cli_source, agent_name, started_at, parent_session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.userId || null,
    data.projectId || null,
    data.nodeId || null,
    data.cliSource,
    data.agentName || null,
    now,
    parentSessionId
  );

  const session = getSession(id);
  session.stitched = !!parentSessionId;
  return session;
}

function endSession(sessionId, summary) {
  const db = getDb();
  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
  if (!session) {
    throw Object.assign(new Error('Session not found'), { code: 'SESSION_NOT_FOUND' });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE sessions SET ended_at = ?, summary = ? WHERE id = ?')
    .run(now, summary || null, sessionId);

  return getSession(sessionId);
}

function getSession(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  return row || null;
}

function listSessions(query) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (query.projectId) {
    conditions.push('project_id = ?');
    params.push(query.projectId);
  }
  if (query.userId) {
    conditions.push('user_id = ?');
    params.push(query.userId);
  }
  if (query.cliSource) {
    conditions.push('cli_source = ?');
    params.push(query.cliSource);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = query.limit || 50;

  return db.prepare(`
    SELECT * FROM sessions ${where}
    ORDER BY started_at DESC LIMIT ?
  `).all(...params, limit);
}

function getSessionHistory(query) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (query.userId) {
    conditions.push('user_id = ?');
    params.push(query.userId);
  }
  if (query.projectId) {
    conditions.push('project_id = ?');
    params.push(query.projectId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = query.limit || 50;

  return db.prepare(`
    SELECT * FROM sessions ${where}
    ORDER BY started_at DESC LIMIT ?
  `).all(...params, limit);
}

function getSessionChain(sessionId) {
  const chain = [];
  const db = getDb();
  let currentId = sessionId;

  while (currentId) {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(currentId);
    if (!session) break;
    chain.unshift(session);
    currentId = session.parent_session_id;
  }

  return chain;
}

function getStitchedContext(sessionId) {
  const chain = getSessionChain(sessionId);
  if (chain.length === 0) return { sessions: [], memories: [], context: '' };

  const db = getDb();
  const seen = new Set();
  const allMemories = [];

  for (const session of chain) {
    const memories = db.prepare(
      'SELECT * FROM memories WHERE session_id = ? ORDER BY created_at ASC'
    ).all(session.id);

    for (const mem of memories) {
      if (seen.has(mem.id)) continue;
      seen.add(mem.id);
      allMemories.push({
        ...mem,
        metadata: mem.metadata ? JSON.parse(mem.metadata) : null,
        pinned: !!mem.pinned
      });
    }
  }

  const contextParts = allMemories.map(m =>
    `[${m.cli_source || 'unknown'}:${m.category || 'memory'}] ${m.content}`
  );

  return {
    sessions: chain,
    memories: allMemories,
    context: contextParts.join('\n')
  };
}

module.exports = {
  startSession,
  endSession,
  getSession,
  listSessions,
  getSessionHistory,
  getSessionChain,
  getStitchedContext
};
