'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db');
const config = require('../config');

module.exports = function registerAgentRoutes(router, auth) {

  router.get('/api/agents', auth, (req, res) => {
    const db = getDb();
    const conditions = [];
    const params = [];

    if (req.query.module) {
      conditions.push('module = ?');
      params.push(req.query.module);
    }
    if (req.query.active !== undefined) {
      conditions.push('active = ?');
      params.push(req.query.active === 'true' ? 1 : 0);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const data = db.prepare(`SELECT * FROM agents ${where} ORDER BY module, name`).all(...params).map(parseAgent);
    sendJson(res, 200, { data, total: data.length });
  });

  router.post('/api/agents', auth, (req, res) => {
    const { name, displayName, module: mod, sourcePath, persona, capabilities } = req.body;
    if (!name) {
      return sendError(res, 400, 'name is required', 'MISSING_FIELDS');
    }
    try {
      const db = getDb();
      const id = req.body.id || crypto.randomUUID();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO agents (id, name, display_name, module, source_path, persona, capabilities, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        id, name,
        displayName || null,
        mod || null,
        sourcePath || null,
        persona || null,
        capabilities ? JSON.stringify(capabilities) : null,
        now, now
      );

      const data = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
      sendJson(res, 201, { data: parseAgent(data) });
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        return sendError(res, 409, 'Agent already exists', 'DUPLICATE');
      }
      sendError(res, 500, err.message, err.code || 'CREATE_FAILED');
    }
  });

  router.get('/api/agents/:id', auth, (req, res) => {
    const db = getDb();
    const data = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
    if (!data) return sendError(res, 404, 'Agent not found', 'NOT_FOUND');
    sendJson(res, 200, { data: parseAgent(data) });
  });

  router.put('/api/agents/:id', auth, (req, res) => {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM agents WHERE id = ?').get(req.params.id);
    if (!existing) return sendError(res, 404, 'Agent not found', 'NOT_FOUND');

    const fields = [];
    const values = [];

    if (req.body.name !== undefined) { fields.push('name = ?'); values.push(req.body.name); }
    if (req.body.displayName !== undefined) { fields.push('display_name = ?'); values.push(req.body.displayName); }
    if (req.body.module !== undefined) { fields.push('module = ?'); values.push(req.body.module); }
    if (req.body.sourcePath !== undefined) { fields.push('source_path = ?'); values.push(req.body.sourcePath); }
    if (req.body.persona !== undefined) { fields.push('persona = ?'); values.push(req.body.persona); }
    if (req.body.capabilities !== undefined) { fields.push('capabilities = ?'); values.push(JSON.stringify(req.body.capabilities)); }
    if (req.body.active !== undefined) { fields.push('active = ?'); values.push(req.body.active ? 1 : 0); }
    if (req.body.soulHash !== undefined) { fields.push('soul_hash = ?'); values.push(req.body.soulHash); }

    if (fields.length === 0) {
      const data = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
      return sendJson(res, 200, { data: parseAgent(data) });
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(req.params.id);

    db.prepare(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const data = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
    sendJson(res, 200, { data: parseAgent(data) });
  });

  router.delete('/api/agents/:id', auth, (req, res) => {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM agents WHERE id = ?').get(req.params.id);
    if (!existing) return sendError(res, 404, 'Agent not found', 'NOT_FOUND');
    db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id);
    sendJson(res, 200, { data: { deleted: true } });
  });

  router.post('/api/agents/scan', auth, (req, res) => {
    try {
      const results = scanAndRegisterAgents();
      sendJson(res, 200, { data: results });
    } catch (err) {
      sendError(res, 500, err.message, err.code || 'SCAN_FAILED');
    }
  });
};

function scanAndRegisterAgents() {
  const db = getDb();
  const bmadRoot = path.join(config.projectRoot, '_bmad');
  const modules = ['core', 'bmm', 'bmb', 'tea', 'cis'];
  const results = { scanned: 0, registered: 0, updated: 0, agents: [] };

  for (const mod of modules) {
    const agentsDir = path.join(bmadRoot, mod, 'agents');
    if (!fs.existsSync(agentsDir)) continue;

    const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      results.scanned++;
      const filePath = path.join(agentsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = parseAgentFile(content, file, mod);
      const agentId = `${mod}-${parsed.name}`;
      const soulHash = crypto.createHash('sha256').update(content).digest('hex');

      const existing = db.prepare('SELECT id, soul_hash FROM agents WHERE id = ?').get(agentId);

      if (existing) {
        if (existing.soul_hash !== soulHash) {
          db.prepare(`
            UPDATE agents SET display_name = ?, persona = ?, soul_hash = ?, source_path = ?, updated_at = ?
            WHERE id = ?
          `).run(parsed.displayName, parsed.persona, soulHash, filePath, new Date().toISOString(), agentId);
          results.updated++;
        }
      } else {
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO agents (id, name, display_name, module, source_path, persona, soul_hash, active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(agentId, parsed.name, parsed.displayName, mod, filePath, parsed.persona, soulHash, now, now);
        results.registered++;
      }

      results.agents.push({ id: agentId, name: parsed.name, module: mod });
    }
  }

  return results;
}

function parseAgentFile(content, filename, module) {
  const name = filename.replace(/\.md$/, '');
  let displayName = name;
  let persona = null;

  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch) displayName = titleMatch[1].trim();

  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const fm = frontmatterMatch[1];
    const nameMatch = fm.match(/^name:\s*(.+)$/m);
    if (nameMatch) displayName = nameMatch[1].trim();
    const descMatch = fm.match(/^description:\s*(.+)$/m);
    if (descMatch) persona = descMatch[1].trim();
  }

  if (!persona) {
    const personaMatch = content.match(/<persona>([\s\S]*?)<\/persona>/);
    if (personaMatch) {
      persona = personaMatch[1].trim().substring(0, 500);
    }
  }

  return { name, displayName, persona };
}

function parseAgent(row) {
  return {
    ...row,
    capabilities: row.capabilities ? JSON.parse(row.capabilities) : null,
    active: !!row.active
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendError(res, status, message, code) {
  sendJson(res, status, { error: message, code });
}
