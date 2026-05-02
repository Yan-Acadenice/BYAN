// Login page for Electron — three connection modes: cloud, local, custom.
// This is an Electron-specific page; the webui Login.jsx is kept for browser-standalone use.
//
// Token contract: token is passed over IPC to the main process and stored in the OS keychain.
// It is NEVER placed in localStorage or any renderer-side persistent store.

import React, { useEffect, useState } from 'react';
import type { AuthMode, AuthResult } from '../../shared/ipc-contract';

const CLOUD_DEFAULT_URL = 'https://byan-api.stark.a3n.fr';
const LOCAL_DEFAULT_URL = 'http://localhost:3737';

type Tab = AuthMode;

interface TabConfig {
  id: Tab;
  label: string;
}

const TABS: TabConfig[] = [
  { id: 'cloud', label: 'Cloud' },
  { id: 'local', label: 'Local' },
  { id: 'custom', label: 'Custom' }
];

interface LoginProps {
  // Injected by the router after successful login so the page can redirect.
  onAuthenticated?: () => void;
}

export default function Login({ onAuthenticated }: LoginProps) {
  const [activeTab, setActiveTab] = useState<Tab>('cloud');
  const [cloudUrl, setCloudUrl] = useState(CLOUD_DEFAULT_URL);
  const [cloudToken, setCloudToken] = useState('');
  const [localPort, setLocalPort] = useState<number | null>(null);
  const [localToken, setLocalToken] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customToken, setCustomToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverStarting, setServerStarting] = useState(false);
  const [error, setError] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Restore last mode from persistent store on mount.
  useEffect(() => {
    const restoreMode = async () => {
      try {
        const lastMode = await window.byanApi.store.get<Tab>('login.lastMode');
        if (lastMode && TABS.some((t) => t.id === lastMode)) {
          setActiveTab(lastMode);
        }
      } catch {
        // Store unavailable (e.g. test env without preload) — fall back to 'cloud'.
      } finally {
        setInitialized(true);
      }
    };
    void restoreMode();
  }, []);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setError('');
  };

  const connect = async (opts: { mode: Tab; url?: string; token?: string }) => {
    setLoading(true);
    setError('');
    try {
      const result: AuthResult = await window.byanApi.auth.login({
        mode: opts.mode,
        url: opts.url,
        token: opts.token
      });

      if (!result.ok) {
        const messages: Record<string, string> = {
          invalid_token: 'Token invalide ou refuse par le serveur.',
          unreachable: 'Serveur inaccessible. Verifiez l\'URL et votre connexion.',
          cancelled: 'Connexion annulee.',
          unknown: 'Erreur inconnue lors de la connexion.'
        };
        setError(messages[result.reason] ?? result.message);
        return;
      }

      await window.byanApi.store.set('login.lastMode', opts.mode);
      onAuthenticated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion.');
    } finally {
      setLoading(false);
    }
  };

  const handleCloudSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void connect({ mode: 'cloud', url: cloudUrl, token: cloudToken });
  };

  const handleLocalSpawn = async () => {
    setServerStarting(true);
    setError('');
    try {
      const result = await window.byanApi.server.spawn();
      setLocalPort(result.port);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de demarrer le serveur local.');
    } finally {
      setServerStarting(false);
    }
  };

  const handleLocalConnect = (e: React.FormEvent) => {
    e.preventDefault();
    const url = localPort ? `http://localhost:${localPort}` : LOCAL_DEFAULT_URL;
    void connect({ mode: 'local', url, token: localToken || undefined });
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void connect({ mode: 'custom', url: customUrl, token: customToken });
  };

  if (!initialized) {
    return null;
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden px-4">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full bg-byan-600/25 blur-3xl" />
        <div className="absolute -bottom-40 -right-20 w-[520px] h-[520px] rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-grid-dark [background-size:36px_36px] opacity-60" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-gradient shadow-glow-lg mb-5">
            <span className="text-white font-bold text-2xl tracking-tight">B</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-gradient-primary">BYAN</h1>
          <p className="text-sm text-ink-400 mt-2">Agent Orchestration Platform</p>
        </div>

        <div className="glass-card p-8 shadow-glass-lg">
          <h2 className="text-lg font-semibold text-white mb-1">Connexion</h2>
          <p className="text-xs text-ink-400 mb-5">Choisissez votre mode de connexion</p>

          {/* Mode tabs */}
          <div className="flex gap-1 mb-6 p-1 bg-white/5 rounded-xl border border-white/10">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                data-testid={`tab-${tab.id}`}
                onClick={() => handleTabChange(tab.id)}
                className={[
                  'flex-1 py-1.5 text-xs font-medium rounded-lg transition-all',
                  activeTab === tab.id
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-ink-400 hover:text-ink-200'
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Error banner */}
          {error && (
            <div
              role="alert"
              className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300"
            >
              {error}
            </div>
          )}

          {/* Cloud panel */}
          {activeTab === 'cloud' && (
            <form onSubmit={handleCloudSubmit} className="space-y-4" data-testid="panel-cloud">
              <div>
                <label className="block text-xs font-medium text-ink-300 mb-1.5 uppercase tracking-wider">
                  URL BYAN Cloud
                </label>
                <input
                  type="url"
                  value={cloudUrl}
                  onChange={(e) => setCloudUrl(e.target.value)}
                  className="input"
                  placeholder={CLOUD_DEFAULT_URL}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-300 mb-1.5 uppercase tracking-wider">
                  Token API
                </label>
                <input
                  type="password"
                  value={cloudToken}
                  onChange={(e) => setCloudToken(e.target.value)}
                  className="input"
                  placeholder="byan_..."
                  required
                  data-testid="cloud-token-input"
                />
              </div>
              <div className="flex items-center justify-between">
                <a
                  href="#"
                  className="text-xs text-byan-400 hover:text-byan-300 underline"
                  onClick={(e) => {
                    e.preventDefault();
                    // openExternal is not in the IPC contract yet — use noop fallback.
                    // TODO(F7): wire window.byanApi.app.openExternal when available.
                  }}
                >
                  Obtenir un token
                </a>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary py-2 px-5"
                  data-testid="cloud-submit"
                >
                  {loading ? 'Connexion...' : 'Se connecter'}
                </button>
              </div>
            </form>
          )}

          {/* Local panel */}
          {activeTab === 'local' && (
            <form onSubmit={handleLocalConnect} className="space-y-4" data-testid="panel-local">
              <p className="text-xs text-ink-400">
                Lance un serveur BYAN embarque localement. Aucune connexion internet requise.
              </p>

              {localPort ? (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300" data-testid="local-server-status">
                  Serveur actif sur{' '}
                  <code className="font-mono">http://localhost:{localPort}</code>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleLocalSpawn()}
                  disabled={serverStarting}
                  className="btn-secondary w-full py-2"
                  data-testid="local-spawn-btn"
                >
                  {serverStarting ? 'Demarrage...' : 'Demarrer le serveur local'}
                </button>
              )}

              <div>
                <label className="block text-xs font-medium text-ink-300 mb-1.5 uppercase tracking-wider">
                  Token (optionnel)
                </label>
                <input
                  type="password"
                  value={localToken}
                  onChange={(e) => setLocalToken(e.target.value)}
                  className="input"
                  placeholder="Laisser vide pour le mode dev"
                  data-testid="local-token-input"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary py-2 px-5"
                  data-testid="local-submit"
                >
                  {loading ? 'Connexion...' : 'Connecter au local'}
                </button>
              </div>
            </form>
          )}

          {/* Custom panel */}
          {activeTab === 'custom' && (
            <form onSubmit={handleCustomSubmit} className="space-y-4" data-testid="panel-custom">
              <p className="text-xs text-ink-400">
                Connectez-vous a une instance BYAN auto-hebergee.
              </p>
              <div>
                <label className="block text-xs font-medium text-ink-300 mb-1.5 uppercase tracking-wider">
                  URL du serveur
                </label>
                <input
                  type="url"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className="input"
                  placeholder="https://mon-byan.exemple.com"
                  required
                  data-testid="custom-url-input"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-300 mb-1.5 uppercase tracking-wider">
                  Token API
                </label>
                <input
                  type="password"
                  value={customToken}
                  onChange={(e) => setCustomToken(e.target.value)}
                  className="input"
                  placeholder="byan_..."
                  required
                  data-testid="custom-token-input"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary py-2 px-5"
                  data-testid="custom-submit"
                >
                  {loading ? 'Connexion...' : 'Se connecter'}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-[11px] text-ink-500 mt-6 uppercase tracking-[0.2em]">
          Builder of YAN &middot; v1.0
        </p>
      </div>
    </div>
  );
}
