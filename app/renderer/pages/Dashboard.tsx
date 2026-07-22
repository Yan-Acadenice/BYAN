// Dashboard — post-login home screen.
// Wired to live byan_web API via IPC: projects count + recent sessions.

import React, { useCallback, useEffect, useState } from 'react';
import { FolderOpen, History, Terminal, Zap, Upload, ArrowUpRight, Brain, Loader2, AlertCircle } from 'lucide-react';
import type { ByanProject, ByanSession } from '../../shared/ipc-contract';
import { useOnlineStatus, type OnlineStatus } from '../hooks/useOnlineStatus';
import { useAuthSession } from '../context/AuthSessionContext';

interface DashboardProps {
  onNavigate: (page: string) => void;
}

type LoadState = 'loading' | 'error' | 'ok';

// F7 : the hero connectivity line is mode-aware and live, not a frozen "Connected".
// In LOCAL mode, being offline from byan_web is expected — the local chat does not
// depend on it — so we show a Local badge, never a scary "offline". In cloud/custom
// mode the live online status (online / unstable / offline) drives the label+dot.
export function connectivity(mode: string | undefined, status: OnlineStatus): { dot: string; label: string } {
  if (mode === 'local') {
    return { dot: 'bg-acadenice-teal', label: 'Local — ce PC (le chat local ne dépend pas de byan_web)' };
  }
  if (status === 'online') return { dot: 'bg-emerald', label: 'Connecté à byan_web' };
  if (status === 'unstable') return { dot: 'bg-amber-500', label: 'Connexion instable à byan_web' };
  return { dot: 'bg-red-600', label: 'Hors ligne — byan_web injoignable' };
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [projects, setProjects] = useState<ByanProject[]>([]);
  const [sessions, setSessions] = useState<ByanSession[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string>('');
  // Live, mode-aware connectivity for the hero line (F7). Hooks before any return.
  const { session } = useAuthSession();
  // In LOCAL mode the probe must NOT hit byan_web (F1) — it resolves locally ;
  // in cloud/custom it pings byan_web.me. Memoized per mode so the interval only
  // re-inits on a mode switch, not every render.
  const ping = useCallback(
    () => (session?.mode === 'local'
      ? Promise.resolve()
      : (window.byanApi?.byanWeb?.me?.() ?? Promise.reject(new Error('no api')))),
    [session?.mode]
  );
  const online = useOnlineStatus({ ping });
  const conn = connectivity(session?.mode, online);

  const load = async () => {
    setState('loading');
    setError('');
    try {
      const [p, s] = await Promise.all([
        window.byanApi.byanWeb.projects.list(),
        window.byanApi.byanWeb.sessions.list({ limit: 5 }),
      ]);
      setProjects(p as ByanProject[]);
      setSessions(s as ByanSession[]);
      setState('ok');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      setState('error');
    }
  };

  useEffect(() => { void load(); }, []);

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center py-xxl text-ink-400">
        <Loader2 size={20} className="animate-spin mr-sm" />
        <span className="font-body-sm text-body-sm">Loading dashboard...</span>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-xxl text-ink-500">
        <AlertCircle size={40} className="mb-md text-red opacity-70" />
        <p className="font-h3 text-h3 text-ink-300 mb-xs">Could not load dashboard</p>
        <p className="font-body-sm text-body-sm text-ink-500 mb-md">{error}</p>
        <button type="button" className="btn-secondary" onClick={() => void load()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-xl">
      {/* Hero */}
      <section className="space-y-xs">
        <h2 className="font-display text-display text-white">Welcome back.</h2>
        <div className="flex items-center gap-xs" data-testid="dashboard-connectivity">
          <span className={`w-1.5 h-1.5 rounded-full ${conn.dot}`} />
          <p className="font-caption text-caption text-ink-400">{conn.label}</p>
        </div>
      </section>

      {/* KPI cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-md">
        {/* Active projects */}
        <div className="bg-ink-900 border border-ink-800 rounded-lg p-lg hover:-translate-y-px hover:border-ink-700 transition-all duration-200 group">
          <div className="flex justify-between items-start mb-4">
            <FolderOpen size={20} className="text-ink-400 group-hover:text-byan-500 transition-colors" />
          </div>
          <p className="font-body-sm text-body-sm text-ink-400 mb-1">Active projects</p>
          <p className="font-display text-display text-white">{projects.length}</p>
        </div>
        {/* Sessions */}
        <div className="bg-ink-900 border border-ink-800 rounded-lg p-lg hover:-translate-y-px hover:border-ink-700 transition-all duration-200 group">
          <div className="flex justify-between items-start mb-4">
            <History size={20} className="text-ink-400 group-hover:text-byan-500 transition-colors" />
          </div>
          <p className="font-body-sm text-body-sm text-ink-400 mb-1">Recent sessions</p>
          <p className="font-display text-display text-white">{sessions.length}</p>
        </div>
        {/* MCP servers — still from local IPC, not byan_web */}
        <div className="bg-ink-900 border border-ink-800 rounded-lg p-lg hover:-translate-y-px hover:border-ink-700 transition-all duration-200 group">
          <div className="flex justify-between items-start mb-4">
            <Terminal size={20} className="text-ink-400 group-hover:text-byan-500 transition-colors" />
          </div>
          <p className="font-body-sm text-body-sm text-ink-400 mb-1">MCP servers</p>
          <p className="font-display text-display text-white">
            <span className="cursor-pointer" onClick={() => onNavigate('mcp-servers')}>View</span>
          </p>
        </div>
      </section>

      {/* Two-column section */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-md">
        {/* Recent sessions — 2 cols */}
        <div className="lg:col-span-2 bg-ink-900 border border-ink-800 rounded-lg overflow-hidden flex flex-col">
          <div className="px-md py-sm border-b border-ink-800 flex justify-between items-center">
            <h3 className="font-h3 text-h3 text-ink-100">Recent sessions</h3>
            <button
              type="button"
              className="font-label text-label text-byan-500 hover:text-byan-700 transition-colors uppercase"
              onClick={() => onNavigate('sessions')}
            >
              View all
            </button>
          </div>
          <div className="flex-1">
            {sessions.length === 0 ? (
              <div className="flex items-center justify-center py-xl text-ink-500">
                <p className="font-body-sm text-body-sm">No sessions yet.</p>
              </div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center px-md border-b border-ink-800/50 last:border-b-0 hover:bg-ink-800 transition-colors cursor-pointer group"
                  style={{ height: '56px' }}
                >
                  <div className="w-8 h-8 rounded bg-ink-850 border border-ink-700 flex items-center justify-center mr-md shrink-0">
                    <Zap size={14} className="text-ink-300 group-hover:text-byan-500 transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0 pr-md">
                    <p className="font-body-sm text-body-sm text-ink-100 truncate font-medium">
                      {s.agent_slug ?? 'Session'}
                    </p>
                    <p className="font-caption text-caption text-ink-400 truncate mt-0.5">
                      {s.status}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-caption text-caption text-ink-500 mt-0.5">
                      {new Date(s.started_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick actions — 1 col */}
        <div className="bg-ink-900 border border-ink-800 rounded-lg p-md flex flex-col">
          <h3 className="font-h3 text-h3 text-ink-100 mb-md px-xs">Quick actions</h3>
          <div className="space-y-xs flex-1">
            <button
              type="button"
              onClick={() => onNavigate('chat')}
              className="w-full bg-gradient-to-r from-byan-500 to-byan-700 text-white font-body-sm text-body-sm font-medium h-9 rounded flex items-center justify-center gap-xs hover:opacity-90 transition-opacity"
            >
              <Zap size={16} />
              New session
            </button>
            <button
              type="button"
              className="w-full bg-transparent border border-ink-600 text-white font-body-sm text-body-sm font-medium h-9 rounded flex items-center justify-center gap-xs hover:bg-ink-800 transition-colors mt-sm"
              onClick={() => onNavigate('projects')}
            >
              <Upload size={16} />
              Import project
            </button>
            <button
              type="button"
              className="w-full bg-transparent border border-ink-600 text-white font-body-sm text-body-sm font-medium h-9 rounded flex items-center justify-center gap-xs hover:bg-ink-800 transition-colors"
              onClick={() => onNavigate('projects')}
            >
              <ArrowUpRight size={16} />
              Open projects
            </button>
            <button
              type="button"
              className="w-full bg-transparent text-ink-400 font-body-sm text-body-sm font-medium h-9 rounded flex items-center justify-center gap-xs hover:text-ink-100 hover:bg-ink-850 transition-colors"
              onClick={() => onNavigate('memory')}
            >
              <Brain size={16} />
              Browse memory
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
