'use strict';

const crypto = require('crypto');
const { getDb } = require('../db');
const config = require('../config');
const { resolveContext, estimateTokens } = require('./context-resolver');

const LONG_TERM_CATEGORIES = new Set(['decision', 'preference']);
const SHORT_TERM_CATEGORIES = new Set(['insight']);

function autoAssignLayer(category) {
  if (LONG_TERM_CATEGORIES.has(category)) return 'long_term';
  if (SHORT_TERM_CATEGORIES.has(category)) return 'short_term';
  return 'working';
}

function store(data) {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const layer = data.layer || autoAssignLayer(data.category);

  db.prepare(`
    INSERT INTO memories (id, project_id, node_id, user_id, cli_source, session_id, layer, category, content, metadata, pinned, accessed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.projectId || null,
    data.nodeId || null,
    data.userId || null,
    data.cliSource || null,
    data.sessionId || null,
    layer,
    data.category || null,
    data.content,
    data.metadata ? JSON.stringify(data.metadata) : null,
    data.pinned ? 1 : 0,
    now, now, now
  );

  return getMemory(id);
}

function getMemory(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM memories WHERE id = ?').get(id);
  return row ? parseMemory(row) : null;
}

function recall(query) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (query.projectId) {
    conditions.push('project_id = ?');
    params.push(query.projectId);
  }
  if (query.nodeId) {
    conditions.push('node_id = ?');
    params.push(query.nodeId);
  }
  if (query.category) {
    conditions.push('category = ?');
    params.push(query.category);
  }
  if (query.layer && !query.includePinned) {
    conditions.push('layer = ?');
    params.push(query.layer);
  }
  if (query.layer && query.includePinned) {
    conditions.push('(layer = ? OR pinned = 1)');
    params.push(query.layer);
  }
  if (query.cliSource) {
    conditions.push('cli_source = ?');
    params.push(query.cliSource);
  }
  if (query.sessionId) {
    conditions.push('session_id = ?');
    params.push(query.sessionId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = query.limit || 50;

  const rows = db.prepare(`
    SELECT * FROM memories ${where}
    ORDER BY pinned DESC, accessed_at DESC
    LIMIT ?
  `).all(...params, limit);

  const now = new Date().toISOString();
  const ids = rows.map(r => r.id);
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE memories SET accessed_at = ? WHERE id IN (${placeholders})`).run(now, ...ids);
  }

  return rows.map(parseMemory);
}

