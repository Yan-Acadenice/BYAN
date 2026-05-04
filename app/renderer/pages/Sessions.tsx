// Sessions — j._sessions ported to React (table).
// Data: mocked statically — IPC wiring deferred to post-MVP.

import React from 'react';
import { Play, Eye, Archive } from 'lucide-react';

type SessionStatus = 'running' | 'completed' | 'error' | 'archived';

const MOCK_SESSIONS = [
  { id: '1', startedAt: '2026-05-04T10:00:00Z', project: 'BYAN Platform', agent: 'byan', duration: '45m', status: 'running' as SessionStatus },
  { id: '2', startedAt: '2026-05-04T08:30:00Z', project: 'BYAN Platform', agent: 'analyst', duration: '1h 20m', status: 'completed' as SessionStatus },
  { id: '3', startedAt: '2026-05-03T14:00:00Z', project: 'Acadenice CFA', agent: 'architect', duration: '30m', status: 'completed' as SessionStatus },
  { id: '4', startedAt: '2026-05-02T09:00:00Z', project: 'Data Pipeline', agent: 'dev', duration: '2h 10m', status: 'error' as SessionStatus },
];

const STATUS_BADGE: Record<SessionStatus, string> = {
  running: 'badge-success',
  completed: 'badge-neutral',
  error: 'badge-danger',
  archived: 'badge-neutral',
};

function formatTs(iso: string) {
  return iso.replace('T', ' ').replace('Z', '').slice(0, 16);
}

export default function Sessions() {
  return (
    <div className="space-y-lg">
      <div>
        <p className="section-title">Platform</p>
        <h1 className="page-title mt-0.5">Sessions</h1>
      </div>

      <div className="bg-ink-900 border border-ink-800 rounded-lg overflow-hidden">
        <div className="grid grid-cols-[200px_1fr_100px_80px_100px_100px] px-md py-sm border-b border-ink-800 bg-ink-950">
          {['Started', 'Project', 'Agent', 'Duration', 'Status', 'Actions'].map((h) => (
            <span key={h} className="font-label text-label text-ink-400 uppercase">{h}</span>
          ))}
        </div>
        <div className="divide-y divide-ink-800/50">
          {MOCK_SESSIONS.map((s) => (
            <div
              key={s.id}
              className="grid grid-cols-[200px_1fr_100px_80px_100px_100px] items-center px-md hover:bg-ink-800 transition-colors"
              style={{ height: '56px' }}
            >
              <span className="font-mono-code text-mono-code text-ink-400 text-[11px]">{formatTs(s.startedAt)}</span>
              <span className="font-body-sm text-body-sm text-ink-100 truncate pr-md">{s.project}</span>
              <span className="font-body-sm text-body-sm text-ink-400">{s.agent}</span>
              <span className="font-mono-code text-mono-code text-ink-300">{s.duration}</span>
              <span className={`badge ${STATUS_BADGE[s.status]} w-fit`}>{s.status}</span>
              <div className="flex items-center gap-xs">
                {s.status === 'running' ? (
                  <button type="button" className="p-1 rounded hover:bg-ink-700 text-byan-400 hover:text-byan-300 transition-colors" title="Resume">
                    <Play size={14} />
                  </button>
                ) : null}
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
    </div>
  );
}
