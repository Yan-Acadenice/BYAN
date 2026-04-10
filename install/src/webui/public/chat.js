/**
 * BYAN Chat — AI Agent Interface
 * Vanilla JS chat application. No frameworks, no build step.
 */

class ByanChat {
  constructor() {
    this.ws = null;
    this.wsRetryDelay = 1000;
    this.sessionId = null;
    this.currentAgent = null;
    this.currentCLI = null;
    this.currentModel = null;
    this.messages = [];
    this.agents = [];
    this.clis = [];
    this.sessions = [];
    this.pinnedMessages = new Set();
    this.splitView = false;
    this.voiceActive = false;
    this.attachedFiles = [];
    this.isStreaming = false;
    this.streamingMessageEl = null;
    this.streamingContent = '';
    this.pendingToolApproval = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.recognition = null;

    this.init();
  }

  async init() {
    this.cacheDOM();
    this.connectWebSocket();
    await Promise.all([
      this.detectCLIs(),
      this.loadAgents(),
      this.loadSessions()
    ]);
    this.setupEventListeners();
    this.autoGrowTextarea();
    this.restoreState();
  }

  cacheDOM() {
    this.dom = {
      messages: document.getElementById('messages'),
      welcomeScreen: document.getElementById('welcome-screen'),
      quickAgents: document.getElementById('quick-agents'),
      messageInput: document.getElementById('message-input'),
      btnSend: document.getElementById('btn-send'),
      btnVoice: document.getElementById('btn-voice'),
      btnAttach: document.getElementById('btn-attach'),
      btnSplit: document.getElementById('btn-split'),
      btnExport: document.getElementById('btn-export'),
      btnSettings: document.getElementById('btn-settings'),
      btnSidebar: document.getElementById('btn-sidebar'),
      btnImportAgent: document.getElementById('btn-import-agent'),
      sidebar: document.getElementById('sidebar'),
      sidebarOverlay: document.getElementById('sidebar-overlay'),
      agentList: document.getElementById('agent-list'),
      sessionList: document.getElementById('session-list'),
      cliStatus: document.getElementById('cli-status'),
      cliSelect: document.getElementById('cli-select'),
      modelSelect: document.getElementById('model-select'),
      agentIndicator: document.getElementById('agent-indicator'),
      activeAgentIcon: document.getElementById('active-agent-icon'),
      activeAgentName: document.getElementById('active-agent-name'),
      typingIndicator: document.getElementById('typing-indicator'),
      cliLabel: document.getElementById('cli-label'),
      charCount: document.getElementById('char-count'),
      splitPanel: document.getElementById('split-panel'),
      splitContent: document.getElementById('split-content'),
      toolApproval: document.getElementById('tool-approval'),
      toolName: document.getElementById('tool-name'),
      toolCommand: document.getElementById('tool-command'),
      attachPreview: document.getElementById('attach-preview'),
      attachInput: document.getElementById('attach-input')
    };
  }

