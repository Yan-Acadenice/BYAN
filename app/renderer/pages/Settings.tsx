// Settings page for Electron — extends the webui Settings.jsx with an Electron-specific
// "Switch login mode" section that logs out and navigates back to /login.
//
// Decision: port as TSX rather than wrap JSX to avoid the @webui import chain pulling
// in AuthContext + api/client which assume browser session storage (not IPC).

import React, { useState } from 'react';
import { LogOut, KeyRound, Info, ArrowLeftRight, type LucideIcon } from 'lucide-react';

interface SettingsProps {
  onLogout?: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.15em] text-ink-500 mb-1.5">{label}</p>
      <div className="text-sm text-white">{children}</div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={14} className="text-byan-400" />
      <h3 className="text-sm font-semibold text-white">{title}</h3>
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
    <div className="space-y-6 max-w-2xl">
      {/* Page header */}
      <div>
        <p className="section-title">System</p>
        <h1 className="page-title mt-1">Settings</h1>
        <p className="text-sm text-ink-400 mt-1">Connection, API, security</p>
      </div>

      {/* Connection mode switch */}
      <div className="glass-card p-6">
        <SectionHeader icon={ArrowLeftRight} title="Connection mode" />
        <p className="text-xs text-ink-400 mb-5 leading-relaxed">
          Switch between Cloud, Local, and Custom modes without reinstalling the application.
        </p>
        <button
          type="button"
          onClick={() => void handleSwitchMode()}
          disabled={loggingOut}
          className="btn-secondary btn-sm flex items-center gap-2"
          data-testid="switch-mode-btn"
        >
          {loggingOut ? (
            <>
              <LogOut size={13} className="animate-pulse" />
              Signing out...
            </>
          ) : (
            <>
              <ArrowLeftRight size={13} />
              Switch login mode
            </>
          )}
        </button>
      </div>

      {/* API reference */}
      <div className="glass-card p-6">
        <SectionHeader icon={KeyRound} title="API Authentication" />
        <div className="space-y-4">
          <Field label="Bearer token">
            <code className="inline-flex items-center px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 font-mono text-xs text-ink-200">
              Authorization: Bearer &lt;token&gt;
            </code>
          </Field>
          <Field label="API Key">
            <code className="inline-flex items-center px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 font-mono text-xs text-ink-200">
              Authorization: ApiKey &lt;key&gt;
            </code>
          </Field>
        </div>
      </div>

      {/* About */}
      <div className="glass-card p-6">
        <SectionHeader icon={Info} title="About" />
        <div className="space-y-2">
          <p className="text-sm text-ink-300">
            <span className="text-gradient-primary font-semibold">BYAN</span>
            {' — '}Builder of YAN · Agent Orchestration Platform
          </p>
          <p className="text-xs text-ink-500">Merise Agile + TDD · 64 Mantras · v1.0</p>
        </div>
      </div>
    </div>
  );
}
