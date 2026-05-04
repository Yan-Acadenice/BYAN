// Settings — l._settings ported to React, extends existing IPC logic.
// Sections: Connection / API Authentication / Appearance / About / Powered by Acadenice.

import React, { useState } from 'react';
import { LogOut, KeyRound, Info, ArrowLeftRight, ExternalLink, type LucideIcon } from 'lucide-react';

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
    <div className="flex items-center gap-xs mb-md">
      <Icon size={14} className="text-byan-400" />
      <h3 className="font-h3 text-h3 text-white">{title}</h3>
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
      // Ignore — logout clears local state even if server call fails.
    } finally {
      setLoggingOut(false);
      onLogout?.();
    }
  };

  const openAcadenice = () => void window.byanApi.app.openExternal('https://acadenice.fr');
  const openContact = () => void window.byanApi.app.openExternal('https://acadenice.fr/contact');

  return (
    <div className="space-y-lg max-w-2xl">
      {/* Page header */}
      <div>
        <p className="section-title">System</p>
        <h1 className="page-title mt-0.5">Settings</h1>
        <p className="font-body-sm text-body-sm text-ink-400 mt-xs">Connection, API, security</p>
      </div>

      {/* Connection mode switch */}
      <div className="bg-ink-900 border border-ink-800 rounded-lg p-md">
        <SectionHeader icon={ArrowLeftRight} title="Connection mode" />
        <p className="font-body-sm text-body-sm text-ink-400 mb-md leading-relaxed">
          Switch between Cloud, Local, and Custom modes without reinstalling the application.
        </p>
        <button
          type="button"
          onClick={() => void handleSwitchMode()}
          disabled={loggingOut}
          className="btn-secondary btn-sm flex items-center gap-xs"
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

      {/* API Authentication */}
      <div className="bg-ink-900 border border-ink-800 rounded-lg p-md">
        <SectionHeader icon={KeyRound} title="API Authentication" />
        <div className="space-y-md">
          <Field label="Bearer token">
            <code className="inline-flex items-center px-sm py-xs rounded bg-ink-850 border border-ink-700 font-mono-code text-mono-code text-ink-200">
              Authorization: Bearer &lt;token&gt;
            </code>
          </Field>
          <Field label="API Key">
            <code className="inline-flex items-center px-sm py-xs rounded bg-ink-850 border border-ink-700 font-mono-code text-mono-code text-ink-200">
              Authorization: ApiKey &lt;key&gt;
            </code>
          </Field>
        </div>
      </div>

      {/* About */}
      <div className="bg-ink-900 border border-ink-800 rounded-lg p-md">
        <SectionHeader icon={Info} title="About" />
        <div className="space-y-xs">
          <p className="font-body text-body text-ink-300">
            <span className="text-gradient-primary font-semibold">BYAN</span>
            {' — '}Builder of YAN · Agent Orchestration Platform
          </p>
          <p className="font-body-sm text-body-sm text-ink-500">Merise Agile + TDD · 64 Mantras · v1.0</p>
        </div>
      </div>

      {/* Powered by Acadenice */}
      <div className="bg-ink-900 border border-ink-800 rounded-lg p-md">
        <div className="flex items-start gap-md">
          {/* Wordmark placeholder — SVG import via img */}
          <img
            src="/assets/branding/logo-acadenice_2coul.svg"
            alt="AcadéNice"
            style={{ width: '120px' }}
            className="mt-xs flex-shrink-0"
          />
          <div className="flex-1">
            <p className="font-body-sm text-body-sm text-ink-400 italic mb-xs">
              Former avec rigueur. Accompagner avec humanité.
            </p>
            <p className="font-body-sm text-body-sm text-ink-500 mb-md leading-relaxed">
              BYAN est un produit du CFA AcadéNice à Nice — formations digital, dev et design en alternance.
            </p>
            <div className="flex items-center gap-md">
              <button
                type="button"
                onClick={openAcadenice}
                className="flex items-center gap-xs font-caption text-caption text-acadenice-teal hover:text-acadenice-teal-dark transition-colors"
              >
                <ExternalLink size={12} />
                acadenice.fr
              </button>
              <button
                type="button"
                onClick={openContact}
                className="flex items-center gap-xs font-caption text-caption text-ink-400 hover:text-ink-200 transition-colors"
              >
                Contact
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
