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
      <div className="flex items-center justify-center py-xxl text-content-tertiary">
        <Loader2 size={20} className="animate-spin mr-sm" />
        <span className="font-body-sm text-body-sm">Chargement du tableau de bord…</span>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-xxl text-content-tertiary">
        <AlertCircle size={40} className="mb-md text-red opacity-70" />
        <p className="font-h3 text-h3 text-content-secondary mb-xs">Impossible de charger le tableau de bord</p>
        <p className="font-body-sm text-body-sm text-content-tertiary mb-md">{error}</p>
        <button type="button" className="btn-secondary" onClick={() => void load()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-xl">
      {/* Hero */}
      <section className="space-y-xs">
        <h2 className="font-display text-display text-white">Content de te revoir.</h2>
        <div className="flex items-center gap-xs" data-testid="dashboard-connectivity">
          <span className={`w-1.5 h-1.5 rounded-full ${conn.dot}`} />
          <p className="font-caption text-caption text-content-tertiary">{conn.label}</p>
        </div>
      </section>

      {/* KPI cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-md">
        {/* Active projects */}
        <div className="bg-surface-card border border-edge-subtle rounded-lg p-lg hover:-translate-y-px hover:border-edge-strong transition-all duration-200 group">
          <div className="flex justify-between items-start mb-4">
            <FolderOpen size={20} className="text-content-tertiary group-hover:text-accent-action transition-colors" />
          </div>
          <p className="font-body-sm text-body-sm text-content-tertiary mb-1">Projets actifs</p>
          <p className="font-display text-display text-white">{projects.length}</p>
        </div>
        {/* Sessions */}
        <div className="bg-surface-card border border-edge-subtle rounded-lg p-lg hover:-translate-y-px hover:border-edge-strong transition-all duration-200 group">
          <div className="flex justify-between items-start mb-4">
            <History size={20} className="text-content-tertiary group-hover:text-accent-action transition-colors" />
          </div>
          <p className="font-body-sm text-body-sm text-content-tertiary mb-1">Sessions récentes</p>
          <p className="font-display text-display text-white">{sessions.length}</p>
        </div>
        {/* MCP servers — still from local IPC, not byan_web */}
        <div className="bg-surface-card border border-edge-subtle rounded-lg p-lg hover:-translate-y-px hover:border-edge-strong transition-all duration-200 group">
          <div className="flex justify-between items-start mb-4">
            <Terminal size={20} className="text-content-tertiary group-hover:text-accent-action transition-colors" />
          </div>
          <p className="font-body-sm text-body-sm text-content-tertiary mb-1">Serveurs MCP</p>
          <p className="font-display text-display text-white">
            <span className="cursor-pointer" onClick={() => onNavigate('mcp-servers')}>View</span>
          </p>
        </div>
      </section>

      {/* Two-column section */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-md">
        {/* Recent sessions — 2 cols */}
        <div className="lg:col-span-2 bg-surface-card border border-edge-subtle rounded-lg overflow-hidden flex flex-col">
          <div className="px-md py-sm border-b border-edge-subtle flex justify-between items-center">
            <h3 className="font-h3 text-h3 text-content-body">Recent sessions</h3>
            <button
              type="button"
              className="font-label text-label text-accent-action hover:text-teal-600 transition-colors uppercase"
              onClick={() => onNavigate('sessions')}
            >
              View all
            </button>
          </div>
          <div className="flex-1">
            {sessions.length === 0 ? (
              <div className="flex items-center justify-center py-xl text-content-tertiary">
                <p className="font-body-sm text-body-sm">Aucune session pour le moment.</p>
              </div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center px-md border-b border-neutral-900/50 last:border-b-0 hover:bg-surface-hover transition-colors cursor-pointer group"
                  style={{ height: '56px' }}
                >
                  <div className="w-8 h-8 rounded bg-surface-raised border border-edge-strong flex items-center justify-center mr-md shrink-0">
                    <Zap size={14} className="text-content-secondary group-hover:text-accent-action transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0 pr-md">
                    <p className="font-body-sm text-body-sm text-content-body truncate font-medium">
                      {s.agent_slug ?? 'Session'}
                    </p>
                    <p className="font-caption text-caption text-content-tertiary truncate mt-0.5">
                      {s.status}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-caption text-caption text-content-tertiary mt-0.5">
                      {new Date(s.started_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick actions — 1 col */}
        <div className="bg-surface-card border border-edge-subtle rounded-lg p-md flex flex-col">
          <h3 className="font-h3 text-h3 text-content-body mb-md px-xs">Actions rapides</h3>
          <div className="space-y-xs flex-1">
            <button
              type="button"
              onClick={() => onNavigate('chat')}
              className="w-full bg-gradient-to-r from-teal-400 to-teal-600 text-white font-body-sm text-body-sm font-medium h-9 rounded flex items-center justify-center gap-xs hover:opacity-90 transition-opacity"
            >
              <Zap size={16} />
              New session
            </button>
            <button
              type="button"
              className="w-full bg-transparent border border-edge-strong text-white font-body-sm text-body-sm font-medium h-9 rounded flex items-center justify-center gap-xs hover:bg-surface-hover transition-colors mt-sm"
              onClick={() => onNavigate('projects')}
            >
              <Upload size={16} />
              Import project
            </button>
            <button
              type="button"
              className="w-full bg-transparent border border-edge-strong text-white font-body-sm text-body-sm font-medium h-9 rounded flex items-center justify-center gap-xs hover:bg-surface-hover transition-colors"
              onClick={() => onNavigate('projects')}
            >
              <ArrowUpRight size={16} />
              Open projects
            </button>
            <button
              type="button"
              className="w-full bg-transparent text-content-tertiary font-body-sm text-body-sm font-medium h-9 rounded flex items-center justify-center gap-xs hover:text-content-body hover:bg-surface-raised transition-colors"
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
