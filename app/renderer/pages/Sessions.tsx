// Sessions — wired to live byan_web API (/api/sessions).

import React, { useEffect, useState } from 'react';
import { Eye, Archive, Loader2, AlertCircle, History, TerminalSquare } from 'lucide-react';
import type { ByanSession } from '../../shared/ipc-contract';
import { useToast } from '../components/toast/ToastContext';

function formatTs(iso: string): string {
  return iso.replace('T', ' ').replace('Z', '').slice(0, 16);
}

export default function Sessions() {
  const [sessions, setSessions] = useState<ByanSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [launching, setLaunching] = useState(false);
  const toast = useToast();

  // F5 : open the local `claude` CLI in an external terminal, in the project dir
  // chosen at onboarding. For users who prefer the raw CLI over the in-app chat.
  const openInTerminal = async () => {
    setLaunching(true);
    try {
      const cwd = (await window.byanApi.store?.get?.<string>('onboarding.projectRoot')) || undefined;
      if (!cwd) {
        toast.error('Aucun dossier de projet configuré (onboarding).');
        return;
      }
      const res = await window.byanApi.terminal.open({ cwd });
      if (res.ok) toast.success(`claude ouvert dans ${res.terminal}.`);
      else toast.error(res.message || 'Ouverture du terminal impossible.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ouverture du terminal impossible.');
    } finally {
      setLaunching(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await window.byanApi.byanWeb.sessions.list({ limit: 50 });
      setSessions(list as ByanSession[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-lg">
      <div className="flex items-start justify-between">
        <div>
          <p className="section-title">Platform</p>
          <h1 className="page-title mt-0.5">Sessions</h1>
        </div>
        <button
          type="button"
          data-testid="sessions-open-terminal"
          onClick={() => void openInTerminal()}
          disabled={launching}
          className="btn-secondary flex items-center gap-xs text-sm disabled:opacity-50"
          title="Ouvrir claude dans un terminal externe"
        >
          {launching ? <Loader2 size={14} className="animate-spin" /> : <TerminalSquare size={14} />}
          Ouvrir dans un terminal
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-xxl text-ink-400">
          <Loader2 size={20} className="animate-spin mr-sm" />
          <span className="font-body-sm text-body-sm">Loading sessions...</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-xxl text-ink-500">
          <AlertCircle size={40} className="mb-md text-red opacity-70" />
          <p className="font-h3 text-h3 text-ink-300 mb-xs">Could not load sessions</p>
          <p className="font-body-sm text-body-sm text-ink-500 mb-md">{error}</p>
          <button type="button" className="btn-secondary" onClick={() => void load()}>Retry</button>
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-xxl text-ink-500">
          <History size={40} className="mb-md opacity-30" />
          <p className="font-h3 text-h3 text-ink-400 mb-xs">No sessions yet</p>
          <p className="font-body-sm text-body-sm text-ink-500">Start a session in byan_web or via an agent.</p>
        </div>
      ) : (
        <div className="bg-ink-900 border border-ink-800 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[200px_120px_100px_100px_100px] px-md py-sm border-b border-ink-800 bg-ink-950">
            {['Started', 'Project', 'Agent', 'Status', 'Actions'].map((h) => (
              <span key={h} className="font-label text-label text-ink-400 uppercase">{h}</span>
            ))}
          </div>
          <div className="divide-y divide-ink-800/50">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="grid grid-cols-[200px_120px_100px_100px_100px] items-center px-md hover:bg-ink-800 transition-colors"
                style={{ height: '56px' }}
              >
                <span className="font-mono-code text-mono-code text-ink-400 text-[11px]">
                  {formatTs(s.started_at)}
                </span>
                <span className="font-body-sm text-body-sm text-ink-400 truncate">
                  {s.project_id ? s.project_id.slice(0, 8) + '...' : '—'}
                </span>
                <span className="font-body-sm text-body-sm text-ink-400">{s.agent_slug ?? '—'}</span>
                <span className={`badge w-fit ${
                  s.status === 'active' ? 'badge-success' :
                  s.status === 'error' ? 'badge-danger' :
                  'badge-neutral'
                }`}>{s.status}</span>
                <div className="flex items-center gap-xs">
                  <button type="button" className="p-1 rounded hover:bg-ink-700 text-ink-500 hover:text-ink-200 transition-colors" title="View">
                    <Eye size={14} />
                  </button>
                  <button type="button" className="p-1 rounded hover:bg-ink-700 text-ink-500 hover:text-ink-200 transition-colors" title="Archive">
                    <Archive size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
