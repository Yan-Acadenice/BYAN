// Login page for Electron — three connection modes: cloud, local, custom.
// This is an Electron-specific page; the webui Login.jsx is kept for browser-standalone use.
//
// Token contract: token is passed over IPC to the main process and stored in the OS keychain.
// It is NEVER placed in localStorage or any renderer-side persistent store.

import React, { useEffect, useState } from 'react';
import {
  Cloud,
  Monitor,
  Settings2,
  Key,
  Eye,
  EyeOff,
  Play,
  ArrowRight,
  ExternalLink,
  Loader2,
  Wifi,
  WifiOff,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { AuthMode, AuthResult } from '../../shared/ipc-contract';
import ByanLogo from '../components/ByanLogo';

const CLOUD_DEFAULT_URL = 'https://byan-api.stark.a3n.fr';
const LOCAL_DEFAULT_URL = 'http://localhost:3737';

type Tab = AuthMode;

interface TabConfig {
  id: Tab;
  label: string;
  Icon: LucideIcon;
  description: string;
}

const TABS: TabConfig[] = [
  {
    id: 'cloud',
    label: 'Cloud',
    Icon: Cloud,
    description: 'Connect to BYAN cloud service',
  },
  {
    id: 'local',
    label: 'Local',
    Icon: Monitor,
    description: 'Run BYAN on this machine',
  },
  {
    id: 'custom',
    label: 'Custom',
    Icon: Settings2,
    description: 'Self-hosted BYAN instance',
  },
];

interface LoginProps {
  onAuthenticated?: () => void;
}

export default function Login({ onAuthenticated }: LoginProps) {
  const [activeTab, setActiveTab] = useState<Tab>('cloud');
  const [cloudUrl, setCloudUrl] = useState(CLOUD_DEFAULT_URL);
  const [cloudToken, setCloudToken] = useState('');
  const [showCloudToken, setShowCloudToken] = useState(false);
  const [localPort, setLocalPort] = useState<number | null>(null);
  const [localToken, setLocalToken] = useState('');
  const [showLocalToken, setShowLocalToken] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [customToken, setCustomToken] = useState('');
  const [showCustomToken, setShowCustomToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverStarting, setServerStarting] = useState(false);
  const [error, setError] = useState('');
  const [initialized, setInitialized] = useState(false);

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
        token: opts.token,
      });

      if (!result.ok) {
        const messages: Record<string, string> = {
          invalid_token: 'Token invalide ou refuse par le serveur.',
          unreachable:
            "Serveur inaccessible. Verifiez l'URL et votre connexion.",
          cancelled: 'Connexion annulee.',
          unknown: 'Erreur inconnue lors de la connexion.',
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
      setError(
        err instanceof Error ? err.message : 'Impossible de demarrer le serveur local.'
      );
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
    <div className="min-h-screen flex items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-[480px] animate-fade-in-up">
        {/* Header */}
        <div className="flex flex-col items-center mb-xl">
          <div className="mb-md w-16 h-16 rounded-lg overflow-hidden bg-ink-900 border border-ink-800 flex items-center justify-center shadow-glow-sm">
            <ByanLogo size={56} />
          </div>
          <h1 className="font-h1 text-h1 text-white">Connect to BYAN</h1>
          {/* Acadenice co-branding caption */}
          <p className="font-caption text-caption text-ink-400 mt-xs uppercase tracking-wider">
            An AcadéNice product
          </p>
        </div>

        {/* Main card */}
        <div className="bg-ink-900 border border-ink-800 rounded-xl overflow-hidden shadow-glass">
          <div className="p-7">
            <h2 className="text-lg font-bold text-white mb-0.5">Connect to BYAN</h2>
            <p className="text-xs text-ink-400 mb-5">Choose your connection mode</p>

            {/* Mode tabs */}
            <div className="flex gap-1 mb-6 p-1 bg-white/5 rounded-xl border border-white/8">
              {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                const { Icon } = tab;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    data-testid={`tab-${tab.id}`}
                    onClick={() => handleTabChange(tab.id)}
                    className={[
                      'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all duration-200',
                      isActive
                        ? 'bg-byan-500/20 text-byan-200 border border-byan-500/30 shadow-glow-sm'
                        : 'text-ink-400 hover:text-ink-200 hover:bg-white/5',
                    ].join(' ')}
                  >
                    <Icon size={12} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Error banner */}
            {error && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-sm text-red-300"
              >
                <XCircle size={15} className="flex-shrink-0 mt-0.5 text-red-400" />
                <span className="text-xs">{error}</span>
              </div>
            )}

            {/* Cloud panel */}
            {activeTab === 'cloud' && (
              <form
                onSubmit={handleCloudSubmit}
                className="space-y-4 animate-fade-in-up"
                data-testid="panel-cloud"
              >
                <div>
                  <label className="block text-xs font-semibold text-ink-300 mb-1.5 uppercase tracking-[0.15em]">
                    BYAN Cloud URL
                  </label>
                  <input
                    type="url"
                    value={cloudUrl}
                    onChange={(e) => setCloudUrl(e.target.value)}
                    className="input text-ink-400"
                    placeholder={CLOUD_DEFAULT_URL}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-300 mb-1.5 uppercase tracking-[0.15em]">
                    API Token
                  </label>
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none">
                      <Key size={14} />
                    </div>
                    <input
                      type={showCloudToken ? 'text' : 'password'}
                      value={cloudToken}
                      onChange={(e) => setCloudToken(e.target.value)}
                      className="input pl-9 pr-10"
                      placeholder="byan_..."
                      required
                      data-testid="cloud-token-input"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-300 transition-colors"
                      onClick={() => setShowCloudToken((v) => !v)}
                      tabIndex={-1}
                      aria-label={showCloudToken ? 'Hide token' : 'Show token'}
                    >
                      {showCloudToken ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-xs text-byan-400 hover:text-byan-300 transition-colors"
                    onClick={(e) => {
                      e.preventDefault();
                      // TODO(F7): wire window.byanApi.app.openExternal when available.
                    }}
                  >
                    <ExternalLink size={11} />
                    Get a token
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary flex items-center gap-2 py-2.5 px-5"
                    data-testid="cloud-submit"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        Connect
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Local panel */}
            {activeTab === 'local' && (
              <form
                onSubmit={handleLocalConnect}
                className="space-y-4 animate-fade-in-up"
                data-testid="panel-local"
              >
                <p className="text-xs text-ink-400 leading-relaxed">
                  Launch an embedded BYAN server locally. No internet connection required.
                </p>

                {localPort ? (
                  <div
                    className="flex items-center gap-3 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-300"
                    data-testid="local-server-status"
                  >
                    <Wifi size={14} className="text-emerald-400 flex-shrink-0" />
                    <span>
                      Server running on{' '}
                      <code className="font-mono text-emerald-200">
                        http://localhost:{localPort}
                      </code>
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleLocalSpawn()}
                    disabled={serverStarting}
                    className="btn-secondary w-full flex items-center justify-center gap-2 py-2.5"
                    data-testid="local-spawn-btn"
                  >
                    {serverStarting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Starting server...
                      </>
                    ) : (
                      <>
                        <Play size={14} />
                        Start local server
                      </>
                    )}
                  </button>
                )}

                <div>
                  <label className="block text-xs font-semibold text-ink-300 mb-1.5 uppercase tracking-[0.15em]">
                    Token (optional)
                  </label>
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none">
                      <Key size={14} />
                    </div>
                    <input
                      type={showLocalToken ? 'text' : 'password'}
                      value={localToken}
                      onChange={(e) => setLocalToken(e.target.value)}
                      className="input pl-9 pr-10"
                      placeholder="Leave empty for dev mode"
                      data-testid="local-token-input"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-300 transition-colors"
                      onClick={() => setShowLocalToken((v) => !v)}
                      tabIndex={-1}
                      aria-label={showLocalToken ? 'Hide token' : 'Show token'}
                    >
                      {showLocalToken ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary flex items-center gap-2 py-2.5 px-5"
                    data-testid="local-submit"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        Connect to local
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Custom panel */}
            {activeTab === 'custom' && (
              <form
                onSubmit={handleCustomSubmit}
                className="space-y-4 animate-fade-in-up"
                data-testid="panel-custom"
              >
                <p className="text-xs text-ink-400 leading-relaxed">
                  Connect to a self-hosted BYAN instance.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-ink-300 mb-1.5 uppercase tracking-[0.15em]">
                    Server URL
                  </label>
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none">
                      <WifiOff size={14} />
                    </div>
                    <input
                      type="url"
                      value={customUrl}
                      onChange={(e) => setCustomUrl(e.target.value)}
                      className="input pl-9"
                      placeholder="https://byan.example.com"
                      required
                      data-testid="custom-url-input"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-300 mb-1.5 uppercase tracking-[0.15em]">
                    API Token
                  </label>
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none">
                      <Key size={14} />
                    </div>
                    <input
                      type={showCustomToken ? 'text' : 'password'}
                      value={customToken}
                      onChange={(e) => setCustomToken(e.target.value)}
                      className="input pl-9 pr-10"
                      placeholder="byan_..."
                      required
                      data-testid="custom-token-input"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-300 transition-colors"
                      onClick={() => setShowCustomToken((v) => !v)}
                      tabIndex={-1}
                      aria-label={showCustomToken ? 'Hide token' : 'Show token'}
                    >
                      {showCustomToken ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary flex items-center gap-2 py-2.5 px-5"
                    data-testid="custom-submit"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        Connect
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <div className="mt-lg text-center flex justify-center gap-lg">
          <span className="font-caption text-caption text-ink-500/60 uppercase tracking-[0.2em]">
            Builder of YAN &middot; v1.0
          </span>
        </div>
      </div>
    </div>
  );
}
