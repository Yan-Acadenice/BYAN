/**
 * Chat session persistence -- save, load, list, export conversations.
 * Stores under the memory dir: Gen3 {projectRoot}/_byan/memoire/chat-sessions/
 * first, Gen2 {projectRoot}/_byan/_memory/chat-sessions/ fallback (resolved via
 * the layout resolver so reads/writes survive the Gen2->Gen3 FS migration).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const layoutResolver = require('../../../../src/byan-v2/lib/layout-resolver');

class SessionManager {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.sessionsDir = layoutResolver.memoryPath('chat-sessions', { projectRoot }).path;
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

  // Session ids reach disk paths (load/delete). A resume request carries the id
  // from the client, so an unvalidated id like '../../../.ssh/id_rsa' would
  // escape sessionsDir via path.join. Only ids in our own generated shape are
  // allowed; anything else is rejected (no file touched).
  _isValidId(id) {
    return typeof id === 'string' && /^chat-[a-z0-9]+-[a-f0-9]+$/.test(id);
  }

  // opts.cwd     : the project directory the CLI runs in (per-session, F3/F4).
  // opts.claudeSessionId : the underlying claude CLI session id (F3). Usually
  //   filled later via setClaudeSessionId once the CLI reports it, so a future
  //   resume can pass --resume <id>.
  create(cliName, agentName, opts = {}) {
    const id = this._generateId();
    const session = {
      id,
      cli: cliName || 'claude',
      agent: agentName || null,
      cwd: opts.cwd || null,
      claudeSessionId: opts.claudeSessionId || null,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      messages: [],
    };

    this.sessions.set(id, session);
    this._saveToDisk(session);
    return session;
  }

  // Persist the underlying CLI session id (claude's own uuid) on the record so a
  // later start can resume it with --resume. No-op if the record is gone.
  setClaudeSessionId(sessionId, claudeSessionId) {
    const session = this._getSession(sessionId);
    if (!session || !claudeSessionId) return;
    if (session.claudeSessionId === claudeSessionId) return;
    session.claudeSessionId = claudeSessionId;
    session.updated = new Date().toISOString();
    this._saveToDisk(session);
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
    if (!this._isValidId(sessionId)) return null;
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
        cwd: session.cwd || null,
        // Resumable when the CLI reported its own session id at least once.
        resumable: Boolean(session.claudeSessionId),
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
    if (!this._isValidId(sessionId)) return;
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
