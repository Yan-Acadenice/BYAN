/**
 * SharedStateStore — SQLite-backed state for LoadBalancer
 *
 * Manages conversations, switchover events, rate limit logs, and
 * provider statistics. Shared between providers via MCP tools.
 *
 * Uses better-sqlite3 for synchronous, fast access.
 */

const fs = require('fs');
const path = require('path');

const MIGRATION_DIR = path.join(__dirname, 'migrations');

class SharedStateStore {
  /**
   * @param {string} dbPath - Path to SQLite database file
   */
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  /**
   * Initialize database and run migrations.
   */
  open() {
    let Database;
    try {
      Database = require('better-sqlite3');
    } catch {
      throw new Error('better-sqlite3 required for SharedStateStore. Run: npm install better-sqlite3');
    }

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this._runMigrations();
    return this;
  }

  _runMigrations() {
    const files = fs.readdirSync(MIGRATION_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATION_DIR, file), 'utf8');
      this.db.exec(sql);
    }
  }

  // --- Conversations ---

  createConversation(id, provider) {
    const stmt = this.db.prepare(
      'INSERT INTO lb_conversations (id, active_provider) VALUES (?, ?)'
    );
    stmt.run(id, provider);
    return this.getConversation(id);
  }

  getConversation(id) {
    return this.db.prepare('SELECT * FROM lb_conversations WHERE id = ?').get(id);
  }

  getActiveConversations() {
    return this.db.prepare(
      "SELECT * FROM lb_conversations WHERE status = 'active' ORDER BY updated_at DESC"
    ).all();
  }

  updateConversation(id, fields) {
    const allowed = ['active_provider', 'context_json', 'status'];
    const sets = [];
    const values = [];

    for (const [key, val] of Object.entries(fields)) {
      if (!allowed.includes(key)) continue;
      sets.push(`${key} = ?`);
      values.push(val);
    }

    if (sets.length === 0) return;

    sets.push("updated_at = datetime('now')");
    values.push(id);

    this.db.prepare(
      `UPDATE lb_conversations SET ${sets.join(', ')} WHERE id = ?`
    ).run(...values);
  }

  // --- Switchovers ---

  recordSwitchover({ conversationId, from, to, reason, contextSnapshot, fidelityPct }) {
    const stmt = this.db.prepare(`
      INSERT INTO lb_switchovers (conversation_id, from_provider, to_provider, reason, context_snapshot, context_fidelity_pct)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(conversationId, from, to, reason, contextSnapshot || null, fidelityPct || null);

    if (conversationId) {
      this.updateConversation(conversationId, {
        active_provider: to,
        status: 'active',
      });
    }

    this._updateProviderStat(from, { total_switchovers_from: 1 });
    this._updateProviderStat(to, { total_switchovers_to: 1 });

    return info.lastInsertRowid;
  }

  getSwitchoverHistory(limit = 20) {
    return this.db.prepare(
      'SELECT * FROM lb_switchovers ORDER BY switched_at DESC LIMIT ?'
    ).all(limit);
  }

  getSwitchoversForConversation(conversationId) {
    return this.db.prepare(
      'SELECT * FROM lb_switchovers WHERE conversation_id = ? ORDER BY switched_at'
    ).all(conversationId);
  }

  // --- Rate Limit Log ---

  logRateLimit({ provider, eventType, stateBefore, stateAfter, meta }) {
    const stmt = this.db.prepare(`
      INSERT INTO lb_rate_limit_log (provider, event_type, state_before, state_after, meta_json)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(provider, eventType, stateBefore, stateAfter, meta ? JSON.stringify(meta) : null);

    if (eventType === '429') {
      this._updateProviderStat(provider, { total_429s: 1 });
    }
  }

  getRateLimitLog(provider, limit = 50) {
    if (provider) {
      return this.db.prepare(
        'SELECT * FROM lb_rate_limit_log WHERE provider = ? ORDER BY logged_at DESC LIMIT ?'
      ).all(provider, limit);
    }
    return this.db.prepare(
      'SELECT * FROM lb_rate_limit_log ORDER BY logged_at DESC LIMIT ?'
    ).all(limit);
  }

  // --- Provider Stats ---

  recordRequest(provider, latencyMs) {
    this._ensureProviderStat(provider);
    const current = this.db.prepare('SELECT * FROM lb_provider_stats WHERE provider = ?').get(provider);

    const newTotal = current.total_requests + 1;
    const newAvg = ((current.avg_latency_ms * current.total_requests) + latencyMs) / newTotal;

    this.db.prepare(`
      UPDATE lb_provider_stats
      SET total_requests = ?, avg_latency_ms = ?, last_used_at = datetime('now'), updated_at = datetime('now')
      WHERE provider = ?
    `).run(newTotal, newAvg, provider);
  }

  getProviderStats() {
    return this.db.prepare('SELECT * FROM lb_provider_stats ORDER BY provider').all();
  }

  _ensureProviderStat(provider) {
    this.db.prepare(
      'INSERT OR IGNORE INTO lb_provider_stats (provider) VALUES (?)'
    ).run(provider);
  }

  _updateProviderStat(provider, increments) {
    this._ensureProviderStat(provider);
    const sets = [];
    const values = [];

    for (const [key, inc] of Object.entries(increments)) {
      sets.push(`${key} = ${key} + ?`);
      values.push(inc);
    }

    sets.push("updated_at = datetime('now')");
    values.push(provider);

    this.db.prepare(
      `UPDATE lb_provider_stats SET ${sets.join(', ')} WHERE provider = ?`
    ).run(...values);
  }

  // --- Lifecycle ---

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = { SharedStateStore };