function promote(memoryId, targetLayer) {
  const db = getDb();
  const memory = db.prepare('SELECT * FROM memories WHERE id = ?').get(memoryId);
  if (!memory) {
    throw Object.assign(new Error('Memory not found'), { code: 'MEMORY_NOT_FOUND' });
  }

  const hierarchy = ['working', 'short_term', 'long_term'];
  const currentIdx = hierarchy.indexOf(memory.layer);
  const targetIdx = hierarchy.indexOf(targetLayer);

  if (targetIdx < 0) {
    throw Object.assign(new Error('Invalid target layer'), { code: 'INVALID_LAYER' });
  }
  if (targetIdx <= currentIdx) {
    throw Object.assign(new Error('Can only promote to a higher layer'), { code: 'INVALID_PROMOTION' });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE memories SET layer = ?, updated_at = ? WHERE id = ?').run(targetLayer, now, memoryId);
  return getMemory(memoryId);
}

function pin(memoryId) {
  const db = getDb();
  const memory = db.prepare('SELECT id FROM memories WHERE id = ?').get(memoryId);
  if (!memory) {
    throw Object.assign(new Error('Memory not found'), { code: 'MEMORY_NOT_FOUND' });
  }
  const now = new Date().toISOString();
  db.prepare('UPDATE memories SET pinned = 1, updated_at = ? WHERE id = ?').run(now, memoryId);
  return getMemory(memoryId);
}

function unpin(memoryId) {
  const db = getDb();
  const memory = db.prepare('SELECT id FROM memories WHERE id = ?').get(memoryId);
  if (!memory) {
    throw Object.assign(new Error('Memory not found'), { code: 'MEMORY_NOT_FOUND' });
  }
  const now = new Date().toISOString();
  db.prepare('UPDATE memories SET pinned = 0, updated_at = ? WHERE id = ?').run(now, memoryId);
  return getMemory(memoryId);
}

function decay() {
  const db = getDb();
  const now = Date.now();
  let totalDecayed = 0;

  if (config.memoryLayers.working) {
    const cutoff = new Date(now - config.memoryLayers.working).toISOString();
    const result = db.prepare(
      "DELETE FROM memories WHERE layer = 'working' AND pinned = 0 AND accessed_at < ?"
    ).run(cutoff);
    totalDecayed += result.changes;
  }

  if (config.memoryLayers.shortTerm) {
    const cutoff = new Date(now - config.memoryLayers.shortTerm).toISOString();
    const result = db.prepare(
      "DELETE FROM memories WHERE layer = 'short_term' AND pinned = 0 AND accessed_at < ?"
    ).run(cutoff);
    totalDecayed += result.changes;
  }

  return { decayed: totalDecayed };
}

function buildContextWindow(nodeId, maxTokens) {
  const budget = maxTokens || config.maxContextTokens;
  let tokenCount = 0;
  const parts = [];
  const memoryList = [];

  const resolved = resolveContext(nodeId);
  if (resolved) {
    parts.push(resolved.resolvedContext);
    tokenCount += resolved.tokenCount;
  }

  const db = getDb();
  const node = db.prepare('SELECT project_id FROM nodes WHERE id = ?').get(nodeId);
  const projectId = node ? node.project_id : null;

  const pinnedConditions = ['pinned = 1'];
  const pinnedParams = [];
  if (projectId) {
    pinnedConditions.push('(node_id = ? OR project_id = ?)');
    pinnedParams.push(nodeId, projectId);
  } else {
    pinnedConditions.push('node_id = ?');
    pinnedParams.push(nodeId);
  }
  const pinnedMemories = db.prepare(`
    SELECT * FROM memories WHERE ${pinnedConditions.join(' AND ')}
    ORDER BY accessed_at DESC
  `).all(...pinnedParams);

  for (const mem of pinnedMemories) {
    const tokens = estimateTokens(mem.content);
    if (tokenCount + tokens > budget) break;
    memoryList.push(parseMemory(mem));
    parts.push(`[pinned:${mem.category || 'memory'}] ${mem.content}`);
    tokenCount += tokens;
  }

  const workingMemories = db.prepare(`
    SELECT * FROM memories
    WHERE layer = 'working' AND pinned = 0 AND (node_id = ? OR project_id = ?)
    ORDER BY accessed_at DESC LIMIT 20
  `).all(nodeId, projectId);

  for (const mem of workingMemories) {
    const tokens = estimateTokens(mem.content);
    if (tokenCount + tokens > budget) break;
    memoryList.push(parseMemory(mem));
    parts.push(`[working:${mem.category || 'memory'}] ${mem.content}`);
    tokenCount += tokens;
  }

  const longTermMemories = db.prepare(`
    SELECT * FROM memories
    WHERE layer = 'long_term' AND pinned = 0 AND (node_id = ? OR project_id = ?)
    ORDER BY accessed_at DESC LIMIT 20
  `).all(nodeId, projectId);

  for (const mem of longTermMemories) {
    const tokens = estimateTokens(mem.content);
    if (tokenCount + tokens > budget) break;
    memoryList.push(parseMemory(mem));
    parts.push(`[long_term:${mem.category || 'memory'}] ${mem.content}`);
    tokenCount += tokens;
  }

  return {
    context: parts.join('\n\n'),
    memories: memoryList,
    tokenCount
  };
}

function search(query, options = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];

  conditions.push('content LIKE ?');
  params.push(`%${query}%`);

  if (options.projectId) {
    conditions.push('project_id = ?');
    params.push(options.projectId);
  }

  const limit = options.limit || 50;
  const where = conditions.join(' AND ');

  return db.prepare(`
    SELECT * FROM memories WHERE ${where}
    ORDER BY pinned DESC, accessed_at DESC LIMIT ?
  `).all(...params, limit).map(parseMemory);
}

function updateMemory(id, data) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM memories WHERE id = ?').get(id);
  if (!existing) {
    throw Object.assign(new Error('Memory not found'), { code: 'MEMORY_NOT_FOUND' });
  }

  const fields = [];
  const values = [];

  if (data.content !== undefined) { fields.push('content = ?'); values.push(data.content); }
  if (data.category !== undefined) { fields.push('category = ?'); values.push(data.category); }
  if (data.metadata !== undefined) { fields.push('metadata = ?'); values.push(JSON.stringify(data.metadata)); }
  if (data.layer !== undefined) { fields.push('layer = ?'); values.push(data.layer); }

  if (fields.length === 0) return getMemory(id);

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE memories SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getMemory(id);
}

function deleteMemory(id) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM memories WHERE id = ?').get(id);
  if (!existing) {
    throw Object.assign(new Error('Memory not found'), { code: 'MEMORY_NOT_FOUND' });
  }
  db.prepare('DELETE FROM memories WHERE id = ?').run(id);
  return { deleted: true };
}

function parseMemory(row) {
  return {
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    pinned: !!row.pinned
  };
}

module.exports = {
  store,
  recall,
  promote,
  pin,
  unpin,
  decay,
  buildContextWindow,
  search,
  getMemory,
  updateMemory,
  deleteMemory
};