  // ============================================================
  // WebSocket
  // ============================================================

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.wsRetryDelay = 1000;
      if (this.sessionId) {
        this.wsSend({ type: 'join', sessionId: this.sessionId });
      }
    };

    this.ws.onmessage = (event) => {
      try {
        this.handleWSMessage(JSON.parse(event.data));
      } catch { /* ignore malformed messages */ }
    };

    this.ws.onclose = () => this.scheduleReconnect();
    this.ws.onerror = () => {};
  }

  scheduleReconnect() {
    setTimeout(() => {
      this.wsRetryDelay = Math.min(this.wsRetryDelay * 1.5, 15000);
      this.connectWebSocket();
    }, this.wsRetryDelay);
  }

  wsSend(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  handleWSMessage(data) {
    switch (data.type) {
      case 'chat':
        this.appendChunk(data.chunk);
        if (data.raw) this.appendRawOutput(data.raw);
        break;
      case 'chat-complete':
        this.finishStreaming(data.fullResponse || this.streamingContent);
        break;
      case 'tool-approval':
        this.showToolApproval(data.tool, data.command);
        break;
      case 'chat-error':
      case 'error':
        this.handleChatError(data);
        break;
      case 'chat-tool':
        this.showToolUsage(data.tool);
        break;
      case 'raw-output':
        this.appendRawOutput(data.content);
        break;
      default:
        break;
    }
  }

  handleChatError(data) {
    const errorMsg = data.error || data.message || 'An error occurred';
    this.showToast(errorMsg, 'error');
    this.addMessage('system', `Error: ${errorMsg}`, { agent: 'System' });
    this.finishStreaming(this.streamingContent);
  }

  showToolUsage(tool) {
    if (!tool) return;
    const name = typeof tool === 'string' ? tool : tool.name || 'unknown tool';
    this.appendChunk(`\n> Using tool: **${name}**\n`);
  }

  // ============================================================
  // CLI Detection
  // ============================================================

  async detectCLIs() {
    const knownCLIs = [
      { id: 'claude', name: 'Claude Code', cmd: 'claude' },
      { id: 'copilot', name: 'GitHub Copilot', cmd: 'copilot' },
      { id: 'codex', name: 'OpenCode', cmd: 'codex' }
    ];

    try {
      const res = await fetch('/api/cli/detect');
      if (res.ok) {
        const data = await res.json();
        this.clis = (data.clis || []).map(cli => ({
          ...cli,
          available: cli.available || cli.detected || false
        }));
      }
    } catch {
      // API not available, use defaults with unknown status
      this.clis = knownCLIs.map(c => ({ ...c, available: false }));
    }

    if (this.clis.length === 0) {
      this.clis = knownCLIs.map(c => ({ ...c, available: false }));
    }

    this.renderCLIStatus();
    this.pickDefaultCLI();
  }

  renderCLIStatus() {
    this.dom.cliStatus.innerHTML = '';
    for (const cli of this.clis) {
      const cliId = cli.id || cli.name;
      const el = document.createElement('div');
      el.className = 'cli-item' + (cli.available ? ' available' : '') + (this.currentCLI === cliId ? ' active' : '');
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', `${cli.name}: ${cli.available ? 'available' : 'not detected'}`);
      el.innerHTML = `<span class="cli-dot"></span>${this.escapeHtml(cli.name)}`;
      el.addEventListener('click', () => this.selectCLI(cliId));
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.selectCLI(cliId); });
      this.dom.cliStatus.appendChild(el);
    }
    this.renderCLISelect();
  }

  renderCLISelect() {
    if (!this.dom.cliSelect) return;
    this.dom.cliSelect.innerHTML = '';
    for (const cli of this.clis) {
      const cliId = cli.id || cli.name;
      const opt = document.createElement('option');
      opt.value = cliId;
      opt.textContent = cli.name + (cli.available ? '' : ' (not detected)');
      opt.disabled = !cli.available;
      this.dom.cliSelect.appendChild(opt);
    }
    if (this.currentCLI) this.dom.cliSelect.value = this.currentCLI;
  }

  pickDefaultCLI() {
    const available = this.clis.filter(c => c.available);
    if (available.length > 0) {
      this.selectCLI(available[0].id || available[0].name);
    } else if (this.clis.length > 0) {
      this.selectCLI(this.clis[0].id || this.clis[0].name);
    }
  }

  selectCLI(id) {
    this.currentCLI = id;
    const cli = this.clis.find(c => (c.id || c.name) === id);
    if (this.dom.cliLabel) this.dom.cliLabel.textContent = cli ? cli.name : id;
    if (this.dom.cliSelect) this.dom.cliSelect.value = id;
    this.renderCLIStatus();
    this.saveState();
  }

  // ============================================================
  // Agent Management
  // ============================================================

  async loadAgents() {
    const defaultAgents = [
      { name: 'byan', title: 'BYAN', module: 'bmb', icon: '\u{1F916}', description: 'Agent builder' },
      { name: 'bmm-analyst', title: 'Analyst', module: 'bmm', icon: '\u{1F50D}', description: 'Requirements analysis' },
      { name: 'bmm-pm', title: 'PM', module: 'bmm', icon: '\u{1F4CB}', description: 'Product management' },
      { name: 'bmm-architect', title: 'Architect', module: 'bmm', icon: '\u{1F3D7}', description: 'System architecture' },
      { name: 'bmm-dev', title: 'Dev', module: 'bmm', icon: '\u{1F4BB}', description: 'Implementation' },
      { name: 'bmm-sm', title: 'SM', module: 'bmm', icon: '\u{1F3AF}', description: 'Scrum master' },
      { name: 'bmm-quinn', title: 'Quinn', module: 'bmm', icon: '\u{1F9EA}', description: 'Quality assurance' },
      { name: 'bmm-ux-designer', title: 'UX Designer', module: 'bmm', icon: '\u{1F3A8}', description: 'User experience' },
      { name: 'brainstorming-coach', title: 'Carson', module: 'cis', icon: '\u{1F4A1}', description: 'Creative brainstorming' },
      { name: 'tea-testarch', title: 'TEA', module: 'tea', icon: '\u{1F9F0}', description: 'Test architecture' },
      { name: 'bmad-master', title: 'BMAD Master', module: 'core', icon: '\u{2699}', description: 'Platform orchestrator' }
    ];

    try {
      const res = await fetch('/api/agents');
      if (res.ok) {
        const data = await res.json();
        if (data.agents && data.agents.length > 0) {
          this.agents = data.agents;
        } else {
          this.agents = defaultAgents;
        }
      } else {
        this.agents = defaultAgents;
      }
    } catch {
      this.agents = defaultAgents;
    }

    this.renderAgentList();
    this.renderQuickAgents();
  }

  renderAgentList() {
    this.dom.agentList.innerHTML = '';

    const grouped = {};
    for (const agent of this.agents) {
      const mod = agent.module || 'other';
      if (!grouped[mod]) grouped[mod] = [];
      grouped[mod].push(agent);
    }

    const moduleOrder = ['core', 'bmm', 'bmb', 'tea', 'cis', 'other'];
    const sortedModules = Object.keys(grouped).sort((a, b) => {
      const ia = moduleOrder.indexOf(a);
      const ib = moduleOrder.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    for (const mod of sortedModules) {
      const group = document.createElement('div');
      group.className = 'agent-group';

      const title = document.createElement('div');
      title.className = 'agent-group-title';
      title.textContent = mod.toUpperCase();
      group.appendChild(title);

      for (const agent of grouped[mod]) {
        const card = document.createElement('div');
        card.className = 'agent-card' + (this.currentAgent && this.currentAgent.name === agent.name ? ' active' : '');
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `Select agent ${agent.title || agent.name}`);
        card.dataset.agent = agent.name;

        card.innerHTML = `
          <div class="agent-card-icon">${agent.icon || '\u{1F916}'}</div>
          <div class="agent-card-info">
            <div class="agent-card-name">${this.escapeHtml(agent.title || agent.name)}</div>
            <div class="agent-card-desc">${this.escapeHtml(agent.description || '')}</div>
          </div>
          <span class="agent-card-badge">${this.escapeHtml(mod)}</span>
        `;

        card.addEventListener('click', () => this.selectAgent(agent.name));
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.selectAgent(agent.name); });
        group.appendChild(card);
      }

      this.dom.agentList.appendChild(group);
    }
  }

  renderQuickAgents() {
    const quickList = this.agents.slice(0, 4);
    this.dom.quickAgents.innerHTML = '';

    for (const agent of quickList) {
      const card = document.createElement('div');
      card.className = 'quick-agent-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `Start chat with ${agent.title || agent.name}`);
      card.innerHTML = `
        <span class="qa-icon">${agent.icon || '\u{1F916}'}</span>
        <span class="qa-name">${this.escapeHtml(agent.title || agent.name)}</span>
        <span class="qa-desc">${this.escapeHtml(agent.description || '')}</span>
      `;
      card.addEventListener('click', () => this.selectAgent(agent.name));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.selectAgent(agent.name); });
      this.dom.quickAgents.appendChild(card);
    }
  }

  selectAgent(name) {
    const agent = this.agents.find(a => a.name === name);
    if (!agent) return;

    this.currentAgent = agent;
    this.dom.activeAgentIcon.textContent = agent.icon || '\u{1F916}';
    this.dom.activeAgentName.textContent = agent.title || agent.name;
    this.dom.agentIndicator.classList.add('active');

    // Highlight in sidebar
    this.dom.agentList.querySelectorAll('.agent-card').forEach(el => {
      el.classList.toggle('active', el.dataset.agent === name);
    });

    this.startSession();
    this.closeSidebar();
    this.dom.messageInput.focus();
    this.saveState();
  }

  // ============================================================
  // Session Management
  // ============================================================

  async loadSessions() {
    try {
      const res = await fetch('/api/chat/sessions');
      if (res.ok) {
        const data = await res.json();
        this.sessions = data.sessions || [];
      }
    } catch {
      this.sessions = this.loadSessionsFromStorage();
    }
    this.renderSessions();
  }

  loadSessionsFromStorage() {
    try {
      return JSON.parse(localStorage.getItem('byan-chat-sessions') || '[]');
    } catch { return []; }
  }

  saveSessionsToStorage() {
    try {
      localStorage.setItem('byan-chat-sessions', JSON.stringify(this.sessions));
    } catch { /* storage full or unavailable */ }
  }

  renderSessions() {
    this.dom.sessionList.innerHTML = '';

    if (this.sessions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'session-item';
      empty.innerHTML = '<span class="session-item-title" style="color:var(--text-dim)">No conversations yet</span>';
      this.dom.sessionList.appendChild(empty);
      return;
    }

    const sorted = [...this.sessions].sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

    for (const session of sorted.slice(0, 20)) {
      const el = document.createElement('div');
      el.className = 'session-item' + (this.sessionId === session.id ? ' active' : '');
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');

      const title = session.title || session.agent || 'Untitled';
      const time = session.updatedAt ? this.formatRelativeTime(session.updatedAt) : '';

      el.innerHTML = `
        <span class="session-item-title">${this.escapeHtml(title)}</span>
        <span class="session-item-time">${this.escapeHtml(time)}</span>
        <button class="session-item-delete" title="Delete" aria-label="Delete conversation">&times;</button>
      `;

      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('session-item-delete')) {
          this.deleteSession(session.id);
        } else {
          this.loadSession(session.id);
        }
      });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.loadSession(session.id); });

      this.dom.sessionList.appendChild(el);
    }
  }

  async startSession() {
    const agentName = this.currentAgent ? this.currentAgent.name : null;
    let bridgeOk = false;

    try {
      const res = await fetch('/api/chat/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: agentName, cli: this.currentCLI, model: this.currentModel })
      });
      if (res.ok) {
        const data = await res.json();
        this.sessionId = data.sessionId || data.id || this.generateId();
        bridgeOk = true;
      } else {
        const err = await res.json().catch(() => ({}));
        const errMsg = err.error || `CLI bridge failed (${this.currentCLI || 'unknown'})`;
        this.showToast(errMsg, 'error');
        this.sessionId = this.generateId();
      }
    } catch (e) {
      this.showToast(`Cannot reach server: ${e.message || 'network error'}`, 'error');
      this.sessionId = this.generateId();
    }

    this.messages = [];
    this.clearMessages();

    const newSession = {
      id: this.sessionId,
      agent: agentName,
      title: this.currentAgent ? this.currentAgent.title : 'New chat',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.sessions.unshift(newSession);
    this.saveSessionsToStorage();
    this.renderSessions();

    if (this.currentAgent) {
      this.addMessage('system', `Session started with ${this.currentAgent.title || this.currentAgent.name}` +
        (bridgeOk ? ` via ${this.currentCLI || 'default CLI'}` : ' (offline mode — CLI bridge unavailable)'));
    } else if (!bridgeOk) {
      this.addMessage('system', 'Session started in offline mode — CLI bridge could not be initialized');
    }

    this.wsSend({ type: 'join', sessionId: this.sessionId });
    this.saveState();
  }

  async loadSession(id) {
    try {
      const res = await fetch(`/api/chat/session/${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = await res.json();
        this.sessionId = id;
        this.messages = data.messages || [];
        this.clearMessages();
        for (const msg of this.messages) {
          this.addMessage(msg.role, msg.content, msg.metadata, true);
        }
        this.wsSend({ type: 'join', sessionId: this.sessionId });
      }
    } catch {
      // Try loading from stored messages
      this.sessionId = id;
      this.clearMessages();
    }

    this.renderSessions();
    this.scrollToBottom();
    this.closeSidebar();
    this.saveState();
  }

  async deleteSession(id) {
    if (!confirm('Delete this conversation?')) return;

    try {
      await fetch(`/api/chat/session/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch { /* best effort */ }

    this.sessions = this.sessions.filter(s => s.id !== id);
    this.saveSessionsToStorage();

    if (this.sessionId === id) {
      this.sessionId = null;
      this.messages = [];
      this.clearMessages();
    }

    this.renderSessions();
  }

  // ============================================================
  // Messaging
  // ============================================================

  async send() {
    const text = this.dom.messageInput.value.trim();
    if (!text && this.attachedFiles.length === 0) return;
    if (this.isStreaming) return;

    if (!this.sessionId) {
      await this.startSession();
    }

    let fullMessage = text;
    if (this.attachedFiles.length > 0) {
      const fileHeaders = this.attachedFiles.map(f => `@${f.name}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');
      fullMessage = fileHeaders + (text ? '\n\n' + text : '');
      this.attachedFiles = [];
    }

    this.addMessage('user', fullMessage);
    this.dom.messageInput.value = '';
    this.dom.messageInput.style.height = 'auto';
    this.dom.charCount.textContent = '';

    this.startStreaming();

    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          message: fullMessage,
          agent: this.currentAgent ? this.currentAgent.name : null,
          cli: this.currentCLI,
          model: this.currentModel
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to send message' }));
        this.showToast(err.error || 'Failed to send message', 'error');
        this.finishStreaming('');
        return;
      }

      const data = await res.json();

      // If the API returns a direct response (non-streaming), display it
      if (data.response) {
        this.finishStreaming(data.response);
      }
      // Otherwise, response will come via WebSocket
    } catch (err) {
      this.showToast('Network error. Check your connection.', 'error');
      this.finishStreaming('');
    }
  }

  // ============================================================
  // Message Rendering
  // ============================================================

  addMessage(role, content, metadata, skipPush) {
    if (!skipPush) {
      this.messages.push({ role, content, metadata, timestamp: Date.now() });
      this.updateSessionTitle(content, role);
    }

    // Hide welcome screen once we have messages
    if (this.dom.welcomeScreen && this.messages.length > 0) {
      this.dom.welcomeScreen.classList.add('hidden');
    }

    const index = this.messages.length - 1;

    const el = document.createElement('div');
    el.className = `message ${role}`;
    el.dataset.index = index;

    const avatarLabel = role === 'user' ? 'Y' : role === 'system' ? '!' : (this.currentAgent ? this.currentAgent.icon || 'A' : 'A');

    const isPinned = this.pinnedMessages.has(index);
    const pinClass = isPinned ? ' pinned' : '';
    const pinIcon = isPinned ? '\u{1F4CC}' : '\u{1F4CC}';

    el.innerHTML = `
      <div class="message-avatar" aria-hidden="true">${avatarLabel}</div>
      <div class="message-body">
        <div class="content">${role === 'user' ? this.escapeHtml(content) : this.renderMarkdown(content)}</div>
        <div class="meta">
          <span>${this.escapeHtml((metadata && metadata.agent) || this.getAgentLabel(role))}</span>
          <span>${this.formatTime(metadata && metadata.timestamp ? metadata.timestamp : Date.now())}</span>
          ${isPinned ? '<span class="pin-indicator">\u{1F4CC} Pinned</span>' : ''}
        </div>
        ${role !== 'system' ? `
        <div class="actions">
          <button title="Copy" aria-label="Copy message" onclick="chat.copyMessage(${index})">&#x2398;</button>
          <button title="Pin" aria-label="Pin message" class="${pinClass}" onclick="chat.pinMessage(${index})">${pinIcon}</button>
          <button title="Fork" aria-label="Fork from here" onclick="chat.forkFromMessage(${index})">&#x2442;</button>
        </div>` : ''}
      </div>
    `;

    this.dom.messages.appendChild(el);
    this.scrollToBottom();

    return el;
  }

  clearMessages() {
    this.dom.messages.innerHTML = '';
    if (this.messages.length === 0 && this.dom.welcomeScreen) {
      this.dom.messages.appendChild(this.dom.welcomeScreen);
      this.dom.welcomeScreen.classList.remove('hidden');
    }
  }

  updateSessionTitle(content, role) {
    if (role !== 'user' || !this.sessionId) return;
    const session = this.sessions.find(s => s.id === this.sessionId);
    if (!session) return;

    // Use first user message as title
    const userMessages = this.messages.filter(m => m.role === 'user');
    if (userMessages.length === 1) {
      session.title = content.substring(0, 60) + (content.length > 60 ? '...' : '');
    }
    session.updatedAt = Date.now();
    this.saveSessionsToStorage();
    this.renderSessions();
  }

  getAgentLabel(role) {
    if (role === 'user') return 'You';
    if (role === 'system') return 'System';
    return this.currentAgent ? (this.currentAgent.title || this.currentAgent.name) : 'Assistant';
  }

  // ============================================================
  // Markdown Renderer
  // ============================================================

  renderMarkdown(text) {
    if (!text) return '';

    let html = this.escapeHtml(text);

    // Code blocks with optional language
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const langLabel = lang ? `<div class="code-block-header"><span class="code-lang">${lang}</span><button class="code-copy-btn" onclick="chat.copyCodeBlock(this)">Copy</button></div>` : '';
      return `${langLabel}<pre><code>${code}</code></pre>`;
    });

    // Inline code (must come after code blocks)
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headers
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');

    // Strikethrough
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // Blockquote
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Horizontal rule
    html = html.replace(/^---$/gm, '<hr>');

    // Links: [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // Unordered lists
    html = html.replace(/^(\s*)[-*] (.+)$/gm, (_, indent, item) => {
      const level = Math.floor(indent.length / 2);
      return `<li style="margin-left:${level}em">${item}</li>`;
    });
    html = html.replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // Ordered lists
    html = html.replace(/^(\s*)\d+\. (.+)$/gm, (_, indent, item) => {
      const level = Math.floor(indent.length / 2);
      return `<oli style="margin-left:${level}em">${item}</oli>`;
    });
    html = html.replace(/((?:<oli[^>]*>.*<\/oli>\n?)+)/g, (match) => {
      return '<ol>' + match.replace(/<\/?oli/g, (m) => m.replace('oli', 'li')) + '</ol>';
    });

    // Paragraphs (double newlines)
    html = html.replace(/\n\n+/g, '</p><p>');
    html = '<p>' + html + '</p>';

    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<p>(<h[1-6]>)/g, '$1');
    html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
    html = html.replace(/<p>(<pre>)/g, '$1');
    html = html.replace(/(<\/pre>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ol>)/g, '$1');
    html = html.replace(/(<\/ol>)<\/p>/g, '$1');
    html = html.replace(/<p>(<blockquote>)/g, '$1');
    html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');
    html = html.replace(/<p>(<hr>)/g, '$1');
    html = html.replace(/(<hr>)<\/p>/g, '$1');
    html = html.replace(/<p>(<div class="code-block-header">)/g, '$1');

    // Single newlines to <br>
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  copyCodeBlock(btnEl) {
    const pre = btnEl.closest('.code-block-header')
      ? btnEl.closest('.code-block-header').nextElementSibling
      : btnEl.closest('pre');
    if (!pre) return;
    const code = pre.querySelector('code') || pre;
    navigator.clipboard.writeText(code.textContent).then(() => {
      const orig = btnEl.textContent;
      btnEl.textContent = 'Copied!';
      setTimeout(() => { btnEl.textContent = orig; }, 1500);
    });
  }

  // ============================================================
  // Streaming
  // ============================================================

  startStreaming() {
    this.isStreaming = true;
    this.streamingContent = '';
    this.dom.typingIndicator.classList.remove('hidden');
    this.dom.btnSend.disabled = true;

    // Create empty assistant message
    const el = document.createElement('div');
    el.className = 'message assistant';
    el.dataset.index = this.messages.length;

    const avatarLabel = this.currentAgent ? (this.currentAgent.icon || 'A') : 'A';
    el.innerHTML = `
      <div class="message-avatar" aria-hidden="true">${avatarLabel}</div>
      <div class="message-body">
        <div class="content"><span class="streaming-cursor"></span></div>
        <div class="meta">
          <span>${this.escapeHtml(this.getAgentLabel('assistant'))}</span>
        </div>
      </div>
    `;

    this.dom.messages.appendChild(el);
    this.streamingMessageEl = el;
    this.scrollToBottom();
  }

  appendChunk(chunk) {
    if (!chunk || !this.streamingMessageEl) return;
    this.streamingContent += chunk;

    const contentEl = this.streamingMessageEl.querySelector('.content');
    if (contentEl) {
      contentEl.innerHTML = this.renderMarkdown(this.streamingContent) + '<span class="streaming-cursor"></span>';
    }
    this.scrollToBottom();
  }

  finishStreaming(fullResponse) {
    this.isStreaming = false;
    this.dom.typingIndicator.classList.add('hidden');
    this.dom.btnSend.disabled = false;

    const content = fullResponse || this.streamingContent;

    if (this.streamingMessageEl) {
      // Remove streaming message, add final rendered message
      this.streamingMessageEl.remove();
      this.streamingMessageEl = null;
    }

    if (content) {
      this.addMessage('assistant', content);
    }

    this.streamingContent = '';
    this.dom.messageInput.focus();
  }

  // ============================================================
  // Tool Approval
  // ============================================================

  showToolApproval(tool, command) {
    this.pendingToolApproval = { tool, command };
    this.dom.toolName.textContent = tool || 'Unknown tool';
    this.dom.toolCommand.textContent = command || '';
    this.dom.toolApproval.classList.remove('hidden');
  }

  approveTool() {
    this.wsSend({
      type: 'tool-response',
      sessionId: this.sessionId,
      approved: true,
      tool: this.pendingToolApproval ? this.pendingToolApproval.tool : null
    });
    this.dom.toolApproval.classList.add('hidden');
    this.pendingToolApproval = null;
  }

  denyTool() {
    this.wsSend({
      type: 'tool-response',
      sessionId: this.sessionId,
      approved: false,
      tool: this.pendingToolApproval ? this.pendingToolApproval.tool : null
    });
    this.dom.toolApproval.classList.add('hidden');
    this.pendingToolApproval = null;
    this.addMessage('system', 'Tool request denied.');
  }

  // ============================================================
  // Split View (Raw CLI Output)
  // ============================================================

  toggleSplit() {
    this.splitView = !this.splitView;
    this.dom.splitPanel.classList.toggle('hidden', !this.splitView);
  }

  appendRawOutput(text) {
    if (!text) return;
    this.dom.splitContent.textContent += text;
    this.dom.splitContent.scrollTop = this.dom.splitContent.scrollHeight;
  }

  closeSplit() {
    this.splitView = false;
    this.dom.splitPanel.classList.add('hidden');
  }

  // ============================================================
  // Voice Input
  // ============================================================

  async toggleVoice() {
    if (this.voiceActive) {
      this.stopVoice();
      return;
    }

    // Try server-side STT first
    try {
      const res = await fetch('/api/stt/status');
      if (res.ok) {
        const data = await res.json();
        if (data.available) {
          this.startServerVoice();
          return;
        }
      }
    } catch { /* fallback to browser */ }

    // Browser SpeechRecognition fallback
    this.startBrowserVoice();
  }

  startServerVoice() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.showToast('Microphone access not available', 'warning');
      return;
    }

    this.voiceActive = true;
    this.dom.btnVoice.classList.add('recording');
    this.audioChunks = [];

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      this.mediaRecorder = new MediaRecorder(stream);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };

      this.mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });

        try {
          const formData = new FormData();
          formData.append('audio', blob, 'voice.webm');

          const res = await fetch('/api/stt/transcribe', { method: 'POST', body: formData });
          if (res.ok) {
            const data = await res.json();
            if (data.text) {
              this.dom.messageInput.value += data.text;
              this.dom.messageInput.dispatchEvent(new Event('input'));
            }
          } else {
            this.showToast('Transcription failed', 'error');
          }
        } catch {
          this.showToast('Transcription failed', 'error');
        }
      };

      this.mediaRecorder.start();
    }).catch(() => {
      this.voiceActive = false;
      this.dom.btnVoice.classList.remove('recording');
      this.showToast('Microphone access denied', 'error');
    });
  }

  startBrowserVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.showToast('Speech recognition not supported in this browser', 'warning');
      return;
    }

    this.voiceActive = true;
    this.dom.btnVoice.classList.add('recording');

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'en-US';
    this.recognition.interimResults = true;
    this.recognition.continuous = false;

    let finalTranscript = '';

    this.recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      this.dom.messageInput.value = finalTranscript + interim;
      this.dom.messageInput.dispatchEvent(new Event('input'));
    };

    this.recognition.onend = () => {
      this.voiceActive = false;
      this.dom.btnVoice.classList.remove('recording');
      this.recognition = null;
    };

    this.recognition.onerror = () => {
      this.voiceActive = false;
      this.dom.btnVoice.classList.remove('recording');
      this.recognition = null;
    };

    this.recognition.start();
  }

  stopVoice() {
    this.voiceActive = false;
    this.dom.btnVoice.classList.remove('recording');

    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    if (this.recognition) {
      this.recognition.stop();
    }
  }

  // ============================================================
  // File Attachment
  // ============================================================

  showAttachModal() {
    this.openModal('modal-attach');
    this.dom.attachPreview.innerHTML = '';
    if (this.dom.attachInput) this.dom.attachInput.value = '';
  }

  handleAttachFiles(files) {
    this.dom.attachPreview.innerHTML = '';

    for (const file of files) {
      const item = document.createElement('div');
      item.className = 'attach-file-item';
      item.innerHTML = `
        <span class="attach-file-name">${this.escapeHtml(file.name)}</span>
        <span class="attach-file-size">${this.formatFileSize(file.size)}</span>
      `;
      this.dom.attachPreview.appendChild(item);
    }
  }

  async confirmAttach() {
    const input = this.dom.attachInput;
    if (!input || !input.files || input.files.length === 0) {
      this.closeModal('modal-attach');
      return;
    }

    const files = Array.from(input.files);
    for (const file of files) {
      try {
        const text = await this.readFileAsText(file);
        this.attachedFiles.push({ name: file.name, content: text, size: file.size });
      } catch {
        this.showToast(`Could not read ${file.name}`, 'warning');
      }
    }

    this.closeModal('modal-attach');

    if (this.attachedFiles.length > 0) {
      const names = this.attachedFiles.map(f => f.name).join(', ');
      this.dom.messageInput.placeholder = `Attached: ${names} — Type your message...`;
      this.dom.messageInput.focus();
    }
  }

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  // ============================================================
  // Import / Export
  // ============================================================

  async exportAs(format) {
    if (this.messages.length === 0) {
      this.showToast('No messages to export', 'warning');
      this.closeModal('modal-export');
      return;
    }

    let content, filename, mime;
    const agent = this.currentAgent ? this.currentAgent.name : 'unknown';
    const timestamp = new Date().toISOString().slice(0, 10);

    switch (format) {
      case 'json': {
        const data = {
          version: '1.0',
          agent,
          sessionId: this.sessionId,
          exportedAt: new Date().toISOString(),
          messages: this.messages
        };
        content = JSON.stringify(data, null, 2);
        filename = `byan-chat-${agent}-${timestamp}.json`;
        mime = 'application/json';
        break;
      }
      case 'markdown': {
        const lines = [`# BYAN Chat — ${agent}`, `*Exported: ${new Date().toLocaleString()}*`, ''];
        for (const msg of this.messages) {
          const label = msg.role === 'user' ? '**You**' : msg.role === 'system' ? '*System*' : `**${agent}**`;
          lines.push(`### ${label}`, '', msg.content, '');
        }
        content = lines.join('\n');
        filename = `byan-chat-${agent}-${timestamp}.md`;
        mime = 'text/markdown';
        break;
      }
      case 'template': {
        const prompts = this.messages.filter(m => m.role === 'user').map(m => m.content);
        content = JSON.stringify({ version: '1.0', agent, prompts }, null, 2);
        filename = `byan-template-${agent}-${timestamp}.json`;
        mime = 'application/json';
        break;
      }
      default:
        return;
    }

    this.downloadFile(content, filename, mime);
    this.closeModal('modal-export');
    this.showToast(`Exported as ${format}`, 'success');
  }

  downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  showImportModal() {
    this.openModal('modal-import');
  }

  async importFromFile(file) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/agents/import', { method: 'POST', body: formData });
      if (res.ok) {
        this.showToast('Agent imported successfully', 'success');
        await this.loadAgents();
      } else {
        const err = await res.json().catch(() => ({}));
        this.showToast(err.error || 'Import failed', 'error');
      }
    } catch {
      this.showToast('Import failed', 'error');
    }
    this.closeModal('modal-import');
  }

  async importFromURL() {
    const urlInput = document.getElementById('import-url');
    const url = urlInput ? urlInput.value.trim() : '';
    if (!url) {
      this.showToast('Please enter a URL', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/agents/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      if (res.ok) {
        this.showToast('Agent imported successfully', 'success');
        await this.loadAgents();
      } else {
        const err = await res.json().catch(() => ({}));
        this.showToast(err.error || 'Import failed', 'error');
      }
    } catch {
      this.showToast('Import failed', 'error');
    }
    this.closeModal('modal-import');
  }

  // ============================================================
  // Message Actions
  // ============================================================

  copyMessage(index) {
    const msg = this.messages[index];
    if (!msg) return;
    navigator.clipboard.writeText(msg.content).then(() => {
      this.showToast('Copied to clipboard', 'success');
    }).catch(() => {
      this.showToast('Failed to copy', 'error');
    });
  }

  pinMessage(index) {
    if (this.pinnedMessages.has(index)) {
      this.pinnedMessages.delete(index);
    } else {
      this.pinnedMessages.add(index);
    }

    // Re-render the specific message
    const el = this.dom.messages.querySelector(`.message[data-index="${index}"]`);
    if (el) {
      const pinBtn = el.querySelector('.actions button[title="Pin"]');
      if (pinBtn) {
        pinBtn.classList.toggle('pinned', this.pinnedMessages.has(index));
      }
      const meta = el.querySelector('.meta');
      if (meta) {
        const existing = meta.querySelector('.pin-indicator');
        if (this.pinnedMessages.has(index) && !existing) {
          const pin = document.createElement('span');
          pin.className = 'pin-indicator';
          pin.textContent = '\u{1F4CC} Pinned';
          meta.appendChild(pin);
        } else if (!this.pinnedMessages.has(index) && existing) {
          existing.remove();
        }
      }
    }
  }

  async forkFromMessage(index) {
    const messagesUpTo = this.messages.slice(0, index + 1);
    const oldSessionId = this.sessionId;

    await this.startSession();

    for (const msg of messagesUpTo) {
      this.addMessage(msg.role, msg.content, msg.metadata, true);
    }

    this.messages = [...messagesUpTo];
    this.addMessage('system', `Forked from message ${index + 1} of previous session.`);
    this.showToast('Conversation forked', 'success');
  }

  // ============================================================
  // Model Switching
  // ============================================================

  switchModel(model) {
    this.currentModel = model || null;
    this.saveState();

    if (this.sessionId) {
      this.wsSend({
        type: 'config',
        sessionId: this.sessionId,
        model: this.currentModel
      });
    }
  }

  // ============================================================
  // UI Helpers
  // ============================================================

  autoGrowTextarea() {
    const textarea = this.dom.messageInput;
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
      this.dom.charCount.textContent = textarea.value.length > 0 ? `${textarea.value.length}` : '';
    });
  }

  scrollToBottom() {
    requestAnimationFrame(() => {
      this.dom.messages.scrollTop = this.dom.messages.scrollHeight;
    });
  }

  openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.remove('hidden');
      const firstInput = modal.querySelector('input, button, select, textarea');
      if (firstInput) firstInput.focus();
    }
  }

  closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('hidden');
  }

  closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  }

  toggleSidebar() {
    this.dom.sidebar.classList.toggle('open');
    this.dom.sidebarOverlay.classList.toggle('hidden', !this.dom.sidebar.classList.contains('open'));
  }

  closeSidebar() {
    this.dom.sidebar.classList.remove('open');
    this.dom.sidebarOverlay.classList.add('hidden');
  }

  showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type || ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
  }

  // ============================================================
  // Event Listeners
  // ============================================================

  setupEventListeners() {
    // Send button
    this.dom.btnSend.addEventListener('click', () => this.send());

    // Textarea keyboard
    this.dom.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.send();
      }
    });

    // Topbar buttons
    this.dom.btnSplit.addEventListener('click', () => this.toggleSplit());
    this.dom.btnExport.addEventListener('click', () => this.openModal('modal-export'));
    this.dom.btnSettings.addEventListener('click', () => this.openModal('modal-settings'));
    this.dom.btnSidebar.addEventListener('click', () => this.toggleSidebar());
    this.dom.btnImportAgent.addEventListener('click', () => this.showImportModal());

    // Voice & attach
    this.dom.btnVoice.addEventListener('click', () => this.toggleVoice());
    this.dom.btnAttach.addEventListener('click', () => this.showAttachModal());

    // Model select
    this.dom.modelSelect.addEventListener('change', (e) => this.switchModel(e.target.value));

    // CLI select
    if (this.dom.cliSelect) {
      this.dom.cliSelect.addEventListener('change', (e) => this.selectCLI(e.target.value));
    }

    // Sidebar overlay (close on click)
    this.dom.sidebarOverlay.addEventListener('click', () => this.closeSidebar());

    // Attach input change
    if (this.dom.attachInput) {
      this.dom.attachInput.addEventListener('change', (e) => this.handleAttachFiles(e.target.files));
    }

    // File import via file-input in import modal
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) this.importFromFile(e.target.files[0]);
      });
    }

    // Drag and drop on import modal
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) this.importFromFile(e.dataTransfer.files[0]);
      });
    }

    // Global drag-drop for file attachment
    document.body.addEventListener('dragover', (e) => e.preventDefault());
    document.body.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files);
        this.attachDroppedFiles(files);
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Escape closes modals
      if (e.key === 'Escape') {
        this.closeAllModals();
        this.closeSidebar();
      }

      // Ctrl+/ toggles sidebar
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        this.toggleSidebar();
      }

      // Ctrl+Shift+E export
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        this.openModal('modal-export');
      }

      // Ctrl+N new chat
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        this.startSession();
      }
    });

    // Close modals on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
        }
      });
    });
  }

  async attachDroppedFiles(files) {
    for (const file of files) {
      try {
        const text = await this.readFileAsText(file);
        this.attachedFiles.push({ name: file.name, content: text, size: file.size });
      } catch {
        this.showToast(`Could not read ${file.name}`, 'warning');
      }
    }

    if (this.attachedFiles.length > 0) {
      const names = this.attachedFiles.map(f => f.name).join(', ');
      this.dom.messageInput.placeholder = `Attached: ${names} — Type your message...`;
      this.dom.messageInput.focus();
      this.showToast(`${files.length} file(s) attached`, 'success');
    }
  }

  // ============================================================
  // Conversation Fork
  // ============================================================

  async forkConversation(atMessageIndex) {
    return this.forkFromMessage(atMessageIndex);
  }

  // ============================================================
  // State Persistence
  // ============================================================

  saveState() {
    try {
      localStorage.setItem('byan-chat-state', JSON.stringify({
        currentCLI: this.currentCLI,
        currentModel: this.currentModel,
        currentAgent: this.currentAgent ? this.currentAgent.name : null,
        sessionId: this.sessionId
      }));
    } catch { /* ignore */ }
  }

  restoreState() {
    try {
      const state = JSON.parse(localStorage.getItem('byan-chat-state') || '{}');

      if (state.currentCLI) this.selectCLI(state.currentCLI);
      if (state.currentModel) {
        this.currentModel = state.currentModel;
        this.dom.modelSelect.value = state.currentModel;
      }
      if (state.currentAgent) {
        const agent = this.agents.find(a => a.name === state.currentAgent);
        if (agent) {
          this.currentAgent = agent;
          this.dom.activeAgentIcon.textContent = agent.icon || '\u{1F916}';
          this.dom.activeAgentName.textContent = agent.title || agent.name;
          this.dom.agentIndicator.classList.add('active');
          this.dom.agentList.querySelectorAll('.agent-card').forEach(el => {
            el.classList.toggle('active', el.dataset.agent === agent.name);
          });
        }
      }
      if (state.sessionId) {
        this.loadSession(state.sessionId);
      }
    } catch { /* ignore */ }
  }

  // ============================================================
  // Utility
  // ============================================================

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  generateId() {
    return 'byan-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
  }

  formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  formatRelativeTime(ts) {
    const diff = Date.now() - ts;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) return new Date(ts).toLocaleDateString();
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  }

  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}

// Initialize
const chat = new ByanChat();
