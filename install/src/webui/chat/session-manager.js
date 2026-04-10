/**
 * Chat session persistence -- save, load, list, export conversations.
 * Stores under {projectRoot}/_byan/_memory/chat-sessions/
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SessionManager {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.sessionsDir = path.join(projectRoot, '_byan', '_memory', 'chat-sessions');
    this.sessions = new Map();
    this._ensureDir();
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(this.sessionsDir)) {
        fs.mkdirSync(this.sessionsDir, { recursive: true });
      }
    } catch { /* best effort */ }
  }

  _generateId() {
    const ts = Date.now().toString(36);
    const rand = crypto.randomBytes(4).toString('hex');
    return `chat-${ts}-${rand}`;
  }

  create(cliName, agentName) {
    const id = this._generateId();
    const session = {
      id,
      cli: cliName || 'claude',
      agent: agentName || null,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      messages: [],
    };

    this.sessions.set(id, session);
    this._saveToDisk(session);
    return session;
  }

  addMessage(sessionId, role, content, metadata = {}) {
    const session = this._getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    session.messages.push({
      role,
      content,
      timestamp: new Date().toISOString(),
      ...metadata,
    });

    session.updated = new Date().toISOString();
    this._saveToDisk(session);
  }

  save(sessionId) {
    const session = this._getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    this._saveToDisk(session);
  }

  load(sessionId) {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId);
    }

    const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      this.sessions.set(sessionId, data);
      return data;
    } catch {
      return null;
    }
  }

  list() {
    this._loadAllFromDisk();

    const summaries = [];
    for (const session of this.sessions.values()) {
      const lastMsg = session.messages[session.messages.length - 1];
      summaries.push({
        id: session.id,
        cli: session.cli,
        agent: session.agent,
        created: session.created,
        updated: session.updated,
        messageCount: session.messages.length,
        lastMessage: lastMsg
          ? lastMsg.content.slice(0, 100)
          : null,
      });
    }

    summaries.sort((a, b) => b.updated.localeCompare(a.updated));
    return summaries;
  }

  delete(sessionId) {
    this.sessions.delete(sessionId);
    const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch { /* best effort */ }
  }

  exportJSON(sessionId) {
    const session = this._getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    return JSON.stringify(session, null, 2);
  }

  exportMarkdown(sessionId) {
    const session = this._getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const lines = [
      `# Chat Session: ${session.id}`,
      '',
      `- **CLI:** ${session.cli}`,
      `- **Agent:** ${session.agent || 'none'}`,
      `- **Created:** ${session.created}`,
      '',
      '---',
      '',
    ];

    for (const msg of session.messages) {
      const label = msg.role === 'user' ? 'User' : 'Assistant';
      lines.push(`### ${label} (${msg.timestamp})`);
      lines.push('');
      lines.push(msg.content);
      lines.push('');
    }

    return lines.join('\n');
  }

  getSession(sessionId) {
    return this._getSession(sessionId);
  }

  _getSession(sessionId) {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId);
    }
    return this.load(sessionId);
  }

  _saveToDisk(session) {
    try {
      this._ensureDir();
      const filePath = path.join(this.sessionsDir, `${session.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf8');
    } catch { /* best effort */ }
  }

  _loadAllFromDisk() {
    try {
      if (!fs.existsSync(this.sessionsDir)) return;
      const files = fs.readdirSync(this.sessionsDir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        const id = file.replace(/\.json$/, '');
        if (!this.sessions.has(id)) {
          try {
            const data = JSON.parse(
              fs.readFileSync(path.join(this.sessionsDir, file), 'utf8')
            );
            this.sessions.set(id, data);
          } catch { /* skip corrupted */ }
        }
      }
    } catch { /* best effort */ }
  }
}

module.exports = SessionManager;
