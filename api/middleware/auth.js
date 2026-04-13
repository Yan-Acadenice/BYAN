'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = { N: 16384, r: 8, p: 1 };

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, SCRYPT_COST, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve, reject) => {
    const [salt, hash] = stored.split(':');
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, SCRYPT_COST, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(crypto.timingSafeEqual(Buffer.from(hash, 'hex'), derivedKey));
    });
  });
}

function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function resolveUserFromJwt(token, secret) {
  try {
    const payload = jwt.verify(token, secret);
    const db = getDb();
    const user = db.prepare(
      'SELECT id, username, role, active FROM users WHERE id = ?'
    ).get(payload.sub);
    if (!user || !user.active) return null;
    return { id: user.id, username: user.username, role: user.role };
  } catch {
    return null;
  }
}

function resolveUserFromApiKey(key) {
  const db = getDb();
  const keyHash = hashApiKey(key);
  const row = db.prepare(`
    SELECT ak.id as key_id, ak.user_id, ak.scopes, ak.expires_at,
           u.username, u.role, u.active
    FROM api_keys ak
    JOIN users u ON u.id = ak.user_id
    WHERE ak.key_hash = ?
  `).get(keyHash);

  if (!row || !row.active) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

  db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?')
    .run(new Date().toISOString(), row.key_id);

  return {
    id: row.user_id,
    username: row.username,
    role: row.role,
    apiKeyScopes: row.scopes ? JSON.parse(row.scopes) : null
  };
}

function sendUnauthorized(res, message, code) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message || 'Unauthorized', code: code || 'AUTH_REQUIRED' }));
}

function sendForbidden(res, message) {
  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message || 'Forbidden', code: 'FORBIDDEN' }));
}

function createAuth(config) {
  function extractUser(req) {
    const header = req.headers['authorization'];
    if (!header) return null;

    if (header.startsWith('Bearer ')) {
      return resolveUserFromJwt(header.slice(7), config.jwtSecret);
    }

    if (header.startsWith('ApiKey ')) {
      return resolveUserFromApiKey(header.slice(7));
    }

    return null;
  }

  function required(req, res, next) {
    const user = extractUser(req);
    if (!user) return sendUnauthorized(res);
    req.user = user;
    next();
  }

  function optional(req, res, next) {
    req.user = extractUser(req) || null;
    next();
  }

  function admin(req, res, next) {
    const user = extractUser(req);
    if (!user) return sendUnauthorized(res);
    if (user.role !== 'admin') return sendForbidden(res, 'Admin access required');
    req.user = user;
    next();
  }

  return { required, optional, admin };
}

module.exports = createAuth;
module.exports.hashPassword = hashPassword;
module.exports.verifyPassword = verifyPassword;
module.exports.hashApiKey = hashApiKey;
