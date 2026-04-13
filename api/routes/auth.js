'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');
const config = require('../config');
const { hashPassword, verifyPassword, hashApiKey } = require('../middleware/auth');

module.exports = function registerAuthRoutes(router, noAuth, auth) {
  router.post('/api/auth/register', noAuth, async (req, res) => {
    const { username, password, displayName, email } = req.body;

    if (!username || !password) {
      return sendError(res, 400, 'username and password are required', 'MISSING_FIELDS');
    }

    if (password.length < 8) {
      return sendError(res, 400, 'Password must be at least 8 characters', 'WEAK_PASSWORD');
    }

    try {
      const db = getDb();
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (existing) {
        return sendError(res, 409, 'Username already taken', 'USERNAME_EXISTS');
      }

      const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
      const role = userCount === 0 ? 'admin' : 'user';

      const id = crypto.randomUUID();
      const passwordHash = await hashPassword(password);
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO users (id, username, display_name, email, password_hash, role, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(id, username, displayName || null, email || null, passwordHash, role, now, now);

      const token = jwt.sign({ sub: id, username, role }, config.jwtSecret, { expiresIn: config.jwtExpiry });

      sendJson(res, 201, {
        data: { id, username, displayName: displayName || null, email: email || null, role },
        token
      });
    } catch (err) {
      sendError(res, 500, err.message, 'REGISTER_FAILED');
    }
  });

  router.post('/api/auth/login', noAuth, async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return sendError(res, 400, 'username and password are required', 'MISSING_FIELDS');
    }

    try {
      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      if (!user || !user.active) {
        return sendError(res, 401, 'Invalid credentials', 'INVALID_CREDENTIALS');
      }

      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        return sendError(res, 401, 'Invalid credentials', 'INVALID_CREDENTIALS');
      }

      const token = jwt.sign(
        { sub: user.id, username: user.username, role: user.role },
        config.jwtSecret,
        { expiresIn: config.jwtExpiry }
      );

      sendJson(res, 200, {
        data: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          email: user.email,
          role: user.role
        },
        token
      });
    } catch (err) {
      sendError(res, 500, err.message, 'LOGIN_FAILED');
    }
  });

  router.post('/api/auth/refresh', auth.required, (req, res) => {
    const db = getDb();
    const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(req.user.id);
    if (!user) return sendError(res, 401, 'User not found', 'INVALID_USER');

    const token = jwt.sign(
      { sub: user.id, username: user.username, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiry }
    );

    sendJson(res, 200, { token });
  });

  router.get('/api/auth/me', auth.required, (req, res) => {
    const db = getDb();
    const user = db.prepare(
      'SELECT id, username, display_name, email, role, created_at FROM users WHERE id = ?'
    ).get(req.user.id);

    if (!user) return sendError(res, 404, 'User not found', 'NOT_FOUND');

    sendJson(res, 200, {
      data: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        email: user.email,
        role: user.role,
        createdAt: user.created_at
      }
    });
  });

  router.put('/api/auth/me', auth.required, (req, res) => {
    const { displayName, email } = req.body;
    const db = getDb();
    const fields = [];
    const values = [];

    if (displayName !== undefined) { fields.push('display_name = ?'); values.push(displayName); }
    if (email !== undefined) { fields.push('email = ?'); values.push(email); }

    if (fields.length === 0) {
      return sendError(res, 400, 'No fields to update', 'NO_CHANGES');
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(req.user.id);

    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare(
      'SELECT id, username, display_name, email, role FROM users WHERE id = ?'
    ).get(req.user.id);

    sendJson(res, 200, {
      data: {
        id: updated.id,
        username: updated.username,
        displayName: updated.display_name,
        email: updated.email,
        role: updated.role
      }
    });
  });

  router.post('/api/auth/change-password', auth.required, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return sendError(res, 400, 'currentPassword and newPassword are required', 'MISSING_FIELDS');
    }

    if (newPassword.length < 8) {
      return sendError(res, 400, 'New password must be at least 8 characters', 'WEAK_PASSWORD');
    }

    try {
      const db = getDb();
      const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);

      const valid = await verifyPassword(currentPassword, user.password_hash);
      if (!valid) {
        return sendError(res, 401, 'Current password is incorrect', 'INVALID_PASSWORD');
      }

      const newHash = await hashPassword(newPassword);
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
        .run(newHash, new Date().toISOString(), req.user.id);

      sendJson(res, 200, { data: { changed: true } });
    } catch (err) {
      sendError(res, 500, err.message, 'PASSWORD_CHANGE_FAILED');
    }
  });

  // --- API Keys ---

  router.get('/api/auth/api-keys', auth.required, (req, res) => {
    const db = getDb();
    const keys = db.prepare(
      'SELECT id, name, scopes, last_used_at, expires_at, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC'
    ).all(req.user.id);

    const data = keys.map(k => ({
      ...k,
      scopes: k.scopes ? JSON.parse(k.scopes) : null
    }));

    sendJson(res, 200, { data });
  });

  router.post('/api/auth/api-keys', auth.required, (req, res) => {
    const { name, scopes, expiresAt } = req.body;
    if (!name) {
      return sendError(res, 400, 'name is required', 'MISSING_FIELDS');
    }

    const rawKey = `byan_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = hashApiKey(rawKey);
    const id = crypto.randomUUID();

    const db = getDb();
    db.prepare(`
      INSERT INTO api_keys (id, user_id, name, key_hash, scopes, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.user.id,
      name,
      keyHash,
      scopes ? JSON.stringify(scopes) : null,
      expiresAt || null,
      new Date().toISOString()
    );

    sendJson(res, 201, { data: { id, name, key: rawKey } });
  });

  router.delete('/api/auth/api-keys/:id', auth.required, (req, res) => {
    const db = getDb();
    const existing = db.prepare(
      'SELECT id FROM api_keys WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!existing) return sendError(res, 404, 'API key not found', 'NOT_FOUND');

    db.prepare('DELETE FROM api_keys WHERE id = ?').run(req.params.id);
    sendJson(res, 200, { data: { deleted: true } });
  });
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendError(res, status, message, code) {
  sendJson(res, status, { error: message, code });
}
