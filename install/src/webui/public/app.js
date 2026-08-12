class ByanApp {
  constructor() {
    this.currentStep = 'welcome';
    this.stepHistory = [];
    this.ws = null;
    this.wsRetryDelay = 1000;
    // Defauts valides : francais, tous les modules (l'installation AUTO pose
    // tous les agents), plateformes remplies par la detection machine.
    this.config = {
      mode: 'auto',
      userName: '',
      language: 'Francais',
      platforms: [],
      modules: ['core', 'bmm', 'bmb', 'tea', 'cis']
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

      html += this.detectionRow(true, 'Node.js', this.status.detection?.nodeVersion || 'detecte');
      html += this.detectionRow(
        this.status.detection?.hasGit !== false,
        'Git',
        this.status.detection?.gitVersion || (this.status.detection?.hasGit !== false ? 'detecte' : 'introuvable')
      );
      html += this.detectionRow(true, 'Systeme d\'exploitation', this.status.detection?.os || navigator.platform);

      const platformNames = { 'claude': 'Claude Code', 'codex': 'Codex' };
      const detectedPlatforms = this.status.detection?.platforms || [];
      if (detectedPlatforms.length > 0) {
        for (const p of detectedPlatforms) {
          html += this.detectionRow(p.detected, platformNames[p.name] || p.name, p.detected ? 'detecte' : 'non detecte');
        }
      } else {
        for (const name of this.status.platforms || []) {
          html += this.detectionRow(true, platformNames[name] || name, 'detecte');
        }
      }

      html += this.detectionRow(
        this.status.installed,
        'Installation BYAN existante',
        this.status.installed ? 'trouvee (sera mise a jour)' : 'installation neuve'
      );

      container.innerHTML = html;
      nextBtn.disabled = false;

      this.config.platforms = this.status.platforms || [];
    } catch (err) {
      container.innerHTML = `<div class="detection-item"><div class="detection-status fail"></div><div class="detection-label">Echec de la detection</div><div class="detection-value">${this.escapeHtml(err.message)}</div></div>`;
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

    // Le mode AUTO installe TOUS les agents (les 5 modules) sur les plateformes
    // detectees, en francais — mais il demande quand meme le prenom : on ne
    // baptise personne "User" d'office.
    if (mode === 'auto') {
      this.config.modules = ['core', 'bmm', 'bmb', 'tea', 'cis'];
      this.config.language = this.config.language || 'Francais';
    }
    this.showConfigForm(mode);
    this.showStep('config');
  }

  showConfigForm(mode) {
    const form = document.getElementById('config-form');
    const allModules = [
      { id: 'core', label: 'Core (fondation)', required: true },
      { id: 'bmm', label: 'BMM (developpement logiciel)', required: false },
      { id: 'bmb', label: 'BMB (createur d\'agents)', required: false },
      { id: 'tea', label: 'TEA (architecture de tests)', required: false },
      { id: 'cis', label: 'CIS (innovation creative)', required: false }
    ];

    const platformOptions = [
      { id: 'claude', label: 'Claude Code' },
      { id: 'codex', label: 'Codex / OpenCode' }
    ];

    let html = `
      <div class="form-group">
        <label for="cfg-name">Comment veux-tu etre appele ?</label>
        <input id="cfg-name" type="text" value="${this.escapeHtml(this.config.userName)}" placeholder="Yan">
      </div>
      <div class="form-group">
        <label for="cfg-project-name">Nom du projet</label>
        <input id="cfg-project-name" type="text" value="${this.escapeHtml(this.config.projectName || '')}" placeholder="mon-projet">
      </div>
      <div class="form-group">
        <label for="cfg-project-dir">Repertoire du projet</label>
        <input id="cfg-project-dir" type="text" value="${this.escapeHtml(this.config.projectDir || this.status?.projectRoot || '')}" placeholder="/chemin/vers/le/projet">
        <div class="form-hint">Par defaut : le repertoire depuis lequel l'assistant a ete lance.</div>
      </div>
      <div class="form-group">
        <label for="cfg-lang">Langue de communication</label>
        <select id="cfg-lang">
          <option value="Francais" ${this.config.language === 'Francais' ? 'selected' : ''}>Francais</option>
          <option value="English" ${this.config.language === 'English' ? 'selected' : ''}>English</option>
        </select>
      </div>`;

    // En AUTO, plateformes et modules sont regles par la detection et le
    // roster complet — pas de cases a cocher, juste l'essentiel.
    if (mode === 'auto') {
      const detected = (this.config.platforms || []).map(p => p === 'claude' ? 'Claude Code' : 'Codex').join(' + ') || 'aucune detectee';
      html += `
      <div class="form-group">
        <div class="form-hint">Plateformes detectees : ${this.escapeHtml(detected)} &mdash; tous les agents seront installes.</div>
      </div>`;
    } else {
      html += `
      <div class="form-group">
        <label>Plateformes cibles</label>
        <div class="form-hint">Choisis les plateformes que tu utilises.</div>
        <div class="checkbox-group">`;

      for (const p of platformOptions) {
        const checked = this.config.platforms.includes(p.id) ? 'checked' : '';
        html += `<label><input type="checkbox" name="platform" value="${p.id}" ${checked}> ${this.escapeHtml(p.label)}</label>`;
      }

      html += `</div></div>`;
    }

    if (mode === 'manual') {
      html += `
        <div class="form-group">
          <label>Modules</label>
          <div class="form-hint">Core est toujours inclus.</div>
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
    const projNameEl = document.getElementById('cfg-project-name');
    const projDirEl = document.getElementById('cfg-project-dir');

    if (nameEl) this.config.userName = nameEl.value.trim() || 'Developpeur';
    if (langEl) this.config.language = langEl.value;
    if (projNameEl) this.config.projectName = projNameEl.value.trim();
    if (projDirEl) this.config.projectDir = projDirEl.value.trim();

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
    const allModules = this.config.modules.length >= 5;
    const rows = [
      ['Mode', this.config.mode.toUpperCase()],
      ['Prenom', this.config.userName || 'Developpeur'],
      ['Langue', this.config.language],
      ['Plateformes', this.config.platforms.join(', ') || 'detection automatique'],
      ['Agents', allModules ? 'tous (roster complet)' : `modules ${this.config.modules.join(', ')}`],
      ['Modules', this.config.modules.join(', ')],
      ['Nom du projet', this.config.projectName || '(nom du dossier)'],
      ['Repertoire', this.config.projectDir || this.status?.projectRoot || '(auto)']
    ];

    container.innerHTML = rows.map(([k, v]) =>
      `<div class="preview-row"><span class="preview-key">${this.escapeHtml(k)}</span><span class="preview-val">${this.escapeHtml(v)}</span></div>`
    ).join('');

    this.showStep('preview');
  }

  async confirmInstall() {
    this.showStep('progress');
    document.getElementById('progress-title').textContent = 'Installation en cours...';
    this.resetProgress();

    try {
      const res = await fetch('/api/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.config)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erreur inconnue' }));
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
            <div class="detection-label">Mise a jour disponible</div>
            <div class="detection-value">${this.escapeHtml(data.installed)} &#8594; ${this.escapeHtml(data.latest)}</div>
          </div>
          ${data.changes.length > 0 ? '<div class="code-block">' + data.changes.map(c => this.escapeHtml(c)).join('\n') + '</div>' : ''}`;
        confirmBtn.disabled = false;
      } else {
        container.innerHTML = `
          <div class="detection-item">
            <div class="detection-status ok"></div>
            <div class="detection-label">A jour</div>
            <div class="detection-value">v${this.escapeHtml(data.installed)}</div>
          </div>
          <p style="color:var(--text-muted);margin-top:1rem;">Ton installation est deja sur la derniere version.</p>`;
        confirmBtn.disabled = true;
      }

      actionsEl.style.display = 'flex';
    } catch (err) {
      container.innerHTML = `<div class="detection-item"><div class="detection-status fail"></div><div class="detection-label">Echec de la verification</div><div class="detection-value">${this.escapeHtml(err.message)}</div></div>`;
      actionsEl.style.display = 'flex';
    }
  }

  async confirmUpdate() {
    this.showStep('progress');
    document.getElementById('progress-title').textContent = 'Mise a jour en cours...';
    this.resetProgress();

    try {
      const res = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erreur inconnue' }));
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
    document.getElementById('progress-label').textContent = 'Preparation...';
    document.getElementById('progress-pct').textContent = '0%';
  }

  showComplete(data) {
    const icon = document.getElementById('done-icon');
    const title = document.getElementById('done-title');
    const summary = document.getElementById('done-summary');

    if (data.success) {
      icon.innerHTML = '&#10003;';
      icon.classList.remove('error');
      title.textContent = 'Installation terminee';

      const s = data.summary || {};
      let html = `<p>${this.escapeHtml(s.message || 'Termine')}</p>`;
      if (s.projectRoot) html += `<p><strong>Projet :</strong> <code>${this.escapeHtml(s.projectRoot)}</code></p>`;
      if (s.mode) html += `<p><strong>Mode :</strong> ${this.escapeHtml(s.mode)}</p>`;
      if (s.platforms && s.platforms.length) html += `<p><strong>Plateformes :</strong> ${s.platforms.map(p => this.escapeHtml(p)).join(', ')}</p>`;

      // CE QUI N'A PAS TOURNE SE DIT ICI AUSSI.
      //
      // Le moteur diffuse `skipped`, `verify.skipped` et `ownership` depuis la
      // correction du rapport honnete, mais cette page n'en affichait rien :
      // l'assistant web continuait d'annoncer une reussite pleine sur un
      // perimetre reduit, exactement le defaut corrige cote terminal.
      if (s.verify && typeof s.verify.passed === 'number') {
        html += `<p><strong>Verification :</strong> ${s.verify.passed}/${s.verify.total} controles`;
        if (s.verify.skipped && s.verify.skipped.length) {
          html += ` — ${s.verify.skipped.length} saute(s) sur ${s.verify.intendedTotal || '?'}`;
        }
        html += '</p>';
      }
      if (s.skipped && s.skipped.length) {
        html += '<p><strong>Etapes sautees :</strong></p><ul>';
        for (const e of s.skipped) {
          html += `<li><code>${this.escapeHtml(e.id)}</code> — ${this.escapeHtml(e.reason || 'sans raison donnee')}</li>`;
        }
        html += '</ul>';
      }
      if (s.targetUser && s.targetUser.elevated) {
        const qui = s.targetUser.name || s.targetUser.uid;
        html += `<p><strong>Utilisateur cible :</strong> ${this.escapeHtml(String(qui))} (${this.escapeHtml(s.targetUser.source || 'inconnu')})</p>`;
      }
      if (s.ownership) {
        const issue = s.ownership.overall || s.ownership.outcome;
        const couleur = issue === 'failed' ? 'var(--error)' : 'inherit';
        html += `<p style="color:${couleur}"><strong>Droits :</strong> ${this.escapeHtml(String(issue))}`;
        if (s.ownership.changed) html += ` — ${s.ownership.changed} entree(s) reprises`;
        html += '</p>';
        for (const p of s.ownership.homeFailed || []) {
          html += `<p style="color:var(--error)">Echec de reprise sur <code>${this.escapeHtml(p)}</code></p>`;
        }
        if (s.ownership.homeSkipped) {
          html += `<p style="color:var(--text-muted)">${this.escapeHtml(s.ownership.homeSkipped)}</p>`;
        }
      }

      html += '<p style="margin-top:1rem;color:var(--text-muted);">Tu peux fermer cette fenetre.</p>';
      summary.innerHTML = html;
    } else {
      icon.innerHTML = '&#10007;';
      icon.classList.add('error');
      title.textContent = 'Echec de l\'installation';

      const msg = data.summary?.message || 'Erreur inconnue';
      summary.innerHTML = `<p style="color:var(--error)">${this.escapeHtml(msg)}</p><p style="margin-top:1rem;color:var(--text-muted);">Consulte le journal ci-dessous pour le detail. Tu peux reessayer.</p>`;
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
