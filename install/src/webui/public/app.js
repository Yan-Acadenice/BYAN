class ByanApp {
  constructor() {
    this.currentStep = 'welcome';
    this.stepHistory = [];
    this.ws = null;
    this.wsRetryDelay = 1000;
    this.config = {
      mode: 'auto',
      userName: '',
      language: 'English',
      platforms: [],
      modules: ['core', 'bmm']
    };
    this.status = null;
    this.logCount = 0;
    this.logsExpanded = false;

    this.connectWebSocket();
  }

  // --- WebSocket ---

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${window.location.host}`);

    this.ws.onopen = () => {
      this.wsRetryDelay = 1000;
    };

    this.ws.onmessage = (event) => {
      try {
        this.handleWSMessage(JSON.parse(event.data));
      } catch { /* malformed message */ }
    };

    this.ws.onclose = () => {
      setTimeout(() => {
        this.wsRetryDelay = Math.min(this.wsRetryDelay * 1.5, 10000);
        this.connectWebSocket();
      }, this.wsRetryDelay);
    };

    this.ws.onerror = () => {};
  }

  handleWSMessage(data) {
    switch (data.type) {
      case 'log':
        this.addLog(data);
        break;
      case 'progress':
        this.updateProgress(data);
        break;
      case 'complete':
        this.showComplete(data);
        break;
    }
  }

  // --- Navigation ---

  showStep(stepId) {
    if (this.currentStep !== stepId) {
      this.stepHistory.push(this.currentStep);
    }

    document.querySelectorAll('.step').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(`step-${stepId}`);
    if (target) {
      target.classList.remove('hidden');
      target.focus();
    }

    this.currentStep = stepId;
    this.updateWizardNav();
  }

  goBack() {
    const prev = this.stepHistory.pop();
    if (prev) {
      document.querySelectorAll('.step').forEach(el => el.classList.add('hidden'));
      const target = document.getElementById(`step-${prev}`);
      if (target) target.classList.remove('hidden');
      this.currentStep = prev;
      this.updateWizardNav();
    }
  }

  updateWizardNav() {
    const stepOrder = ['welcome', 'detection', 'mode', 'config', 'preview', 'progress', 'done'];
    const currentIdx = stepOrder.indexOf(this.currentStep);

    document.querySelectorAll('.wizard-step').forEach(el => {
      const step = el.dataset.step;
      const idx = stepOrder.indexOf(step);

      el.classList.remove('active', 'completed');
      if (idx < currentIdx) {
        el.classList.add('completed');
      } else if (idx === currentIdx) {
        el.classList.add('active');
      }
    });
  }

  // --- Install Flow ---

  async startInstall() {
    this.showStep('detection');
    await this.runDetection();
  }

  async runDetection() {
    const container = document.getElementById('detection-results');
    const nextBtn = document.getElementById('btn-detection-next');

    try {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.status = await res.json();

      let html = '';

      html += this.detectionRow(true, 'Node.js', this.status.detection?.nodeVersion || process.version || 'detected');
      html += this.detectionRow(
        this.status.detection?.hasGit !== false,
        'Git',
        this.status.detection?.gitVersion || (this.status.detection?.hasGit !== false ? 'detected' : 'not found')
      );
      html += this.detectionRow(true, 'Operating System', this.status.detection?.os || navigator.platform);

      const platformNames = { 'copilot-cli': 'GitHub Copilot CLI', 'vscode': 'VSCode', 'claude': 'Claude Code', 'codex': 'Codex' };
      const detectedPlatforms = this.status.detection?.platforms || [];
      if (detectedPlatforms.length > 0) {
        for (const p of detectedPlatforms) {
          html += this.detectionRow(p.detected, platformNames[p.name] || p.name, p.detected ? 'found' : 'not detected');
        }
      } else {
        for (const name of this.status.platforms || []) {
          html += this.detectionRow(true, platformNames[name] || name, 'found');
        }
      }

      html += this.detectionRow(
        this.status.installed,
        'Existing BYAN installation',
        this.status.installed ? 'found (will upgrade)' : 'clean install'
      );

      container.innerHTML = html;
      nextBtn.disabled = false;

      this.config.platforms = this.status.platforms || [];
    } catch (err) {
      container.innerHTML = `<div class="detection-item"><div class="detection-status fail"></div><div class="detection-label">Detection failed</div><div class="detection-value">${this.escapeHtml(err.message)}</div></div>`;
      nextBtn.disabled = false;
    }
  }

  detectionRow(ok, label, value) {
    const status = ok ? 'ok' : (ok === false ? 'fail' : 'unknown');
    return `<div class="detection-item"><div class="detection-status ${status}"></div><div class="detection-label">${this.escapeHtml(label)}</div><div class="detection-value">${this.escapeHtml(value)}</div></div>`;
  }

  selectMode(mode) {
    this.config.mode = mode;

    document.querySelectorAll('.mode-cards .card').forEach(card => card.classList.remove('selected'));
    event.currentTarget.classList.add('selected');

    if (mode === 'auto') {
      this.config.userName = this.status?.detection?.userName || 'User';
      this.config.language = 'English';
      this.config.modules = ['core', 'bmm', 'bmb', 'tea', 'cis'];
      this.showPreview();
    } else {
      this.showConfigForm(mode);
      this.showStep('config');
    }
  }

  showConfigForm(mode) {
    const form = document.getElementById('config-form');
    const allModules = [
      { id: 'core', label: 'Core (foundation)', required: true },
      { id: 'bmm', label: 'BMM (software development)', required: false },
      { id: 'bmb', label: 'BMB (agent builder)', required: false },
      { id: 'tea', label: 'TEA (test architecture)', required: false },
      { id: 'cis', label: 'CIS (creative innovation)', required: false }
    ];

    const platformOptions = [
      { id: 'copilot-cli', label: 'GitHub Copilot CLI' },
      { id: 'vscode', label: 'VSCode Extension' },
      { id: 'claude', label: 'Claude Code' },
      { id: 'codex', label: 'Codex / OpenCode' }
    ];

    let html = `
      <div class="form-group">
        <label for="cfg-name">Your Name</label>
        <input id="cfg-name" type="text" value="${this.escapeHtml(this.config.userName)}" placeholder="Yan">
      </div>
      <div class="form-group">
        <label for="cfg-lang">Communication Language</label>
        <select id="cfg-lang">
          <option value="English" ${this.config.language === 'English' ? 'selected' : ''}>English</option>
          <option value="Francais" ${this.config.language === 'Francais' ? 'selected' : ''}>Francais</option>
        </select>
      </div>
      <div class="form-group">
        <label>Target Platforms</label>
        <div class="form-hint">Select the platforms you use.</div>
        <div class="checkbox-group">`;

    for (const p of platformOptions) {
      const checked = this.config.platforms.includes(p.id) ? 'checked' : '';
      html += `<label><input type="checkbox" name="platform" value="${p.id}" ${checked}> ${this.escapeHtml(p.label)}</label>`;
    }

    html += `</div></div>`;

    if (mode === 'manual') {
      html += `
        <div class="form-group">
          <label>Modules</label>
          <div class="form-hint">Core is always included.</div>
          <div class="checkbox-group">`;
      for (const m of allModules) {
        const checked = m.required || this.config.modules.includes(m.id) ? 'checked' : '';
        const disabled = m.required ? 'disabled' : '';
        html += `<label><input type="checkbox" name="module" value="${m.id}" ${checked} ${disabled}> ${this.escapeHtml(m.label)}</label>`;
      }
      html += `</div></div>`;
    }

    form.innerHTML = html;
  }

  readConfigForm() {
    const nameEl = document.getElementById('cfg-name');
    const langEl = document.getElementById('cfg-lang');

    if (nameEl) this.config.userName = nameEl.value.trim() || 'User';
    if (langEl) this.config.language = langEl.value;

    const platforms = [];
    document.querySelectorAll('input[name="platform"]:checked').forEach(el => platforms.push(el.value));
    if (platforms.length > 0) this.config.platforms = platforms;

    const modules = ['core'];
    document.querySelectorAll('input[name="module"]:checked').forEach(el => {
      if (!modules.includes(el.value)) modules.push(el.value);
    });
    if (modules.length > 1) this.config.modules = modules;
  }

  showPreview() {
    this.readConfigForm();

    const container = document.getElementById('preview-content');
    const rows = [
      ['Mode', this.config.mode.toUpperCase()],
      ['User Name', this.config.userName || 'User'],
      ['Language', this.config.language],
      ['Platforms', this.config.platforms.join(', ') || 'auto-detect'],
      ['Modules', this.config.modules.join(', ')],
      ['Project Root', this.status?.projectRoot || '(auto)']
    ];

    container.innerHTML = rows.map(([k, v]) =>
      `<div class="preview-row"><span class="preview-key">${this.escapeHtml(k)}</span><span class="preview-val">${this.escapeHtml(v)}</span></div>`
    ).join('');

    this.showStep('preview');
  }

  async confirmInstall() {
    this.showStep('progress');
    document.getElementById('progress-title').textContent = 'Installing...';
    this.resetProgress();

    try {
      const res = await fetch('/api/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.config)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        this.showComplete({ success: false, summary: { message: err.error } });
      }
    } catch (err) {
      this.showComplete({ success: false, summary: { message: err.message } });
    }
  }

  // --- Update Flow ---

  async startUpdate() {
    this.showStep('update-check');
    const container = document.getElementById('update-info');
    const actionsEl = document.getElementById('update-check-actions');
    const confirmBtn = document.getElementById('btn-update-confirm');

    try {
      const res = await fetch('/api/update/check');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.updateAvailable) {
        container.innerHTML = `
          <div class="detection-item">
            <div class="detection-status ok"></div>
            <div class="detection-label">Update available</div>
            <div class="detection-value">${this.escapeHtml(data.installed)} &#8594; ${this.escapeHtml(data.latest)}</div>
          </div>
          ${data.changes.length > 0 ? '<div class="code-block">' + data.changes.map(c => this.escapeHtml(c)).join('\n') + '</div>' : ''}`;
        confirmBtn.disabled = false;
      } else {
        container.innerHTML = `
          <div class="detection-item">
            <div class="detection-status ok"></div>
            <div class="detection-label">Up to date</div>
            <div class="detection-value">v${this.escapeHtml(data.installed)}</div>
          </div>
          <p style="color:var(--text-muted);margin-top:1rem;">Your installation is already on the latest version.</p>`;
        confirmBtn.disabled = true;
      }

      actionsEl.style.display = 'flex';
    } catch (err) {
      container.innerHTML = `<div class="detection-item"><div class="detection-status fail"></div><div class="detection-label">Check failed</div><div class="detection-value">${this.escapeHtml(err.message)}</div></div>`;
      actionsEl.style.display = 'flex';
    }
  }

  async confirmUpdate() {
    this.showStep('progress');
    document.getElementById('progress-title').textContent = 'Updating...';
    this.resetProgress();

    try {
      const res = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        this.showComplete({ success: false, summary: { message: err.error } });
      }
    } catch (err) {
      this.showComplete({ success: false, summary: { message: err.message } });
    }
  }

  // --- UI Helpers ---

  addLog(data) {
    const container = document.getElementById('log-content');
    const badge = document.getElementById('log-badge');
    const level = data.level || 'info';
    const time = data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();

    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;
    entry.innerHTML = `<span class="log-time">${time}</span>${this.escapeHtml(data.message)}`;
    container.appendChild(entry);

    container.scrollTop = container.scrollHeight;

    this.logCount++;
    badge.textContent = this.logCount;
    badge.classList.remove('hidden');

    if (!this.logsExpanded) {
      const panel = document.getElementById('log-panel');
      panel.classList.add('expanded');
      this.logsExpanded = true;
      document.querySelector('.log-header').setAttribute('aria-expanded', 'true');
    }
  }

  updateProgress(data) {
    const fill = document.getElementById('progress-fill');
    const label = document.getElementById('progress-label');
    const pct = document.getElementById('progress-pct');

    const percent = data.total > 0 ? Math.round((data.step / data.total) * 100) : 0;

    fill.style.width = `${percent}%`;
    label.textContent = data.label || '';
    pct.textContent = `${percent}%`;

    const bar = fill.parentElement;
    bar.setAttribute('aria-valuenow', percent);
  }

  resetProgress() {
    document.getElementById('progress-fill').style.width = '0%';
    document.getElementById('progress-label').textContent = 'Preparing...';
    document.getElementById('progress-pct').textContent = '0%';
  }

  showComplete(data) {
    const icon = document.getElementById('done-icon');
    const title = document.getElementById('done-title');
    const summary = document.getElementById('done-summary');

    if (data.success) {
      icon.innerHTML = '&#10003;';
      icon.classList.remove('error');
      title.textContent = 'Installation Complete';

      const s = data.summary || {};
      let html = `<p>${this.escapeHtml(s.message || 'Done')}</p>`;
      if (s.projectRoot) html += `<p><strong>Project:</strong> <code>${this.escapeHtml(s.projectRoot)}</code></p>`;
      if (s.mode) html += `<p><strong>Mode:</strong> ${this.escapeHtml(s.mode)}</p>`;
      if (s.platforms && s.platforms.length) html += `<p><strong>Platforms:</strong> ${s.platforms.map(p => this.escapeHtml(p)).join(', ')}</p>`;
      html += '<p style="margin-top:1rem;color:var(--text-muted);">You can close this window.</p>';
      summary.innerHTML = html;
    } else {
      icon.innerHTML = '&#10007;';
      icon.classList.add('error');
      title.textContent = 'Installation Failed';

      const msg = data.summary?.message || 'Unknown error';
      summary.innerHTML = `<p style="color:var(--error)">${this.escapeHtml(msg)}</p><p style="margin-top:1rem;color:var(--text-muted);">Check the logs below for details. You can try again.</p>`;
    }

    this.showStep('done');
  }

  toggleLogs() {
    const panel = document.getElementById('log-panel');
    const header = document.querySelector('.log-header');
    this.logsExpanded = !this.logsExpanded;
    panel.classList.toggle('expanded', this.logsExpanded);
    header.setAttribute('aria-expanded', this.logsExpanded);
  }

  escapeHtml(str) {
    if (!str) return '';
    const s = String(str);
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(s));
    return div.innerHTML;
  }
}

const app = new ByanApp();
