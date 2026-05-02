// Settings page for Electron — extends the webui Settings.jsx with an Electron-specific
// "Switch login mode" section that logs out and navigates back to /login.
//
// Decision: port as TSX rather than wrap JSX to avoid the @webui import chain pulling
// in AuthContext + api/client which assume browser session storage (not IPC).

import React, { useState } from 'react';

interface SettingsProps {
  onLogout?: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-ink-400 mb-1">{label}</p>
      <div className="text-sm text-white">{children}</div>
    </div>
  );
}

export default function Settings({ onLogout }: SettingsProps) {
  const [loggingOut, setLoggingOut] = useState(false);

  const handleSwitchMode = async () => {
    setLoggingOut(true);
    try {
      await window.byanApi.auth.logout();
    } catch {
      // Ignore — logout clears local state even if the server call fails.
    } finally {
      setLoggingOut(false);
      onLogout?.();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="section-title">Systeme</p>
        <h1 className="page-title mt-1">Parametres</h1>
        <p className="text-sm text-ink-400 mt-1">Connexion, API, securite</p>
      </div>

      {/* Connection mode switch */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-white mb-2">Mode de connexion</h3>
        <p className="text-xs text-ink-400 mb-4">
          Changez de mode (cloud, local, custom) sans reinstaller l&apos;application.
        </p>
        <button
          type="button"
          onClick={() => void handleSwitchMode()}
          disabled={loggingOut}
          className="btn-secondary btn-sm"
          data-testid="switch-mode-btn"
        >
          {loggingOut ? 'Deconnexion...' : 'Changer de mode de connexion'}
        </button>
      </div>

      {/* API reference */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-white mb-4">API</h3>
        <div className="space-y-3 text-sm">
          <Field label="Bearer">
            <code className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 font-mono text-xs text-ink-100">
              Authorization: Bearer &lt;token&gt;
            </code>
          </Field>
          <Field label="API Key">
            <code className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 font-mono text-xs text-ink-100">
              Authorization: ApiKey &lt;key&gt;
            </code>
          </Field>
        </div>
      </div>

      {/* About */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-white mb-3">A propos</h3>
        <div className="text-sm text-ink-300 space-y-1">
          <p>
            <span className="text-gradient-primary font-semibold">BYAN</span>
            {' '}· Builder of YAN · Agent Orchestration Platform
          </p>
          <p className="text-xs text-ink-400">Merise Agile + TDD · 64 Mantras</p>
        </div>
      </div>
    </div>
  );
}
